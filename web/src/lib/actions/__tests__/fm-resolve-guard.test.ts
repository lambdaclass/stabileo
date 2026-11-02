import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelStore, uiStore, fmStepsStore } from '../../store';
import * as solve from '../../engine/force-method/solve';
import * as scope from '../../engine/step-by-step-scope';
import { resolveFlexibility } from '../fm-fundamental';

function portal() {
  modelStore.clear();
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
  modelStore.addElement(a, b); modelStore.addElement(b, c); modelStore.addElement(d, c);
  modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
  modelStore.addNodalLoad(b, 10, 0, 0);
}

afterEach(() => { vi.restoreAllMocks(); fmStepsStore.close(); modelStore.clear(); });

describe('solving the open flexibility wizard again checks the model as opening it does', () => {
  it('a model inside the scope is solved again', () => {
    portal();
    expect(resolveFlexibility({ axial: false })).toBe(true);
    expect(fmStepsStore.result).not.toBeNull();
  });

  it('sliding joints added after opening: refused with the same toast, nothing solved', () => {
    portal();
    vi.spyOn(modelStore, 'hasSlidingJoints').mockReturnValue(true);
    const toast = vi.spyOn(uiStore, 'toast');
    const run = vi.spyOn(solve, 'solveForceMethod');
    expect(resolveFlexibility({ axial: false })).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('a model grown past the step-by-step scope: refused, nothing solved', () => {
    portal();
    vi.spyOn(scope, 'stepByStepScope').mockReturnValue({ ok: false, reason: 'tooBig', dofs: 999 });
    const run = vi.spyOn(solve, 'solveForceMethod');
    expect(resolveFlexibility({ axial: true })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
