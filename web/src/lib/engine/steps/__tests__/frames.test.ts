/**
 * Moment distribution (with and without sway) and slope-deflection against
 * the matrix solve of the same model.
 *
 * The classical methods keep every member at its length, the matrix solve
 * does not, so on the examples the two agree to what axial shortening moves
 * (about 1 % of the largest end moment at most). Making the members axially
 * rigid (A × 10⁵) takes that away, and then the agreement is to the solver's
 * own precision: the proof that the methods are exact up to axial deformation.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import katex from 'katex';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import type { SolverInput } from '../../types';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import type { MethodContext } from '../registry';
import type { Block, CompareRow, StepDoc, Txt } from '../doc';
import { isTxt } from '../doc';
import { methods } from '../methods/frames';
import { swayModeCount } from '../sway-modes';
import { stepsEs, stepsEn, stepsPt } from '../../../i18n/locales/steps';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

const byId = (id: string) => methods.find((m) => m.id === id)!;

function ctxOf(input: SolverInput): MethodContext {
  return { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] } };
}

async function example(name: string): Promise<SolverInput> {
  await modelStore.loadExample(name);
  return modelStore.buildSolverInput(false)!;
}

/** The same model with every member axially rigid in practice. */
function axiallyRigid(input: SolverInput): SolverInput {
  const sections = new Map([...input.sections].map(([id, s]) => [id, { ...s, a: s.a * 1e5 }]));
  return { ...input, sections };
}

function compareRows(doc: StepDoc): CompareRow[] {
  for (const s of doc.steps) for (const b of s.blocks) if (b.kind === 'compare') return b.rows;
  throw new Error('no compare block');
}

/** Largest difference against the matrix solve, relative to the largest value of its kind. */
function worst(doc: StepDoc, unit: string): number {
  const rows = compareRows(doc).filter((r) => r.unit === unit);
  const big = Math.max(...rows.map((r) => Math.abs(r.matrix)), 1e-9);
  return Math.max(...rows.map((r) => Math.abs(r.method - r.matrix))) / big;
}

function build(id: string, ctx: MethodContext): StepDoc {
  const m = byId(id);
  const a = m.applies(ctx);
  expect(a).toEqual({ ok: true });
  return m.build!(ctx);
}

/** Every piece of mathematics in a document: equations, calculations, table cells, matrix names, compare labels. */
function texs(doc: StepDoc): string[] {
  const out: string[] = [];
  const cell = (c: unknown) => { if (typeof c === 'object' && c !== null && 'tex' in c) out.push((c as { tex: string }).tex); };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.kind === 'eq') out.push(b.tex);
      else if (b.kind === 'calc') out.push(b.formula, b.result, ...(b.subst ? [b.subst] : []), ...(b.check ? [b.check] : []));
      else if (b.kind === 'table') { b.head.forEach(cell); b.rows.forEach((r) => r.forEach(cell)); }
      else if (b.kind === 'matrix') out.push(b.name);
      else if (b.kind === 'compare') out.push(...b.rows.map((r) => r.label));
      else if (b.kind === 'sub') walk(b.blocks);
    }
  };
  walk(doc.intro);
  for (const s of doc.steps) walk(s.blocks);
  return out;
}

/** Every Txt in a document, walked through every block, cell, title, caption and label. */
function txts(doc: StepDoc): Txt[] {
  const out: Txt[] = [doc.title];
  if (doc.subtitle) out.push(doc.subtitle);
  const cell = (c: unknown) => { if (isTxt(c)) out.push(c); };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      switch (b.kind) {
        case 'p': case 'note': out.push(b.text); break;
        case 'eq': if (b.note) out.push(b.note); break;
        case 'calc': if (b.label) out.push(b.label); break;
        case 'table': b.head.forEach(cell); b.rows.forEach((r) => r.forEach(cell)); if (b.caption) out.push(b.caption); break;
        case 'matrix': case 'fig': case 'compare': if (b.caption) out.push(b.caption); break;
        case 'sub': cell(b.title); walk(b.blocks); break;
      }
    }
  };
  walk(doc.intro);
  for (const s of doc.steps) { out.push(s.title); walk(s.blocks); }
  return out;
}

describe('sway modes of frames whose members keep their length', () => {
  it('braced portal 0, portal 1, two-story frame 2', async () => {
    expect(swayModeCount(planeModel(await example('portal-frame-braced')))).toBe(0);
    expect(swayModeCount(planeModel(await example('portal-frame')))).toBe(1);
    expect(swayModeCount(planeModel(await example('two-story-frame')))).toBe(2);
  });
});

describe('the examples against the matrix solve', () => {
  // What axial deformation moves, measured on each example as a share of its
  // largest end moment (reaction): the braced portal's beam carries the 10 kN
  // to the roller and shortens by N·L/EA = 2·10⁻⁵ m, which sways the columns
  // by 0.23 kN·m out of 22 (1.02 %); the others stay under 0.4 %.
  const cases: Array<[string, string, number]> = [
    ['crossNoSway', 'portal-frame-braced', 0.015],
    ['slopeDeflection', 'portal-frame-braced', 0.015],
    ['crossSway', 'portal-frame', 0.01],
    ['slopeDeflection', 'portal-frame', 0.01],
    ['crossSway', 'two-story-frame', 0.01],
    ['slopeDeflection', 'two-story-frame', 0.01],
  ];
  for (const [id, ex, tol] of cases) {
    it(`${id} on ${ex}: within ${tol * 100} % (axial shortening), and exact when the members are axially rigid`, async () => {
      const input = await example(ex);
      const doc = build(id, ctxOf(input));
      expect(worst(doc, 'kN·m')).toBeLessThan(tol);
      expect(worst(doc, 'kN')).toBeLessThan(tol);
      const rigid = build(id, ctxOf(axiallyRigid(input)));
      expect(worst(rigid, 'kN·m')).toBeLessThan(1e-4);
      expect(worst(rigid, 'kN')).toBeLessThan(1e-4);
    });
  }

  it('the two ways of the same frame give the same end moments', async () => {
    const ctx = ctxOf(await example('two-story-frame'));
    const a = compareRows(build('crossSway', ctx)).filter((r) => r.unit === 'kN·m');
    const b = compareRows(build('slopeDeflection', ctx)).filter((r) => r.unit === 'kN·m');
    a.forEach((r, k) => expect(r.method).toBeCloseTo(b[k].method, 3));
  });
});

describe('beams and odd drawings', () => {
  it('a continuous beam through slope-deflection matches exactly', () => {
    const n = [0, 5, 11, 15].map((x) => modelStore.addNode(x, 0));
    const e1 = modelStore.addElement(n[0], n[1]);
    const e2 = modelStore.addElement(n[1], n[2]);
    const e3 = modelStore.addElement(n[2], n[3]);
    modelStore.addSupport(n[0], 'pinned');
    modelStore.addSupport(n[1], 'rollerX');
    modelStore.addSupport(n[2], 'rollerX');
    modelStore.addSupport(n[3], 'rollerX');
    modelStore.addDistributedLoad(e1, -12, -12);
    modelStore.addPointLoadOnElement(e2, 2, -40);
    modelStore.addDistributedLoad(e3, 0, -9);
    const ctx = ctxOf(modelStore.buildSolverInput(false)!);
    expect(swayModeCount(ctx.pm)).toBe(0);
    const doc = build('slopeDeflection', ctx);
    expect(doc.subtitle?.key).toBe('steps.frames.subtitle.beam');
    expect(worst(doc, 'kN·m')).toBeLessThan(1e-6);
    expect(worst(doc, 'kN')).toBeLessThan(1e-6);
    // Moment distribution without sway on the same beam: to the distribution's tolerance.
    const cross = build('crossNoSway', ctx);
    expect(worst(cross, 'kN·m')).toBeLessThan(1e-5);
  });

  it('members drawn in reverse change nothing', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
    modelStore.addElement(b, a); // column drawn downwards
    const beam = modelStore.addElement(c, b); // beam drawn right to left
    modelStore.addElement(d, c);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'pinned');
    modelStore.addDistributedLoad(beam, 15, 15); // q > 0 along local +y, which points down for a member drawn right to left
    modelStore.addNodalLoad(b, 10, 0, 0);
    modelStore.addNodalLoad(c, 0, 0, 8);
    const input = axiallyRigid(modelStore.buildSolverInput(false)!);
    const ctx = ctxOf(input);
    for (const id of ['crossSway', 'slopeDeflection']) {
      const doc = build(id, ctx);
      expect(worst(doc, 'kN·m')).toBeLessThan(1e-4);
      expect(worst(doc, 'kN')).toBeLessThan(1e-4);
    }
  });

  it('an inclined gable frame: two sway modes, exact up to axial deformation', () => {
    const n = [[0, 0], [0, 4], [5, 6], [10, 4], [10, 0]].map(([x, z]) => modelStore.addNode(x, z));
    const e = [modelStore.addElement(n[0], n[1]), modelStore.addElement(n[1], n[2]), modelStore.addElement(n[2], n[3]), modelStore.addElement(n[4], n[3])];
    modelStore.addSupport(n[0], 'fixed'); modelStore.addSupport(n[4], 'fixed');
    modelStore.addDistributedLoad(e[1], -8, -8);
    modelStore.addDistributedLoad(e[2], -8, -8);
    modelStore.addNodalLoad(n[1], 6, 0, 0);
    const ctx = ctxOf(axiallyRigid(modelStore.buildSolverInput(false)!));
    expect(swayModeCount(ctx.pm)).toBe(2);
    for (const id of ['crossSway', 'slopeDeflection']) {
      const doc = build(id, ctx);
      expect(worst(doc, 'kN·m')).toBeLessThan(1e-4);
      expect(worst(doc, 'kN')).toBeLessThan(1e-4);
    }
  });
});

describe('released ends: pinned feet, couples at joints, free ends', () => {
  it('a pinned foot (3EI/L) and a couple at a joint, braced so nothing sways', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
    modelStore.addElement(a, b); const beam = modelStore.addElement(b, c); modelStore.addElement(d, c);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(d, 'fixed'); modelStore.addSupport(c, 'rollerZ');
    modelStore.addDistributedLoad(beam, -10, -10); modelStore.addNodalLoad(b, 0, 0, 5);
    const ctx = ctxOf(axiallyRigid(modelStore.buildSolverInput(false)!));
    expect(swayModeCount(ctx.pm)).toBe(0);
    for (const id of ['crossNoSway', 'slopeDeflection']) {
      const doc = build(id, ctx);
      expect(worst(doc, 'kN·m')).toBeLessThan(1e-4);
      expect(worst(doc, 'kN')).toBeLessThan(1e-4);
    }
  });

  it('a cantilever overhang: its tip is a released end and its deflection one more mode', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0), e = modelStore.addNode(8, 4);
    modelStore.addElement(a, b); const beam = modelStore.addElement(b, c); modelStore.addElement(d, c); const tip = modelStore.addElement(c, e);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
    modelStore.addDistributedLoad(beam, -12, -12); modelStore.addDistributedLoad(tip, -6, -6);
    modelStore.addNodalLoad(e, 0, -10, 0); modelStore.addNodalLoad(b, 4, 0, 0);
    const ctx = ctxOf(axiallyRigid(modelStore.buildSolverInput(false)!));
    expect(swayModeCount(ctx.pm)).toBe(2);
    for (const id of ['crossSway', 'slopeDeflection']) {
      const doc = build(id, ctx);
      expect(worst(doc, 'kN·m')).toBeLessThan(1e-4);
      expect(worst(doc, 'kN')).toBeLessThan(1e-4);
    }
  });
});

describe('hinges', () => {
  it('a hinge at a pinned foot or a roller only that member reaches changes nothing', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0), e = modelStore.addNode(10, 4);
    const col = modelStore.addElement(a, b); const beam = modelStore.addElement(b, c); modelStore.addElement(d, c); const span = modelStore.addElement(c, e);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(d, 'fixed'); modelStore.addSupport(e, 'rollerX');
    modelStore.addDistributedLoad(beam, -10, -10); modelStore.addDistributedLoad(span, -6, -6); modelStore.addNodalLoad(b, 5, 0, 0);
    const plain = ctxOf(axiallyRigid(modelStore.buildSolverInput(false)!));
    modelStore.toggleHinge(col, 'start'); // at the pinned foot A
    modelStore.toggleHinge(span, 'end'); // at the roller E
    const hinged = ctxOf(axiallyRigid(modelStore.buildSolverInput(false)!));
    expect(hinged.pm.members.get(col)!.hingeI).toBe(true);
    for (const id of ['crossSway', 'slopeDeflection']) {
      const doc = build(id, hinged);
      expect(worst(doc, 'kN·m')).toBeLessThan(1e-4);
      expect(worst(doc, 'kN')).toBeLessThan(1e-4);
      const same = compareRows(build(id, plain));
      compareRows(doc).forEach((r, k) => expect(r.method).toBeCloseTo(same[k].method, 9));
    }
  });

  it('a hinge between members, or at a fixed support, is still refused', () => {
    const reason = (ctx: MethodContext) => { const r = byId('slopeDeflection').applies(ctx); return r.ok ? null : r.reason.key; };
    const portal = () => {
      modelStore.clear();
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
      const e = [modelStore.addElement(a, b), modelStore.addElement(b, c), modelStore.addElement(d, c)];
      modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'pinned');
      modelStore.addDistributedLoad(e[1], -10, -10);
      return e;
    };
    let e = portal();
    modelStore.toggleHinge(e[1], 'start'); // beam end at joint B, where the column also arrives
    expect(reason(ctxOf(modelStore.buildSolverInput(false)!))).toBe('steps.frames.req.hinge');
    e = portal();
    modelStore.toggleHinge(e[0], 'start'); // column foot at the fixed support A
    expect(reason(ctxOf(modelStore.buildSolverInput(false)!))).toBe('steps.frames.req.hinge');
    e = portal();
    modelStore.toggleHinge(e[2], 'start'); // column foot at the pinned support D: accepted
    expect(reason(ctxOf(modelStore.buildSolverInput(false)!))).toBeNull();
  });
});

describe('what the methods refuse, and why', () => {
  const reason = (id: string, ctx: MethodContext) => { const r = byId(id).applies(ctx); return r.ok ? null : r.reason.key; };

  it('sway counts per method', async () => {
    const portal = ctxOf(await example('portal-frame'));
    expect(reason('crossNoSway', portal)).toBe('steps.frames.req.hasSway');
    const braced = ctxOf(await example('portal-frame-braced'));
    expect(reason('crossSway', braced)).toBe('steps.frames.req.noSway');
    expect(reason('slopeDeflection', braced)).toBeNull();
  });

  it('truss members, hinges, thermal loads, springs, nothing to rotate', () => {
    const portal = () => {
      modelStore.clear();
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
      const e = [modelStore.addElement(a, b), modelStore.addElement(b, c), modelStore.addElement(d, c)];
      modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
      modelStore.addDistributedLoad(e[1], -10, -10);
      return { a, b, c, d, e };
    };
    const ctx = () => ctxOf(modelStore.buildSolverInput(false)!);

    let p = portal();
    modelStore.addElement(p.a, p.c, 'truss');
    expect(reason('slopeDeflection', ctx())).toBe('steps.frames.req.truss');

    p = portal();
    modelStore.toggleHinge(p.e[1], 'start');
    expect(reason('slopeDeflection', ctx())).toBe('steps.frames.req.hinge');

    p = portal();
    modelStore.addThermalLoad(p.e[1], 20, 0);
    expect(reason('slopeDeflection', ctx())).toBe('steps.req.thermal');

    p = portal();
    modelStore.addSupport(p.b, 'spring', { kx: 1000 });
    expect(reason('slopeDeflection', ctx())).toBe('steps.req.special');

    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const beam = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'fixed');
    modelStore.addDistributedLoad(beam, -10, -10);
    expect(reason('slopeDeflection', ctx())).toBe('steps.frames.req.noJoint');
    expect(reason('crossNoSway', ctx())).toBe('steps.frames.req.noJoint');
  });
});

describe('words', () => {
  const dicts = { es: { ...es, ...stepsEs }, en: { ...en, ...stepsEn }, pt: { ...pt, ...stepsPt } };

  it('every key a document uses exists in Spanish, English and Portuguese, and its mathematics renders', async () => {
    const docs: StepDoc[] = [];
    docs.push(build('crossNoSway', ctxOf(await example('portal-frame-braced'))));
    for (const ex of ['portal-frame', 'two-story-frame']) {
      const ctx = ctxOf(await example(ex));
      docs.push(build('crossSway', ctx), build('slopeDeflection', ctx));
    }
    // A pinned foot (modified stiffness) and a nodal couple.
    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
    modelStore.addElement(a, b); const beam = modelStore.addElement(b, c); modelStore.addElement(d, c);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(d, 'fixed'); modelStore.addSupport(c, 'rollerZ');
    modelStore.addDistributedLoad(beam, -10, -10); modelStore.addNodalLoad(b, 0, 0, 5);
    const ctx = ctxOf(modelStore.buildSolverInput(false)!);
    docs.push(build('crossNoSway', ctx), build('slopeDeflection', ctx));

    // Valid KaTeX everywhere, and no coefficient glued to the value it multiplies ("4(20250)").
    for (const doc of docs) {
      for (const t of texs(doc)) {
        expect(() => katex.renderToString(t, { throwOnError: true }), t).not.toThrow();
        expect(t).not.toMatch(/\{\d+\(|[0-9]\(-?\d/);
      }
    }
    const missing: string[] = [];
    for (const doc of docs) {
      for (const t of txts(doc)) {
        for (const [lang, dict] of Object.entries(dicts)) if (!(t.key in dict)) missing.push(`${lang}: ${t.key}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
    for (const m of methods) {
      for (const k of ['title', 'help', 'requires']) {
        for (const [lang, dict] of Object.entries(dicts)) expect(dict, `${lang} steps.m.${m.id}.${k}`).toHaveProperty([`steps.m.${m.id}.${k}`]);
      }
    }
  });

  it('every key the method files name, including the rarely reached ones, is in the three languages', () => {
    // Refusals, a distribution that stops short, a self-stress state: keys the examples do not reach.
    const src = ['../methods/frames.ts', '../frames-common.ts', '../sway-modes.ts']
      .map((f) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8')).join('\n');
    const keys = new Set([...src.matchAll(/'(steps\.[A-Za-z0-9_.]+[A-Za-z0-9_])'/g)].map((m) => m[1]));
    expect(keys.size).toBeGreaterThan(100);
    const missing: string[] = [];
    for (const k of keys) for (const [lang, dict] of Object.entries(dicts)) if (!(k in dict)) missing.push(`${lang}: ${k}`);
    expect(missing).toEqual([]);
  });
});
