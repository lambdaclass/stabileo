/**
 * Every explained method, on every 2D example and on a few hundred generated
 * models: wherever a method says it applies, its document must build, every
 * word in it must exist in the three languages with its parameters filled,
 * every formula must be valid KaTeX, every number finite, and its closing
 * comparison must agree with the matrix solve of the same model.
 *
 * The per-method tests pin the theory on chosen cases; this one looks for the
 * model nobody thought of: an overhang with a couple at its tip, a member
 * drawn backwards next to a fixed end, a truss with an odd number of panels.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import katex from 'katex';
import { narrowTex, NARROW_LEVELS } from '../narrow-tex';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import { allMethods } from '../methods';
import type { ExplainedMethod, MethodContext } from '../registry';
import type { Block, Cell, CompareRow, StepDoc, Txt } from '../doc';
import { isTxt } from '../doc';
import { teachingPDelta, solveState } from '../../second-order/pdelta';
import { teachingBuckling, linearBuckling, phiBuckling, firstOrderAxial } from '../../second-order/buckling';
import { buildSystem } from '../../second-order/system';
import type { GeomMethod } from '../../second-order/member-matrices';
import { refineInput } from '../../second-order/refine';
import { referenceInput } from '../second-order-common';
import { generalizedEigen } from '../../second-order/dense';
import { solveDense } from '../sway-modes';
import type { SolverInput, SolverLoad } from '../../types';
import { fixtureNames2D, INTENTIONALLY_UNSOLVABLE } from '../../../templates/fixture-index';
import { stepsEs, stepsEn, stepsPt } from '../../../i18n/locales/steps';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });

const DICTS = { es: { ...es, ...stepsEs }, en: { ...en, ...stepsEn }, pt: { ...pt, ...stepsPt } } as Record<string, Record<string, string>>;

/**
 * How closely each method must agree with the matrix solve, relative to the
 * largest value compared in the same unit. The classical frame methods keep
 * members at their length, so they differ by the axial deformation the
 * matrix method includes. The one-degree-of-freedom response is checked
 * against the engine's step-by-step time integration, which carries its own
 * time-step error. The plastic methods compare with the step-by-step collapse,
 * whose hinge under a distributed load sits on one of 200 sections.
 * Everything else is exact up to round-off.
 */
const TOL: Record<string, number> = { crossNoSway: 0.02, crossSway: 0.02, slopeDeflection: 0.02, displacement: 0.02, sdof: 0.005, plasticKinematic: 1e-3, plasticStatic: 1e-3 };
/**
 * Second order compares with the engine's consistent matrix: φ against it cut in 8 (discretization
 * left), the chord matrix against it by design (no P-δ), rigid members against axial shortening.
 */
const SECOND_ORDER_TOL = (id: string, opts: Record<string, boolean>): number | undefined => {
  if (!id.startsWith('so-')) return undefined;
  if (opts.chord) return 0.25;
  return id.endsWith('-phi') || opts.axialRigid ? 0.01 : 1e-5;
};
const tolOf = (m: ExplainedMethod, opts: Record<string, boolean>) =>
  SECOND_ORDER_TOL(m.id, opts) ?? (Object.keys(opts).length ? 1e-5 : (TOL[m.id] ?? 1e-5));

interface Found { txts: Txt[]; tex: string[]; numbers: number[]; compare: CompareRow[] }

function collect(doc: StepDoc): Found {
  const f: Found = { txts: [doc.title], tex: [], numbers: [], compare: [] };
  if (doc.subtitle) f.txts.push(doc.subtitle);
  const cell = (c: Cell) => {
    if (typeof c === 'number') f.numbers.push(c);
    else if (isTxt(c)) f.txts.push(c);
    else if (typeof c === 'object' && c && 'tex' in c) f.tex.push(c.tex);
  };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      switch (b.kind) {
        case 'p': f.txts.push(b.text); break;
        case 'eq': f.tex.push(b.tex); if (b.note) f.txts.push(b.note); break;
        case 'calc': if (b.label) f.txts.push(b.label); f.tex.push(b.formula, b.result); if (b.subst) f.tex.push(b.subst); if (b.check) f.tex.push(b.check); break;
        case 'table': b.head.forEach(cell); b.rows.forEach((r) => r.forEach(cell)); if (b.caption) f.txts.push(b.caption); break;
        case 'matrix': f.tex.push(b.name); b.rows.forEach((r) => f.numbers.push(...r)); if (b.caption) f.txts.push(b.caption); break;
        case 'fig': if (b.caption) f.txts.push(b.caption); break;
        case 'note': f.txts.push(b.text); break;
        case 'sub': if (typeof b.title !== 'string') f.txts.push(b.title); walk(b.blocks); break;
        case 'compare': f.compare.push(...b.rows); b.rows.forEach((r) => { f.tex.push(r.label); f.numbers.push(r.method, r.matrix); }); if (b.caption) f.txts.push(b.caption); break;
      }
    }
  };
  walk(doc.intro);
  for (const s of doc.steps) { f.txts.push(s.title); walk(s.blocks); }
  return f;
}

/** Everything wrong with one document, as readable lines (empty when it is right). */
function problems(m: ExplainedMethod, doc: StepDoc, opts: Record<string, boolean>): string[] {
  const out: string[] = [];
  const f = collect(doc);
  if (doc.steps.length === 0) out.push('no steps');
  for (const t of f.txts) {
    for (const [lang, d] of Object.entries(DICTS)) {
      const raw = d[t.key];
      if (raw === undefined) { out.push(`missing ${lang} key ${t.key}`); continue; }
      for (const [, name] of raw.matchAll(/\{(\w+)\}/g)) {
        if (t.params?.[name] === undefined) out.push(`${lang} ${t.key}: parameter {${name}} not given`);
      }
    }
  }
  for (const tex of f.tex) {
    // As written, and as laid out for a narrow panel at every level of breaking.
    for (const t of new Set([tex, ...Array.from({ length: NARROW_LEVELS + 1 }, (_, k) => narrowTex(tex, k))])) {
      try { katex.renderToString(t, { throwOnError: true, displayMode: true }); } catch (e) { out.push(`bad TeX: ${String(e).slice(0, 80)} in ${t.slice(0, 80)}`); }
    }
  }
  for (const v of f.numbers) if (!Number.isFinite(v)) out.push(`non-finite number ${v}`);
  // The comparison: per unit, relative to the largest value in that unit, and
  // never on differences below 10⁻⁶ of the unit (round-off, or the nanometre
  // an axially rigid member still stretches).
  out.push(...compareProblems(f.compare, tolOf(m, opts)));
  return out;
}

function unitScales(rows: CompareRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.unit, Math.max(out.get(r.unit) ?? 0, Math.abs(r.matrix), Math.abs(r.method)));
  return out;
}

/**
 * Rows that disagree by more than `tol` of the largest value in their unit.
 * `floor` (per unit) is the difference below which a row is not looked at:
 * round-off by default, and for the rigid-member check what is left of the
 * axial deformation once the areas are 10⁵ times larger.
 */
function compareProblems(rows: CompareRow[], tol: number, floor?: Map<string, number>): string[] {
  const out: string[] = [];
  const byUnit = new Map<string, CompareRow[]>();
  for (const r of rows) (byUnit.get(r.unit) ?? byUnit.set(r.unit, []).get(r.unit)!).push(r);
  for (const [unit, list] of byUnit) {
    const scale = Math.max(...list.map((r) => Math.max(Math.abs(r.matrix), Math.abs(r.method))));
    for (const r of list) {
      const d = Math.abs(r.method - r.matrix);
      if (d < Math.max(1e-6, floor?.get(unit) ?? 0) || d <= tol * scale) continue;
      out.push(`compare ${r.label} [${unit}]: ${r.method} vs ${r.matrix} (${((100 * d) / scale).toFixed(3)} %)`);
    }
  }
  return out;
}

/** Whether `mine` misses `ref` by more than `tol`; any non-finite value counts as a miss. */
const differs = (mine: number, ref: number, tol: number) =>
  !(Number.isFinite(mine) && Number.isFinite(ref) && Number.isFinite(tol)) || Math.abs(mine - ref) > tol;

/** A linear-matrix λ₁ refused as unrepresented: its document says so, and the exact φ λ₁ lies below it. */
function unrepresentedProblems(input: SolverInput, method: 'string' | 'consistent', axialRigid: boolean, doc: StepDoc): string[] {
  const tag = `${axialRigid ? 'rigid ' : ''}${method} buckling refused as unrepresented`;
  if (!JSON.stringify(doc).includes('course.second-order.refuse.noModeRepresented')) return [`${tag}, but its document gave a mode`];
  const sys = buildSystem(input, { method, axialRigid }, false);
  const first = sys.ok ? firstOrderAxial(sys.sys) : null;
  if (!sys.ok || !first?.ok) return [`${tag}: its system could not be rebuilt`];
  const linear = linearBuckling(sys.sys, method, 1, first.N0)[0]?.lambda;
  const exact = teachingBuckling(input, { method: 'phi', axialRigid }, 1);
  if (!exact.ok || linear === undefined) return [`${tag}: no φ or linear λ₁ to compare`];
  return linear > exact.run.modes[0].lambda ? [] : [`${tag}: its λ₁ ${linear} is not above the exact ${exact.run.modes[0].lambda}`];
}

/**
 * The chord (P/L) answer checked against the engine's elastic solve with the same approximation:
 * P-Δ's final D must be what the engine gives under the loads plus −K_G(N)·D as nodal forces, N the
 * forces it was solved with; λ₁ must be the first root of (F⁻¹ + λK_G(N₀))·x = 0, F the engine's
 * flexibility on the free DOFs and N₀ the engine's first-order forces. Both to 1e-8 / 1e-6.
 */
function chordProblems(input: SolverInput, buckling: boolean, doc: StepDoc): string[] {
  if ([...input.supports.values()].some((s) => s.angle !== undefined && s.angle !== 0)) return [];
  const chordForces = (sysN: Map<number, number>, D: (node: number, k: number) => number, members: Array<{ id: number; i: number; j: number; c: number; s: number; L: number }>) => {
    const f = new Map<number, [number, number]>();
    const add = (node: number, fx: number, fz: number) => { const o = f.get(node) ?? [0, 0]; f.set(node, [o[0] + fx, o[1] + fz]); };
    for (const m of members) {
      const N = sysN.get(m.id) ?? 0;
      const nx = -m.s, nz = m.c;
      const delta = (D(m.j, 0) * nx + D(m.j, 1) * nz) - (D(m.i, 0) * nx + D(m.i, 1) * nz);
      const q = (N / m.L) * delta;
      add(m.i, q * nx, q * nz);
      add(m.j, -q * nx, -q * nz);
    }
    return [...f].map(([nodeId, [fx, fz]]) => ({ type: 'nodal', data: { nodeId, fx, fz, my: 0 } }) as SolverLoad);
  };
  if (!buckling) {
    const r = teachingPDelta(input, { method: 'string', axialRigid: false });
    const bad = runFailure('chord P-Δ', r);
    if (bad || !r.ok) return bad ? [bad] : [];
    const { sys, final, finalSolvedWith } = r.run;
    const Dof = (node: number, k: number) => final.D[sys.dof(node, k)];
    const eng = wasm.solve({ ...input, loads: [...input.loads, ...chordForces(finalSolvedWith, Dof, sys.members)] });
    const scale = Math.max(1e-12, ...final.D.map(Math.abs));
    const out: string[] = [];
    for (const d of eng.displacements) {
      const got = [d.ux, d.uz, d.ry], mine = [0, 1, 2].map((k) => Dof(d.nodeId, k));
      for (let k = 0; k < 3; k++) if (differs(mine[k], got[k], 1e-8 * scale)) out.push(`chord P-Δ node ${d.nodeId} dof ${k}: ${mine[k]} vs engine ${got[k]}`);
    }
    return out;
  }
  const b = teachingBuckling(input, { method: 'string', axialRigid: false }, 1);
  if (!b.ok && b.reason.key === 'course.second-order.refuse.noModeRepresented') return unrepresentedProblems(input, 'string', false, doc);
  if (!b.ok || !b.run.modes.length) return [`chord buckling gave no mode although its document built${b.ok ? '' : `: ${b.reason.key}`}`];
  const sys = b.run.sys;
  const free = sys.free;
  const where = new Map<number, [number, number]>();
  sys.pm.nodeOrder.forEach((node) => { for (let k = 0; k < 3; k++) where.set(sys.dof(node, k), [node, k]); });
  const lin = wasm.solve(input);
  const N0 = new Map(lin.elementForces.map((f) => [f.elementId, (f.nStart + f.nEnd) / 2]));
  const F = free.map(() => new Array(free.length).fill(0));
  free.forEach((dj, j) => {
    const [node, k] = where.get(dj)!;
    const res = wasm.solve({ ...input, loads: [{ type: 'nodal', data: { nodeId: node, fx: k === 0 ? 1 : 0, fz: k === 1 ? 1 : 0, my: k === 2 ? 1 : 0 } } as SolverLoad] });
    free.forEach((di, i) => { const [n2, k2] = where.get(di)!; const d = res.displacements.find((x) => x.nodeId === n2)!; F[i][j] = [d.ux, d.uz, d.ry][k2]; });
  });
  const K = free.map((_, j) => solveDense(F, free.map((__, i) => (i === j ? 1 : 0))));
  if (K.some((c) => !c)) return ['chord buckling: the engine flexibility is singular'];
  const Ks = free.map((_, i) => free.map((__, j) => (K[j]![i] + K[i]![j]) / 2));
  const idx = new Map(free.map((d, i) => [d, i]));
  const G = free.map(() => new Array(free.length).fill(0));
  for (const m of sys.members) {
    const q = (N0.get(m.id) ?? 0) / m.L;
    const n = [-m.s, m.c];
    const ends = [[m.i, 1], [m.j, -1]] as const;
    for (const [a, sa] of ends) for (const [bn, sb] of ends) for (let ka = 0; ka < 2; ka++) for (let kb = 0; kb < 2; kb++) {
      const ia = idx.get(sys.dof(a, ka)), ib = idx.get(sys.dof(bn, kb));
      if (ia === undefined || ib === undefined) continue;
      G[ia][ib] -= q * sa * sb * n[ka] * n[kb];
    }
  }
  const pairs = generalizedEigen(Ks, G);
  const mine = b.run.modes[0].lambda;
  if (!pairs || !pairs.length) return [`chord buckling: no independent root, the method gives ${mine}`];
  return differs(mine, pairs[0].lambda, 1e-6 * Math.abs(mine)) ? [`chord buckling λ₁ ${mine} vs independent ${pairs[0].lambda}`] : [];
}

/** A P-Δ run that every model of the sweep must finish: refused, broken down, unconverged or unstable is reported. */
function runFailure(label: string, r: ReturnType<typeof teachingPDelta>): string | null {
  if (!r.ok) return `${label} refused although its document built: ${r.reason.key}`;
  if (r.run.failed || !r.run.converged || !r.run.stable) return `${label} did not end converged and stable (failed ${r.run.failed}, converged ${r.run.converged}, stable ${r.run.stable})`;
  return null;
}

/** Pairs of cuts, finest first, for models too large for the finest. */
const CUTS = [[8, 16], [4, 8]] as const;

/** The nodal D of K(N)·D = F solved with the consistent matrix on `input` cut in n, every piece at its member's N. */
function cutSolve(input: SolverInput, n: number, N: Map<number, number>): ((node: number, k: number) => number) | null {
  const r = refineInput(input, n);
  const b = buildSystem(r.input, { method: 'consistent', axialRigid: false });
  if (!b.ok) return null;
  const pieceN = new Map([...r.input.elements.keys()].map((id) => [id, N.get(r.parent.get(id) ?? id) ?? 0]));
  const st = solveState(b.sys, pieceN, 'consistent');
  return st ? (node, k) => st.D[b.sys.dof(node, k)] : null;
}

/**
 * φ checked against the consistent matrix with the members cut in n and 2n (8 and 16 when the
 * model allows), at the same axial forces: the cut solution converges to the exact one φ gives,
 * so φ must lie within the change from n to 2n (plus 1e-9 of the largest value). P-Δ by the nodal D of the last solve, buckling by λ₁.
 */
function phiProblems(input: SolverInput, buckling: boolean): string[] {
  if (!buckling) {
    const r = teachingPDelta(input, { method: 'phi', axialRigid: false });
    const bad = runFailure('φ P-Δ', r);
    if (bad || !r.ok) return bad ? [bad] : [];
    const { sys, final, finalSolvedWith } = r.run;
    const pair = CUTS.map(([a, z]) => [cutSolve(input, a, finalSolvedWith), cutSolve(input, z, finalSolvedWith)] as const).find(([x, y]) => x && y);
    if (!pair) return ['φ P-Δ: the cut reference could not be solved at any pair of cuts'];
    const [c16, c32] = pair as [NonNullable<ReturnType<typeof cutSolve>>, NonNullable<ReturnType<typeof cutSolve>>];
    const nodes = [...input.nodes.keys()];
    const scale = Math.max(1e-12, ...final.D.map(Math.abs));
    let conv = 0;
    for (const node of nodes) for (let k = 0; k < 3; k++) conv = Math.max(conv, Math.abs(c16(node, k) - c32(node, k)));
    const out: string[] = [];
    for (const node of nodes) for (let k = 0; k < 3; k++) {
      const mine = final.D[sys.dof(node, k)], ref = c32(node, k);
      if (differs(mine, ref, conv + 1e-9 * scale)) out.push(`φ P-Δ node ${node} dof ${k}: ${mine} vs cut reference ${ref} (change between the cuts ${conv})`);
    }
    return out;
  }
  const b = teachingBuckling(input, { method: 'phi', axialRigid: false }, 1);
  if (!b.ok || !b.run.modes.length) return [`φ buckling gave no mode although its document built${b.ok ? '' : `: ${b.reason.key}`}`];
  const mine = b.run.modes[0].lambda;
  const cut = (n: number) => {
    const r = refineInput(input, n);
    const s = buildSystem(r.input, { method: 'consistent', axialRigid: false });
    if (!s.ok) return null;
    const N0 = new Map([...r.input.elements.keys()].map((id) => [id, b.run.N0.get(r.parent.get(id) ?? id) ?? 0]));
    return linearBuckling(s.sys, 'consistent', 1, N0)[0]?.lambda ?? null;
  };
  const pairL = CUTS.map(([a, z]) => [cut(a), cut(z)] as const).find(([x, y]) => x !== null && y !== null);
  if (!pairL) return ['φ buckling: the cut reference gave no mode at any pair of cuts'];
  const [l16, l32] = pairL as [number, number];
  return differs(mine, l32, Math.abs(l16 - l32) + 1e-9 * Math.abs(mine)) ? [`φ buckling λ₁ ${mine} vs cut reference ${l32} (change between the cuts ${Math.abs(l16 - l32)})`] : [];
}

/**
 * Rigid members checked against the same method with every area × 10⁵ at the same axial forces:
 * what is left is that axial deformation, 1e-5 of the answer, so 1e-4 of the largest value.
 */
function rigidProblems(input: SolverInput, method: GeomMethod, buckling: boolean, doc: StepDoc): string[] {
  const stiff = buildSystem(referenceInput(input, true), { method, axialRigid: false }, method === 'phi');
  if (!stiff.ok) return [`rigid ${method}: the stiff reference was refused: ${stiff.reason.key}`];
  if (!buckling) {
    const r = teachingPDelta(input, { method, axialRigid: true });
    const bad = runFailure(`rigid ${method} P-Δ`, r);
    if (bad || !r.ok) return bad ? [bad] : [];
    const st = solveState(stiff.sys, r.run.finalSolvedWith, method);
    if (!st) return [`rigid ${method} P-Δ: the stiff reference could not be solved`];
    const scale = Math.max(1e-12, ...r.run.final.D.map(Math.abs));
    const out: string[] = [];
    for (const node of input.nodes.keys()) for (let k = 0; k < 3; k++) {
      const mine = r.run.final.D[r.run.sys.dof(node, k)], ref = st.D[stiff.sys.dof(node, k)];
      if (differs(mine, ref, 1e-4 * scale)) out.push(`rigid ${method} P-Δ node ${node} dof ${k}: ${mine} vs stiff ${ref}`);
    }
    return out;
  }
  const b = teachingBuckling(input, { method, axialRigid: true }, 1);
  if (!b.ok && b.reason.key === 'course.second-order.refuse.noModeRepresented' && (method === 'string' || method === 'consistent')) return unrepresentedProblems(input, method, true, doc);
  if (!b.ok || !b.run.modes.length) return [`rigid ${method} buckling gave no mode although its document built${b.ok ? '' : `: ${b.reason.key}`}`];
  const mine = b.run.modes[0].lambda;
  const ref = method === 'phi'
    ? phiBuckling(stiff.sys, 1, b.run.N0, [mine * 1.0001])[0]?.lambda
    : linearBuckling(stiff.sys, method === 'string' ? 'string' : 'consistent', 1, b.run.N0)[0]?.lambda;
  if (ref === undefined) return [`rigid ${method} buckling: the stiff reference gave no mode`];
  return differs(mine, ref, 1e-4 * Math.abs(mine)) ? [`rigid ${method} buckling λ₁ ${mine} vs stiff ${ref}`] : [];
}

/** The classical frame methods keep members at their length: with axially rigid members they must match the matrix solve. */
const INEXTENSIBLE = new Set(['crossNoSway', 'crossSway', 'slopeDeflection', 'displacement']);

function rigidAxially(ctx: MethodContext): MethodContext {
  const input = { ...ctx.input, sections: new Map([...ctx.input.sections].map(([id, sec]) => [id, { ...sec, a: sec.a * 1e5 }])) };
  return { ...ctx, input, pm: planeModel(input), ref: solveReference(input) };
}

function context(opts: Record<string, boolean> = {}, selection = { members: [] as number[], nodes: [] as number[] }): MethodContext | null {
  const input = modelStore.buildSolverInput(false);
  if (!input || input.elements.size === 0) return null;
  return { input, pm: planeModel(input), ref: solveReference(input), selection, options: opts, model: modelStore.model };
}

/** Run every applicable method (and each switchable assumption both ways) on the model now loaded. */
function runAll(label: string, tally: Map<string, number>, failures: string[]): void {
  const base = context();
  if (!base) return;
  for (const m of allMethods()) {
    if (m.wizard || !m.build) continue;
    let ok;
    try { ok = m.applies(base); } catch (e) { failures.push(`${label} ${m.id}: applies threw ${String(e).slice(0, 120)}`); continue; }
    if (!ok.ok) {
      if (!DICTS.es[ok.reason.key]) failures.push(`${label} ${m.id}: refusal key ${ok.reason.key} missing`);
      continue;
    }
    const variants: Record<string, boolean>[] = [{}];
    for (const o of m.options ?? []) variants.push({ [o.id]: !o.default });
    for (const opts of variants) {
      const ctx = { ...base, options: opts };
      if (!m.applies(ctx).ok) continue;
      let doc: StepDoc;
      try { doc = m.build(ctx); } catch (e) { failures.push(`${label} ${m.id} ${JSON.stringify(opts)}: build threw ${String((e as Error)?.stack ?? e).slice(0, 300)}`); continue; }
      let found = problems(m, doc, opts);
      if (m.id.startsWith('so-')) {
        const buckles = m.id.startsWith('so-buckling');
        const method: GeomMethod = m.id.endsWith('-phi') ? 'phi' : opts.chord ? 'string' : 'consistent';
        if (opts.axialRigid) found.push(...rigidProblems(ctx.input, method, buckles, doc));
        else if (method === 'string') found.push(...chordProblems(ctx.input, buckles, doc));
        else if (method === 'phi') found.push(...phiProblems(ctx.input, buckles));
      }
      // A classical frame method that differs from the matrix solve must be
      // exact once members cannot change length: then the difference was axial
      // deformation and nothing else.
      // The same holds for a switched assumption (no axial term, members held
      // at their length): it changes the answer on purpose, by exactly the
      // axial deformation, so with rigid members the answer is exact again.
      const switched = Object.keys(opts).length > 0;
      if (found.length && !m.id.startsWith('so-') && (INEXTENSIBLE.has(m.id) || switched) && found.every((p) => p.startsWith('compare'))) {
        const rigid = rigidAxially(ctx);
        const floor = new Map([...unitScales(collect(doc).compare)].map(([u, v]) => [u, 1e-4 * v]));
        found = compareProblems(collect(m.build(rigid)).compare, 1e-4, floor).map((p) => `with rigid members: ${p}`);
      }
      for (const p of found) failures.push(`${label} ${m.id} ${JSON.stringify(opts)}: ${p}`);
      tally.set(m.id, (tally.get(m.id) ?? 0) + 1);
    }
  }
}

// ── Generated models ────────────────────────────────────────────────

/** A small seeded generator, so a failure names a reproducible case. */
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  return {
    next,
    int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)),
    pick: <T,>(xs: T[]): T => xs[Math.floor(next() * xs.length)],
    real: (a: number, b: number, step = 0.5) => a + step * Math.floor((next() * (b - a)) / step + 0.5),
  };
}

function member(a: number, b: number, r: ReturnType<typeof rng>, type: 'frame' | 'truss' = 'frame') {
  return r.next() < 0.3 ? modelStore.addElement(b, a, type) : modelStore.addElement(a, b, type);
}

function spanLoads(e: number, L: number, r: ReturnType<typeof rng>) {
  const kind = r.int(0, 5);
  const w = -r.real(5, 30, 5);
  if (kind === 0) modelStore.addDistributedLoad(e, w, w);
  else if (kind === 1) modelStore.addDistributedLoad(e, 0, w);
  else if (kind === 2) modelStore.addDistributedLoad(e, w / 2, w);
  else if (kind === 3) { const a = r.real(0.5, L / 2); modelStore.addDistributedLoad(e, w, w, undefined, undefined, undefined, a, Math.min(L - 0.5, a + r.real(1, L / 2))); }
  else if (kind === 4) modelStore.addPointLoadOnElement(e, r.real(0.5, L - 0.5), -r.real(10, 60, 5));
  else modelStore.addPointLoadOnElement(e, r.real(0.5, L - 0.5), 0, { my: r.pick([-1, 1]) * r.real(5, 40, 5) });
}

function continuousBeam(seed: number) {
  const r = rng(seed);
  modelStore.clear();
  const spans = r.int(1, 4);
  const xs = [0];
  const overL = r.next() < 0.3 ? r.real(1, 2.5) : 0;
  const overR = r.next() < 0.3 ? r.real(1, 2.5) : 0;
  if (overL) xs.push(overL);
  for (let k = 0; k < spans; k++) xs.push(xs[xs.length - 1] + r.real(3, 8));
  if (overR) xs.push(xs[xs.length - 1] + overR);
  const nodes = xs.map((x) => modelStore.addNode(x, 0));
  const els: Array<{ id: number; L: number }> = [];
  for (let k = 0; k + 1 < nodes.length; k++) els.push({ id: member(nodes[k], nodes[k + 1], r), L: xs[k + 1] - xs[k] });
  const first = overL ? 1 : 0, last = nodes.length - 1 - (overR ? 1 : 0);
  modelStore.addSupport(nodes[first], overL ? 'rollerX' : r.pick(['pinned', 'fixed']));
  for (let k = first + 1; k < last; k++) modelStore.addSupport(nodes[k], 'rollerX');
  modelStore.addSupport(nodes[last], overR ? 'pinned' : r.pick(['rollerX', 'fixed', 'rollerX']));
  // A pinned support somewhere holds it horizontally.
  if (!modelStore.supports || [...modelStore.supports.values()].every((s) => s.type === 'rollerX')) modelStore.addSupport(nodes[first], 'pinned');
  for (const e of els) if (r.next() < 0.8) spanLoads(e.id, e.L, r);
  if (overR && r.next() < 0.5) modelStore.addNodalLoad(nodes[nodes.length - 1], 0, -r.real(5, 20, 5), r.next() < 0.3 ? 10 : 0);
}

function frame(seed: number) {
  const r = rng(seed);
  modelStore.clear();
  const bays = r.int(1, 2), stories = r.int(1, 2);
  const ws = Array.from({ length: bays }, () => r.real(4, 7));
  const hs = Array.from({ length: stories }, () => r.real(3, 4.5));
  const grid: number[][] = [];
  for (let j = 0; j <= stories; j++) {
    grid.push([]);
    let x = 0;
    for (let i = 0; i <= bays; i++) { grid[j].push(modelStore.addNode(x, hs.slice(0, j).reduce((a, b) => a + b, 0))); if (i < bays) x += ws[i]; }
  }
  const beams: Array<{ id: number; L: number }> = [];
  for (let j = 1; j <= stories; j++) {
    for (let i = 0; i <= bays; i++) member(grid[j - 1][i], grid[j][i], r);
    for (let i = 0; i < bays; i++) beams.push({ id: member(grid[j][i], grid[j][i + 1], r), L: ws[i] });
  }
  for (let i = 0; i <= bays; i++) modelStore.addSupport(grid[0][i], r.pick(['fixed', 'fixed', 'pinned']));
  if (r.next() < 0.25) modelStore.addSupport(grid[stories][bays], 'rollerZ');
  for (const b of beams) if (r.next() < 0.85) spanLoads(b.id, b.L, r);
  if (r.next() < 0.7) modelStore.addNodalLoad(grid[r.int(1, stories)][0], r.real(5, 20, 5), 0, 0);
}

function truss(seed: number) {
  const r = rng(seed);
  modelStore.clear();
  const panels = r.int(2, 6), a = r.real(1.5, 3), h = r.real(1.5, 3);
  const style = r.pick(['pratt', 'warren']);
  const bottom = Array.from({ length: panels + 1 }, (_, i) => modelStore.addNode(i * a, 0));
  if (style === 'pratt') {
    const top = Array.from({ length: panels - 1 }, (_, i) => modelStore.addNode((i + 1) * a, h));
    for (let i = 0; i < panels; i++) member(bottom[i], bottom[i + 1], r, 'truss');
    for (let i = 0; i + 1 < top.length; i++) member(top[i], top[i + 1], r, 'truss');
    member(bottom[0], top[0], r, 'truss'); member(top[top.length - 1], bottom[panels], r, 'truss');
    for (let i = 0; i < top.length; i++) member(bottom[i + 1], top[i], r, 'truss');
    const mid = panels / 2;
    for (let i = 0; i + 1 < top.length; i++) {
      if (i + 1 < mid) member(top[i], bottom[i + 2], r, 'truss'); else member(bottom[i + 1], top[i + 1], r, 'truss');
    }
    for (const n of top) if (r.next() < 0.8) modelStore.addNodalLoad(n, 0, -r.real(10, 40, 5), 0);
  } else {
    const top = Array.from({ length: panels }, (_, i) => modelStore.addNode((i + 0.5) * a, h));
    for (let i = 0; i < panels; i++) member(bottom[i], bottom[i + 1], r, 'truss');
    for (let i = 0; i + 1 < top.length; i++) member(top[i], top[i + 1], r, 'truss');
    for (let i = 0; i < panels; i++) { member(bottom[i], top[i], r, 'truss'); member(top[i], bottom[i + 1], r, 'truss'); }
    for (const n of top) if (r.next() < 0.8) modelStore.addNodalLoad(n, r.next() < 0.2 ? 5 : 0, -r.real(10, 40, 5), 0);
  }
  modelStore.addSupport(bottom[0], 'pinned');
  modelStore.addSupport(bottom[panels], 'rollerX');
}

// ── The sweep ───────────────────────────────────────────────────────

describe('every explained method, everywhere it applies', () => {
  it('counts a non-finite answer, reference or tolerance as a miss', () => {
    expect(differs(1, 1, 0)).toBe(false);
    expect(differs(Number.NaN, 1, 1)).toBe(true);
    expect(differs(1, Number.NaN, 1)).toBe(true);
    expect(differs(1, 1, Number.NaN)).toBe(true);
    expect(differs(Infinity, Infinity, 1)).toBe(true);
  });

  it('on every 2D example', async () => {
    const tally = new Map<string, number>();
    const failures: string[] = [];
    for (const name of fixtureNames2D()) {
      if (INTENTIONALLY_UNSOLVABLE.has(name)) continue;
      modelStore.clear();
      await modelStore.loadExample(name);
      runAll(name, tally, failures);
    }
    expect(failures).toEqual([]);
    // Every method met at least one example it applies to.
    for (const m of allMethods()) if (!m.wizard) expect(tally.get(m.id) ?? 0, m.id).toBeGreaterThan(0);
  }, 300_000);

  const generated = new Map<string, number>();
  const families: Array<[string, number, number, (seed: number) => void]> = [
    ['continuous beams', 1, 120, continuousBeam], ['frames', 1, 40, frame], ['frames', 41, 80, frame], ['trusses', 1, 60, truss],
  ];
  for (const [family, first, last, build] of families) {
    it(`on generated ${family} ${first} to ${last}`, () => {
      const failures: string[] = [];
      for (let seed = first; seed <= last; seed++) { build(seed); runAll(`${family}#${seed}`, generated, failures); }
      expect(failures.slice(0, 40)).toEqual([]);
    }, 600_000);
  }

  it('each generated family exercised the methods meant for it many times', () => {
    for (const id of ['threeMoments', 'crossBeams', 'doubleIntegration', 'cuts', 'slopeDeflection', 'crossSway', 'compatibility', 'joints', 'sections', 'virtualWork', 'castigliano']) {
      expect(generated.get(id) ?? 0, id).toBeGreaterThan(10);
    }
  });
});
