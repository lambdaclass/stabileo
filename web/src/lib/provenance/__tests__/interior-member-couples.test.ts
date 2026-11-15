import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const entry = RESULT_CHANGES.changes.find(c => c.id === 'interior-member-couples')!;

it.each(['2d', '3d'])('saved %s member loads receive the recovery notice until recomputed', mode => {
  const model: FeatureSnapshot = {
    analysisMode: mode,
    elements: [[1, { id: 1, type: 'frame', nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1 }]],
    loads: [{ type: mode === '2d' ? 'pointOnElement' : 'distributed3d', data: { elementId: 1, a: 2, p: 0, my: 6 } }],
  };
  const ids = (stamp?: SolveStamp) => assessProject(model, stamp).changes.map(c => c.id);
  expect(ids()).toContain(entry.id);
  for (const analysis of ['linear', 'pdelta'] as const) {
    const stamp: SolveStamp = { id: 'couple-recovery', resultsSchemaVersion: 1, appVersion: 'test', engineVersion: 'test',
      commit: 'test', wasmHash: 'test', solvedAt: '2026-11-15T00:00:00Z', resultsVersion: entry.resultsVersion - 1,
      analyses: [analysis], recorded: [analysis] };
    expect(ids(stamp)).toContain(entry.id);
    expect(ids({ ...stamp, resultsVersion: entry.resultsVersion })).not.toContain(entry.id);
  }
  expect(assessProject({ ...model, loads: [] }, undefined).changes.map(c => c.id)).not.toContain(entry.id);
});

it.each(['2d', '3d'])('saved %s nodal-load members receive the round-4 notice', mode => {
  const recovery = RESULT_CHANGES.changes.find(c => c.id === 'member-recovery-round4')!;
  const model: FeatureSnapshot = {
    analysisMode: mode,
    elements: [[1, { id: 1, type: 'frame', nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1 }]],
    loads: [{ type: 'nodal', data: { nodeId: 1, fz: 1 } }],
  };
  expect(assessProject(model, undefined).changes.map(c => c.id)).toContain(recovery.id);
  expect(assessProject({ ...model, elements: [] }, undefined).changes.map(c => c.id)).not.toContain(recovery.id);
  const stamp: SolveStamp = { id: 'round4-recovery', resultsSchemaVersion: 1, appVersion: 'test', engineVersion: 'test',
    commit: 'test', wasmHash: 'test', solvedAt: '2026-11-15T00:00:00Z', resultsVersion: recovery.resultsVersion,
    analyses: ['linear'], recorded: ['linear'] };
  expect(assessProject(model, stamp).changes.map(c => c.id)).not.toContain(recovery.id);
  expect(assessProject(model, { ...stamp, resultsVersion: recovery.resultsVersion - 1 }).changes.map(c => c.id)).toContain(recovery.id);
});
