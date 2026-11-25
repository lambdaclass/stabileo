import { expect, it } from 'vitest';
import { assessProject, conditionHolds } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { ANALYSIS_KINDS, modelFeatures, type FeatureSnapshot } from '../model-features';
import { GRAVITY_SELF_WEIGHT } from '../../engine/analysis-settings';
import { stampSolve } from '../solve-stamp';
import declaration from '../result-changes/distributed-load-diagram-integration.json';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';

const entry = RESULT_CHANGES.changes.find(c => c.id === 'distributed-load-diagram-integration')!;

it('known wrong result: #2223 — distributed diagrams require members even with self-weight or orphan loads', () => {
  for (const action of ['selfWeight', 'distributedMemberLoads']) {
    for (const analysis of ANALYSIS_KINDS) {
      const features = [action, `analysis:${analysis}`];
      for (const structure of [[], ['shells'], ['connectors'], ['springs']]) {
        expect(conditionHolds(entry.when!, new Set([...features, ...structure]))).toBe(false);
      }
      expect(conditionHolds(entry.when!, new Set(features)), features.join(',')).toBe(false);
      expect(fieldCovered(declaration, 'base.diagrams[0].moment[0]', features)).toBe(false);
    }
  }
});

it('known wrong result: #2223 — unrelated older nodal projects have no diagram notice in either dimension', () => {
  for (const analysisMode of ['2d', '3d', 'pro']) {
    for (const analysis of ['linear', 'nonlinear'] as const) {
      const stamp = { ...stampSolve(analysis, null), resultsVersion: RESULT_CHANGES.currentResultsVersion - 1 };
      const snapshot: FeatureSnapshot = {
        analysisMode,
        supports: [[1, { nodeId: 1, type: analysisMode === '2d' ? 'fixed' : 'fixed3d' }]],
        loads: [{ type: 'nodal3d', data: { nodeId: 1, fz: -20, caseId: 1 } }],
        loadCases: [{ id: 1, type: 'D' }],
        includeSelfWeight: true,
      };
      expect(assessProject(snapshot, stamp, analysisMode).changes).toEqual([]);
    }
  }
});

it.skip('known wrong result: #2539 — planar nonlinear resultants require structural evidence', () => {
  const change = RESULT_CHANGES.changes.find(c => c.id === 'planar-nonlinear-resultants');
  expect(change).toBeDefined();
  const snapshots: Array<[string, FeatureSnapshot]> = [
    ['nodal only', { supports: [[1, { nodeId: 1, type: 'fixed' }]] }],
    ['member', { elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]] }],
    ['spring', { supports: [[1, { nodeId: 1, type: 'spring', kx: 1 }]] }],
    ['constraint', { constraints: [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0] }] }],
  ];
  for (const analysisMode of ['2d', '3d', 'pro']) {
    for (const analysis of ['linear', 'nonlinear'] as const) {
      for (const [structure, snapshot] of snapshots) {
        const model: FeatureSnapshot = {
          ...snapshot, analysisMode,
          loads: [{ type: 'nodal3d', data: { nodeId: 1, fx: 1 } }],
        };
        const expected = analysisMode === '2d' && analysis === 'nonlinear' && structure !== 'nodal only';
        const label = `${analysisMode} ${analysis} ${structure}`;
        for (const offset of [-1, 0, 1]) {
          const stamp = { ...stampSolve(analysis, null), resultsVersion: change!.resultsVersion + offset };
          const changes = assessProject(model, stamp, analysisMode).changes;
          expect(changes.some(c => c.id === change!.id), `${label} version offset ${offset}`)
            .toBe(expected && offset === -1);
        }
        const features = modelFeatures(model, { analysesRun: [analysis], analysesRecorded: ANALYSIS_KINDS });
        expect(fieldCovered(change, 'nonlinear.results.reactions[0].rx', [...features]), label).toBe(expected);
      }
    }
  }
});

it('#2223 — loaded member diagrams keep their notice across histories and version boundaries', () => {
  for (const analysisMode of ['2d', '3d', 'pro']) {
    for (const analysis of ANALYSIS_KINDS) {
      for (const action of ['selfWeight', 'distributedMemberLoads']) {
        const features = new Set(['members', action, `analysis:${analysis}`]);
        expect(conditionHolds(entry.when!, features)).toBe(true);
        if (analysis === 'linear') expect(fieldCovered(declaration, 'base.diagrams[0].moment[0]', [...features])).toBe(true);
        for (const offset of [-1, 0, 1]) {
          const stamp = { ...stampSolve(analysis, null), resultsVersion: entry.resultsVersion + offset };
          const changes = assessProject({}, stamp, analysisMode, RESULT_CHANGES, features).changes.map(c => c.id);
          expect(changes.includes(entry.id)).toBe(offset < 0);
        }
        expect(assessProject({}, null, analysisMode, RESULT_CHANGES, features).changes.map(c => c.id)).toContain(entry.id);
      }
    }
  }
});

it('#2223 — shells alone and unloaded, nodal, point or axial member loads do not change member diagrams', () => {
  for (const structure of [[], ['members'], ['shells'], ['connectors'], ['springs']]) {
    for (const action of [[], ['nodalForces'], ['nodalMoments'], ['pointOrPartialMemberLoads'], ['memberLoads']]) {
      expect(conditionHolds(entry.when!, new Set([...structure, ...action]))).toBe(false);
    }
  }
});

const loadingSnapshots: Array<{ name: string; snapshot: FeatureSnapshot }> = [
  ...[false, true].flatMap(isGlobal => [false, true].map(partial => ({
    name: `planar ${isGlobal ? 'global' : 'local'} ${partial ? 'partial' : 'full'}`,
    snapshot: { loads: [{ type: 'distributed', data: { elementId: 1, qI: 0, qJ: 1, isGlobal, ...(partial ? { a: 0.25, b: 0.75 } : {}) } }] },
  }))),
  ...[undefined, 'local', 'global', 'projected'].flatMap(frame => ['X', 'Y', 'Z'].flatMap(axis => [false, true].map(partial => ({
    name: `spatial ${frame ?? 'default'} ${axis} ${partial ? 'partial' : 'full'}`,
    snapshot: { loads: [{ type: 'distributed3d', data: {
      elementId: 1, qXI: 0, qXJ: 0, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
      [`q${axis}J`]: 1, ...(frame ? { frame } : {}), ...(partial ? { a: 0.25, b: 0.75 } : {}),
    } }] },
  })))),
  { name: 'legacy self-weight', snapshot: { includeSelfWeight: true } },
  { name: 'saved self-weight rule', snapshot: { analysis: { selfWeight: [{ caseId: 1, ...GRAVITY_SELF_WEIGHT }] } } },
];

it.each(loadingSnapshots)('#2223 — $name retains diagram applicability through snapshot feature extraction', ({ name, snapshot }) => {
  for (const analysisMode of ['2d', '3d', 'pro']) {
    for (const analysis of ['linear', 'nonlinear'] as const) {
      const loaded: FeatureSnapshot = {
        ...snapshot, analysisMode,
        elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
      };
      const context = { analysesRun: [analysis], analysesRecorded: ANALYSIS_KINDS };
      const features = modelFeatures(loaded, context);
      const stamp = { ...stampSolve(analysis, null), resultsVersion: entry.resultsVersion - 1 };
      expect(features.has('members'), name).toBe(true);
      expect(features.has(snapshot.loads ? 'distributedMemberLoads' : 'selfWeight'), name).toBe(true);
      expect(conditionHolds(entry.when!, features), name).toBe(true);
      expect(fieldCovered(declaration, 'base.diagrams[0].moment[0]', [...features]), name).toBe(true);
      expect(assessProject(loaded, stamp, analysisMode).changes.map(c => c.id), name).toContain(entry.id);
      const memberless = { ...loaded, elements: [] };
      const memberlessFeatures = modelFeatures(memberless, context);
      expect(conditionHolds(entry.when!, memberlessFeatures), name).toBe(false);
      expect(fieldCovered(declaration, 'base.diagrams[0].moment[0]', [...memberlessFeatures]), name).toBe(false);
      expect(assessProject(memberless, stamp, analysisMode).changes.map(c => c.id), name).not.toContain(entry.id);
    }
  }
});
