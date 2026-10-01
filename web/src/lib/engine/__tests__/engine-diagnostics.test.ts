/**
 * The engine's older diagnostics reach the panel with a source and in the reader's language, and
 * a semi-rigid end the solve cannot honour is reported before the solve.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readSolverDiagnostic } from '../engine-diagnostics';
import { checkModel } from '../model-diagnostics';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { t, setLocale } from '../../i18n';

describe('the engine\'s own lines', () => {
  beforeEach(() => { setLocale('es'); });

  it('get a source and a translation, numbers kept', () => {
    const d = readSolverDiagnostic({ category: 'solver_path', severity: 'info', message: 'Sparse Cholesky solver (456 free DOFs)' }, t);
    expect(d.source).toBe('solver');
    expect(d.code).toBe('SOLVER_SOLVER_PATH');
    expect(d.message).toContain('456');
    expect(d.message).not.toMatch(/free DOFs/);
    const c = readSolverDiagnostic({ category: 'conditioning', severity: 'warning', message: 'High diagonal ratio 3.2e9 — potential conditioning issues' }, t);
    expect(c.message).toContain('3.2e9');
  });

  it('an unknown line keeps its text', () => {
    expect(readSolverDiagnostic({ severity: 'info', message: 'Something new' }, t).message).toBe('Something new');
  });
});

describe('semi-rigid ends', () => {
  beforeEach(() => { modelStore.clear(); });
  const m = () => ({ ...modelStore.model, loads: modelStore.loads as never });

  it('on a sloped member they are named before the solve refuses them; on a level beam they are not', () => {
    const a = modelStore.addNode(0, 0, 4), b = modelStore.addNode(5, 0, 4), c = modelStore.addNode(10, 0, 5);
    const beam = modelStore.addElement(a, b, 'frame');
    const rafter = modelStore.addElement(b, c, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.updateElement(beam, { semiRigid: { i: { ky: 1000, kz: 1000 } } } as never);
    modelStore.updateElement(rafter, { semiRigid: { i: { ky: 1000, kz: 1000 } } } as never);
    const d = checkModel(m()).find((x) => x.code === 'MODEL_SEMIRIGID_NOT_ALIGNED');
    expect(d?.elementIds).toEqual([rafter]);
  });
});
