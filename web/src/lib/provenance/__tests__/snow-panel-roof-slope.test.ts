import { describe, expect, it } from 'vitest';
import { auditRoof } from '../../engine/loads/__tests__/snow-slope-audit-fixture';
import { gravityLayout } from '../../engine/loads/plan-gravity';
import { assessProject } from '../applicability';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { RESULT_CHANGES } from '../full-registry';
import { stampSolve } from '../solve-stamp';

const entry = RESULT_CHANGES.changes.find(c => c.id === 'snow-panel-roof-slope')!;

function snapshot(slope = 20, by: unknown = 'generator', caseType = 'S'): FeatureSnapshot {
  const model = auditRoof('gable', slope);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const carrier = layout.pieces.find(p => p.roof && p.wI > 0)!.elementId;
  return {
    analysisMode: 'pro', nodes: [...model.nodes], elements: [...model.elements],
    loadCases: [{ id: 4, type: caseType }],
    loads: [{ type: 'distributed3d', data: { caseId: 4, elementId: carrier, generatedBy: by } }],
  };
}

const concerns = (s: FeatureSnapshot) => assessProject(s, null).changes.some(c => c.id === entry.id);

describe('the pitched snow panel notice', () => {
  it.each(['mono', 'gable'] as const)('reaches saved generated snow on a %s roof', kind => {
    const model = auditRoof(kind, 20);
    const s = { ...snapshot(), nodes: [...model.nodes], elements: [...model.elements] };
    expect(modelFeatures(s).has('generatedPitchedSnowPanels')).toBe(true);
    expect(concerns(s)).toBe(true);
  });
  it('excludes a flat roof, manual snow, generated dead load and unrelated generated load', () => {
    for (const s of [snapshot(0), snapshot(20, null), snapshot(20, 'generator', 'D'), {
      ...snapshot(), loads: [
        { type: 'distributed3d', data: { caseId: 4, elementId: 1 } },
        { type: 'distributed3d', data: { caseId: 8, elementId: 1, generatedBy: 'generator' } },
      ],
    }, snapshot(20, 'stair:1'), snapshot(20, 'arch:1')]) {
      expect(concerns(s)).toBe(false);
    }
  });
  it('excludes a pitched frame loaded only by width and a generated snow load without a panel carrier', () => {
    const s = snapshot();
    const model = auditRoof('gable', 20);
    const pitched = [...model.elements.values()].find(e => {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      return a.z !== b.z && a.x === b.x && a.y !== b.y;
    })!;
    expect(concerns({ ...s, loads: [{ type: 'distributed3d', data: { caseId: 4, elementId: pitched.id, generatedBy: 'generator' } }] })).toBe(false);
    expect(concerns({ ...s, loads: [{ type: 'nodal3d', data: { caseId: 4, nodeId: 1, generatedBy: 'generator' } }] })).toBe(false);
  });
  it('recognizes nodal shares with an explicit panel carrier', () => {
    const s = snapshot(), data = s.loads![0]!.data!;
    s.loads = [{ type: 'nodal3d', data: { caseId: 4, carrier: data.elementId, generatedBy: 'generator' } }];
    expect(concerns(s)).toBe(true);
  });
  it('keeps the notice after a new solve with stale snow, and clears it only after regeneration', () => {
    const s = snapshot();
    s.designData = { loadBasis: { resultsVersion: entry.resultsVersion - 1 } };
    const stamp = { ...stampSolve('linear', null), resultsVersion: RESULT_CHANGES.currentResultsVersion };
    expect(assessProject(s, stamp).changes.map(c => c.id)).toContain(entry.id);
    s.designData.loadBasis!.resultsVersion = entry.resultsVersion;
    expect(assessProject(s, stamp).changes.map(c => c.id)).not.toContain(entry.id);
  });
});
