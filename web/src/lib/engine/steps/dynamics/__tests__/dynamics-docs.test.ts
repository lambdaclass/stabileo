import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { isSolverReady } from '../../../wasm-solver';
import { methodContext } from '../../../../store/explained-steps.svelte';
import { methodById } from '../../methods';
import { setDynamicsSettings, resetDynamicsSettings } from '../../../dynamics/course/settings';
import { resolveMdof, MIN_HARMONIC_RATIO, MAX_HARMONIC_RATIO } from '../mdof-build';
import { solveSdof, resolveSdof, finiteSdof } from '../sdof-doc';
import { stepsEs, stepsEn, stepsPt } from '../../../../i18n/locales/steps';
import type { Block, StepDoc, Txt } from '../../doc';
import { isTxt } from '../../doc';
import { num } from '../../format';
import katex from 'katex';
import { shearMatrixTex } from '../mdof-system-blocks';
import { freeVibrationTex } from '../mdof-doc';
import { firstModeTex } from '../mass-doc';

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

  it('refuses a mass, stiffness or dynamic input that is not a finite number', async () => {
    await load('cantilever');
    const base = { source: 'manual' as const, m: 2, k: 800, xi: 0.05, F0: 10, u0: 0.01, v0: 0.05, Omega: null };
    const cases: Array<[Record<string, number>, string]> = [
      [{ m: Infinity }, 'mk'], [{ k: Infinity }, 'mk'], [{ m: NaN }, 'mk'],
      [{ xi: Infinity }, 'inputs'], [{ xi: -0.1 }, 'inputs'], [{ F0: Infinity }, 'inputs'],
      [{ u0: NaN }, 'inputs'], [{ v0: -Infinity }, 'inputs'], [{ Omega: Infinity }, 'inputs'], [{ Omega: -1 }, 'inputs'],
    ];
    for (const [bad, code] of cases) {
      setDynamicsSettings({ sdof: { ...base, ...bad } });
      const v = methodById('sdof')!.applies(methodContext('sdof')!);
      expect(v.ok, JSON.stringify(bad)).toBe(false);
      if (!v.ok) expect(v.reason.key).toBe(`course.dynamics.sdof.err.${code}`);
    }
    setDynamicsSettings({ sdof: base });
    expect(methodById('sdof')!.applies(methodContext('sdof')!).ok).toBe(true);
  });

  it('refuses finite m and k whose ω or response overflows', async () => {
    await load('cantilever');
    const base = { source: 'manual' as const, m: 2, k: 800, xi: 0.05, F0: 10, u0: 0.01, v0: 0.05, Omega: null };
    for (const bad of [{ m: 1e-300, k: 1e300 }, { m: 1e300, k: 1e-300, v0: 1e300 }]) {
      setDynamicsSettings({ sdof: { ...base, ...bad } });
      const v = methodById('sdof')!.applies(methodContext('sdof')!);
      expect(v.ok, JSON.stringify(bad)).toBe(false);
      if (!v.ok) expect(v.reason.key).toBe('course.dynamics.mdof.err.notFinite');
    }
    setDynamicsSettings({ sdof: base });
    const ok = methodById('sdof')!.applies(methodContext('sdof')!);
    expect(ok.ok).toBe(true);
    expect(finiteSdof(solveSdof(2, 800, { ...base, dir: 'ux', nodeId: null } as never))).toBe(true);
  });
});

function resetAndGet() { return { source: 'model' as const, nodeId: null, dir: 'ux' as const, m: 2, k: 800, xi: 0.05, u0: 0.01, v0: 0, F0: 10, Omega: null }; }

describe('the modal decomposition document', () => {
  it('harmonic excitation needs a finite frequency ratio of at least the minimum, and ξ a finite number ≥ 0', async () => {
    await load('dynamics-shear-building');
    for (const ratio of [0, -1, NaN, Infinity, MIN_HARMONIC_RATIO / 2, MAX_HARMONIC_RATIO * 1.01, Number.MAX_VALUE]) {
      setDynamicsSettings({ mdof: { source: 'shear', excitation: 'harmonic', ratio, xi: 0.05 } });
      const c = resolveMdof(methodContext('mdofModal')!);
      expect('refusal' in c && c.refusal).toBe('mdof.err.ratio');
    }
    for (const xi of [-0.1, NaN, Infinity]) {
      setDynamicsSettings({ mdof: { source: 'shear', excitation: 'free', ratio: 0.8, xi } });
      const c = resolveMdof(methodContext('mdofModal')!);
      expect('refusal' in c && c.refusal).toBe('mdof.err.xi');
    }
    setDynamicsSettings({ mdof: { source: 'shear', excitation: 'harmonic', ratio: MIN_HARMONIC_RATIO, xi: 0.05 } });
    const ok = resolveMdof(methodContext('mdofModal')!);
    if ('refusal' in ok) throw new Error(ok.refusal);
    expect(ok.times.every(Number.isFinite)).toBe(true);
    for (const ratio of [10, MAX_HARMONIC_RATIO]) {
      setDynamicsSettings({ mdof: { source: 'shear', excitation: 'harmonic', ratio, xi: 0.05 } });
      const hi = resolveMdof(methodContext('mdofModal')!);
      if ('refusal' in hi) throw new Error(hi.refusal);
      const peak = Math.max(...hi.modal.map((u) => Math.abs(u[hi.at])));
      const gap = Math.max(...hi.modal.map((u, i) => Math.abs(u[hi.at] - hi.direct[i][hi.at])));
      expect(gap).toBeLessThan(1e-2 * peak);
    }
    setDynamicsSettings({ mdof: { excitation: 'free', ratio: 0.8, xi: 0.05 } });
  });

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

  it('with lumped or condensed mass the same bars with consistent mass still check against the engine', async () => {
    await load('dynamics-shear-building');
    for (const massModel of ['lumped', 'guyan'] as const) {
      setDynamicsSettings({ mdof: { source: 'model' }, mass: { massModel, nPerMember: 2 } });
      const doc = build('mdofModal');
      const cmp = doc.steps[3].blocks.filter((b) => b.kind === 'compare');
      expect(cmp.length, massModel).toBe(1);
      if (cmp[0]?.kind === 'compare') {
        expect(cmp[0].rows.length).toBeGreaterThan(2);
        for (const r of cmp[0].rows) expect(r.method).toBeCloseTo(r.matrix, 5);
      }
      const diff = doc.steps[3].blocks.find((b) => b.kind === 'table' && b.head.length === 4);
      expect(diff?.kind, massModel).toBe('table');
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

  it('fixed-fixed beam: n = 1 has nothing free to vibrate, so it is left out of the table with its reason, and the rest is built', async () => {
    await load('cantilever');
    const ends = [...modelStore.nodes.keys()];
    for (const id of ends) if (![...modelStore.supports.values()].some((s) => s.nodeId === id)) modelStore.addSupport(id, 'fixed');
    expect(modelStore.elements.size).toBe(1);
    setDynamicsSettings({ mass: { nPerMember: 4, massModel: 'consistent' } });
    const doc = build('massDiscretization');
    const blocks = doc.steps[5].blocks;
    const conv = blocks.find((b) => b.kind === 'table');
    if (conv?.kind !== 'table') throw new Error('no table');
    expect(conv.rows.map((r) => r[0])).toEqual([2, 4, 8]);
    const notes = blocks.filter((b) => b.kind === 'note').map((b) => (b.kind === 'note' && isTxt(b.text) ? b.text : null));
    const skip = notes.findIndex((x) => x?.key === 'course.dynamics.mass.conv.skip');
    expect(skip).toBeGreaterThanOrEqual(0);
    expect(notes[skip]!.params).toEqual({ n: 1 });
    expect(notes[skip + 1]!.key).toMatch(/^course\.dynamics\.mdof\.err\./);
    expect(notes.some((x) => x?.key === 'course.dynamics.mass.conv.cut')).toBe(false);
    expectTranslated(doc);
  });

  it('a beam pinned at both ends, consistent mass, n = 1: only rotations vibrate, so Guyan says why it has no system and the rest is built', async () => {
    await load('cantilever');
    for (const id of [...modelStore.nodes.keys()]) {
      for (const [sid, sp] of [...modelStore.supports.entries()]) if (sp.nodeId === id) modelStore.removeSupport(sid);
      modelStore.addSupport(id, 'pinned');
    }
    expect(modelStore.elements.size).toBe(1);
    setDynamicsSettings({ mass: { nPerMember: 1, massModel: 'consistent' } });
    const doc = build('massDiscretization');
    const s4 = doc.steps[3].blocks;
    const notes = s4.filter((b) => b.kind === 'note').map((b) => (b.kind === 'note' && isTxt(b.text) ? b.text.key : null));
    expect(notes).toContain('course.dynamics.mass.guyan.refused');
    expect(notes.some((k) => k?.startsWith('course.dynamics.mdof.err.'))).toBe(true);
    expect(doc.steps.length).toBe(6);
    expectTranslated(doc);
  });

  it('portal frame with lumped mass', async () => {
    await load('portal-frame');
    setDynamicsSettings({ mass: { nPerMember: 2, massModel: 'lumped' } });
    const doc = build('massDiscretization');
    expectTranslated(doc);
    const cmp = doc.steps[4].blocks.find((b) => b.kind === 'compare');
    expect(cmp?.kind).toBe('compare');
    if (cmp?.kind === 'compare') for (const r of cmp.rows) expect(r.method).toBeCloseTo(r.matrix, 5);
  });
});

describe('the shear building stiffness matrix as written', () => {
  it('two storeys: the top diagonal is k₂ alone; three: k₃; larger: the band', () => {
    expect(shearMatrixTex(2)).toBe('\\mathbf K = \\begin{bmatrix} k_1 + k_2 & -k_2 \\\\ -k_2 & k_2 \\end{bmatrix}');
    expect(shearMatrixTex(2)).not.toContain('k_3');
    expect(shearMatrixTex(3)).toContain('-k_3 & k_3 \\end');
    expect(shearMatrixTex(5)).toContain('k_{5}');
    for (const n of [1, 2, 3, 5]) expect(() => katex.renderToString(shearMatrixTex(n), { throwOnError: true })).not.toThrow();
  });
});

describe('a modal free vibration written in its damping regime', () => {
  it('undamped, underdamped, critical and overdamped each get their own form', () => {
    expect(freeVibrationTex(1, 1, 0, 0, 2)).not.toContain('e^');
    expect(freeVibrationTex(1, 1, 0, 0.05, 2)).toContain('\\cos\\omega_{D1}');
    const crit = freeVibrationTex(1, 1, 0, 1, 2);
    expect(crit).toContain('e^{-\\omega_{1} t}');
    expect(crit).not.toMatch(/cos|sin/);
    const over = freeVibrationTex(1, 1, 0, 2, 2);
    expect(over).toContain('\\cosh');
    expect(over).toContain('\\sinh');
  });
});

describe('the exact first frequency as written', () => {
  const base = { beamCase: 'cantilever' as const, L: 0.1, EI: 1.2e4, EA: 4e6, rhoA: 0.157 };
  it('is the axial bar\'s when the axial mode is the lowest', () => {
    const fa = (Math.PI / 2) * Math.sqrt(base.EA / base.rhoA) / base.L / (2 * Math.PI);
    const fb = 3.516 * Math.sqrt(base.EI / (base.rhoA * base.L ** 4)) / (2 * Math.PI);
    expect(fa).toBeLessThan(fb);
    const tex = firstModeTex({ ...base, modes: [{ f: fa, kind: 'axial', order: 1 }, { f: fb, kind: 'bending', order: 1 }] });
    expect(tex).toContain(`\\omega_1 = ${num(Math.PI / 2)}\\sqrt{\\frac{EA}`);
    expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
  });
  it('is the bending one when bending is the lowest', () => {
    const fb = 3.516 * Math.sqrt(base.EI / (base.rhoA * base.L ** 4)) / (2 * Math.PI);
    const tex = firstModeTex({ ...base, modes: [{ f: fb, kind: 'bending', order: 1 }, { f: 10 * fb, kind: 'axial', order: 1 }] });
    expect(tex).toContain(`\\omega_1 = ${num(3.516)}\\sqrt{\\frac{EI}`);
  });
});

describe('an SDOF taken from the model', () => {
  it('is refused without a model, never built from the typed m and k', () => {
    const s = { source: 'model' as const, nodeId: null, dir: 'ux' as const, m: 2, k: 800, xi: 0.05, u0: 0.01, v0: 0, F0: 10, Omega: null };
    expect(resolveSdof({ model: null } as never, s)).toEqual({ refusal: 'sdof.err.noModel' });
    const manual = resolveSdof({ model: null } as never, { ...s, source: 'manual' });
    expect('refusal' in manual).toBe(false);
  });
});
