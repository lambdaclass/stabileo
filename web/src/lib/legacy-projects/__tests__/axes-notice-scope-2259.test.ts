import { expect, it } from 'vitest';
import declaredQuantities from 'virtual:result-change-quantities';
import axesNotice from '../../provenance/result-changes/global-axes-inputs.json';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { modelFeatures } from '../../provenance/model-features';
import { conditionHolds } from '../../provenance/applicability';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';
import { declaresMove, judge } from '../legacy';

it('the axes notice cannot explain an unrelated solver change even on an axes-marked model', () => {
  const metadata = RESULT_CHANGES.changes.find(change => change.id === axesNotice.id);
  expect(metadata).toBeDefined();
  const entry = { ...metadata!, quantities: declaredQuantities[axesNotice.id] };
  expect(entry.quantities).toBeUndefined();
  const when = entry.when;
  if (!when) throw new Error('Axes notice must declare its applicability');
  for (const analysisMode of ['2d', '3d', 'pro']) {
    const features = [...modelFeatures({ analysisMode, loadCases: [{ id: 1, axisNamed: true }] })];
    expect(conditionHolds(when, new Set(features))).toBe(true);
    for (const family of ['base', 'case[1]', 'combo[1]', 'pdelta.results', 'nonlinear.results']) {
      for (const quantity of ['displacements[n1].ux', 'reactions[n1].rz', 'elementForces[e1].nStart']) {
        const path = `${family}.${quantity}`;
        expect(fieldCovered(axesNotice, path, features), path).toBe(false);
        expect(declaresMove(entry, path), path).toBe(false);
        const before = { 'solve.ok': true, [path]: 1 };
        expect(judge('unchanged solver answer', before, before, [entry]).kind).toBe('same');
        expect(judge('unrelated solver change', before, { ...before, [path]: 2 }, [entry]).kind).toBe('unexplained');
      }
    }
    expect(judge('new refusal', { 'solve.ok': true }, { 'solve.ok': false }, [entry]).kind).toBe('unexplained');
    expect(judge('new acceptance', { 'solve.ok': false }, { 'solve.ok': true }, [entry]).kind).toBe('unexplained');
  }
});
