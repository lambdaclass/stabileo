/**
 * The three-moment equation and moment distribution against the matrix
 * solve: on a beam there is no axial effect, so both classical methods must
 * reproduce the engine's support moments, end moments and reactions exactly
 * (to round-off), whatever loads, stiffnesses, overhangs and drawing
 * directions the beam has. And every word the documents use must exist in
 * the three offered languages.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import type { MethodContext } from '../registry';
import type { Block, CompareRow, StepDoc, Txt } from '../doc';
import { isTxt } from '../doc';
import { methods } from '../methods/continuous';
import { stepsEs, stepsEn, stepsPt } from '../../../i18n/locales/steps';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

const threeMoments = methods.find((m) => m.id === 'threeMoments')!;
const crossBeams = methods.find((m) => m.id === 'crossBeams')!;

function context(): MethodContext {
  const input = modelStore.buildSolverInput(false)!;
  return { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] } };
}

function compareRows(doc: StepDoc): CompareRow[] {
  const rows: CompareRow[] = [];
  const walk = (bs: Block[]) => { for (const b of bs) { if (b.kind === 'compare') rows.push(...b.rows); if (b.kind === 'sub') walk(b.blocks); } };
  for (const s of doc.steps) walk(s.blocks);
  return rows;
}

function txts(doc: StepDoc): Txt[] {
  const out: Txt[] = [doc.title];
  if (doc.subtitle) out.push(doc.subtitle);
  const cell = (c: unknown) => { if (isTxt(c)) out.push(c); };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      switch (b.kind) {
        case 'p': out.push(b.text); break;
        case 'eq': if (b.note) out.push(b.note); break;
        case 'calc': if (b.label) out.push(b.label); break;
        case 'table': b.head.forEach(cell); b.rows.forEach((r) => r.forEach(cell)); if (b.caption) out.push(b.caption); break;
        case 'matrix': if (b.caption) out.push(b.caption); break;
        case 'fig': if (b.caption) out.push(b.caption); break;
        case 'note': out.push(b.text); break;
        case 'sub': cell(b.title); walk(b.blocks); break;
        case 'compare': if (b.caption) out.push(b.caption); break;
      }
    }
  };
  walk(doc.intro);
  for (const s of doc.steps) { out.push(s.title); walk(s.blocks); }
  return out;
}

const dicts = { es: { ...es, ...stepsEs }, en: { ...en, ...stepsEn }, pt: { ...pt, ...stepsPt } } as Record<string, Record<string, string>>;

function expectWords(doc: StepDoc) {
  for (const t of txts(doc)) {
    for (const [lang, d] of Object.entries(dicts)) {
      const s = d[t.key];
      expect(s, `${lang}: ${t.key}`).toBeTypeOf('string');
      // Every placeholder the text has must come with the document.
      for (const m of s.matchAll(/\{(\w+)\}/g)) expect(t.params ?? {}, `${lang}: ${t.key} {${m[1]}}`).toHaveProperty(m[1]);
    }
  }
}

/** Both methods on the current model: applicable, built, and equal to the matrix solve. */
function checkBoth(minRows = 1) {
  const ctx = context();
  expect(ctx.ref).not.toBeNull();
  for (const m of [threeMoments, crossBeams]) {
    const ok = m.applies(ctx);
    expect(ok, `${m.id}: ${JSON.stringify(ok)}`).toEqual({ ok: true });
    const doc = m.build!(ctx);
    expect(doc.method).toBe(m.id);
    expect(doc.steps.length).toBeGreaterThan(4);
    const rows = compareRows(doc);
    expect(rows.length).toBeGreaterThanOrEqual(minRows);
    const scale = Math.max(1, ...rows.map((r) => Math.abs(r.matrix)));
    for (const r of rows) {
      expect(Number.isFinite(r.method), `${m.id} ${r.label}`).toBe(true);
      expect(Math.abs(r.method - r.matrix), `${m.id} ${r.label}: ${r.method} vs ${r.matrix}`).toBeLessThanOrEqual(1e-6 * scale);
    }
    expectWords(doc);
    expectDiagrams(doc, ctx);
  }
}

/**
 * The V and M diagrams are sampled from the method's own solution along
 * members drawn left to right; the engine's, along each member as modelled.
 */
function expectDiagrams(doc: StepDoc, ctx: MethodContext) {
  const figs = doc.steps[doc.steps.length - 1].blocks.filter((b) => b.kind === 'fig');
  expect(figs).toHaveLength(2);
  const [v, m] = figs.map((f) => (f.kind === 'fig' ? f.sketch.diagram! : null)!);
  const ref = ctx.ref!;
  let scale = 1;
  for (const d of [v, m]) for (const mm of d.members) for (const [, x] of mm.values) scale = Math.max(scale, Math.abs(x));
  for (const [d, which] of [[v, 'V'], [m, 'M']] as const) {
    for (const mm of d.members) {
      const pmm = ctx.pm.members.get(mm.member)!;
      const flipped = ctx.pm.nodes.get(pmm.i)!.x > ctx.pm.nodes.get(pmm.j)!.x;
      for (const [t, x] of mm.values) {
        const tm = flipped ? 1 - t : t;
        // Sagging is local −y of a member drawn left to right, local +y of one drawn right to left.
        const r = which === 'M' ? (flipped ? -1 : 1) * ref.momentAt(mm.member, tm) : ref.shearAt(mm.member, tm);
        expect(Math.abs(x - r), `${doc.method} ${which} member ${mm.member} t=${t}: ${x} vs ${r}`).toBeLessThanOrEqual(1e-5 * scale);
      }
    }
  }
}

function section(iz: number): number {
  return modelStore.addSection({ name: `S ${iz}`, a: 0.01, iy: iz, iz });
}

describe('continuous-beam methods against the matrix solve', () => {
  it('the continuous-beam example', async () => {
    await modelStore.loadExample('continuous-beam');
    checkBoth(8);
    // The example is three equal spans: the classical answer by hand.
    const doc = threeMoments.build!(context());
    const rows = compareRows(doc);
    const MB = rows.find((r) => r.label === 'M_{B}')!;
    expect(MB).toBeDefined();
    expect(MB.method).toBeLessThan(0);
  });

  it('two spans, a point load and a couple, different EI per span', () => {
    const n = [0, 5, 11].map((x) => modelStore.addNode(x, 0));
    const e1 = modelStore.addElement(n[0], n[1]);
    const e2 = modelStore.addElement(n[1], n[2]);
    modelStore.updateElementSection(e2, section(2 * 4.51e-6));
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addSupport(n[2], 'rollerX');
    modelStore.addPointLoadOnElement(e1, 2, -30);
    modelStore.addPointLoadOnElement(e2, 4, 0, { my: 25 });
    modelStore.addDistributedLoad(e2, -6, -6);
    checkBoth();
  });

  it('partial, triangular and trapezoidal loads', () => {
    const n = [0, 4, 10, 14].map((x) => modelStore.addNode(x, 0));
    const e1 = modelStore.addElement(n[0], n[1]);
    const e2 = modelStore.addElement(n[1], n[2]);
    const e3 = modelStore.addElement(n[2], n[3]);
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addSupport(n[2], 'rollerX'); modelStore.addSupport(n[3], 'rollerX');
    modelStore.addDistributedLoad(e1, 0, -12);
    modelStore.addDistributedLoad(e2, -4, -10);
    modelStore.addDistributedLoad(e3, -8, -8, undefined, undefined, undefined, 1, 3);
    checkBoth();
  });

  it('a fixed end', () => {
    const n = [0, 6, 10].map((x) => modelStore.addNode(x, 0));
    const e1 = modelStore.addElement(n[0], n[1]);
    const e2 = modelStore.addElement(n[1], n[2]);
    modelStore.addSupport(n[0], 'fixed'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addSupport(n[2], 'rollerX');
    modelStore.addDistributedLoad(e1, -10, -10);
    modelStore.addPointLoadOnElement(e2, 1.5, -20);
    checkBoth();
  });

  it('one span with a fixed end (propped cantilever) and one fixed at both ends', () => {
    let a = modelStore.addNode(0, 0), b = modelStore.addNode(5, 0);
    let e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e, -8, -8);
    checkBoth();
    modelStore.clear();
    a = modelStore.addNode(0, 0); b = modelStore.addNode(5, 0);
    e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'fixed');
    modelStore.addPointLoadOnElement(e, 2, -12);
    checkBoth();
  });

  it('overhangs at both ends, a joint couple and a joint load at a support', () => {
    const n = [0, 2, 7, 12, 13.5].map((x) => modelStore.addNode(x, 0));
    const e = [0, 1, 2, 3].map((k) => modelStore.addElement(n[k], n[k + 1]));
    modelStore.addSupport(n[1], 'pinned'); modelStore.addSupport(n[2], 'rollerX'); modelStore.addSupport(n[3], 'rollerX');
    modelStore.addDistributedLoad(e[0], -5, -5);
    modelStore.addDistributedLoad(e[1], -10, -10);
    modelStore.addDistributedLoad(e[2], -10, -10);
    modelStore.addNodalLoad(n[4], 0, -8, 0);
    modelStore.addNodalLoad(n[2], 0, -15, 12);
    checkBoth();
  });

  it('members drawn right to left, with an inner node in a span', () => {
    const n = [0, 3, 6, 11].map((x) => modelStore.addNode(x, 0));
    const e1 = modelStore.addElement(n[1], n[0]);
    const e2 = modelStore.addElement(n[2], n[1]);
    const e3 = modelStore.addElement(n[3], n[2]);
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'rollerX'); modelStore.addSupport(n[3], 'fixed');
    modelStore.addDistributedLoad(e1, -6, -6);
    modelStore.addPointLoadOnElement(e2, 1, -10);
    modelStore.addDistributedLoad(e3, -4, -9);
    modelStore.addNodalLoad(n[1], 0, -7, 5);
    checkBoth();
  });

  it('an interior fixed support and a couple at a simple end', () => {
    const n = [0, 4, 9].map((x) => modelStore.addNode(x, 0));
    const e1 = modelStore.addElement(n[0], n[1]);
    const e2 = modelStore.addElement(n[1], n[2]);
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'fixed'); modelStore.addSupport(n[2], 'rollerX');
    modelStore.addDistributedLoad(e1, -10, -10);
    modelStore.addDistributedLoad(e2, -5, -5);
    modelStore.addNodalLoad(n[2], 0, 0, -9);
    checkBoth();
  });
});

describe('what the continuous-beam methods refuse', () => {
  it('a portal frame', async () => {
    await modelStore.loadExample('portal-frame');
    const ctx = context();
    for (const m of [threeMoments, crossBeams]) {
      const r = m.applies(ctx);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.key).toMatch(/^steps\.req\.beam\./);
    }
  });

  it('a single simply supported span: statically determinate', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e, -10, -10);
    const ctx = context();
    for (const m of [threeMoments, crossBeams]) {
      const r = m.applies(ctx);
      expect(r).toEqual({ ok: false, reason: { key: 'steps.continuous.req.determinate' } });
    }
  });

  it('a span whose members differ in EI', () => {
    const n = [0, 3, 6, 10].map((x) => modelStore.addNode(x, 0));
    modelStore.addElement(n[0], n[1]);
    const e2 = modelStore.addElement(n[1], n[2]);
    modelStore.addElement(n[2], n[3]);
    modelStore.updateElementSection(e2, section(9e-6));
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'rollerX'); modelStore.addSupport(n[3], 'rollerX');
    const r = threeMoments.applies(context());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.continuous.req.variableEI');
  });
});
