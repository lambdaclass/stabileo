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
  for (const key of Object.keys(emptyCleanup()) as (keyof CleanupReport)[]) report[key] += next[key];
}

function checkTolerance(tol: number): void {
  if (!Number.isFinite(tol) || tol <= 0) throw new RangeError('Topology tolerance must be finite and positive');
}

export function topologyPreview(tol = weldTolerance()): TopologyPreview {
  checkTolerance(tol);
  const ids = [...modelStore.elements.keys()];
  return {
    coincidentNodes: coincidentNodeGroups(tol).reduce((n, group) => n + group.length - 1, 0),
    crossings: crossingPairs(ids).length,
    atNodes: nodesOnMembers(modelStore.nodes, modelStore.elements.values(), { tol }).length,
  };
}

export function connectTopology(tol = weldTolerance()): TopologyReport {
  checkTolerance(tol);
  const report: TopologyReport = {
    ...emptyCleanup(), intersections: emptyCut(), atNodes: emptyCut(), finalMerge: emptyCleanup(),
  };
  modelStore.batch(() => {
    accumulate(report, mergeCoincidentNodes(tol));
    const all = () => [...modelStore.elements.keys()];
    report.intersections = intersectMembers(all());
    report.atNodes = splitAtNodes(all());
    report.finalMerge = mergeCoincidentNodes(tol);
    accumulate(report, report.finalMerge);
    accumulate(report, removeZeroLengthMembers(tol));
    accumulate(report, removeDuplicateMembers());
  });
  return report;
}
