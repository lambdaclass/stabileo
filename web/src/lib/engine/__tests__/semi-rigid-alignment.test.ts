/**
 * The model check names the semi-rigid ends a solve will refuse, reading the axes the solve
 * reads. It read the member's roll alone; the solver input adds the section's rotation, so a
 * member along X on a section turned 30° passed the check and was refused by the solve.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { checkModel } from '../model-diagnostics';
import { validateAndSolve3D } from '../solver-service';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

function cantilever(rotation: number): number {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, 1);
  modelStore.updateSection(modelStore.elements.get(e)!.sectionId, { rotation } as never);
  modelStore.updateElement(e, { semiRigid: { i: { ky: 5000, kz: 5000 } } });
  return e;
}
const named = () => checkModel(modelStore.model as never).find((d) => d.code === 'MODEL_SEMIRIGID_NOT_ALIGNED')?.elementIds;

describe('semi-rigid ends on a member whose section is rotated', () => {
  it('turned 30°: the solve refuses them, and the model check names the member first', () => {
    const e = cantilever(30);
    expect(validateAndSolve3D(modelStore.model as never)).toMatch(/semi-rigid ends apply only/);
    expect(named()).toEqual([e]);
  });

  it('turned 90°: the bending axes are still global ones, so neither refuses them', () => {
    cantilever(90);
    expect(typeof validateAndSolve3D(modelStore.model as never)).not.toBe('string');
    expect(named()).toBeUndefined();
  });
});
