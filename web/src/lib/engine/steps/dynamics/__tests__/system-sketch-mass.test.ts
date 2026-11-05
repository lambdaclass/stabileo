import { describe, expect, it } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { modelSystem } from '../../../dynamics/course/mdof-system';
import { planeModel } from '../../plane-model';
import { systemSketch } from '../common';

function beam(horizontalOnly: boolean) {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  let b = 0;
  modelStore.batch(() => {
    const a = modelStore.addNode(0, 0);
    b = modelStore.addNode(4, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed');
  });
  const sys = modelSystem(modelStore.model, [{ nodeId: b, m: 2, horizontalOnly }], { nPerMember: 1, massModel: 'lumped', barMass: false });
  const pm = planeModel(modelStore.buildSolverInput(false)!);
  return { sys, sketch: systemSketch(pm, sys, new Map()) };
}

describe('the bar model sketch writes each point mass as the model has it', () => {
  it('a mass in both directions reads m', () => {
    const { sketch } = beam(false);
    expect(sketch.labels?.map((l) => l.text)).toEqual(['m = 2 t']);
  });

  it('a horizontal-only mass shows its zero vertical part instead of m = mx', () => {
    const { sys, sketch } = beam(true);
    expect(sys.points[0]).toMatchObject({ mx: 2, mz: 0 });
    expect(sketch.labels?.map((l) => l.text)).toEqual(['m_x = 2 t, m_z = 0 t']);
  });
});
