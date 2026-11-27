import { modelStore } from '../../store/model.svelte';
import { nodesOnMembers } from '../../engine/nodes-on-members';
import { weldTolerance } from '../weld-tolerance';
import {
  coincidentNodeGroups, mergeCoincidentNodes, removeDuplicateMembers, removeZeroLengthMembers,
  type CleanupReport,
} from './cleanup';
import { crossingPairs, intersectMembers, splitAtNodes, type CutReport } from './cut-members';

export interface TopologyPreview {
  coincidentNodes: number;
  crossings: number;
  atNodes: number;
}

export interface TopologyReport extends CleanupReport {
  intersections: CutReport;
  atNodes: CutReport;
  finalMerge: CleanupReport;
}

const emptyCleanup = (): CleanupReport => ({
  mergedNodes: 0, droppedSupports: 0, removedDuplicates: 0, removedLoadsOnDuplicates: 0,
  removedZeroLength: 0, removedOrphans: 0,
});

const emptyCut = (): CutReport => ({ cut: [], nodes: [], reinforcementDropped: 0, variableNotCut: 0 });

function accumulate(report: CleanupReport, next: CleanupReport): void {
  for (const key of Object.keys(emptyCleanup()) as (keyof CleanupReport)[]) report[key] += next[key] ?? 0;
}

function checkTolerance(tol: number): void {
  if (!Number.isFinite(tol) || tol <= 0) throw new RangeError('Topology tolerance must be finite and positive');
}

function initialNodeMap(tol: number): Map<number, number> {
  const to = new Map<number, number>();
  for (const group of coincidentNodeGroups(tol)) for (const id of group.slice(1)) to.set(id, group[0]!);
  return to;
}

export function topologyPreview(tol = weldTolerance()): TopologyPreview {
  checkTolerance(tol);
  const to = initialNodeMap(tol);
  const mapped = (id: number) => to.get(id) ?? id;
  const valid = (id: number) => {
    const e = modelStore.elements.get(id);
    return !!e && mapped(e.nodeI) !== mapped(e.nodeJ);
  };
  const crossings = crossingPairs([...modelStore.elements.keys()].filter(valid), undefined, tol).filter(({ a, b }) => {
    const ea = modelStore.elements.get(a)!, eb = modelStore.elements.get(b)!;
    return ![mapped(ea.nodeI), mapped(ea.nodeJ)].some((n) => n === mapped(eb.nodeI) || n === mapped(eb.nodeJ));
  });
  const atNodes = new Set(nodesOnMembers(modelStore.nodes, modelStore.elements.values(), { tol })
    .filter((hit) => valid(hit.elementId)).map((hit) => hit.elementId));
  return {
    coincidentNodes: coincidentNodeGroups(tol).reduce((n, group) => n + group.length - 1, 0),
    crossings: crossings.length,
    atNodes: atNodes.size,
  };
}

export function connectTopology(tol = weldTolerance()): TopologyReport {
  checkTolerance(tol);
  const report: TopologyReport = {
    ...emptyCleanup(), intersections: emptyCut(), atNodes: emptyCut(), finalMerge: emptyCleanup(),
  };
  modelStore.batch(() => {
    accumulate(report, mergeCoincidentNodes(tol));
    accumulate(report, removeZeroLengthMembers(tol));
    const all = () => [...modelStore.elements.keys()];
    report.intersections = intersectMembers(all(), undefined, tol);
    report.atNodes = splitAtNodes(all(), undefined, tol);
    report.finalMerge = mergeCoincidentNodes(tol);
    accumulate(report, report.finalMerge);
    accumulate(report, removeZeroLengthMembers(tol));
    accumulate(report, removeDuplicateMembers());
  });
  return report;
}
