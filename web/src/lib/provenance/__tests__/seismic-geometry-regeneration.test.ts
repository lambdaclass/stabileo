import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const brace = 'seismic-connected-brace-crossing';
const gable = 'seismic-supported-gable';
const version = Math.min(...[brace, gable].map(id => RESULT_CHANGES.changes.find(change => change.id === id)!.resultsVersion));

function notices(points: number[][], members: number[][], generatedBy?: string) {
  const snapshot: FeatureSnapshot = {
    analysisMode: 'pro',
    nodes: points.map(([x, z], i) => [i + 1, { id: i + 1, x: x!, y: 0, z }]),
    elements: members.map(([nodeI, nodeJ], i) => [i + 1, { id: i + 1, type: 'frame', nodeI: nodeI!, nodeJ: nodeJ!, materialId: 1, sectionId: 1 }]),
    supports: [1, 2].map(nodeId => [nodeId, { nodeId, type: 'pinned3d' }]),
    loadCases: [{ id: 1, type: 'E' }],
    loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 3, caseId: 1, fx: 1, generatedBy } }],
  };
  const stamp = { ...stampSolve('linear', null), resultsVersion: version - 1 };
  return assessProject(snapshot, stamp).changes.map(change => change.id).filter(id => id === brace || id === gable);
}

const review = it.skipIf(process.env.RUN_KNOWN_WRONG !== '2586');

review('known wrong result: #2586 — restricts seismic regeneration notices to their geometry', () => {
  const portal = [[0, 0], [4, 0], [0, 4], [4, 4]];
  const frame = [[1, 3], [2, 4]];
  const generated = 'inpres103-2018';
  expect.soft(notices(portal, [...frame, [3, 4]], generated)).toEqual([]);
  expect.soft(notices([...portal, [2, 2]], [...frame, [3, 4], [1, 5], [2, 5], [5, 3], [5, 4]], generated)).toEqual([brace]);
  expect.soft(notices([...portal, [2, 5]], [...frame, [3, 5], [4, 5]], generated)).toEqual([gable]);
  expect.soft(notices([...portal, [2, 5], [0, 2]], [[1, 6], [6, 3], [2, 4], [3, 5], [4, 5]], generated)).toEqual([gable]);
  expect.soft(notices([...portal, [2, 5]], [...frame, [3, 5], [4, 5]])).toEqual([]);
});
