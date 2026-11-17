import { expect, it } from 'vitest';
import { assessProject, conditionHolds } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { ANALYSIS_KINDS, type FeatureSnapshot } from '../model-features';
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
