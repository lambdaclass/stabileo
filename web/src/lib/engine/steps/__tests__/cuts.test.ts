/**
 * The method of cuts against the engine: reactions (when the structure is
 * statically determinate) and N, V, M at every member end, at the extremes
 * and inside every segment, for beams and frames drawn either way, with
 * partial and varying distributed loads, point loads, couples and hinges.
 * And every word the document uses exists in the three languages.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import katex from 'katex';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import type { MethodContext } from '../registry';
import type { Block, Cell, StepDoc } from '../doc';
import { isTxt } from '../doc';
import { buildCuts, methods, CUTS_MAX_MEMBERS } from '../methods/cuts';
import { stepsEs, stepsEn, stepsPt } from '../../../i18n/locales/steps';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';

const cuts = methods.find((m) => m.id === 'cuts')!;

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

function ctx(): MethodContext {
  const input = modelStore.buildSolverInput(false)!;
  return { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] } };
}

/** Everything the method found, against the matrix solve of the same model. */
function checkAgainstEngine(c: MethodContext, expectStatics: boolean) {
  expect(cuts.applies(c).ok).toBe(true);
  const b = buildCuts(c);
  const ref = c.ref!;
  expect(b.reactionsFromStatics).toBe(expectStatics);
  let scale = 1;
  for (const r of ref.reactions.values()) scale = Math.max(scale, Math.abs(r.rx), Math.abs(r.rz), Math.abs(r.my));
  const close = (a: number, e: number, what: string) => {
    const tol = 1e-6 * Math.max(scale, Math.abs(e));
    if (!(Math.abs(a - e) <= tol)) throw new Error(`${what}: ${a} vs ${e}`);
  };
  for (const [n, r] of b.reactions) {
    const e = ref.reactions.get(n)!;
    close(r.rx, e.rx, `Rx ${n}`); close(r.rz, e.rz, `Rz ${n}`); close(r.my, e.my, `My ${n}`);
  }
  let extremes = 0;
  // The axial force at J straight from the engine's element forces (the reference keeps only I's).
  const nEnd = new Map(wasm.solve(c.input).elementForces.map((f) => [f.elementId, f.nEnd]));
  for (const [id, cu] of b.cuts) {
    const L = cu.m.L;
    close(cu.Nj, nEnd.get(id)!, `N_j ${id}`);
    close(cu.Ni, ref.axial.get(id)!, `N_i ${id}`);
    close(cu.Vi, ref.shearAt(id, 0), `V_i ${id}`);
    close(cu.Mi, ref.momentAt(id, 0), `M_i ${id}`);
    close(cu.Vj, ref.shearAt(id, 1), `V_j ${id}`);
    close(cu.Mj, ref.momentAt(id, 1), `M_j ${id}`);
    for (const s of cu.segs) {
      for (const f of [0.25, 0.5, 0.75]) {
        const x = s.x0 + f * (s.x1 - s.x0);
        const ev = (p: number[]) => p.reduceRight((acc, k) => acc * x + k, 0);
        close(ev(s.V), ref.shearAt(id, x / L), `V ${id} at ${x}`);
        close(ev(s.M), ref.momentAt(id, x / L), `M ${id} at ${x}`);
      }
      for (const e of s.extremes) {
        extremes++;
        close(e.M, ref.momentAt(id, e.x / L), `M extreme ${id}`);
        // A true extreme: the moment just beside it is not larger in the extreme's sense.
        const d = 1e-4 * L, side = Math.sign(e.M - ref.momentAt(id, (e.x + d) / L));
        expect(side * (e.M - ref.momentAt(id, (e.x - d) / L))).toBeGreaterThanOrEqual(-1e-9 * scale);
      }
    }
  }
  return { built: b, extremes };
}

/** Every Txt key in a document, walking every block, cell, title and caption. */
function keysOf(doc: StepDoc): Set<string> {
  const keys = new Set<string>([doc.title.key, ...(doc.subtitle ? [doc.subtitle.key] : [])]);
  const cell = (c: Cell) => { if (isTxt(c)) keys.add(c.key); };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      switch (b.kind) {
        case 'p': case 'note': keys.add(b.text.key); break;
        case 'eq': if (b.note) keys.add(b.note.key); break;
        case 'calc': if (b.label) keys.add(b.label.key); break;
        case 'table': b.head.forEach(cell); b.rows.forEach((r) => r.forEach(cell)); if (b.caption) keys.add(b.caption.key); break;
        case 'matrix': case 'fig': case 'compare': if (b.caption) keys.add(b.caption.key); break;
        case 'sub': if (typeof b.title !== 'string') keys.add(b.title.key); walk(b.blocks); break;
      }
    }
  };
  walk(doc.intro);
  for (const s of doc.steps) { keys.add(s.title.key); walk(s.blocks); }
  return keys;
}

/** Every piece of mathematics in a document, so KaTeX can be asked to parse it. */
function texOf(doc: StepDoc): string[] {
  const out: string[] = [];
  const cell = (c: Cell) => { if (typeof c === 'object' && c !== null && 'tex' in c) out.push(c.tex); };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.kind === 'eq') out.push(b.tex);
      else if (b.kind === 'calc') out.push(b.formula, b.result, ...(b.subst ? [b.subst] : []), ...(b.check ? [b.check] : []));
      else if (b.kind === 'table') { b.head.forEach(cell); b.rows.forEach((r) => r.forEach(cell)); }
      else if (b.kind === 'compare') out.push(...b.rows.map((r) => r.label));
      else if (b.kind === 'sub') walk(b.blocks);
    }
  };
  walk(doc.intro);
  for (const s of doc.steps) walk(s.blocks);
  return out;
}

function expectDocSound(doc: StepDoc) {
  const bad: string[] = [];
  for (const t of texOf(doc)) {
    try { katex.renderToString(t, { throwOnError: true, displayMode: true }); } catch (e) { bad.push(`${t}\n  ${(e as Error).message}`); }
  }
  expect(bad).toEqual([]);
  const dicts = [{ ...es, ...stepsEs }, { ...en, ...stepsEn }, { ...pt, ...stepsPt }];
  const missing: string[] = [];
  for (const k of keysOf(doc)) for (const d of dicts) if (!(k in d)) missing.push(k);
  expect(missing).toEqual([]);
}

describe('method of cuts: the examples', () => {
  it('simply supported beam: reactions by statics, the wL²/8 extreme at mid-span', async () => {
    await modelStore.loadExample('simply-supported');
    const { built, extremes } = checkAgainstEngine(ctx(), true);
    expect(extremes).toBe(1);
    const cu = [...built.cuts.values()][0];
    expect(cu.segs[0].extremes[0].x).toBeCloseTo(3, 9);
    expect(cu.segs[0].extremes[0].M).toBeCloseTo(10 * 36 / 8, 9);
    expectDocSound(built.doc);
  });

  it('cantilever with a tip load', async () => {
    await modelStore.loadExample('cantilever-point');
    const { built } = checkAgainstEngine(ctx(), true);
    const cu = [...built.cuts.values()][0];
    expect(cu.Mi).toBeCloseTo(-45, 9);
    expectDocSound(built.doc);
  });

  it('portal frame: indeterminate, reactions from the matrix solve, the rest by cuts', async () => {
    await modelStore.loadExample('portal-frame');
    const { built } = checkAgainstEngine(ctx(), false);
    expectDocSound(built.doc);
    // The document says why the reactions are taken, and points elsewhere.
    expect(keysOf(built.doc).has('steps.cuts.reac.indeterminate')).toBe(true);
  });

  it('three-hinged arch: determinate, one hinge equation', async () => {
    await modelStore.loadExample('three-hinge-arch');
    const { built } = checkAgainstEngine(ctx(), true);
    expect(keysOf(built.doc).has('steps.cuts.reac.eqHinge')).toBe(true);
    expectDocSound(built.doc);
  });

  it('Gerber beam: indeterminate with a hinged link', async () => {
    await modelStore.loadExample('gerber-beam');
    const { built } = checkAgainstEngine(ctx(), false);
    expectDocSound(built.doc);
  });
});

describe('method of cuts: built models', () => {
  /** A three-hinged gable frame: one rafter drawn from the ridge down, varied loads. */
  function gable() {
    const A = modelStore.addNode(0, 0), B = modelStore.addNode(0, 4), C = modelStore.addNode(4, 6), D = modelStore.addNode(8, 4), E = modelStore.addNode(8, 0);
    const colL = modelStore.addElement(A, B);
    const rafL = modelStore.addElement(B, C);
    const rafR = modelStore.addElement(C, D);
    const colR = modelStore.addElement(E, D);
    modelStore.toggleHinge(rafL, 'end');
    modelStore.addSupport(A, 'pinned'); modelStore.addSupport(E, 'pinned');
    return { A, B, C, D, E, colL, rafL, rafR, colR };
  }

  it('a three-hinged gable frame with a partial trapezoidal load, a couple and an axial point load', () => {
    const g = gable();
    modelStore.addDistributedLoad(g.rafL, -4, -10, undefined, undefined, undefined, 0.5, 3.5);
    modelStore.addPointLoadOnElement(g.rafR, 2, -12, { my: 8 });
    modelStore.addPointLoadOnElement(g.colL, 1.5, 6, { px: 5 });
    modelStore.addNodalLoad(g.B, 7, 0, 0);
    const c = ctx();
    const { built } = checkAgainstEngine(c, true);
    // The rafter with the partial load splits in three, the other in two at the couple.
    expect(built.cuts.get(g.rafL)!.segs).toHaveLength(3);
    expect(built.cuts.get(g.rafR)!.segs).toHaveLength(2);
    // The axial load steps N down by 5 past it.
    const col = built.cuts.get(g.colL)!;
    expect(col.segs[0].N[0] - col.segs[1].N[0]).toBeCloseTo(5, 9);
    // The hinge: no moment at the ridge end of the left rafter.
    expect(Math.abs(built.cuts.get(g.rafL)!.Mj)).toBeLessThan(1e-9);
    expectDocSound(built.doc);
  });

  it('a member drawn right to left reads the same forces as the engine', () => {
    for (const reverse of [false, true]) {
      modelStore.clear();
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0), d = modelStore.addNode(9, 0);
      const e1 = reverse ? modelStore.addElement(b, a) : modelStore.addElement(a, b);
      const e2 = reverse ? modelStore.addElement(d, b) : modelStore.addElement(b, d);
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
      modelStore.addDistributedLoad(e1, -8, -8, undefined, undefined, undefined, 1, 4);
      modelStore.addPointLoadOnElement(e1, 5, 0, { my: 20 });
      modelStore.addPointLoadOnElement(e2, 1, -10);
      const { built } = checkAgainstEngine(ctx(), true);
      // Partial load [1, 4] and the couple at 5 (from I): four segments either way.
      expect(built.cuts.get(e1)!.segs).toHaveLength(4);
      expectDocSound(built.doc);
    }
  });

  it('a closed ring: end forces from the matrix solve, checked at the joints', () => {
    const n = [[0, 0], [5, 0], [5, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x, y));
    const es = [0, 1, 2, 3].map((k) => modelStore.addElement(n[k], n[(k + 1) % 4]));
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX');
    modelStore.addDistributedLoad(es[2], 6, 6);
    modelStore.addNodalLoad(n[3], 4, 0, 0);
    const { built } = checkAgainstEngine(ctx(), false);
    expect(keysOf(built.doc).has('steps.cuts.end.fromRef')).toBe(true);
    expectDocSound(built.doc);
  });

  it('a closed ring with three hinges: reactions by statics, end forces from the matrix solve', () => {
    const n = [[0, 0], [5, 0], [5, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x, y));
    const es = [0, 1, 2, 3].map((k) => modelStore.addElement(n[k], n[(k + 1) % 4]));
    modelStore.toggleHinge(es[1], 'end'); modelStore.toggleHinge(es[2], 'end'); modelStore.toggleHinge(es[3], 'end');
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX');
    modelStore.addDistributedLoad(es[2], 6, 6);
    modelStore.addNodalLoad(n[3], 4, 0, 0);
    const c = ctx();
    expect(c.ref).not.toBeNull();
    const { built } = checkAgainstEngine(c, true);
    const keys = keysOf(built.doc);
    expect(keys.has('steps.cuts.end.fromRef')).toBe(true);
    expect(keys.has('steps.cuts.reac.eqHinge')).toBe(false);
    expectDocSound(built.doc);
  });

  it('a cantilever with a couple only: the moment falls back to zero past it', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed');
    modelStore.addPointLoadOnElement(e, 2.5, 0, { my: 12 });
    const { built } = checkAgainstEngine(ctx(), true);
    const cu = built.cuts.get(e)!;
    expect(cu.segs[0].M).toEqual([12]);
    expect(Math.abs(cu.Mj)).toBeLessThan(1e-9);
    expect(keysOf(built.doc).has('steps.cuts.seg.noShear')).toBe(true);
  });

  it('a hinge at a fixed support: its condition counts there too', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(5, 0), c = modelStore.addNode(7, 0);
    const e1 = modelStore.addElement(a, b), e2 = modelStore.addElement(b, c);
    modelStore.toggleHinge(e1, 'end');
    modelStore.addSupport(a, 'rollerX'); modelStore.addSupport(b, 'fixed');
    modelStore.addDistributedLoad(e1, -6, -6);
    modelStore.addPointLoadOnElement(e2, 2, -9);
    const { built } = checkAgainstEngine(ctx(), true);
    expect(Math.abs(built.cuts.get(e1)!.Mj)).toBeLessThan(1e-9);
    expectDocSound(built.doc);
  });

  it('a triangular load: the extreme from a quadratic V(x) = 0', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e, 0, -12);
    const { built, extremes } = checkAgainstEngine(ctx(), true);
    expect(extremes).toBe(1);
    const x = built.cuts.get(e)!.segs[0].extremes[0].x;
    expect(x).toBeCloseTo(6 / Math.sqrt(3), 9);
  });
});

describe('method of cuts: what it refuses', () => {
  function beam() {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(5, 0);
    const e = modelStore.addElement(a, b);
    return { a, b, e };
  }

  it('truss members', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(2, 2);
    modelStore.addElement(a, b, 'truss'); modelStore.addElement(b, c, 'truss'); modelStore.addElement(c, a, 'truss');
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addNodalLoad(c, 0, -10, 0);
    const r = cuts.applies(ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.cuts.req.truss');
  });

  it('springs', () => {
    const { a, b, e } = beam();
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'spring', { ky: 1000 });
    modelStore.addDistributedLoad(e, -5, -5);
    const r = cuts.applies(ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.req.special');
  });

  it('thermal loads', () => {
    const { a, b, e } = beam();
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX');
    modelStore.addThermalLoad(e, 20, 10);
    const r = cuts.applies(ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.req.thermal');
  });

  it('a mechanism', () => {
    const { a, b, e } = beam();
    modelStore.addSupport(a, 'rollerX'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e, -5, -5);
    const r = cuts.applies(ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.req.unstable');
  });

  it(`more than ${CUTS_MAX_MEMBERS} members`, () => {
    const ids = Array.from({ length: CUTS_MAX_MEMBERS + 2 }, (_, k) => modelStore.addNode(k, 0));
    for (let k = 0; k + 1 < ids.length; k++) modelStore.addElement(ids[k], ids[k + 1]);
    modelStore.addSupport(ids[0], 'fixed');
    const r = cuts.applies(ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.cuts.req.tooMany');
  });

  it('the catalog entry: its words exist in the three languages', () => {
    for (const d of [{ ...es, ...stepsEs }, { ...en, ...stepsEn }, { ...pt, ...stepsPt }]) {
      for (const k of ['title', 'help', 'requires']) expect(d[`steps.m.cuts.${k}`]).toBeTruthy();
      for (const k of ['steps.cuts.req.truss', 'steps.cuts.req.tooMany', 'steps.cuts.req.connectors', 'steps.req.special', 'steps.req.thermal', 'steps.req.unstable', 'steps.req.noMembers']) expect(d[k]).toBeTruthy();
    }
  });
});
