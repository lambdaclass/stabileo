import type { SupportType } from '../../lib/store/ui.svelte';
import { isPlaneSupportType } from '../../lib/model/support-types';
import { t, tp } from '../../lib/i18n';
import type { ModelSpec } from './exercise-spec';

export * from './exercise-draw';
import { defaultVariant, rangeValues, type Variant, type ExerciseParams } from './exercise-draw';

export type Expr = number | string;

export class ExprError extends Error {}

/** Exercises arrive from links and files: this grammar (numbers, parameters, + - * /, parentheses) is the only evaluator; never `eval`. */
export function evalExpr(e: Expr, values: Record<string, number>): number {
  if (typeof e === 'number') return e;
  const src = e;
  let i = 0;
  const ws = () => { while (i < src.length && src[i] === ' ') i++; };
  const fail = (detail?: string): never => {
    const where = tp('edu.params.error.expr', { pos: i, expr: src });
    throw new ExprError(detail ? `${where} — ${detail}` : where);
  };

  function unary(): number {
    ws();
    const c = src[i];
    if (c === '-') { i++; return -unary(); }
    if (c === '+') { i++; return unary(); }
    if (c === '(') {
      i++;
      const v = expr();
      ws();
      if (src[i] !== ')') fail(')');
      i++;
      return v;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) { i += num[0].length; return Number(num[0]); }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (name) {
      i += name[0].length;
      if (!Object.hasOwn(values, name[0])) fail(tp('edu.params.error.unknown', { name: name[0] }));
      return values[name[0]]!;
    }
    return fail();
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
  if (src.length > 200) fail();
  const v = expr();
  ws();
  if (i !== src.length) fail();
  if (!Number.isFinite(v)) fail();
  return v;
}

export function exprNames(e: Expr): string[] {
  if (typeof e === 'number') return [];
  const withoutNumbers = e.replace(/(?<![A-Za-z0-9_.])(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/gi, ' ');
  return [...new Set(withoutNumbers.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])];
}
export interface ParametricModelSpec {
  nodes: Array<[Expr, Expr]>;
  elements: Array<[number, number]>;
  supports: Array<{ node: number; type: SupportType }>;
  profile?: string;
  fy?: number;
  nodalLoads?: Array<{ node: number; fx?: Expr; fy?: Expr; mz?: Expr }>;
  distributedLoads?: Array<{ element: number; qI: Expr; qJ?: Expr }>;
  hinges?: Array<{ element: number; end: 'start' | 'end' }>;
  truss?: number[];
}

export function resolveModel(model: ParametricModelSpec, v: Variant): ModelSpec {
  const ev = (e: Expr | undefined) => (e === undefined ? undefined : evalExpr(e, v.values));
  const out: ModelSpec = {
    nodes: model.nodes.map(([x, y]) => [evalExpr(x, v.values), evalExpr(y, v.values)]),
    elements: model.elements.map(([a, b]) => [a, b]),
    supports: model.supports.map((s, i) => ({ node: s.node, type: v.supports[i] ?? s.type })),
  };
  if (model.hinges) out.hinges = model.hinges.map((h) => ({ element: h.element, end: h.end }));
  if (model.truss) out.truss = [...model.truss];
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

export function supportCombos(p: ExerciseParams, limit = 256): Array<Record<number, SupportType>> {
  let out: Array<Record<number, SupportType>> = [{}];
  for (const c of p.supportChoices ?? []) {
    if (!c.types.length) continue;
    if (out.length * c.types.length > limit) throw new Error(tp('edu.params.supportLimit', { limit }));
    out = out.flatMap((combo) => c.types.map((type) => ({ ...combo, [c.support]: type })));
  }
  return out;
}

export function lintParams(model: ParametricModelSpec, p: ExerciseParams): string[] {
  const record = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!record(p) || !record(p.values) || Object.values(p.values).some(range => !record(range)) ||
      (p.supportChoices !== undefined && (!Array.isArray(p.supportChoices) ||
        p.supportChoices.some(c => !record(c) || !Number.isSafeInteger(c.support) ||
          !Array.isArray(c.types) || !c.types.every(isPlaneSupportType))))) return [t('edu.params.invalidVariant')];
  const problems: string[] = [];
  try { supportCombos(p); } catch (error) { problems.push((error as Error).message); }
  for (const [k, r] of Object.entries(p.values)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) problems.push(tp('edu.params.error.name', { name: k }));
    if (rangeValues(r).length === 0) problems.push(tp('edu.params.error.range', { name: k, ...r }));
  }
  for (const { where, expr } of modelExprs(model)) {
    const missing = exprNames(expr).filter(name => !Object.hasOwn(p.values, name));
    if (missing.length) {
      for (const name of missing) problems.push(`${where}: ${tp('edu.params.error.unknown', { name })}`);
      continue;
    }
    try { evalExpr(expr, defaultVariant(p).values); } catch (e) { problems.push(`${where}: ${(e as Error).message}`); }
  }
  for (const c of p.supportChoices ?? []) {
    if (!model.supports[c.support]) problems.push(tp('edu.params.error.missingSupport', { id: c.support }));
    if (c.types.length === 0) problems.push(tp('edu.params.error.emptySupport', { id: c.support }));
  }
  return problems;
}
