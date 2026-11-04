/**
 * The displacement method as a course solves it, against hand solutions and
 * against the matrix solve: with members axially rigid it matches a solve
 * whose frame members have A × 10⁶; with axial stiffness it matches the
 * model itself to round-off.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import katex from 'katex';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import type { SolverInput } from '../../types';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import type { MethodContext } from '../registry';
import type { Block, CompareRow, StepDoc, Txt } from '../doc';
import { isTxt } from '../doc';
import { methods, displacementSolution } from '../methods/displacement';
import { endKey } from '../sway-modes';
import { stepsEs, stepsEn, stepsPt } from '../../../i18n/locales/steps';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

const method = methods[0];

/** Frame members axially rigid in practice; truss members (bielas) untouched. */
function rigidFrames(input: SolverInput): SolverInput {
  const sections = new Map(input.sections);
  const elements = new Map(input.elements);
  let next = Math.max(...sections.keys()) + 1;
  for (const [id, e] of input.elements) {
    if (e.type !== 'frame') continue;
    const s = input.sections.get(e.sectionId)!;
    sections.set(next, { ...s, id: next, a: s.a * 1e6 });
    elements.set(id, { ...e, sectionId: next });
    next++;
  }
  return { ...input, sections, elements };
}

function ctxOf(input: SolverInput, options: Record<string, boolean> = {}, ref: SolverInput = input): MethodContext {
  return { input, pm: planeModel(input), ref: solveReference(ref), selection: { members: [], nodes: [] }, options };
}

function build(ctx: MethodContext): StepDoc {
  expect(method.applies(ctx)).toEqual({ ok: true });
  return method.build!(ctx);
}

function compareRows(doc: StepDoc): CompareRow[] {
  for (const s of doc.steps) for (const b of s.blocks) if (b.kind === 'compare') return b.rows;
  throw new Error('no compare block');
}

function worst(doc: StepDoc, unit: string): number {
  const rows = compareRows(doc).filter((r) => r.unit === unit);
  const big = Math.max(...rows.map((r) => Math.abs(r.matrix)), 1e-9);
  return Math.max(...rows.map((r) => Math.abs(r.method - r.matrix))) / big;
}

/** Rigid against the engine with stiff frame members, axial against the model itself. */
function againstEngine(input: SolverInput, opts: Record<string, boolean> = {}) {
  const rigid = build(ctxOf(input, { ...opts, axial: false }, rigidFrames(input)));
  for (const u of ['kN·m', 'kN', 'rad']) if (compareRows(rigid).some((r) => r.unit === u)) expect(worst(rigid, u), `rigid ${u}`).toBeLessThan(1e-4);
  const axial = build(ctxOf(input, { ...opts, axial: true }));
  for (const u of ['kN·m', 'kN', 'rad', 'mm']) if (compareRows(axial).some((r) => r.unit === u)) expect(worst(axial, u), `axial ${u}`).toBeLessThan(1e-6);
  return { rigid, axial };
}

const solution = (input: SolverInput, opts: Record<string, boolean> = {}) => displacementSolution(ctxOf(input, opts))!;
const M = (sol: ReturnType<typeof solution>, id: number, e: 'i' | 'j') => sol.M.get(endKey(id, e))!;

function portal(opts: { hingeTopRight?: boolean; pinnedBases?: boolean; H?: number; w?: number } = {}) {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
  const col1 = modelStore.addElement(a, b), beam = modelStore.addElement(b, c), col2 = modelStore.addElement(d, c);
  modelStore.addSupport(a, opts.pinnedBases ? 'pinned' : 'fixed'); modelStore.addSupport(d, opts.pinnedBases ? 'pinned' : 'fixed');
  if (opts.w) modelStore.addDistributedLoad(beam, -opts.w, -opts.w);
  if (opts.H) modelStore.addNodalLoad(b, opts.H, 0, 0);
  if (opts.hingeTopRight) modelStore.toggleHinge(col2, 'end');
  return { a, b, c, d, col1, beam, col2 };
}

describe('hand-checked cases', () => {
  it('two-span beam, fixed at A: θ_B from k = 4EI/L + 3EI/L and the textbook end moments', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0), c = modelStore.addNode(12, 0);
    const e1 = modelStore.addElement(a, b), e2 = modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX'); modelStore.addSupport(c, 'pinned');
    modelStore.addDistributedLoad(e1, -12, -12); modelStore.addDistributedLoad(e2, -12, -12);
    const input = modelStore.buildSolverInput(false)!;
    const sol = solution(input);
    const EI = sol.md.get(e1)!.m.EI;
    expect(sol.ks.unknowns.length).toBe(1);
    expect(sol.K[0][0]).toBeCloseTo((4 * EI) / 6 + (3 * EI) / 6, 6);
    // R⁰ = FEM_BA + FEM*_BC = −36 + 54 = 18; θ_B = −18 / (7EI/6).
    expect(sol.R0[0]).toBeCloseTo(18, 9);
    expect(sol.D[0] * EI).toBeCloseTo(-108 / 7, 9);
    expect(M(sol, e1, 'i')).toBeCloseTo(36 - 36 / 7, 9);
    expect(M(sol, e1, 'j')).toBeCloseTo(-36 - 72 / 7, 9);
    expect(M(sol, e2, 'i')).toBeCloseTo(36 + 72 / 7, 9);
    expect(M(sol, e2, 'j')).toBeCloseTo(0, 9);
    againstEngine(input);
  });

  it('fixed-base portal with sway: k_ij from 4EI/L, 2EI/L, 6EI/L² and 12EI/L³', () => {
    const p = portal({ H: 20, w: 10 });
    const input = modelStore.buildSolverInput(false)!;
    const sol = solution(input);
    const EI = sol.md.get(p.col1)!.m.EI;
    expect(sol.ks.nTheta).toBe(2);
    expect(sol.ks.nDelta).toBe(1);
    const [tb, tc, dl] = [0, 1, 2];
    expect(sol.K[tb][tb]).toBeCloseTo((4 * EI) / 4 + (4 * EI) / 6, 6);
    expect(sol.K[tb][tc]).toBeCloseTo((2 * EI) / 6, 6);
    expect(Math.abs(sol.K[tb][dl])).toBeCloseTo((6 * EI) / 16, 6);
    expect(sol.K[dl][dl]).toBeCloseTo((2 * 12 * EI) / 64, 6);
    // Story shear: the restraint of the sway takes the horizontal load in state 0.
    expect(sol.R0[dl]).toBeCloseTo(-20, 9);
    againstEngine(input);
  });

  it('portal with a pinned column top: 3EI/L members, 12EI/h³ + 3EI/h³ sway stiffness, and the same moments with the released rotations as unknowns', () => {
    const p = portal({ H: 20, w: 10, hingeTopRight: true });
    const input = modelStore.buildSolverInput(false)!;
    const sol = solution(input);
    const EI = sol.md.get(p.col1)!.m.EI;
    // Only the beam reaches C rigidly: its end there is released too, so θ_B and the sway are the unknowns.
    expect([sol.ks.nTheta, sol.ks.nDelta]).toEqual([1, 1]);
    expect(sol.K[0][0]).toBeCloseTo((4 * EI) / 4 + (3 * EI) / 6, 6);
    expect(sol.K[1][1]).toBeCloseTo((12 * EI) / 64 + (3 * EI) / 64, 6);
    expect(M(sol, p.col2, 'j')).toBeCloseTo(0, 9);
    expect(M(sol, p.beam, 'j')).toBeCloseTo(0, 9);
    const more = solution(input, { releasedUnknown: true });
    expect([more.ks.nTheta, more.ks.nDelta]).toEqual([3, 1]);
    for (const id of [p.col1, p.beam, p.col2]) for (const e of ['i', 'j'] as const) expect(M(more, id, e)).toBeCloseTo(M(sol, id, e), 8);
    againstEngine(input);
    againstEngine(input, { releasedUnknown: true });
  });

  it('frame braced by a tie (biela): the tie adds EA/L·cos²α to the sway stiffness', () => {
    const p = portal({ H: 20, w: 10, pinnedBases: true });
    const tie = modelStore.addElement(p.a, p.c, 'truss');
    const input = modelStore.buildSolverInput(false)!;
    const sol = solution(input);
    const EI = sol.md.get(p.col1)!.m.EI;
    const t = sol.md.get(tie)!.m;
    expect([sol.ks.nTheta, sol.ks.nDelta]).toEqual([2, 1]);
    expect(sol.ks.extensible.has(tie)).toBe(true);
    expect(sol.K[2][2]).toBeCloseTo((2 * 3 * EI) / 64 + (t.EA / t.L) * t.c ** 2, 4);
    expect(sol.N.get(tie)!).toBeGreaterThan(0);
    againstEngine(input);
  });

  it('beam on a spring: k is added on the diagonal of the support translation', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(5, 0), c = modelStore.addNode(10, 0);
    const e1 = modelStore.addElement(a, b); modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'pinned'); modelStore.addSupport(b, 'spring', { ky: 2000 });
    modelStore.addDistributedLoad(e1, -10, -10);
    const input = modelStore.buildSolverInput(false)!;
    const sol = solution(input);
    const EI = sol.md.get(e1)!.m.EI;
    expect([sol.ks.nTheta, sol.ks.nDelta]).toEqual([1, 1]);
    expect(sol.K[1][1]).toBeCloseTo((12 * EI) / 125 + (3 * EI) / 125 + 2000, 4);
    const { axial } = againstEngine(input);
    expect(compareRows(axial).some((r) => r.label === 'B_z')).toBe(true);
    expect(sol.springs.get(b)!.z).toBeCloseTo(-2000 * sol.u.get(b)!.z, 9);
  });

  it('support settlement in estado 0: −6EIΔ/L² at the ends of the members it bends', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0), c = modelStore.addNode(12, 0);
    const e1 = modelStore.addElement(a, b), e2 = modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed'); const sb = modelStore.addSupport(b, 'rollerX'); modelStore.addSupport(c, 'rollerX');
    modelStore.updateSupport(sb, { dz: -0.01 });
    const input = modelStore.buildSolverInput(false)!;
    const sol = solution(input);
    const EI = sol.md.get(e1)!.m.EI;
    // Beam A–B fixed–fixed in estado 0: ψ = −0.01/6, M = −6EIψ/L at both ends.
    expect(sol.s0.act.get(e1)!.Mi).toBeCloseTo((6 * EI * 0.01) / 36, 6);
    // B–C released at C: M_BC = −3EIψ/L with ψ = +0.01/6.
    expect(sol.s0.act.get(e2)!.Mi).toBeCloseTo((-3 * EI * 0.01) / 36, 6);
    againstEngine(input);
  });

  it('temperature in estado 0: a gradient bends, a uniform rise stretches (rigid members take it as an imposed elongation)', () => {
    const p = portal();
    modelStore.addThermalLoad(p.beam, 30, 10);
    const input = modelStore.buildSolverInput(false)!;
    const sol = solution(input);
    expect([...sol.ks.up.values()].some((u) => Math.abs(u.x) > 0)).toBe(true);
    againstEngine(input);
  });

  it('a Gerber beam: the hinge leaves one deflection as the only unknown', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(8, 0);
    const e1 = modelStore.addElement(a, b), e2 = modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'rollerX');
    modelStore.toggleHinge(e1, 'end');
    modelStore.addDistributedLoad(e2, -10, -10);
    const input = modelStore.buildSolverInput(false)!;
    const sol = solution(input);
    expect([sol.ks.nTheta, sol.ks.nDelta]).toEqual([0, 1]);
    // The cantilever A–B carries B–C's reaction wL/2 = 20 kN at its tip: 20·4 = 80 kN·m, counter-clockwise on the member.
    expect(M(sol, e1, 'i')).toBeCloseTo(80, 6);
    againstEngine(input);
  });
});

describe('GIC with and without axial stiffness', () => {
  const count = (input: SolverInput, opts: Record<string, boolean>) => { const s = solution(input, opts); return [s.ks.nTheta, s.ks.nDelta]; };

  it('portal, two-story frame, continuous beam, hinged portal and braced frame', async () => {
    portal({ H: 10 });
    let input = modelStore.buildSolverInput(false)!;
    expect(count(input, {})).toEqual([2, 1]);
    expect(count(input, { axial: true })).toEqual([2, 4]);

    await modelStore.loadExample('two-story-frame');
    input = modelStore.buildSolverInput(false)!;
    expect(count(input, {})).toEqual([4, 2]);
    expect(count(input, { axial: true })).toEqual([4, 8]);

    modelStore.clear();
    const n = [0, 5, 10].map((x) => modelStore.addNode(x, 0));
    const e = modelStore.addElement(n[0], n[1]); modelStore.addElement(n[1], n[2]);
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addSupport(n[2], 'rollerX');
    modelStore.addDistributedLoad(e, -10, -10);
    input = modelStore.buildSolverInput(false)!;
    expect(count(input, {})).toEqual([1, 0]);
    expect(count(input, { axial: true })).toEqual([1, 2]);
    expect(count(input, { releasedUnknown: true })).toEqual([3, 0]);

    modelStore.clear();
    portal({ H: 10, hingeTopRight: true });
    input = modelStore.buildSolverInput(false)!;
    expect(count(input, {})).toEqual([1, 1]);
    expect(count(input, { releasedUnknown: true })).toEqual([3, 1]);

    modelStore.clear();
    const p = portal({ H: 10, pinnedBases: true });
    modelStore.addElement(p.a, p.c, 'truss');
    input = modelStore.buildSolverInput(false)!;
    expect(count(input, {})).toEqual([2, 1]);
    expect(count(input, { axial: true })).toEqual([2, 4]);
    expect(count(input, { releasedUnknown: true })).toEqual([4, 1]);
  });

  it('the GIC step names and sums the count, and compares it with GH', () => {
    portal({ H: 10, w: 5 });
    const input = modelStore.buildSolverInput(false)!;
    for (const [axial, gic] of [[false, 3], [true, 6]] as const) {
      const doc = build(ctxOf(input, { axial }, axial ? input : rigidFrames(input)));
      const first = doc.steps[0];
      expect(first.title.key).toBe('course.kinematics.gic.title');
      const calcs = first.blocks.filter((b): b is Extract<Block, { kind: 'calc' }> => b.kind === 'calc');
      expect(calcs.some((c) => c.result.includes(`GIC = ${gic}`))).toBe(true);
      const cmp = first.blocks.find((b) => b.kind === 'note' && b.text.key.startsWith('course.kinematics.gic.cmp.'));
      expect(cmp).toBeDefined();
      // GH = 3 for a fixed portal: equal with rigid members, fewer for the force method with axial stiffness.
      expect((cmp as { text: Txt }).text.key).toBe(axial ? 'course.kinematics.gic.cmp.force' : 'course.kinematics.gic.cmp.equal');
    }
  });
});

describe('the document', () => {
  function txts(doc: StepDoc): Txt[] {
    const out: Txt[] = [doc.title];
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

  it('reads GIC, stiffnesses, estado 0, one estado per unknown, the system, superposition, then the shared closing steps', () => {
    portal({ H: 20, w: 10 });
    const input = modelStore.buildSolverInput(false)!;
    const doc = build(ctxOf(input, {}, rigidFrames(input)));
    const keys = doc.steps.map((s) => s.title.key);
    expect(keys).toEqual([
      'course.kinematics.gic.title', 'course.kinematics.dm.stiff.title', 'course.kinematics.dm.s0.title',
      'course.kinematics.dm.state.title', 'course.kinematics.dm.state.title', 'course.kinematics.dm.state.title',
      'course.kinematics.dm.sys.title', 'course.kinematics.dm.sup.title',
      'steps.frames.shear.title', 'steps.frames.axial.title', 'steps.common.reactions', 'steps.common.compare', 'steps.common.diagrams',
    ]);
    expect(doc.steps[3].title.params).toMatchObject({ j: 1, u: 'θ_B' });
    expect(doc.steps[5].title.params).toMatchObject({ j: 3, u: 'Δ_1' });
    // The solved values in the system step are the ones the comparison checks.
    const sol = solution(input);
    const sys = doc.steps[6].blocks.find((b) => b.kind === 'calc' && b.label?.key === 'course.kinematics.dm.sys.solve') as Extract<Block, { kind: 'calc' }>;
    expect(sys.result).toContain(`\\theta_{B} =`);
    const theta = compareRows(doc).find((r) => r.label === '\\theta_{B}')!;
    expect(theta.method).toBeCloseTo(sol.D[0], 12);
    const mat = doc.steps[6].blocks.find((b) => b.kind === 'matrix' && b.name === '\\mathbf{K}') as Extract<Block, { kind: 'matrix' }>;
    expect(mat.rows).toEqual(sol.K);
  });

  it('every key is in Spanish, English and Portuguese, and the mathematics renders', () => {
    const dicts = { es: { ...es, ...stepsEs }, en: { ...en, ...stepsEn }, pt: { ...pt, ...stepsPt } };
    const docs: StepDoc[] = [];
    const p = portal({ H: 20, w: 10, hingeTopRight: true });
    modelStore.addThermalLoad(p.beam, 20, 5);
    modelStore.addElement(p.a, p.c, 'truss');
    const sd = [...modelStore.supports.values()].find((s) => s.nodeId === p.d)!;
    modelStore.updateSupport(sd.id, { dz: -0.005 });
    const input = modelStore.buildSolverInput(false)!;
    for (const axial of [false, true]) for (const releasedUnknown of [false, true]) docs.push(build(ctxOf(input, { axial, releasedUnknown })));
    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(5, 0), c = modelStore.addNode(10, 0);
    modelStore.addElement(a, b); modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'pinned'); modelStore.addSupport(b, 'spring', { ky: 2000, kz: 500 });
    modelStore.addNodalLoad(b, 0, -10, 3);
    docs.push(build(ctxOf(modelStore.buildSolverInput(false)!)));
    const missing: string[] = [];
    for (const doc of docs) {
      for (const t of texs(doc)) expect(() => katex.renderToString(t, { throwOnError: true }), t).not.toThrow();
      for (const t of txts(doc)) for (const [lang, dict] of Object.entries(dicts)) if (!(t.key in dict)) missing.push(`${lang}: ${t.key}`);
    }
    expect([...new Set(missing)]).toEqual([]);
    for (const k of ['title', 'help', 'requires', 'opt.axial.label', 'opt.axial.help', 'opt.releasedUnknown.label', 'opt.releasedUnknown.help']) {
      for (const [lang, dict] of Object.entries(dicts)) expect(dict, `${lang} steps.m.displacement.${k}`).toHaveProperty([`steps.m.displacement.${k}`]);
    }
  });

  it('refuses what it cannot take, and says why', () => {
    const reason = (input: SolverInput, opts: Record<string, boolean> = {}) => { const r = method.applies(ctxOf(input, opts)); return r.ok ? null : r.reason.key; };
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'fixed');
    modelStore.addDistributedLoad(e, -10, -10);
    expect(reason(modelStore.buildSolverInput(false)!)).toBe('course.kinematics.req.noUnknowns');
    modelStore.clear();
    const n = [0, 6, 12].map((x) => modelStore.addNode(x, 0));
    modelStore.addElement(n[0], n[1]); modelStore.addElement(n[1], n[2]);
    modelStore.addSupport(n[0], 'pinned'); const s = modelStore.addSupport(n[2], 'pinned');
    modelStore.addSupport(n[1], 'rollerX');
    modelStore.updateSupport(s, { dx: 0.01 });
    expect(reason(modelStore.buildSolverInput(false)!)).toBe('course.kinematics.req.imposedRigid');
    expect(reason(modelStore.buildSolverInput(false)!, { axial: true })).toBeNull();
  });
});

describe('slope-deflection and moment distribution show the GIC too', () => {
  it('portal: GIC = 2 + 1 beside the sway count', async () => {
    await modelStore.loadExample('portal-frame');
    const input = modelStore.buildSolverInput(false)!;
    const { methods: frames } = await import('../methods/frames');
    const doc = frames.find((m) => m.id === 'slopeDeflection')!.build!(ctxOf(input));
    const calcs = doc.steps[0].blocks.filter((b): b is Extract<Block, { kind: 'calc' }> => b.kind === 'calc');
    expect(calcs.some((c) => c.subst === 'GIC = 2 + 1' && c.result.includes('GIC = 3'))).toBe(true);
  });
});
