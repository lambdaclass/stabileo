/**
 * The truss methods against the engine: the method of joints and the method
 * of sections give the member forces and reactions of the matrix solve on
 * statically determinate trusses (there, equilibrium alone fixes them), and
 * the compatibility-matrix method reproduces the solve itself, displacements
 * included, on a truss and on a frame. Every word a document uses exists in
 * the three offered languages.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import type { MethodContext } from '../registry';
import type { Block, StepDoc, Txt } from '../doc';
import { isTxt } from '../doc';
import { methods, internals } from '../methods/trusses';
import { stepsEs, stepsEn, stepsPt } from '../../../i18n/locales/steps';
import katex from 'katex';
import type { Cell } from '../doc';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

const joints = methods.find((m) => m.id === 'joints')!;
const sections = methods.find((m) => m.id === 'sections')!;
const compat = methods.find((m) => m.id === 'compatibility')!;

function ctxNow(selection: MethodContext['selection'] = { members: [], nodes: [] }): MethodContext {
  const input = modelStore.buildSolverInput(false)!;
  return { input, pm: planeModel(input), ref: solveReference(input), selection };
}
async function example(name: string, selection?: MethodContext['selection']): Promise<MethodContext> {
  await modelStore.loadExample(name);
  return ctxNow(selection);
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));

/** Every compare row of a document, method against matrix, within `tol` relative. */
function expectCompareAgrees(doc: StepDoc, tol: number): number {
  let n = 0;
  for (const s of doc.steps) for (const b of s.blocks) if (b.kind === 'compare') {
    for (const r of b.rows) {
      expect(Number.isFinite(r.matrix), r.label).toBe(true);
      expect(rel(r.method, r.matrix), `${r.label}: ${r.method} vs ${r.matrix}`).toBeLessThan(tol);
      n++;
    }
  }
  return n;
}

/** Every Txt in a document, wherever it sits. */
function txtsOf(doc: StepDoc): Txt[] {
  const out: Txt[] = [doc.title];
  if (doc.subtitle) out.push(doc.subtitle);
  const walk = (b: Block) => {
    switch (b.kind) {
      case 'p': out.push(b.text); break;
      case 'eq': if (b.note) out.push(b.note); break;
      case 'calc': if (b.label) out.push(b.label); break;
      case 'table': for (const c of [...b.head, ...b.rows.flat()]) if (isTxt(c)) out.push(c); if (b.caption) out.push(b.caption); break;
      case 'matrix': if (b.caption) out.push(b.caption); break;
      case 'fig': if (b.caption) out.push(b.caption); break;
      case 'note': out.push(b.text); break;
      case 'sub': if (isTxt(b.title)) out.push(b.title); b.blocks.forEach(walk); break;
      case 'compare': if (b.caption) out.push(b.caption); break;
    }
  };
  doc.intro.forEach(walk);
  for (const s of doc.steps) { out.push(s.title); s.blocks.forEach(walk); }
  return out;
}

const dicts = { es: { ...es, ...stepsEs }, en: { ...en, ...stepsEn }, pt: { ...pt, ...stepsPt } } as Record<string, Record<string, string>>;

function expectWordsExist(doc: StepDoc) {
  for (const t of txtsOf(doc)) {
    for (const [lang, d] of Object.entries(dicts)) {
      expect(d[t.key], `${lang}: ${t.key}`).toBeTypeOf('string');
      // Every parameter the text uses is given.
      for (const m of d[t.key].matchAll(/\{(\w+)\}/g)) expect(t.params?.[m[1]], `${lang}: ${t.key} {${m[1]}}`).not.toBeUndefined();
    }
  }
}

describe('method of joints', () => {
  for (const name of ['truss', 'warren-truss', 'howe-truss']) {
    it(`matches the matrix solve on '${name}'`, async () => {
      const ctx = await example(name);
      expect(joints.applies(ctx)).toEqual({ ok: true });
      const doc = joints.build!(ctx);
      const n = expectCompareAgrees(doc, 1e-6);
      expect(n).toBe(ctx.pm.members.size + 3);
      expectWordsExist(doc);
    });
  }

  it('finds an order that starts at a support joint with two members and ends with checks', async () => {
    const ctx = await example('truss');
    const gs = internals.solveGlobal(ctx.pm)!;
    expect(gs.seq[0].g.kind).toBe('M');
    expect(gs.seq[0].g.O!.name).toBe('A');
    const plan = internals.planJoints(ctx.pm, new Set(gs.values.keys()))!;
    const names = plan.order.map((o) => ctx.pm.nodes.get(o.node)!.name);
    expect(names[0]).toBe('A');
    expect(plan.order.every((o) => o.unknowns.length <= 2)).toBe(true);
    expect(names.length + plan.checks.length).toBe(8);
    // 13 forces from 16 equations less the 3 of global equilibrium: three equations are checks.
    const solvedEqs = plan.order.reduce((s, o) => s + o.unknowns.length, 0);
    expect(solvedEqs).toBe(13);
  });

  it('gives the same forces with a member drawn the other way', async () => {
    await modelStore.loadExample('truss');
    const before = joints.build!(ctxNow());
    const e = [...modelStore.elements.values()].find((x) => x.nodeI === 6 && x.nodeJ === 3)!;
    modelStore.updateElement(e.id, { nodeI: 3, nodeJ: 6 });
    const ctx = ctxNow();
    expect(ctx.pm.members.get(e.id)!.i).toBe(3);
    const after = joints.build!(ctx);
    expectCompareAgrees(after, 1e-6);
    const rows = (d: StepDoc) => d.steps.flatMap((s) => s.blocks).find((b) => b.kind === 'compare')!;
    const a = rows(before), b = rows(after);
    if (a.kind !== 'compare' || b.kind !== 'compare') throw new Error('no compare');
    a.rows.forEach((r, k) => expect(b.rows[k].method).toBeCloseTo(r.method, 9));
  });

  it('notes a zero-force member', async () => {
    const ctx = await example('truss');
    const doc = joints.build!(ctx);
    const notes = doc.steps.flatMap((s) => s.blocks).flatMap((b) => (b.kind === 'sub' ? b.blocks : [b])).filter((b) => b.kind === 'note' && b.text.key.endsWith('zeroForce'));
    const zero = [...ctx.ref!.axial].filter(([, v]) => Math.abs(v) < 1e-9).length;
    expect(notes.length).toBe(zero);
  });

  it('refuses an indeterminate truss, a frame, and span loads', async () => {
    await modelStore.loadExample('truss');
    modelStore.addElement(2, 7, 'truss'); // a second diagonal in a panel
    let r = joints.applies(ctxNow());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toEqual({ key: 'steps.trusses.req.indeterminate', params: { g: 1 } });
    expect(sections.applies(ctxNow()).ok).toBe(false);

    await modelStore.loadExample('portal-frame');
    r = joints.applies(ctxNow());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.trusses.req.notTruss');

    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(2, 2);
    const e = modelStore.addElement(a, b, 'truss'); modelStore.addElement(b, c, 'truss'); modelStore.addElement(a, c, 'truss');
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e, -5, -5);
    r = joints.applies(ctxNow());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.trusses.req.spanLoads');
  });

  it('finds the reactions at the joints when global equilibrium cannot (a three-hinged truss arch)', async () => {
    const [a, b, c, d, e] = [[0, 0], [3, 1], [4, 3], [5, 1], [8, 0]].map(([x, z]) => modelStore.addNode(x, z));
    for (const [i, j] of [[a, b], [b, c], [a, c], [c, d], [d, e], [c, e]]) modelStore.addElement(i, j, 'truss');
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(e, 'pinned');
    modelStore.addNodalLoad(c, 4, -20);
    const ctx = ctxNow();
    expect(internals.solveGlobal(ctx.pm)).toBeNull();
    expect(joints.applies(ctx)).toEqual({ ok: true });
    const doc = joints.build!(ctx);
    expect(expectCompareAgrees(doc, 1e-6)).toBe(6 + 4);
    expectWordsExist(doc);
    expectCompareAgrees(compat.build!(ctx), 1e-6);
  });

  it('takes frame members hinged at both ends as truss members', async () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(2, 3);
    for (const [i, j] of [[a, b], [b, c], [a, c]]) {
      const e = modelStore.addElement(i, j, 'frame');
      modelStore.toggleHinge(e, 'start'); modelStore.toggleHinge(e, 'end');
    }
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addNodalLoad(c, 5, -12);
    const ctx = ctxNow();
    expect(joints.applies(ctx)).toEqual({ ok: true });
    expectCompareAgrees(joints.build!(ctx), 1e-6);
  });
});

describe('method of sections', () => {
  it('cuts the middle-panel diagonal by default and matches the matrix solve', async () => {
    const ctx = await example('truss');
    expect(sections.applies(ctx)).toEqual({ ok: true });
    const t = internals.sectionTarget(ctx, true);
    const m = ctx.pm.members.get(t.target!)!;
    expect(Math.abs(m.c) > 1e-6 && Math.abs(m.s) > 1e-6).toBe(true);
    expect(t.cut!.members).toHaveLength(3);
    const doc = sections.build!(ctx);
    expect(expectCompareAgrees(doc, 1e-6)).toBe(3 + 3);
    expectWordsExist(doc);
  });

  it('cuts through the member the user selected', async () => {
    await modelStore.loadExample('truss');
    for (const id of [5, 2, 11, 7]) {
      const ctx = ctxNow({ members: [id], nodes: [] });
      expect(sections.applies(ctx)).toEqual({ ok: true });
      const t = internals.sectionTarget(ctx, true);
      expect(t.target).toBe(id);
      expect(t.cut!.members).toContain(id);
      const doc = sections.build!(ctx);
      expectCompareAgrees(doc, 1e-6);
      expectWordsExist(doc);
    }
  });

  it('works on the Warren and Howe trusses', async () => {
    for (const name of ['warren-truss', 'howe-truss']) {
      const ctx = await example(name);
      expect(sections.applies(ctx)).toEqual({ ok: true });
      expectCompareAgrees(sections.build!(ctx), 1e-6);
    }
  });

  it('says when the selected member has no three-member cut, and never cuts around a joint with two members in line', async () => {
    // A K-truss: the vertical is split at mid-height, where the K diagonals meet.
    const n = [[0, 0], [4, 0], [8, 0], [0, 4], [4, 4], [8, 4], [4, 2]].map(([x, z]) => modelStore.addNode(x, z));
    const bars: Array<[number, number]> = [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [2, 5], [1, 6], [6, 4], [3, 6], [6, 2], [6, 5]];
    const ids = bars.map(([i, j]) => modelStore.addElement(n[i], n[j], 'truss'));
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'rollerX');
    modelStore.addNodalLoad(n[4], 0, -10);
    // The right post C–F: any cut through it crosses a fourth member.
    const r = sections.applies(ctxNow({ members: [ids[5]], nodes: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toEqual({ key: 'steps.trusses.req.noCutFor', params: { m: 'C–F' } });
    // E–F with D–E and G–E isolates joint E, but D–E and E–F lie on one line: not a Ritter cut.
    expect(internals.findCut(ctxNow().pm, ids[3], true)).toBeNull();
    // A chord does have one, and the default target too.
    for (const sel of [[ids[0]], []]) {
      const ctx = ctxNow({ members: sel, nodes: [] });
      expect(sections.applies(ctx)).toEqual({ ok: true });
      expectCompareAgrees(sections.build!(ctx), 1e-6);
    }
    expect(joints.applies(ctxNow())).toEqual({ ok: true });
    expectCompareAgrees(joints.build!(ctxNow()), 1e-6);
  });
});

describe('compatibility-matrix method', () => {
  it('reproduces the matrix solve on the Pratt truss', async () => {
    const ctx = await example('truss');
    expect(compat.applies(ctx)).toEqual({ ok: true });
    const cm = internals.compatSolve(ctx.pm)!;
    expect(cm.dofs).toHaveLength(13);
    expect(cm.coords).toHaveLength(13);
    for (const [k, d] of cm.dofs.entries()) {
      const u = ctx.ref!.displacements.get(d.node)!;
      const v = d.kind === 'ux' ? u.ux : u.uz;
      expect(Math.abs(cm.q[k] - v) / Math.max(1e-12, Math.abs(v))).toBeLessThan(1e-6);
    }
    const doc = compat.build!(ctx);
    expectCompareAgrees(doc, 1e-6);
    expectWordsExist(doc);
  });

  it('reproduces the matrix solve on the portal frame', async () => {
    const ctx = await example('portal-frame');
    expect(compat.applies(ctx)).toEqual({ ok: true });
    const cm = internals.compatSolve(ctx.pm)!;
    expect(cm.dofs).toHaveLength(6);
    expect(cm.coords).toHaveLength(9);
    for (const [k, d] of cm.dofs.entries()) {
      const u = ctx.ref!.displacements.get(d.node)!;
      const v = d.kind === 'ux' ? u.ux : d.kind === 'uz' ? u.uz : u.ry;
      expect(Math.abs(cm.q[k] - v) / Math.abs(v)).toBeLessThan(1e-6);
    }
    for (const m of ctx.pm.members.values()) {
      const e = cm.ends.get(m.id)!;
      const em = ctx.ref!.endMoments.get(m.id)!;
      expect(rel(e.Mi, em.Mi)).toBeLessThan(1e-6);
      expect(rel(e.Mj, em.Mj)).toBeLessThan(1e-6);
      expect(rel(e.Ni, ctx.ref!.axial.get(m.id)!)).toBeLessThan(1e-6);
      for (const t of [0.25, 0.5, 0.8]) {
        // The bending moment along the member, from the end actions and the span load.
        expect(rel(internals.momentAlong(ctx.pm, m, cm.ends.get(m.id)!, t), ctx.ref!.momentAt(m.id, t))).toBeLessThan(1e-6);
      }
    }
    const doc = compat.build!(ctx);
    expectCompareAgrees(doc, 1e-6);
    expectWordsExist(doc);
  });

  it('handles hinged frame ends, a point load with an axial part, and a mixed truss-frame model', async () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(5, 4), d = modelStore.addNode(5, 0), e = modelStore.addNode(8, 4);
    const col1 = modelStore.addElement(a, b, 'frame');
    const beam = modelStore.addElement(c, b, 'frame'); // drawn right to left
    const col2 = modelStore.addElement(d, c, 'frame');
    const tie = modelStore.addElement(c, e, 'frame');
    modelStore.toggleHinge(col2, 'end');
    modelStore.addElement(d, e, 'truss');
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'pinned');
    modelStore.addDistributedLoad(beam, -8, -12);
    modelStore.addPointLoadOnElement(col1, 1.5, 6, { px: -3 });
    modelStore.addPointLoadOnElement(tie, 1, -10, { my: 4 });
    modelStore.addNodalLoad(e, 2, -5, 0);
    void col1;
    const ctx = ctxNow();
    expect(compat.applies(ctx)).toEqual({ ok: true });
    const doc = compat.build!(ctx);
    expectCompareAgrees(doc, 1e-6);
    expectWordsExist(doc);
    const cm = internals.compatSolve(ctx.pm)!;
    expect(cm.residual).toBeLessThan(1e-8);
  });

  it('refuses special supports and too many degrees of freedom', async () => {
    await modelStore.loadExample('spring-support');
    const r = compat.applies(ctxNow());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('steps.req.special');

    modelStore.clear();
    const n = Array.from({ length: 16 }, (_, k) => modelStore.addNode(k, 0));
    for (let k = 0; k + 1 < n.length; k++) modelStore.addElement(n[k], n[k + 1], 'frame');
    modelStore.addSupport(n[0], 'fixed');
    const r2 = compat.applies(ctxNow());
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toEqual({ key: 'steps.trusses.req.tooManyDofs', params: { n: 45, max: 40 } });
  });
});

/** Every piece of mathematics in a document, for KaTeX to parse. */
function texOf(doc: StepDoc): string[] {
  const out: string[] = [];
  const cell = (c: Cell) => { if (typeof c === 'object' && c !== null && 'tex' in c) out.push(c.tex); };
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
  for (const st of doc.steps) walk(st.blocks);
  return out;
}
function expectTexParses(doc: StepDoc) {
  const bad: string[] = [];
  for (const t of texOf(doc)) {
    try { katex.renderToString(t, { throwOnError: true, displayMode: true }); } catch (e) { bad.push(`${t}\n  ${(e as Error).message}`); }
  }
  expect(bad).toEqual([]);
}

/** The context with the inextensible assumption on, optionally every area scaled (members nearly rigid axially). */
function inextCtx(areaFactor = 1): MethodContext {
  const input = modelStore.buildSolverInput(false)!;
  if (areaFactor !== 1) for (const [id, sec] of input.sections) input.sections.set(id, { ...sec, a: sec.a * areaFactor });
  return { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] }, options: { inextensible: true } };
}
const notes = (doc: StepDoc) => doc.intro.filter((b) => b.kind === 'note').map((b) => (b.kind === 'note' ? b.text.key : ''));
/** Largest relative difference of the compare rows, relative to the largest value of each unit. */
function worstCompare(doc: StepDoc): number {
  let worst = 0;
  for (const st of doc.steps) for (const b of st.blocks) if (b.kind === 'compare') {
    const big = new Map<string, number>();
    for (const r of b.rows) big.set(r.unit, Math.max(big.get(r.unit) ?? 0, Math.abs(r.matrix)));
    for (const r of b.rows) worst = Math.max(worst, Math.abs(r.method - r.matrix) / Math.max(1e-12, big.get(r.unit)!));
  }
  return worst;
}

describe('compatibility-matrix method, inextensible frame members', () => {
  it('is an option, off by default, and off leaves the document as it was', async () => {
    expect(compat.options).toEqual([{ id: 'inextensible', default: false }]);
    await modelStore.loadExample('portal-frame');
    const off = compat.build!(ctxNow());
    const offExplicit = compat.build!({ ...ctxNow(), options: { inextensible: false } });
    expect(JSON.stringify(offExplicit)).toBe(JSON.stringify(off));
    expect(notes(off)).not.toContain('steps.trusses.compat.inext.on');
  });

  for (const name of ['portal-frame', 'two-story-frame']) {
    it(`'${name}': fewer unknowns, close to the matrix solve, and the matrix solve with rigid members`, async () => {
      await modelStore.loadExample(name);
      const ctx = inextCtx();
      const cm = internals.compatSolve(ctx.pm, true)!;
      const flex = internals.compatSolve(ctx.pm, false)!;
      expect(cm.inext).toBe('on');
      expect(cm.dofs.length).toBeLessThan(flex.dofs.length);
      expect(cm.dofs.length + cm.deps.length).toBe(flex.dofs.length);
      // No frame member keeps an elongation coordinate.
      expect(cm.coords.some((c) => c.local === 3)).toBe(false);
      expect(cm.residual).toBeLessThan(1e-8);
      const doc = compat.build!(ctx);
      expect(notes(doc)).toContain('steps.trusses.compat.inext.on');
      const w = worstCompare(doc);
      expect(w).toBeGreaterThan(1e-9); // axial deformation is left out, so not exact
      expect(w).toBeLessThan(0.1);
      expectWordsExist(doc);
      expectTexParses(doc);
      // With every area 10⁵ times larger the matrix solve tends to rigid members.
      await modelStore.loadExample(name);
      const stiff = inextCtx(1e5);
      expect(worstCompare(compat.build!(stiff))).toBeLessThan(1e-5);
    });
  }

  it('a gable frame with inclined rafters: two sway states, rigid limit matched', async () => {
    const [a, b, c, d, e] = [[0, 0], [0, 4], [3, 6], [6, 4], [6, 0]].map(([x, z]) => modelStore.addNode(x, z));
    const bars = [[a, b], [b, c], [d, c], [e, d]].map(([i, j]) => modelStore.addElement(i, j, 'frame'));
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(e, 'pinned');
    modelStore.addDistributedLoad(bars[1], -6, -6);
    modelStore.addNodalLoad(b, 5, 0, 0);
    modelStore.addNodalLoad(c, 0, -10, 0);
    const ctx = inextCtx();
    const cm = internals.compatSolve(ctx.pm, true)!;
    expect(cm.inext).toBe('on');
    // Translations: B, C, D free in x and z (6), four members of fixed length: two independent.
    expect(cm.dofs.filter((q) => q.kind !== 'ry')).toHaveLength(2);
    const doc = compat.build!(ctx);
    expect(worstCompare(doc)).toBeLessThan(0.1);
    expectWordsExist(doc);
    expectTexParses(doc);
    expect(worstCompare(compat.build!(inextCtx(1e5)))).toBeLessThan(1e-5);
  });

  it('keeps truss members flexible in a mixed model', async () => {
    const [a, b, c, d] = [[0, 0], [0, 4], [5, 4], [5, 0]].map(([x, z]) => modelStore.addNode(x, z));
    modelStore.addElement(a, b, 'frame'); modelStore.addElement(b, c, 'frame'); modelStore.addElement(d, c, 'frame');
    const brace = modelStore.addElement(a, c, 'truss');
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
    modelStore.addNodalLoad(b, 20, 0, 0);
    const ctx = inextCtx();
    const cm = internals.compatSolve(ctx.pm, true)!;
    expect(cm.inext).toBe('on');
    expect(cm.coords.filter((q) => q.local === 3)).toHaveLength(1);
    const doc = compat.build!(ctx);
    expect(notes(doc)).toContain('steps.trusses.compat.inext.mixed');
    expectWordsExist(doc);
    expectTexParses(doc);
    // The brace stays flexible, so the rigid limit is the frame members' areas alone grown (10⁶ times:
    // with a brace the axial effect is larger than in a bare frame, and it fades as 1/EA).
    const input = modelStore.buildSolverInput(false)!;
    const e = input.elements.get(brace)!;
    const own = Math.max(...input.sections.keys()) + 1;
    input.sections.set(own, { ...input.sections.get(e.sectionId)!, id: own });
    input.elements.set(brace, { ...e, sectionId: own });
    for (const [id, sec] of input.sections) if (id !== own) input.sections.set(id, { ...sec, a: sec.a * 1e6 });
    const stiff: MethodContext = { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] }, options: { inextensible: true } };
    expect(worstCompare(compat.build!(stiff))).toBeLessThan(1e-5);
  });

  it('on a truss it keeps the flexible members and says why', async () => {
    await modelStore.loadExample('truss');
    const ctx = inextCtx();
    const doc = compat.build!(ctx);
    expect(notes(doc)).toContain('steps.trusses.compat.inext.truss');
    expectCompareAgrees(doc, 1e-6);
    expectWordsExist(doc);
    expectTexParses(doc);
  });

  it('flexible documents parse in KaTeX too', async () => {
    for (const name of ['truss', 'portal-frame']) {
      await modelStore.loadExample(name);
      expectTexParses(compat.build!(ctxNow()));
    }
  });
});
