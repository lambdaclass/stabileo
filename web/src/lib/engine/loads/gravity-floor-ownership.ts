import type { MultiPolygon, Polygon } from 'polygon-clipping';
import { agrees, Sum } from '../accounting-math';
import { msg } from '../../codes/message';
import type { FloorBay } from './floor-loads';
import {
  bayFrame, canonicalFootprint, footprintArea, footprintIntersection, footprintsOverlap, partitionShellCoverage,
  potentiallyOverlapping, refuseGravityGeometry, shellOverlapMessage, subtractFootprints, unionFootprints,
  type BayPartition, type ShellFootprint,
} from './gravity-shell-partition';

export type GravityBay<S> = {
  bay: FloorBay;
  z: number;
  shells: readonly S[];
};

type FloorCarrier = {
  footprint: Polygon;
  assigned: MultiPolygon;
  bay?: FloorBay;
};

export function partitionGravityFloors<S extends ShellFootprint>(
  shells: readonly S[], bays: readonly GravityBay<S>[], tolerance: number,
  shellsTied: (a: S, b: S) => boolean,
  baysTied: (a: FloorBay, b: FloorBay) => boolean,
): { shells: Set<S>; shadowedBy: ReadonlyMap<S, ReadonlySet<S>>; bays: Map<FloorBay, BayPartition> } {
  const footprintOf = new Map(shells.map(shell => [shell, [canonicalFootprint(shell.poly)]]));
  const elevations = new Map(shells.map(shell => [shell, shell.pts.map(p => p[2])]));
  const frames = new Map<FloorBay, ReturnType<typeof bayFrame>>();
  const frameFor = (bay: FloorBay) => frames.get(bay) ?? frames.set(bay, bayFrame(bay.sides, bay.holes)).get(bay)!;
  const inFrame = (bay: FloorBay, footprint: Polygon) => footprint.map(ring => ring.map(frameFor(bay).local));
  const overlapsBay = (bay: FloorBay, footprint: MultiPolygon) =>
    footprintsOverlap(frameFor(bay).boundary, footprint.map(polygon => inFrame(bay, polygon)));
  const eligibleFor = new Map<FloorBay, S[]>();
  const serving = new Map<S, Set<GravityBay<S>>>();
  for (const bay of bays) {
    const eligible = bay.shells.filter(shell => overlapsBay(bay.bay, [footprintOf.get(shell)!]));
    eligibleFor.set(bay.bay, eligible);
    for (const shell of eligible) (serving.get(shell) ?? serving.set(shell, new Set()).get(shell)!).add(bay);
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
    const aZ = elevations.get(a)!, bZ = elevations.get(b)!;
    const nearby = Math.min(...aZ) <= Math.max(...bZ) + tolerance && Math.min(...bZ) <= Math.max(...aZ) + tolerance;
    const commonBays = [...serving.get(a) ?? []].filter(bay => serving.get(b)?.has(bay));
    if (!nearby && !tied && commonBays.length === 0) continue;
    const intersection = footprintIntersection(footprintOf.get(a)!, footprintOf.get(b)!);
    const overlap = footprintArea(intersection);
    if (overlap === 0) continue;
    if (!(overlap > 0) || !Number.isFinite(overlap) || !a.plane || !b.plane) {
      refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    }
    const differences = intersection.flatMap(([exterior]) => exterior!.map(point => a.plane!(point) - b.plane!(point)));
    if (differences.some(difference => !Number.isFinite(difference))) {
      refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    }
    const above = differences.every(difference => difference > tolerance);
    const below = differences.every(difference => difference < -tolerance);
    if (!tied && (above || below) && !commonBays.some(({ bay }) => overlapsBay(bay, intersection))) continue;
    if (!tied || (!above && !below)) refuseGravityGeometry(shellOverlapMessage(a, b));
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
    const uncovered = subtractFootprints(carrier.footprint, [...above].map(upper => footprintOf.get(upper)!));
    if (footprintArea(uncovered) !== 0) {
      refuseGravityGeometry(shellOverlapMessage(shell, above.values().next().value!));
    }
    carrier.assigned = [];
  }

  const partitions = new Map<FloorBay, BayPartition>();
  for (const { bay } of bays) {
    const carrier = bayCarriers.get(bay)!;
    const serving = eligibleFor.get(bay)!;
    for (const shell of serving) join(carrier, shellCarriers.get(shell)!);
    const partition = partitionShellCoverage(bay.sides, bay.holes, serving.map(shell => footprintOf.get(shell)!), bay.span);
    partitions.set(bay, partition);
    carrier.assigned = partition.kind === 'uncovered' ? [bay.boundary]
      : partition.kind === 'strips' ? partition.polygons.map(poly => [poly]) : [];
  }

  for (const [a, b] of potentiallyOverlapping(bays, ({ bay }) => bay.boundary[0]!)) {
    const first = bayCarriers.get(a.bay)!, second = bayCarriers.get(b.bay)!;
    if ((Math.abs(a.z - b.z) <= tolerance || baysTied(a.bay, b.bay))
      && overlapsBay(a.bay, [second.footprint])) {
      const localFirst = first.assigned.map(footprint => inFrame(a.bay, footprint));
      const localSecond = second.assigned.map(footprint => inFrame(a.bay, footprint));
      if (localFirst.length && localSecond.length && footprintsOverlap(localFirst, localSecond)) {
        const members = (bay: FloorBay) => [...bay.members].sort((x, y) => x - y).join(', ');
        refuseGravityGeometry(msg('loadPlan.gravity.overlappingBays', { first: members(a.bay), second: members(b.bay) }));
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
  return { shells: owners, shadowedBy: coveredBy, bays: partitions };
}
