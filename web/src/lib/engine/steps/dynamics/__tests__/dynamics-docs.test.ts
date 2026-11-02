import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { isSolverReady } from '../../../wasm-solver';
import { methodContext } from '../../../../store/explained-steps.svelte';
import { methodById } from '../../methods';
import { setDynamicsSettings, resetDynamicsSettings } from '../../../dynamics/course/settings';
import { resolveMdof, directStepFor, newmarkDrift, DIRECT_BUDGET, DIRECT_TOL } from '../mdof-build';
import { solveSdof } from '../sdof-doc';
import { stepsEs, stepsEn, stepsPt } from '../../../../i18n/locales/steps';
import type { Block, StepDoc, Txt } from '../../doc';
import { isTxt } from '../../doc';
import { num } from '../../format';

const quiet: Array<ReturnType<typeof vi.spyOn>> = [];
beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
  for (const k of ['log', 'warn', 'info'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}));
});
afterAll(() => { quiet.forEach((s) => s.mockRestore()); });
beforeEach(() => resetDynamicsSettings());

async function load(name: string) {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  await modelStore.loadExample(name);
}

function txts(doc: StepDoc): Txt[] {
  const out: Txt[] = [doc.title, ...(doc.subtitle ? [doc.subtitle] : [])];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      for (const v of Object.values(b)) if (isTxt(v)) out.push(v);
      if (b.kind === 'table') for (const c of [...b.head, ...b.rows.flat()]) if (isTxt(c)) out.push(c);
      if (b.kind === 'sub') { if (isTxt(b.title)) out.push(b.title); walk(b.blocks); }
      if (b.kind === 'plot') for (const s of b.plot.series) if (s.label && isTxt(s.label)) out.push(s.label);
    }
  };
  walk(doc.intro);
  for (const s of doc.steps) { out.push(s.title); walk(s.blocks); }
  return out;
}

function expectTranslated(doc: StepDoc) {
  for (const x of txts(doc)) {
    for (const [code, d] of Object.entries({ es: stepsEs, en: stepsEn, pt: stepsPt })) expect(d[x.key], `${code} ${x.key}`).toBeTypeOf('string');
    const names = [...(stepsEn[x.key] ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const n of names) expect(x.params?.[n], `${x.key} {${n}}`).not.toBeUndefined();
  }
}

const build = (id: string) => {
  const ctx = methodContext(id)!;
  const m = methodById(id)!;
  const ok = m.applies(ctx);
  expect(ok, JSON.stringify(ok)).toEqual({ ok: true });
  return m.build!(ctx);
};

const texOf = (doc: StepDoc) => JSON.stringify(doc);

describe('the single degree of freedom document', () => {
  it('from the model: k of the column is 3EI/L³ and the numbers in the document are the closed forms', async () => {
    await load('dynamics-column-mass');
    const doc = build('sdof');
    expect(doc.steps.length).toBe(7);
    expectTranslated(doc);
    const EI = 30000e3 * 0.000675, k = (3 * EI) / 27;
    const sol = solveSdof(5, k, { ...resetAndGet(), source: 'model' });
    expect(texOf(doc)).toContain(`k = ${num(k)}`);
    expect(texOf(doc)).toContain(`\\\\omega = ${num(sol.props.omega)}`);
    expect(texOf(doc)).toContain(`\\\\delta = ${num(sol.props.logDec)}`);
    const cmp = doc.steps[6].blocks.find((b) => b.kind === 'compare');
    expect(cmp && cmp.kind === 'compare').toBe(true);
    if (cmp?.kind === 'compare') {
      expect(cmp.rows[0].matrix).toBeCloseTo(cmp.rows[0].method, 6);
      expect(cmp.rows[1].matrix).toBeCloseTo(cmp.rows[1].method, 4);
      for (const r of cmp.rows.slice(2)) expect(Math.abs(r.matrix - r.method)).toBeLessThan(0.02 * Math.abs(sol.h!.X * 1000) + 1e-9);
    }
  });

  it('typed m and k, every damping regime, with and without force', async () => {
    await load('cantilever');
    for (const xi of [0, 0.05, 1, 1.5]) {
      for (const F0 of [0, 10]) {
        setDynamicsSettings({ sdof: { source: 'manual', m: 2, k: 800, xi, F0, u0: 0.01, v0: 0.05 } });
        const doc = build('sdof');
        expectTranslated(doc);
        expect(doc.steps.length).toBe(F0 ? 7 : 6);
        expect(doc.steps[3].blocks.some((b) => b.kind === 'plot')).toBe(true);
      }
    }
  });

  it('says why when the node has no mass', async () => {
    await load('cantilever');
    const ctx = methodContext('sdof')!;
    const v = methodById('sdof')!.applies(ctx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason.key).toBe('course.dynamics.sdof.err.noNode');
  });
});

function resetAndGet() { return { source: 'model' as const, nodeId: null, dir: 'ux' as const, m: 2, k: 800, xi: 0.05, u0: 0.01, v0: 0, F0: 10, Omega: null }; }

describe('the modal decomposition document', () => {
  it('shear building of the two-storey example: K tridiagonal with Σ12EI/h³ and ten steps', async () => {
    await load('dynamics-shear-building');
    setDynamicsSettings({ mdof: { source: 'shear' } });
    const doc = build('mdofModal');
    expect(doc.steps.length).toBe(10);
    expectTranslated(doc);
    const c = resolveMdof(methodContext('mdofModal')!);
    if ('refusal' in c) throw new Error(c.refusal);
    const k = 2 * (12 * 30000e3 * 0.000675) / 27;
    expect(c.K[0][0]).toBeCloseTo(2 * k, 3);
    expect(c.K[0][1]).toBeCloseTo(-k, 3);
    expect(c.K[1][1]).toBeCloseTo(k, 3);
    expect(c.sol.offM).toBeLessThan(1e-10);
    const peak = Math.max(...c.modal.map((u) => Math.abs(u[c.at])));
    c.modal.forEach((u, i) => expect(Math.abs(u[c.at] - c.direct[i][c.at])).toBeLessThan(0.02 * peak));
  });

  it('bar model with each mass model and both excitations', async () => {
    await load('dynamics-shear-building');
    for (const massModel of ['lumped', 'consistent', 'guyan'] as const) {
      for (const excitation of ['free', 'harmonic'] as const) {
        setDynamicsSettings({ mdof: { source: 'model', excitation }, mass: { massModel, nPerMember: massModel === 'consistent' ? 1 : 2 } });
        const doc = build('mdofModal');
        expectTranslated(doc);
        expect(doc.steps.length).toBe(10);
      }
    }
  });

  it('with consistent mass the frequencies are the engine\'s', async () => {
    await load('dynamics-shear-building');
    setDynamicsSettings({ mdof: { source: 'model' }, mass: { massModel: 'consistent', nPerMember: 2 } });
    const doc = build('mdofModal');
    const cmp = doc.steps[3].blocks.find((b) => b.kind === 'compare');
    expect(cmp?.kind).toBe('compare');
    if (cmp?.kind === 'compare') {
      expect(cmp.rows.length).toBeGreaterThan(2);
      for (const r of cmp.rows) expect(r.method).toBeCloseTo(r.matrix, 5);
    }
  });
});

describe('the distributed mass document', () => {
  it('cantilever: six steps, the exact beam and the engine in the convergence table', async () => {
    await load('cantilever');
    setDynamicsSettings({ mass: { nPerMember: 4, massModel: 'consistent' } });
    const doc = build('massDiscretization');
    expect(doc.steps.length).toBe(6);
    expectTranslated(doc);
    const conv = doc.steps[5].blocks.find((b) => b.kind === 'table');
    expect(conv?.kind === 'table' && conv.rows.length).toBeGreaterThanOrEqual(4);
    if (conv?.kind === 'table') {
      const n4 = conv.rows.find((r) => r[0] === 4)!;
      expect(n4[4] as number).toBeCloseTo(n4[8] as number, 5);
    }
  });

  it('portal frame with lumped mass', async () => {
    await load('portal-frame');
    setDynamicsSettings({ mass: { nPerMember: 2, massModel: 'lumped' } });
    const doc = build('massDiscretization');
    expectTranslated(doc);
  });
});

describe('the n degree of freedom direct integration and its excitation', () => {
  function axialColumn() {
    uiStore.analysisMode = '2d';
    historyStore.clear();
    modelStore.clear();
    modelStore.batch(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3);
      modelStore.addElement(a, b);
      modelStore.addSupport(a, 'fixed');
      modelStore.addNodalLoad(b, 0, -100);
    });
  }
  const drawnGap = (c: Exclude<ReturnType<typeof resolveMdof>, { refusal: string }>) => {
    const peak = Math.max(...c.modal.map((u) => Math.abs(u[c.at])));
    return Math.max(...c.modal.map((u, k) => Math.abs(u[c.at] - c.direct[k][c.at]))) / peak;
  };

  it('a column released from its axial deflection: the step follows the axial mode and both paths agree', () => {
    axialColumn();
    setDynamicsSettings({ mass: { nPerMember: 1, massModel: 'consistent' }, mdof: { excitation: 'free', xi: 0 } });
    const c = resolveMdof({ model: modelStore.model });
    if ('refusal' in c) throw new Error(c.refusal);
    expect(c.dofs[c.at].dir).toBe('uz');
    expect(c.directStep.resolved).toBe(true);
    expect(c.directStep.omega).toBeGreaterThan(5 * c.sol.modes[0].omega);
    expect(drawnGap(c)).toBeLessThan(0.01);
  });

  it('the same column forced axially, and the frame example free and forced: both paths agree', async () => {
    axialColumn();
    setDynamicsSettings({ mass: { nPerMember: 2, massModel: 'consistent' }, mdof: { excitation: 'harmonic', ratio: 0.8, xi: 0.02 } });
    let c = resolveMdof({ model: modelStore.model });
    if ('refusal' in c) throw new Error(c.refusal);
    expect(drawnGap(c)).toBeLessThan(0.01);
    await load('portal-frame');
    for (const excitation of ['free', 'harmonic'] as const) {
      setDynamicsSettings({ mass: { nPerMember: 2, massModel: 'lumped' }, mdof: { excitation, ratio: 1.3, xi: 0.05 } });
      c = resolveMdof({ model: modelStore.model });
      if ('refusal' in c) throw new Error(c.refusal);
      expect(c.directStep.resolved).toBe(true);
      expect(drawnGap(c)).toBeLessThan(0.01);
    }
  });

  it('Ω = 0 is refused with its reason instead of a record of infinite length', () => {
    axialColumn();
    for (const ratio of [0, -1, Number.NaN]) {
      setDynamicsSettings({ mdof: { excitation: 'harmonic', ratio } });
      expect(resolveMdof({ model: modelStore.model })).toEqual({ refusal: 'mdof.err.omega' });
    }
    expect(stepsEs['course.dynamics.mdof.err.omega']).toMatch(/Ω = 0/);
  });

  it('a component too fast for the budget is flagged, and the step count stays within it', () => {
    const s = directStepFor([{ omega: 10, amp: 1 }, { omega: 1e7, amp: 0.5 }], 2, 2 / 160, 1, 40);
    expect(s.resolved).toBe(false);
    expect(s.steps * 40 * 40).toBeLessThanOrEqual(DIRECT_BUDGET);
    expect(s.estimate).toBeGreaterThan(DIRECT_TOL);
    const easy = directStepFor([{ omega: 10, amp: 1 }], 2, 2 / 160, 1, 4);
    expect(easy.resolved).toBe(true);
    expect(newmarkDrift(10, easy.dt, 2)).toBeLessThanOrEqual(DIRECT_TOL);
  });
});
