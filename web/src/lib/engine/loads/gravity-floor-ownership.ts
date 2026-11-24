import type { MultiPolygon, Polygon } from 'polygon-clipping';
import { orient2d, orient3d } from 'robust-predicates';
import { agrees, Sum } from '../accounting-math';
import { msg } from '../../codes/message';
import type { FloorBay } from './floor-loads';
import {
  canonicalFootprint, footprintArea, footprintIntersection, planarShell, potentiallyOverlapping,
  refuseGravityGeometry, shellOverlapMessage, subtractFootprints, unionFootprints,
  type ShellFootprint, type ShellPlane,
} from './gravity-shell-partition';

type Point3 = [number, number, number];
type HeightRange = readonly [number, number];
type Deck = {
  range: HeightRange;
  points: Point3[];
  basis?: [Point3, Point3, Point3];
  heights: (point: Polygon[number][number]) => HeightRange;
};

function deck(points: Point3[], plane?: ShellPlane, id?: number): Deck {
  const [a, ...rest] = points;
  const b = rest.find(p => p[0] !== a![0] || p[1] !== a![1]);
  const c = b && rest.find(p => orient2d(a![0], a![1], b[0], b[1], p[0], p[1]) !== 0);
  const basis: Deck['basis'] = a && b && c && points.every(p => orient3d(...a, ...b, ...c, ...p) === 0)
    ? [a, b, c] : undefined;
  const surface = basis ? (plane ?? planarShell(id ?? 0, basis)) : undefined;
  const range = points.reduce(([low, high], p) =>
    [Math.min(low, p[2]), Math.max(high, p[2])] as const, [Infinity, -Infinity] as readonly [number, number]);
  return {
    points, basis, range,
    heights: surface ? point => { const z = surface(point); return [z, z]; } : () => range,
  };
}

function clearsTolerance(high: number, low: number, tolerance: number): boolean {
  return high > low + tolerance && high - low > tolerance;
}

function separated(a: Deck, b: Deck, overlap: MultiPolygon, tolerance: number): boolean {
  return overlap.every(polygon => {
    let above = true, below = true;
    for (const ring of polygon) for (const point of ring) {
      const [aLow, aHigh] = a.heights(point), [bLow, bHigh] = b.heights(point);
      if (![aLow, aHigh, bLow, bHigh].every(Number.isFinite)) {
        refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
      }
      above &&= clearsTolerance(aLow, bHigh, tolerance);
      below &&= clearsTolerance(bLow, aHigh, tolerance);
    }
    return above || below;
  });
}

function separatedByHeightRange(a: Deck, b: Deck, tolerance: number): boolean {
  return clearsTolerance(a.range[0], b.range[1], tolerance) || clearsTolerance(b.range[0], a.range[1], tolerance);
}

function positiveOverlap(a: Polygon, b: Polygon): MultiPolygon | undefined {
  const overlap = footprintIntersection(a, b);
  if (!overlap.length) return undefined;
  const area = footprintArea(overlap);
  if (!(area > 0) || !Number.isFinite(area)) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
  return overlap;
}

function shareOnlyAnEdge(first: Polygon[number], second: Polygon[number]): boolean {
  const samePoint = (a: Polygon[number][number], b: Polygon[number][number]) => a[0] === b[0] && a[1] === b[1];
  return first.some((a, i) => {
    const b = first[(i + 1) % first.length]!;
    if (samePoint(a, b)) return false;
    if (!second.some((p, j) => {
      const q = second[(j + 1) % second.length]!;
      return (samePoint(a, p) && samePoint(b, q)) || (samePoint(a, q) && samePoint(b, p));
    })) return false;
    const side = (p: Polygon[number][number]) => orient2d(...a, ...b, ...p);
    const left = first.map(side), right = second.map(side);
    return (left.every(value => value >= 0) && right.every(value => value <= 0)) ||
      (left.every(value => value <= 0) && right.every(value => value >= 0));
  });
}

type Shell = ShellFootprint & { nodes: number[] };
export type BayAssignment =
  | { partition: { kind: 'uncovered' }; region: [Polygon] }
  | { partition: { kind: 'shell' }; region: [] };

const bayMembers = (bay: FloorBay) => [...bay.members].sort((a, b) => a - b).join(', ');

export function partitionGravityFloors<S extends Shell>(
  shells: readonly S[],
  bays: readonly FloorBay[],
  tolerance: number,
  coordinates: (node: number) => Point3,
  hasBoundaryAttachment: (shell: S, bay: FloorBay) => boolean,
  shellSeparation: (first: S, second: S) => number,
): { shellBayMembers: ReadonlyMap<number, ReadonlySet<number>>; bays: Map<FloorBay, BayAssignment> } {
  const shellCarriers = shells.map(shell => ({
    kind: 'shell' as const, shell, footprint: [canonicalFootprint(shell.poly)], deck: deck(shell.pts, shell.plane, shell.id),
  }));
  const bayCarriers = bays.map(bay => {
    const boundaryNodes = bay.boundaryNodes[0]!;
    const points = bay.boundaryNodes.flat().map(coordinates);
    return { kind: 'bay' as const, bay, boundaryNodes, footprint: bay.boundary, deck: deck(points) };
  });
  const matches = new Map<FloorBay, typeof shellCarriers>();
  const carrierOutline = (carrier: (typeof bayCarriers | typeof shellCarriers)[number]) => carrier.footprint[0]!;
  for (const [a, b] of potentiallyOverlapping(shellCarriers, carrierOutline)) {
    const limit = shellSeparation(a.shell, b.shell);
    if (separatedByHeightRange(a.deck, b.deck, limit) || shareOnlyAnEdge(a.shell.poly, b.shell.poly)) continue;
    const overlap = positiveOverlap(a.footprint, b.footprint);
    if (overlap && !separated(a.deck, b.deck, overlap, limit)) {
      refuseGravityGeometry(shellOverlapMessage(a.shell, b.shell));
    }
  }
  for (const [a, b] of potentiallyOverlapping([...shellCarriers, ...bayCarriers], carrierOutline)) {
    if ((a.kind === 'shell' && b.kind === 'shell') || separatedByHeightRange(a.deck, b.deck, tolerance)) continue;
    if (a.kind === 'bay' && b.kind === 'bay') {
      const overlap = positiveOverlap(a.footprint, b.footprint);
      if (overlap && !separated(a.deck, b.deck, overlap, tolerance)) {
        refuseGravityGeometry(msg('loadPlan.gravity.overlappingBays', { first: bayMembers(a.bay), second: bayMembers(b.bay) }));
      }
      continue;
    }
    const bay = a.kind === 'bay' ? a : b.kind === 'bay' ? b : undefined;
    const shell = a.kind === 'shell' ? a : b.kind === 'shell' ? b : undefined;
    if (!bay || !shell) continue;
    const overlap = positiveOverlap(bay.footprint, shell.footprint);
    if (!overlap || separated(bay.deck, shell.deck, overlap, tolerance)) continue;
    const basis = bay.deck.basis;
    if (!basis || !shell.deck.basis) refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    const [p, q, r] = basis;
    const coplanar = shell.deck.points.every(point => orient3d(...p, ...q, ...r, ...point) === 0);
    if (!coplanar && (bay.footprint.length !== 1 || !hasBoundaryAttachment(shell.shell, bay.bay)
      || subtractFootprints(bay.footprint, [shell.footprint]).length !== 0)) {
      refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    }
    const covering = matches.get(bay.bay) ?? [];
    covering.push(shell);
    matches.set(bay.bay, covering);
  }

  const assignments = new Map<FloorBay, BayAssignment>();
  const shellBayMembers = new Map<number, Set<number>>();
  for (const { bay, footprint, boundaryNodes } of bayCarriers) {
    const covering = matches.get(bay);
    if (!covering) {
      assignments.set(bay, { partition: { kind: 'uncovered' }, region: [footprint] });
      continue;
    }
    const footprints = covering.map(shell => shell.footprint);
    if (subtractFootprints(footprint, footprints).length !== 0) {
      refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    }
    const nodes = new Set(covering.flatMap(({ shell }) => shell.nodes));
    if (!boundaryNodes.every(id => nodes.has(id)) &&
      covering.some(({ shell, footprint: region }) =>
        !hasBoundaryAttachment(shell, bay) && subtractFootprints(region, [footprint]).length !== 0)) {
      refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    }
    const union = footprintArea(unionFootprints(footprints));
    const areas = new Sum();
    for (const region of footprints) areas.add(footprintArea([region]));
    if (!agrees(areas.value, union, union) || !agrees(footprintArea(unionFootprints([footprint, ...footprints])), union, union)) {
      refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    }
    assignments.set(bay, { partition: { kind: 'shell' }, region: [] });
    for (const { shell } of covering) {
      const members = shellBayMembers.get(shell.id) ?? new Set<number>();
      for (const member of bay.members) members.add(member);
      shellBayMembers.set(shell.id, members);
    }
  }
  return { bays: assignments, shellBayMembers };
}
