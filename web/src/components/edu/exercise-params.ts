import type { SupportType } from '../../lib/store/ui.svelte';
import type { ModelSpec } from './exercise-spec';

/** FNV-1a: a teacher rebuilding a student's variant later depends on it never changing. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface ParamRange {
  min: number;
  max: number;
  step: number;
    label?: string;
  unit?: string;
}

export interface SupportChoice {
    support: number;
  types: SupportType[];
}

export interface ExerciseParams {
  values: Record<string, ParamRange>;
  supportChoices?: SupportChoice[];
}

export interface Variant {
  values: Record<string, number>;
  supports: Record<number, SupportType>;
}

export function rangeValues(r: ParamRange): number[] {
  if (!(r.step > 0) || !(r.max >= r.min) || !Number.isFinite(r.min) || !Number.isFinite(r.max)) return [];
  const n = Math.floor((r.max - r.min) / r.step + 1e-9);
  if (n > 10_000) return [];
  const decimals = Math.min(10, (String(r.step).split('.')[1] ?? '').length);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Number((r.min + i * r.step).toFixed(decimals)));
  return out;
}

export function defaultVariant(p: ExerciseParams): Variant {
  const values: Record<string, number> = {};
  for (const [k, r] of Object.entries(p.values)) {
    const vs = rangeValues(r);
    values[k] = vs.length ? vs[Math.floor((vs.length - 1) / 2)]! : r.min;
  }
  const supports: Record<number, SupportType> = {};
  for (const c of p.supportChoices ?? []) if (c.types.length) supports[c.support] = c.types[0]!;
  return { values, supports };
}

/** Draws in parameter-name order, so reordering the authored object does not change any student's variant. */
export function drawVariant(p: ExerciseParams, seed: number): Variant {
  const next = rng(seed);
  const values: Record<string, number> = {};
  for (const k of Object.keys(p.values).sort()) {
    const vs = rangeValues(p.values[k]!);
    values[k] = vs.length ? vs[Math.floor(next() * vs.length)]! : p.values[k]!.min;
  }
  const supports: Record<number, SupportType> = {};
  for (const c of [...(p.supportChoices ?? [])].sort((a, b) => a.support - b.support)) {
    if (c.types.length) supports[c.support] = c.types[Math.floor(next() * c.types.length)]!;
  }
  return { values, supports };
}
export type Expr = number | string;

export class ExprError extends Error {}

/** Exercises arrive from links and files: this grammar (numbers, parameters, + - * /, parentheses) is the only evaluator; never `eval`. */
export function evalExpr(e: Expr, values: Record<string, number>): number {
  if (typeof e === 'number') return e;
  const src = e;
  let i = 0;
  const ws = () => { while (i < src.length && src[i] === ' ') i++; };
  const fail = (what: string): never => { throw new ExprError(`${what} at ${i} in "${src}"`); };

  function unary(): number {
    ws();
    const c = src[i];
    if (c === '-') { i++; return -unary(); }
    if (c === '+') { i++; return unary(); }
    if (c === '(') {
      i++;
      const v = expr();
      ws();
      if (src[i] !== ')') fail('missing )');
      i++;
      return v;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) { i += num[0].length; return Number(num[0]); }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (name) {
      i += name[0].length;
      if (!(name[0] in values)) fail(`unknown parameter ${name[0]}`);
      return values[name[0]]!;
    }
    return fail('unexpected input');
  }
  function term(): number {
    let v = unary();
    for (;;) {
      ws();
      const c = src[i];
      if (c === '*') { i++; v *= unary(); } else if (c === '/') { i++; v /= unary(); } else return v;
    }
  }
  function expr(): number {
    let v = term();
    for (;;) {
      ws();
      const c = src[i];
      if (c === '+') { i++; v += term(); } else if (c === '-') { i++; v -= term(); } else return v;
    }
  }
  if (src.length > 200) fail('expression too long');
  const v = expr();
  ws();
  if (i !== src.length) fail('trailing input');
  if (!Number.isFinite(v)) fail('not a finite number');
  return v;
}

export function exprNames(e: Expr): string[] {
  if (typeof e === 'number') return [];
  return [...new Set(e.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])].filter((n) => !/^e\d/i.test(n));
}
export interface ParametricModelSpec {
  nodes: Array<[Expr, Expr]>;
  elements: Array<[number, number]>;
  supports: Array<{ node: number; type: SupportType }>;
  profile?: string;
  fy?: number;
  nodalLoads?: Array<{ node: number; fx?: Expr; fy?: Expr; mz?: Expr }>;
  distributedLoads?: Array<{ element: number; qI: Expr; qJ?: Expr }>;
}

export function resolveModel(model: ParametricModelSpec, v: Variant): ModelSpec {
  const ev = (e: Expr | undefined) => (e === undefined ? undefined : evalExpr(e, v.values));
  const out: ModelSpec = {
    nodes: model.nodes.map(([x, y]) => [evalExpr(x, v.values), evalExpr(y, v.values)]),
    elements: model.elements.map(([a, b]) => [a, b]),
    supports: model.supports.map((s, i) => ({ node: s.node, type: v.supports[i] ?? s.type })),
  };
  if (model.profile !== undefined) out.profile = model.profile;
  if (model.fy !== undefined) out.fy = model.fy;
  if (model.nodalLoads) {
    out.nodalLoads = model.nodalLoads.map((l) => {
      const r: { node: number; fx?: number; fy?: number; mz?: number } = { node: l.node };
      const fx = ev(l.fx), fy = ev(l.fy), mz = ev(l.mz);
      if (fx !== undefined) r.fx = fx;
      if (fy !== undefined) r.fy = fy;
      if (mz !== undefined) r.mz = mz;
      return r;
    });
  }
  if (model.distributedLoads) {
    out.distributedLoads = model.distributedLoads.map((l) => {
      const r: { element: number; qI: number; qJ?: number } = { element: l.element, qI: evalExpr(l.qI, v.values) };
      const qJ = ev(l.qJ);
      if (qJ !== undefined) r.qJ = qJ;
      return r;
    });
  }
  return out;
}

export function modelExprs(model: ParametricModelSpec): Array<{ where: string; expr: Expr }> {
  const out: Array<{ where: string; expr: Expr }> = [];
  model.nodes.forEach(([x, y], i) => { out.push({ where: `nodes[${i}].x`, expr: x }, { where: `nodes[${i}].y`, expr: y }); });
  model.nodalLoads?.forEach((l, i) => {
    for (const k of ['fx', 'fy', 'mz'] as const) if (l[k] !== undefined) out.push({ where: `nodalLoads[${i}].${k}`, expr: l[k]! });
  });
  model.distributedLoads?.forEach((l, i) => {
    out.push({ where: `distributedLoads[${i}].qI`, expr: l.qI });
    if (l.qJ !== undefined) out.push({ where: `distributedLoads[${i}].qJ`, expr: l.qJ });
  });
  return out;
}

export function lintParams(model: ParametricModelSpec, p: ExerciseParams): string[] {
  const problems: string[] = [];
  for (const [k, r] of Object.entries(p.values)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) problems.push(`parameter name "${k}" is not an identifier`);
    if (rangeValues(r).length === 0) problems.push(`parameter ${k} has no values (min ${r.min}, max ${r.max}, step ${r.step})`);
  }
  for (const { where, expr } of modelExprs(model)) {
    for (const n of exprNames(expr)) if (!(n in p.values)) problems.push(`${where} uses unknown parameter ${n}`);
    try { evalExpr(expr, defaultVariant(p).values); } catch (e) { problems.push(`${where}: ${(e as Error).message}`); }
  }
  for (const c of p.supportChoices ?? []) {
    if (!model.supports[c.support]) problems.push(`supportChoices names support ${c.support}, which does not exist`);
    if (c.types.length === 0) problems.push(`supportChoices for support ${c.support} offers no type`);
  }
  return problems;
}
