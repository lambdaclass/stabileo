/**
 * The deformation and energy methods against the engine: double integration
 * and moment-area on beams, the unit-load method and Castigliano's theorems on
 * beams and frames. Every number the documents box is checked against the
 * matrix solve of the same model, and every word they use against the three
 * dictionaries.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import { methods } from '../methods/deformation';
import type { MethodContext } from '../registry';
import type { SolverInput } from '../../types';
import type { Block, CompareRow, StepDoc, Txt } from '../doc';
import { isTxt } from '../doc';
import { stepsEs, stepsEn, stepsPt } from '../../../i18n/locales/steps';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';
import katex from 'katex';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

const method = (id: string) => methods.find((m) => m.id === id)!;

function ctxOf(selection: { nodes: number[]; members: number[] } = { nodes: [], members: [] }): MethodContext {
  const input = modelStore.buildSolverInput(false)!;
  return { input, pm: planeModel(input), ref: solveReference(input), selection };
}

function compareRows(doc: StepDoc): CompareRow[] {
  const out: CompareRow[] = [];
  const walk = (bs: Block[]) => { for (const b of bs) { if (b.kind === 'compare') out.push(...b.rows); if (b.kind === 'sub') walk(b.blocks); } };
  walk(doc.intro);
  for (const s of doc.steps) walk(s.blocks);
  return out;
}

/** Every compare row agrees with the matrix solve to `rel` of the largest value of its unit. */
function expectAgreement(doc: StepDoc, rel = 1e-9) {
  const rows = compareRows(doc);
  expect(rows.length).toBeGreaterThan(0);
  const scale = new Map<string, number>();
  for (const r of rows) scale.set(r.unit, Math.max(scale.get(r.unit) ?? 0, Math.abs(r.matrix)));
  for (const r of rows) {
    // A unit whose matrix values are all zero (every node a support) is compared against a floor.
    const s = Math.max(scale.get(r.unit)!, 1e-3);
    expect(Math.abs(r.method - r.matrix) / s, `${r.label}: ${r.method} vs ${r.matrix}`).toBeLessThan(rel);
  }
  return rows;
}

function build(id: string, ctx = ctxOf()): StepDoc {
  const m = method(id);
  const a = m.applies(ctx);
  expect(a.ok, a.ok ? '' : JSON.stringify(a)).toBe(true);
  return m.build!(ctx);
}

/** Every Txt in a document, wherever it sits. */
function txtsOf(doc: StepDoc): Txt[] {
  const out: Txt[] = [doc.title];
  if (doc.subtitle) out.push(doc.subtitle);
  const cell = (c: unknown) => { if (isTxt(c)) out.push(c); };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.kind === 'p') out.push(b.text);
      else if (b.kind === 'eq') { if (b.note) out.push(b.note); }
      else if (b.kind === 'calc') { if (b.label) out.push(b.label); }
      else if (b.kind === 'table') { b.head.forEach(cell); b.rows.forEach((r) => r.forEach(cell)); if (b.caption) out.push(b.caption); }
      else if (b.kind === 'matrix' || b.kind === 'fig' || b.kind === 'compare') { if (b.caption) out.push(b.caption); }
      else if (b.kind === 'note') out.push(b.text);
      else if (b.kind === 'sub') { cell(b.title); walk(b.blocks); }
    }
  };
  walk(doc.intro);
  for (const s of doc.steps) { out.push(s.title); walk(s.blocks); }
  return out;
}

/** Every piece of KaTeX in a document. */
function texOf(doc: StepDoc): string[] {
  const out: string[] = [];
  const cell = (c: unknown) => { if (typeof c === 'object' && c !== null && 'tex' in c) out.push((c as { tex: string }).tex); };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.kind === 'eq') out.push(b.tex);
      else if (b.kind === 'calc') { out.push(b.formula, b.result); if (b.subst) out.push(b.subst); if (b.check) out.push(b.check); }
      else if (b.kind === 'table') { b.head.forEach(cell); b.rows.forEach((r) => r.forEach(cell)); }
      else if (b.kind === 'compare') out.push(...b.rows.map((r) => r.label));
      else if (b.kind === 'sub') walk(b.blocks);
    }
  };
  walk(doc.intro);
  for (const s of doc.steps) walk(s.blocks);
  return out;
}

const dicts = { es: { ...es, ...stepsEs }, en: { ...en, ...stepsEn }, pt: { ...pt, ...stepsPt } };
/** Every word in the three dictionaries, every formula valid KaTeX. */
function expectWords(doc: StepDoc) {
  for (const x of txtsOf(doc)) {
    for (const [lang, d] of Object.entries(dicts)) expect(d[x.key], `${lang}: ${x.key}`).toBeTypeOf('string');
  }
  for (const tex of texOf(doc)) {
    expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'error' }), tex).not.toThrow();
  }
}

const ref = () => solveReference(modelStore.buildSolverInput(false)!)!;

// ─── Beams ─────────────────────────────────────────────────────

function partialBeam(reverse: boolean) {
  // A beam on a pin and a roller with an overhang, a partial load, a couple and a point load; one member drawn right to left.
  const n = [0, 3, 6, 8].map((x) => modelStore.addNode(x, 0));
  const e1 = modelStore.addElement(n[0], n[1]);
  const e2 = reverse ? modelStore.addElement(n[2], n[1]) : modelStore.addElement(n[1], n[2]);
  const e3 = modelStore.addElement(n[2], n[3]);
  modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'rollerX');
  modelStore.addDistributedLoad(e1, -8, -8, undefined, undefined, undefined, 1, 2.5);
  modelStore.addPointLoadOnElement(e2, 1, 0, { my: 12 });
  modelStore.addDistributedLoad(e2, -4, -10);
  modelStore.addNodalLoad(n[3], 0, -5, 0);
  void e3;
  return n;
}

describe('double integration', () => {
  for (const ex of ['simply-supported', 'cantilever-point', 'continuous-beam']) {
    it(`${ex}: deflections, rotations and reactions agree with the matrix solve`, async () => {
      await modelStore.loadExample(ex);
      const doc = build('doubleIntegration');
      expectAgreement(doc, 1e-9);
      expectWords(doc);
    });
  }

  it('simply supported: 5wL⁴/384EI at midspan', async () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0), m = modelStore.addNode(3, 0), b = modelStore.addNode(6, 0);
    const e1 = modelStore.addElement(a, m), e2 = modelStore.addElement(m, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e1, -10, -10); modelStore.addDistributedLoad(e2, -10, -10);
    const doc = build('doubleIntegration');
    const rows = expectAgreement(doc, 1e-9);
    const EI = planeModel(modelStore.buildSolverInput(false)!).members.get(e1)!.EI;
    const vm = rows.find((r) => r.label === 'v_{B}')!;
    expect(vm.method).toBeCloseTo((-5 * 10 * 6 ** 4 / (384 * EI)) * 1000, 9);
  });

  it('propped cantilever with a partial load, a couple and a point load', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(2.5, 0), c = modelStore.addNode(5, 0);
    const e1 = modelStore.addElement(a, b), e2 = modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'rollerX');
    modelStore.addDistributedLoad(e1, -6, -6, undefined, undefined, undefined, 0.5, 2);
    modelStore.addPointLoadOnElement(e2, 1.2, -9, { my: -7 });
    modelStore.addNodalLoad(b, 0, 0, 5);
    expectAgreement(build('doubleIntegration'), 1e-9);
  });

  for (const reverse of [false, true]) {
    it(`overhang, partial and triangular loads, a couple${reverse ? ', one member drawn right to left' : ''}`, () => {
      partialBeam(reverse);
      const doc = build('doubleIntegration');
      expectAgreement(doc, 1e-9);
      expectWords(doc);
    });
  }

  it('refuses a variable EI, a frame and a hinge', async () => {
    await modelStore.loadExample('portal-frame');
    let r = method('doubleIntegration').applies(ctxOf());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.req.beam.horizontal');

    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(3, 0), c = modelStore.addNode(6, 0);
    modelStore.addElement(a, b); const e2 = modelStore.addElement(b, c);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(c, 'rollerX');
    const sec = modelStore.addSection({ name: 'x', a: 0.01, iz: 2e-5, iy: 1e-5, j: 1e-7, b: 0.1, h: 0.2 } as never);
    modelStore.updateElementSection(e2, sec);
    r = method('doubleIntegration').applies(ctxOf());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.m.doubleIntegration.req.ei');
    // Moment-area takes a variable EI.
    expect(method('momentArea').applies(ctxOf()).ok).toBe(true);
  });
});

describe('moment-area', () => {
  for (const ex of ['simply-supported', 'cantilever-point']) {
    it(`${ex}: agrees with the matrix solve`, async () => {
      await modelStore.loadExample(ex);
      const doc = build('momentArea');
      expectAgreement(doc, 1e-9);
      expectWords(doc);
    });
  }

  for (const reverse of [false, true]) {
    it(`overhang with partial, triangular, point loads and a couple${reverse ? ', drawn in reverse' : ''}`, () => {
      partialBeam(reverse);
      const doc = build('momentArea');
      expectAgreement(doc, 1e-9);
      expectWords(doc);
    });
  }

  it('a fixed support between two overhangs, and a variable EI', () => {
    const n = [0, 2, 5].map((x) => modelStore.addNode(x, 0));
    modelStore.addElement(n[0], n[1]); const e2 = modelStore.addElement(n[1], n[2]);
    modelStore.addSupport(n[1], 'fixed');
    modelStore.addNodalLoad(n[0], 0, -4, 0);
    modelStore.addDistributedLoad(e2, -3, 0);
    const sec = modelStore.addSection({ name: 'x', a: 0.01, iz: 2e-5, iy: 1e-5, j: 1e-7, b: 0.1, h: 0.2 } as never);
    modelStore.updateElementSection(e2, sec);
    const doc = build('momentArea');
    expectAgreement(doc, 1e-9);
  });

  it('refuses a statically indeterminate beam', async () => {
    await modelStore.loadExample('continuous-beam');
    const r = method('momentArea').applies(ctxOf());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.m.momentArea.req.determinate');
  });
});

// ─── Frames ────────────────────────────────────────────────────

describe('virtual work', () => {
  it('portal frame: the node that moves most, along its larger component', async () => {
    await modelStore.loadExample('portal-frame');
    const doc = build('virtualWork');
    const rows = expectAgreement(doc, 1e-9);
    expect(rows).toHaveLength(1);
    expectWords(doc);
  });

  it('portal frame: a selected node, vertically', async () => {
    await modelStore.loadExample('portal-frame');
    const input = modelStore.buildSolverInput(false)!;
    const pm = planeModel(input);
    const r = ref();
    // The node whose vertical displacement is larger than its horizontal one, if any; else the first free one.
    const free = pm.nodeOrder.filter((id) => !pm.supports.has(id));
    for (const id of free) {
      const doc = build('virtualWork', { input, pm, ref: r, selection: { nodes: [id], members: [] } });
      expectAgreement(doc, 1e-9);
    }
  });

  it('simply supported beam at a midspan node', () => {
    const a = modelStore.addNode(0, 0), m = modelStore.addNode(3, 0), b = modelStore.addNode(6, 0);
    const e1 = modelStore.addElement(a, m), e2 = modelStore.addElement(m, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e1, -10, -10); modelStore.addDistributedLoad(e2, -10, -10);
    const input = modelStore.buildSolverInput(false)!;
    const doc = build('virtualWork', { input, pm: planeModel(input), ref: solveReference(input), selection: { nodes: [m], members: [] } });
    const rows = expectAgreement(doc, 1e-9);
    const EI = planeModel(input).members.get(e1)!.EI;
    expect(rows[0].method).toBeCloseTo((5 * 10 * 6 ** 4 / (384 * EI)) * 1000, 9);
  });

  it('beam with partial, triangular and point loads and a couple', () => {
    const n = partialBeam(true);
    const input = modelStore.buildSolverInput(false)!;
    for (const id of [n[1], n[3]]) {
      const doc = build('virtualWork', { input, pm: planeModel(input), ref: solveReference(input), selection: { nodes: [id], members: [] } });
      expectAgreement(doc, 1e-9);
      expectWords(doc);
    }
  });

  it('a frame with an inclined member, an axial point load and a hinge', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(1.5, 3), c = modelStore.addNode(5, 3), d = modelStore.addNode(5, 0);
    const e1 = modelStore.addElement(a, b), e2 = modelStore.addElement(b, c); modelStore.addElement(d, c);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(d, 'fixed');
    modelStore.addPointLoadOnElement(e1, 1.2, -6, { px: 4 });
    modelStore.addDistributedLoad(e2, -9, -9);
    modelStore.toggleHinge(e2, 'end');
    const input = modelStore.buildSolverInput(false)!;
    for (const id of [b, c]) {
      const doc = build('virtualWork', { input, pm: planeModel(input), ref: solveReference(input), selection: { nodes: [id], members: [] } });
      expectAgreement(doc);
      expectWords(doc);
    }
    // The second theorem on the same frame, hinge and all.
    const doc = build('castigliano', { input, pm: planeModel(input), ref: solveReference(input), selection: { nodes: [], members: [] } });
    expectAgreement(doc);
    expectWords(doc);
  });

  it('a truss', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(2, 2);
    modelStore.addElement(a, b, 'truss'); modelStore.addElement(a, c, 'truss'); modelStore.addElement(c, b, 'truss');
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addNodalLoad(c, 5, -20, 0);
    const doc = build('virtualWork');
    expectAgreement(doc, 1e-9);
    expectWords(doc);
  });

  it('refuses thermal loads', async () => {
    await modelStore.loadExample('portal-frame');
    const e = [...modelStore.buildSolverInput(false)!.elements.keys()][0];
    modelStore.addThermalLoad(e, 20, 0);
    const r = method('virtualWork').applies(ctxOf());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.req.thermal');
  });
});

describe('castigliano', () => {
  it('portal frame: the second theorem gives the redundants and end moments', async () => {
    await modelStore.loadExample('portal-frame');
    const doc = build('castigliano');
    const rows = expectAgreement(doc, 1e-9);
    expect(rows.some((r) => r.label.startsWith('X_{1}'))).toBe(true);
    expectWords(doc);
  });

  it('continuous beam: the redundants are reactions', async () => {
    await modelStore.loadExample('continuous-beam');
    const doc = build('castigliano');
    expectAgreement(doc, 1e-9);
    expectWords(doc);
  });

  it('a closed frame, where the redundants are cuts', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
    const e1 = modelStore.addElement(a, b); modelStore.addElement(b, c); modelStore.addElement(c, d); const e4 = modelStore.addElement(d, a);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(d, 'rollerX');
    modelStore.addNodalLoad(b, 10, 0, 0);
    modelStore.addDistributedLoad(e4, -5, -5);
    void e1;
    const doc = build('castigliano');
    expectAgreement(doc, 1e-9);
    expectWords(doc);
  });

  it('cantilever: the first theorem with the load at the tip', async () => {
    await modelStore.loadExample('cantilever-point');
    const doc = build('castigliano');
    const rows = expectAgreement(doc, 1e-9);
    expect(rows).toHaveLength(1);
    expectWords(doc);
  });

  it('simply supported: the first theorem with a dummy load at midspan', () => {
    const a = modelStore.addNode(0, 0), m = modelStore.addNode(3, 0), b = modelStore.addNode(6, 0);
    const e1 = modelStore.addElement(a, m), e2 = modelStore.addElement(m, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e1, -10, -10); modelStore.addDistributedLoad(e2, -10, -10);
    const input = modelStore.buildSolverInput(false)!;
    const doc = build('castigliano', { input, pm: planeModel(input), ref: solveReference(input), selection: { nodes: [m], members: [] } });
    expectAgreement(doc, 1e-9);
    expectWords(doc);
  });

  it('refuses truss members', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(2, 2);
    modelStore.addElement(a, b, 'truss'); modelStore.addElement(a, c, 'truss'); modelStore.addElement(c, b, 'truss');
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addNodalLoad(c, 0, -20, 0);
    const r = method('castigliano').applies(ctxOf());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.deformation.req.truss');
  });
});

// ─── The axial term option ─────────────────────────────────────

/** A context for an input as given, with options. */
function ctxFor(input: SolverInput, options?: Record<string, boolean>, nodes: number[] = []): MethodContext {
  return { input, pm: planeModel(input), ref: solveReference(input), selection: { nodes, members: [] }, options };
}

/** The same model with every cross-section area multiplied: axially rigid members, bending unchanged. */
function stiffAxially(input: SolverInput, f: number): SolverInput {
  return { ...input, sections: new Map([...input.sections].map(([id, sec]) => [id, { ...sec, a: sec.a * f }])) };
}

/** The largest difference of a document's comparison, relative to the largest matrix value of its unit. */
function worstDiff(doc: StepDoc): number {
  const rows = compareRows(doc);
  const scale = new Map<string, number>();
  for (const r of rows) scale.set(r.unit, Math.max(scale.get(r.unit) ?? 0, Math.abs(r.matrix)));
  return Math.max(...rows.map((r) => Math.abs(r.method - r.matrix) / Math.max(scale.get(r.unit)!, 1e-3)));
}

/** A determinate frame: a fixed column with a beam on top, loaded along and across. */
function lFrame() {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3);
  modelStore.addElement(a, b); const e2 = modelStore.addElement(b, c);
  modelStore.addSupport(a, 'fixed');
  modelStore.addDistributedLoad(e2, -6, -6);
  modelStore.addNodalLoad(c, 3, -10, 0);
  return { c };
}

describe('the axial term option', () => {
  for (const id of ['virtualWork', 'castigliano']) {
    it(`${id} on the portal frame: on matches the matrix solve, off differs by a small amount`, async () => {
      await modelStore.loadExample('portal-frame');
      const input = modelStore.buildSolverInput(false)!;
      const on = build(id, ctxFor(input, { axial: true }));
      expectAgreement(on);
      expect(worstDiff(build(id, ctxFor(input)))).toBeLessThan(1e-9); // the default is on
      const off = build(id, ctxFor(input, { axial: false }));
      const d = worstDiff(off);
      expect(d).toBeGreaterThan(1e-4);
      expect(d).toBeLessThan(5e-2);
      expectWords(off);
    });

    it(`${id} with axially rigid members: on and off both match the matrix solve`, async () => {
      await modelStore.loadExample('portal-frame');
      const input = stiffAxially(modelStore.buildSolverInput(false)!, 1e5);
      expect(worstDiff(build(id, ctxFor(input, { axial: true })))).toBeLessThan(1e-9);
      expect(worstDiff(build(id, ctxFor(input, { axial: false })))).toBeLessThan(1e-5);
    });
  }

  it('castigliano, first theorem on a determinate frame: on exact, off close, off exact when axially rigid', () => {
    const { c } = lFrame();
    const input = modelStore.buildSolverInput(false)!;
    const on = build('castigliano', ctxFor(input, { axial: true }, [c]));
    expectAgreement(on);
    const off = build('castigliano', ctxFor(input, { axial: false }, [c]));
    const d = worstDiff(off);
    expect(d).toBeGreaterThan(1e-7);
    expect(d).toBeLessThan(5e-2);
    expectWords(off);
    const rigid = stiffAxially(input, 1e5);
    expect(worstDiff(build('castigliano', ctxFor(rigid, { axial: false }, [c])))).toBeLessThan(1e-5);
  });

  it('castigliano off on a closed frame: the redundants are cuts and the reactions still balance', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
    modelStore.addElement(a, b); modelStore.addElement(b, c); modelStore.addElement(c, d); const e4 = modelStore.addElement(d, a);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(d, 'rollerX');
    modelStore.addNodalLoad(b, 10, 0, 0);
    modelStore.addDistributedLoad(e4, -5, -5);
    const input = stiffAxially(modelStore.buildSolverInput(false)!, 1e5);
    const off = build('castigliano', ctxFor(input, { axial: false }));
    expect(worstDiff(off)).toBeLessThan(1e-5);
    expectWords(off);
  });

  it('a truss keeps its axial term whatever the option says', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(2, 2);
    modelStore.addElement(a, b, 'truss'); modelStore.addElement(a, c, 'truss'); modelStore.addElement(c, b, 'truss');
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addNodalLoad(c, 5, -20, 0);
    const doc = build('virtualWork', ctxFor(modelStore.buildSolverInput(false)!, { axial: false }));
    expectAgreement(doc);
    expectWords(doc);
  });

  it('the options have their words in the three languages', () => {
    const withOptions = methods.filter((m) => m.options?.length);
    expect(withOptions.map((m) => m.id).sort()).toEqual(['castigliano', 'virtualWork']);
    for (const m of withOptions) for (const o of m.options!) {
      expect(o).toEqual({ id: 'axial', default: true });
      for (const k of ['label', 'help']) {
        for (const [lang, d] of Object.entries(dicts)) expect(d[`steps.m.${m.id}.opt.${o.id}.${k}`], `${lang}: ${m.id}.${o.id}.${k}`).toBeTypeOf('string');
      }
    }
  });
});

describe('catalog words', () => {
  it('every method has its title, help and requirement in the three languages', () => {
    for (const m of methods) {
      for (const k of ['title', 'help', 'requires']) {
        for (const [lang, d] of Object.entries(dicts)) expect(d[`steps.m.${m.id}.${k}`], `${lang}: ${m.id}.${k}`).toBeTypeOf('string');
      }
    }
  });

  it('the three dictionaries of this group carry the same keys', async () => {
    const loc = await import('../../../i18n/locales/steps/deformation');
    const k = (o: Record<string, string>) => Object.keys(o).sort();
    expect(k(loc.en)).toEqual(k(loc.es));
    expect(k(loc.pt)).toEqual(k(loc.es));
  });
});
