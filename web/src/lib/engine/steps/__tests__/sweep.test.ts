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
 * matrix method includes; everything else is exact up to round-off.
 */
const TOL: Record<string, number> = { crossNoSway: 0.02, crossSway: 0.02, slopeDeflection: 0.02 };
const tolOf = (m: ExplainedMethod, opts: Record<string, boolean>) =>
  Object.keys(opts).length ? 1e-5 : (TOL[m.id] ?? 1e-5);

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

/** The classical frame methods keep members at their length: with axially rigid members they must match the matrix solve. */
const INEXTENSIBLE = new Set(['crossNoSway', 'crossSway', 'slopeDeflection']);

function rigidAxially(ctx: MethodContext): MethodContext {
  const input = { ...ctx.input, sections: new Map([...ctx.input.sections].map(([id, sec]) => [id, { ...sec, a: sec.a * 1e5 }])) };
  return { ...ctx, input, pm: planeModel(input), ref: solveReference(input) };
}

function context(opts: Record<string, boolean> = {}, selection = { members: [] as number[], nodes: [] as number[] }): MethodContext | null {
  const input = modelStore.buildSolverInput(false);
  if (!input || input.elements.size === 0) return null;
  return { input, pm: planeModel(input), ref: solveReference(input), selection, options: opts };
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
      let doc: StepDoc;
      try { doc = m.build(ctx); } catch (e) { failures.push(`${label} ${m.id} ${JSON.stringify(opts)}: build threw ${String((e as Error)?.stack ?? e).slice(0, 300)}`); continue; }
      let found = problems(m, doc, opts);
      // A classical frame method that differs from the matrix solve must be
      // exact once members cannot change length: then the difference was axial
      // deformation and nothing else.
      // The same holds for a switched assumption (no axial term, members held
      // at their length): it changes the answer on purpose, by exactly the
      // axial deformation, so with rigid members the answer is exact again.
      const switched = Object.keys(opts).length > 0;
      if (found.length && (INEXTENSIBLE.has(m.id) || switched) && found.every((p) => p.startsWith('compare'))) {
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

  it('on generated continuous beams, frames and trusses', () => {
    const tally = new Map<string, number>();
    const failures: string[] = [];
    for (let seed = 1; seed <= 120; seed++) { continuousBeam(seed); runAll(`beam#${seed}`, tally, failures); }
    for (let seed = 1; seed <= 80; seed++) { frame(seed); runAll(`frame#${seed}`, tally, failures); }
    for (let seed = 1; seed <= 60; seed++) { truss(seed); runAll(`truss#${seed}`, tally, failures); }
    expect(failures.slice(0, 40)).toEqual([]);
    // Each family exercised the methods meant for it many times.
    for (const id of ['threeMoments', 'crossBeams', 'doubleIntegration', 'cuts', 'slopeDeflection', 'crossSway', 'compatibility', 'joints', 'sections', 'virtualWork', 'castigliano']) {
      expect(tally.get(id) ?? 0, id).toBeGreaterThan(10);
    }
  }, 600_000);
});
