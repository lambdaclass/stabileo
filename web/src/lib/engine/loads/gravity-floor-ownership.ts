import type { MultiPolygon, Polygon } from 'polygon-clipping';
import { agrees, Sum } from '../accounting-math';
import { msg } from '../../codes/message';
import type { FloorBay } from './floor-loads';
import {
  bayFrame, canonicalFootprint, footprintArea, footprintIntersection, footprintsOverlap, partitionShellCoverage,
  potentiallyOverlapping, refuseGravityGeometry, samePhysicalDeck, shellOverlapMessage, subtractFootprints, unionFootprints,
  type BayPartition, type ShellFootprint, type ShellPlane,
} from './gravity-shell-partition';

export type ShellBayCandidate<S> = {
  shell: S;
  deck: ShellPlane;
  tolerance: number;
  ambiguousLevel?: boolean;
  unequalOffsets?: boolean;
};

export type GravityBay<S> = {
  bay: FloorBay;
  z: number;
  candidates: readonly ShellBayCandidate<S>[];
};

export type BayAssignment = { partition: BayPartition; region: MultiPolygon };

const bayMembers = (bay: FloorBay) => [...bay.members].sort((a, b) => a - b).join(', ');

type FloorCarrier = {
  footprint: Polygon;
  assigned: MultiPolygon;
  bay?: FloorBay;
};

export function partitionGravityFloors<S extends ShellFootprint>(
  shells: readonly S[], bays: readonly GravityBay<S>[], tolerance: number, maxShellDeckRise: number,
  shellsTied: (a: S, b: S) => boolean,
  baysTied: (a: FloorBay, b: FloorBay) => boolean,
): {
  shells: Set<S>;
  shadowedBy: ReadonlyMap<S, ReadonlySet<S>>;
  shellBayMembers: ReadonlyMap<number, ReadonlySet<number>>;
  bays: Map<FloorBay, BayAssignment>;
} {
  const footprintOf = new Map(shells.map(shell => [shell, [canonicalFootprint(shell.poly)]]));
  const vertexHeights = new Map(shells.map(shell => [shell, shell.pts.map(p => p[2])]));
  const frames = new Map<FloorBay, ReturnType<typeof bayFrame>>();
  const frameFor = (bay: FloorBay) => frames.get(bay) ?? frames.set(bay, bayFrame(bay.sides, bay.holes)).get(bay)!;
  const inFrame = (bay: FloorBay, footprint: Polygon) => footprint.map(ring => ring.map(frameFor(bay).local));
  const overlapsBay = (bay: FloorBay, footprint: MultiPolygon) =>
    footprintsOverlap(frameFor(bay).boundary, footprint.map(polygon => inFrame(bay, polygon)));
  const inBayDeck = (bay: FloorBay, overlap: MultiPolygon, first: ShellPlane | undefined, second: ShellPlane, limit: number) => {
    const area = footprintArea(overlap);
    if (area === 0) return undefined;
    if (!(area > 0) || !Number.isFinite(area)) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    const { inPlan } = frameFor(bay);
    const pairs = overlap.flatMap(([exterior]) => exterior!.map(point => {
      const plan = inPlan(point);
      return [first?.(plan) ?? NaN, second(plan)] as const;
    }));
    return samePhysicalDeck(pairs, limit);
  };
  const eligibleFor = new Map<FloorBay, Map<S, ShellPlane>>();
  const serving = new Map<S, Set<GravityBay<S>>>();
  for (const entry of bays) {
    const { bay, candidates } = entry;
    const eligible = new Map<S, ShellPlane>();
    const ambiguous = new Set<S>();
    const unequalOffsets = new Set<S>();
    for (const { shell, deck, tolerance, ambiguousLevel, unequalOffsets: unequal } of candidates) {
      if (eligible.has(shell)) continue;
      const overlap = footprintIntersection(frameFor(bay).boundary, inFrame(bay, footprintOf.get(shell)!));
      const matches = inBayDeck(bay, overlap, shell.plane, deck, tolerance);
      if (matches && unequal) unequalOffsets.add(shell);
      else if (matches) eligible.set(shell, deck);
      else if (matches === false && ambiguousLevel) ambiguous.add(shell);
    }
    if ([...ambiguous].some(shell => !eligible.has(shell))) {
      refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
    }
    const unresolved = [...unequalOffsets].find(shell => !eligible.has(shell));
    if (unresolved) {
      refuseGravityGeometry(msg('loadPlan.gravity.offsetShellDeck', { id: unresolved.id, members: bayMembers(bay) }));
    }
    eligibleFor.set(bay, eligible);
    for (const shell of eligible.keys()) (serving.get(shell) ?? serving.set(shell, new Set()).get(shell)!).add(entry);
  }
  const coveredBy = new Map<S, Set<S>>();
  const floors = new Map<FloorCarrier, FloorCarrier>();
  const shellCarriers = new Map<S, FloorCarrier>();
  for (const [shell, footprint] of footprintOf) shellCarriers.set(shell, { footprint, assigned: [footprint] });
  const bayCarriers = new Map<FloorBay, FloorCarrier>();
  for (const { bay } of bays) bayCarriers.set(bay, { footprint: bay.boundary, assigned: [], bay });

  const root = (carrier: FloorCarrier): FloorCarrier => {
    const path: FloorCarrier[] = [];
    while (floors.has(carrier)) {
      path.push(carrier);
      carrier = floors.get(carrier)!;
    }
    for (const member of path) floors.set(member, carrier);
    return carrier;
  };
  const join = (a: FloorCarrier, b: FloorCarrier) => {
    const first = root(a), second = root(b);
    if (first !== second) floors.set(first, second);
  };

  for (const [a, b] of potentiallyOverlapping(shells, shell => shell.poly)) {
    const tied = shellsTied(a, b);
    const aZ = vertexHeights.get(a)!, bZ = vertexHeights.get(b)!;
    const nearby = Math.min(...aZ) <= Math.max(...bZ) + tolerance && Math.min(...bZ) <= Math.max(...aZ) + tolerance;
    const commonBays = [...serving.get(a) ?? []].filter(bay => serving.get(b)?.has(bay));
    if (!nearby && !tied && commonBays.length === 0) continue;
    const intersection = footprintIntersection(footprintOf.get(a)!, footprintOf.get(b)!);
    const overlap = footprintArea(intersection);
    if (overlap === 0) continue;
    if (!(overlap > 0) || !Number.isFinite(overlap)) {
      refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    }
    const elevations = intersection.flatMap(([exterior]) => exterior!.map(point =>
      [a.plane?.(point) ?? NaN, b.plane?.(point) ?? NaN] as const));
    const withinDeck = samePhysicalDeck(elevations, maxShellDeckRise);
    const above = elevations.every(([height, reference]) => height - reference > tolerance);
    const below = elevations.every(([height, reference]) => height - reference < -tolerance);
    const sameDeck = tied && withinDeck;
    if (!sameDeck && (above || below) && !commonBays.some(({ bay }) => overlapsBay(bay, intersection))) continue;
    if (!sameDeck || (!above && !below)) refuseGravityGeometry(shellOverlapMessage(a, b));
    const upper = above ? a : b, lower = above ? b : a;
    (coveredBy.get(lower) ?? coveredBy.set(lower, new Set()).get(lower)!).add(upper);
    join(shellCarriers.get(lower)!, shellCarriers.get(upper)!);
  }

  const owners = new Set<S>();
  for (const [shell, carrier] of shellCarriers) {
    const above = coveredBy.get(shell);
    if (!above) {
      owners.add(shell);
      continue;
    }
    const upperOwners = [...above].filter(upper => !coveredBy.has(upper));
    const uncovered = subtractFootprints(carrier.footprint, upperOwners.map(upper => footprintOf.get(upper)!));
    if (footprintArea(uncovered) !== 0) {
      refuseGravityGeometry(shellOverlapMessage(shell, above.values().next().value!));
    }
    coveredBy.set(shell, new Set(upperOwners));
    carrier.assigned = [];
  }

  for (const shell of owners) {
    const servedBays = serving.get(shell);
    if (!servedBays || servedBays.size < 2) continue;
    const footprint = footprintOf.get(shell)!;
    for (const [{ bay: a }, { bay: b }] of potentiallyOverlapping([...servedBays], ({ bay }) => bay.boundary[0]!)) {
      const originalOverlap = footprintIntersection(frameFor(a).boundary, inFrame(a, b.boundary));
      if (!originalOverlap.length) continue;
      const sharedWithShell = footprintIntersection(originalOverlap, inFrame(a, footprint));
      if (inBayDeck(a, sharedWithShell, eligibleFor.get(a)!.get(shell)!, eligibleFor.get(b)!.get(shell)!, maxShellDeckRise) === false) {
        refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
      }
    }
  }

  const assignments = new Map<FloorBay, BayAssignment>();
  for (const { bay } of bays) {
    const carrier = bayCarriers.get(bay)!;
    const eligible = eligibleFor.get(bay)!;
    const bayOwners = [...eligible.keys()].filter(shell => owners.has(shell));
    for (const shell of bayOwners) join(carrier, shellCarriers.get(shell)!);
    const partition = partitionShellCoverage(bay.sides, bay.holes, bayOwners.map(shell => footprintOf.get(shell)!), bay.span);
    carrier.assigned = partition.kind === 'uncovered' ? [bay.boundary]
      : partition.kind === 'strips' ? partition.polygons.map(poly => [poly]) : [];
    const shadowed = [...eligible].filter(([shell]) => coveredBy.has(shell));
    if (carrier.assigned.length && shadowed.length) {
      const assignedInBay = carrier.assigned.map(polygon => inFrame(bay, polygon));
      for (const [shell, deck] of shadowed) {
        const upperOwners = coveredBy.get(shell)!;
        const reclaimed = footprintIntersection(assignedInBay, inFrame(bay, footprintOf.get(shell)!));
        for (const upper of upperOwners) {
          const overlap = footprintIntersection(reclaimed, inFrame(bay, footprintOf.get(upper)!));
          if (inBayDeck(bay, overlap, upper.plane, deck, maxShellDeckRise)) {
            refuseGravityGeometry(shellOverlapMessage(shell, upper));
          }
        }
      }
    }
    assignments.set(bay, { partition, region: carrier.assigned });
  }

  for (const [a, b] of potentiallyOverlapping(bays, ({ bay }) => bay.boundary[0]!)) {
    const first = bayCarriers.get(a.bay)!, second = bayCarriers.get(b.bay)!;
    if ((Math.abs(a.z - b.z) <= tolerance || baysTied(a.bay, b.bay))
      && overlapsBay(a.bay, [second.footprint])) {
      const localFirst = first.assigned.map(footprint => inFrame(a.bay, footprint));
      const localSecond = second.assigned.map(footprint => inFrame(a.bay, footprint));
      if (localFirst.length && localSecond.length && footprintsOverlap(localFirst, localSecond)) {
        refuseGravityGeometry(msg('loadPlan.gravity.overlappingBays', { first: bayMembers(a.bay), second: bayMembers(b.bay) }));
      }
      join(first, second);
    }
  }

  const groups = new Map<FloorCarrier, FloorCarrier[]>();
  for (const carrier of [...shellCarriers.values(), ...bayCarriers.values()]) {
    const floor = root(carrier);
    (groups.get(floor) ?? groups.set(floor, []).get(floor)!).push(carrier);
  }
  for (const carriers of groups.values()) {
    const frame = carriers.find(carrier => carrier.bay)?.bay;
    const inFloor = (polygon: Polygon) => frame && carriers.length > 1 ? inFrame(frame, polygon) : polygon;
    const union = footprintArea(unionFootprints(carriers.map(carrier => inFloor(carrier.footprint))));
    const assigned = carriers.flatMap(carrier => carrier.assigned.map(inFloor));
    const areas = new Sum();
    for (const polygon of assigned) areas.add(footprintArea([polygon]));
    const ownedUnion = footprintArea(unionFootprints(assigned));
    if (!agrees(areas.value, ownedUnion, union) || !agrees(ownedUnion, union, union)) {
      refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    }
  }
  const shellBayMembers = new Map<number, ReadonlySet<number>>();
  for (const shell of owners) {
    const servedBays = serving.get(shell);
    if (servedBays) shellBayMembers.set(shell.id, new Set([...servedBays].flatMap(({ bay }) => bay.members)));
  }
  return { shells: owners, shadowedBy: coveredBy, shellBayMembers, bays: assignments };
}
