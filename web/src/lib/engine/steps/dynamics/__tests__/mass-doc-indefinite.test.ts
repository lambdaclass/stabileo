import { describe, it, expect, vi, afterEach } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { methodContext } from '../../../../store/explained-steps.svelte';
import { setDynamicsSettings, resetDynamicsSettings } from '../../../dynamics/course/settings';

const shift = vi.hoisted(() => ({ first: 0, own: 0 }));
vi.mock('../../../dynamics/course/dense', async (orig) => {
  const mod = await orig<typeof import('../../../dynamics/course/dense')>();
  return {
    ...mod,
    generalizedEigen: (K: number[][], M: number[][]) => {
      const r = mod.generalizedEigen(K, M);
      if (!shift.first && !shift.own) return r;
      const lambda = [...r.lambda];
      lambda[0] = shift.own ? shift.own * r.error[0] : shift.first * Math.max(...lambda.map(Math.abs));
      return { ...r, lambda };
    },
  };
});

import { massApplies, buildMass } from '../mass-doc';

async function cantilever() {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  await modelStore.loadExample('cantilever');
  setDynamicsSettings({ mass: { nPerMember: 2, massModel: 'consistent' } });
  return methodContext('massDiscretization')!;
}

afterEach(() => { shift.first = 0; shift.own = 0; resetDynamicsSettings(); });

describe('the distributed mass document with a negative eigenvalue', () => {
  it('a clearly negative λ is refused as indefinite, not drawn as a 0 Hz mode', async () => {
    const ctx = await cantilever();
    shift.first = -1e-3;
    const r = massApplies(ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('course.dynamics.mdof.err.indefinite');
  });

  it('a negative λ within its own error bound is a rigid mode of 0 Hz', async () => {
    const ctx = await cantilever();
    shift.own = -0.5;
    expect(massApplies(ctx).ok).toBe(true);
    const freq = buildMass(ctx).steps[4].blocks.find((b) => b.kind === 'table');
    if (freq?.kind !== 'table') throw new Error('no frequency table');
    expect(freq.rows[0][1]).toBe(0);
  });
});
