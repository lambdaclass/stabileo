import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelStore, uiStore, fmStepsStore } from '../../store';
import * as solve from '../../engine/force-method/solve';
import * as scope from '../../engine/step-by-step-scope';
import { resolveFlexibility, switchFlexibilityAxial, chooseAutoFundamental, choiceError } from '../fm-fundamental';
import { fmChoice } from '../../store/fm-choice.svelte';

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

describe('the axial switch of the flexibility wizard', () => {
  it('goes back to the assumption in use when the solve is refused', () => {
    portal();
    vi.spyOn(modelStore, 'hasSlidingJoints').mockReturnValue(true);
    const box = { checked: false };
    expect(switchFlexibilityAxial(box, true)).toBe(false);
    expect(box.checked).toBe(true);
  });

  it('keeps the new assumption when the solve succeeds', () => {
    portal();
    const box = { checked: false };
    expect(switchFlexibilityAxial(box, true)).toBe(true);
    expect(box.checked).toBe(false);
    expect(fmStepsStore.result?.axial).toBe(false);
  });
});

describe('going back to the automatic primary structure', () => {
  it('a refused solve leaves the toggle on manual, with the primary that is on screen', () => {
    portal();
    fmChoice.setMode('manual');
    vi.spyOn(solve, 'solveForceMethod').mockImplementation(() => { throw new Error('refused'); });
    expect(chooseAutoFundamental('manual')).toBe(false);
    expect(fmChoice.mode).toBe('manual');
    expect(fmChoice.error).not.toBeNull();
  });

  it('a solved one switches the toggle to auto', () => {
    portal();
    fmChoice.setMode('manual');
    expect(chooseAutoFundamental('manual')).toBe(true);
    expect(fmChoice.mode).toBe('auto');
    expect(fmChoice.applied).toBeNull();
  });
});

describe('why a chosen primary structure was not solved', () => {
  it('a failure of the method itself is reported as a solver error, never as "no redundants"', () => {
    expect(choiceError(new Error('index out of range')).key).toBe('toast.detailedSolverError');
    expect(choiceError(new solve.ForceMethodError('noRedundants')).key).toBe('course.statics.err.noRedundants');
  });
});
