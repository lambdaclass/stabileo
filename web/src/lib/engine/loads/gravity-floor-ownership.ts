import type { Polygon } from 'polygon-clipping';
import { orient2d, orient3d } from 'robust-predicates';
import { agrees, Sum } from '../accounting-math';
import { msg } from '../../codes/message';
import { deckOverlaps, physicalDeck, separatedDeckRanges, type Deck } from './gravity-deck-geometry';
import type { FloorBay } from './floor-loads';
import {
  footprintArea, potentiallyOverlapping, shellEdgeComponents,
  refuseGravityGeometry, shellOverlapMessage, subtractFootprints, unionFootprints,
  type GravityShellKey, type ShellFootprint,
} from './gravity-shell-partition';

type Point3 = [number, number, number];
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

type Shell = ShellFootprint & { key: GravityShellKey; nodes: number[]; pitched: boolean; footprint: [Polygon]; geometry: Deck };
type ShellDeck<S extends Shell> = { kind: 'shell'; shell: S; footprint: [Polygon]; geometry: Deck };

function connectedPitchedRoofs<S extends Shell>(shells: readonly ShellDeck<S>[]) {
  return shellEdgeComponents(shells.filter(({ shell }) => shell.pitched), ({ shell }) => shell.nodes);
}

export type BayAssignment = {
  deck: Deck & { independentShells: ReadonlySet<GravityShellKey> };
} & (
  | { partition: { kind: 'uncovered' }; region: [Polygon] }
  | { partition: { kind: 'shell' }; region: [] }
);

const noIndependentShells: ReadonlySet<GravityShellKey> = new Set();

const bayMembers = (bay: FloorBay) => [...bay.members].sort((a, b) => a - b).join(', ');

type BayLevelSeparation = { tolerance: number; componentOf: (node: number) => number };

export function partitionGravityFloors<S extends Shell>(
  shells: readonly S[],
  bays: readonly FloorBay[],
  { deck: tolerance, storeyHeadroom, explicitBeamBays }: { deck: number; storeyHeadroom: number; explicitBeamBays?: BayLevelSeparation },
  coordinates: (node: number) => Point3,
  shellBayAttachment: (shell: S, bay: FloorBay) => 'independent' | 'linked' | 'attached',
  shellSeparation: (first: S, second: S) => number,
  independentDecks: (shell: S, bay: FloorBay) => boolean,
): { shellBayMembers: ReadonlyMap<GravityShellKey, ReadonlySet<number>>; bays: Map<FloorBay, BayAssignment> } {
  const shellCarriers: ShellDeck<S>[] = shells.map(shell => ({
    kind: 'shell', shell, footprint: shell.footprint, geometry: shell.geometry,
  }));
  const bayCarriers = bays.map(bay => {
    const boundaryNodes = bay.boundaryNodes[0]!;
    const nodes = bay.boundaryNodes.flat();
    const geometry = physicalDeck(nodes.map(coordinates));
    const [low, high] = geometry.range;
    const flatFrameComponents = explicitBeamBays && Number.isFinite(low) && low === high
      ? new Set(nodes.map(explicitBeamBays.componentOf)) : undefined;
    const footprint: [Polygon] = [bay.boundary];
    return { kind: 'bay' as const, bay, boundaryNodes, footprint, geometry, flatFrameComponents };
  });
  type BayMatches = { covering: ShellDeck<S>[]; roof?: ShellDeck<S>[] };
  const matches = new Map<FloorBay, BayMatches>();
  const matchesFor = (bay: FloorBay) => {
    const match: BayMatches = matches.get(bay) ?? { covering: [] };
    matches.set(bay, match);
    return match;
  };
  const carrierOutline = (carrier: (typeof bayCarriers | typeof shellCarriers)[number]) => carrier.footprint[0][0]!;
  for (const [a, b] of potentiallyOverlapping(shellCarriers, carrierOutline)) {
    const limit = shellSeparation(a.shell, b.shell);
    if (separatedDeckRanges(a.geometry, b.geometry, limit) || shareOnlyAnEdge(a.shell.poly, b.shell.poly)) continue;
    if (deckOverlaps(a, b).some(part => !part.separated(limit))) {
      refuseGravityGeometry(shellOverlapMessage(a.shell, b.shell));
    }
  }
  const independentShells = new Map<FloorBay, Set<GravityShellKey>>();
  let pitchedRoofs: ReturnType<typeof connectedPitchedRoofs<S>> | undefined;
  for (const [a, b] of potentiallyOverlapping([...shellCarriers, ...bayCarriers], carrierOutline)) {
    if (a.kind === 'bay' && b.kind === 'bay') {
      const first = a.flatFrameComponents, second = b.flatFrameComponents;
      const independentLevels = explicitBeamBays && first && second && ![...first].some(root => second.has(root));
      const limit = independentLevels ? explicitBeamBays.tolerance : tolerance;
      if (separatedDeckRanges(a.geometry, b.geometry, limit)) continue;
      if (deckOverlaps(a, b).some(part => !part.separated(limit))) {
        refuseGravityGeometry(msg('loadPlan.gravity.overlappingBays', { first: bayMembers(a.bay), second: bayMembers(b.bay) }));
      }
      continue;
    }
    const bay = a.kind === 'bay' ? a : b.kind === 'bay' ? b : undefined;
    const shell = a.kind === 'shell' ? a : b.kind === 'shell' ? b : undefined;
    if (!bay || !shell) continue;
    const attachment = shellBayAttachment(shell.shell, bay.bay);
    const overlap = deckOverlaps(bay, shell);
    if (!overlap.length) continue;
    const [bayLow, bayHigh] = bay.geometry.range;
    const mayCoverEaves = bay.footprint[0].length === 1 && bayLow === bayHigh && shell.shell.pitched
      && overlap.every(part => part.band(0, Infinity) === 'full');
    const independent = attachment === 'independent' && (mayCoverEaves || overlap.every(part => part.strictlyAbove(tolerance)))
      && independentDecks(shell.shell, bay.bay);
    if (independent) {
      const independent = independentShells.get(bay.bay) ?? new Set<GravityShellKey>();
      independent.add(shell.shell.key);
      independentShells.set(bay.bay, independent);
      continue;
    }
    if (overlap.every(part => part.separated(tolerance))) {
      if (attachment !== 'independent' && overlap.some(part => part.band(-storeyHeadroom, storeyHeadroom) !== 'none')) {
        refuseGravityGeometry(msg('loadPlan.gravity.offsetShellDeck', { id: shell.shell.id, members: bayMembers(bay.bay) }));
      }
      continue;
    }
    const basis = bay.geometry.basis;
    if (!basis || !shell.geometry.basis) refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    const [p, q, r] = basis;
    const coplanar = shell.geometry.points.every(point => orient3d(...p, ...q, ...r, ...point) === 0);
    const match = matchesFor(bay.bay);
    const attached = !coplanar && bay.footprint[0].length === 1 && attachment === 'attached'
      && subtractFootprints(bay.footprint[0], shell.footprint).length === 0;
    if (coplanar || attached) {
      if (match.roof) refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
      match.covering.push(shell);
      continue;
    }
    if (!mayCoverEaves || match.covering.length) refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    pitchedRoofs ??= connectedPitchedRoofs(shellCarriers);
    const roof = pitchedRoofs.get(shell)!;
    if (match.roof === roof) continue;
    const nodes = new Set(roof.flatMap(({ shell }) => shell.nodes));
    if (match.roof || roof.some(part => !part.geometry.basis || part.geometry.range[0] < bayHigh) ||
      !bay.bay.sides.every(side => nodes.has(side.nodeA)) ||
      roof.some(part => subtractFootprints(part.footprint[0], bay.footprint).length !== 0)) {
      refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    }
    match.roof = roof;
  }

  const assignments = new Map<FloorBay, BayAssignment>();
  const shellBayMembers = new Map<GravityShellKey, Set<number>>();
  for (const { bay, footprint: [footprint], boundaryNodes, geometry } of bayCarriers) {
    const deck = { ...geometry, independentShells: independentShells.get(bay) ?? noIndependentShells };
    const match = matches.get(bay);
    const covering = match?.roof ?? match?.covering ?? [];
    if (!covering.length) {
      assignments.set(bay, { partition: { kind: 'uncovered' }, region: [footprint], deck });
      continue;
    }
    const footprints = covering.flatMap(shell => shell.footprint);
    if (subtractFootprints(footprint, footprints).length !== 0) {
      refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    }
    const nodes = new Set(covering.flatMap(({ shell }) => shell.nodes));
    if (!boundaryNodes.every(id => nodes.has(id)) &&
      covering.some(({ shell, footprint: [region] }) =>
        shellBayAttachment(shell, bay) !== 'attached' && subtractFootprints(region, [footprint]).length !== 0)) {
      refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    }
    const union = footprintArea(unionFootprints(footprints));
    const areas = new Sum();
    for (const region of footprints) areas.add(footprintArea([region]));
    if (!agrees(areas.value, union, union) || !agrees(footprintArea(unionFootprints([footprint, ...footprints])), union, union)) {
      refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    }
    assignments.set(bay, { partition: { kind: 'shell' }, region: [], deck });
    for (const { shell } of covering) {
      const members = shellBayMembers.get(shell.key) ?? new Set<number>();
      for (const member of bay.members) members.add(member);
      shellBayMembers.set(shell.key, members);
    }
  }
  return { bays: assignments, shellBayMembers };
}
