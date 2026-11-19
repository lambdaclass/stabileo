import { tp } from '../../lib/i18n';
import type { Expr, ExerciseParams, ParamRange, ParametricModelSpec, SupportChoice } from './exercise-params';
import type { ModelSpec } from './exercise-spec';

export type ParamTarget =
  | { kind: 'segX' | 'segY'; index: number }
  | { kind: 'fx' | 'fy' | 'mz'; index: number }
  | { kind: 'q'; index: number };

export interface ParamBinding {
  name: string;
  target: ParamTarget;
  range: ParamRange;
}

export interface AuthoredParams {
  model: ModelSpec;
  bindings: ParamBinding[];
  supportChoices: SupportChoice[];
}

const EPS = 1e-6;

export function stations(values: number[]): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (!out.length || v - out[out.length - 1]! > EPS) out.push(v);
  }
  return out;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const sameTarget = (a: ParamTarget, b: ParamTarget) => a.kind === b.kind && a.index === b.index;

export function paramTargets(model: ModelSpec): Array<{ target: ParamTarget; label: string; value: number }> {
  const out: Array<{ target: ParamTarget; label: string; value: number }> = [];
  const xs = stations(model.nodes.map(([x]) => x));
  for (let i = 0; i + 1 < xs.length; i++) {
    out.push({ target: { kind: 'segX', index: i }, label: tp('edu.params.segX', { a: round6(xs[i]!), b: round6(xs[i + 1]!) }), value: round6(xs[i + 1]! - xs[i]!) });
  }
  const ys = stations(model.nodes.map(([, y]) => y));
  for (let i = 0; i + 1 < ys.length; i++) {
    out.push({ target: { kind: 'segY', index: i }, label: tp('edu.params.segY', { a: round6(ys[i]!), b: round6(ys[i + 1]!) }), value: round6(ys[i + 1]! - ys[i]!) });
  }
  (model.nodalLoads ?? []).forEach((l, i) => {
    const n = l.node + 1;
    if (l.fx) out.push({ target: { kind: 'fx', index: i }, label: tp('edu.params.kindFx', { n }), value: Math.abs(l.fx) });
    if (l.fy) out.push({ target: { kind: 'fy', index: i }, label: tp('edu.params.kindFy', { n }), value: Math.abs(l.fy) });
    if (l.mz) out.push({ target: { kind: 'mz', index: i }, label: tp('edu.params.kindMz', { n }), value: Math.abs(l.mz) });
  });
  (model.distributedLoads ?? []).forEach((l, i) => {
    const mag = Math.max(Math.abs(l.qI), Math.abs(l.qJ ?? l.qI));
    if (mag > 0) out.push({ target: { kind: 'q', index: i }, label: tp('edu.params.kindQ', { n: l.element + 1 }), value: mag });
  });
  return out;
}

const BASE_NAME: Record<ParamTarget['kind'], string> = { segX: 'L', segY: 'h', fx: 'H', fy: 'P', mz: 'M', q: 'q' };
const UNIT: Record<ParamTarget['kind'], string> = { segX: 'm', segY: 'm', fx: 'kN', fy: 'kN', mz: 'kN·m', q: 'kN/m' };

function roundTo(v: number, step: number) {
  return Number((Math.round(v / step) * step).toFixed(6));
}

export function suggestRange(kind: ParamTarget['kind'], value: number): ParamRange {
  const length = kind === 'segX' || kind === 'segY';
  const step = length ? 0.5 : value >= 10 ? 5 : value >= 2 ? 1 : 0.5;
  const min = Math.min(Math.max(step, roundTo(value * 0.5, step)), roundTo(value, step) || step);
  const max = Math.max(roundTo(value * 1.5, step), min + step);
  return { min, max, step, unit: UNIT[kind] };
}

export function suggestBinding(model: ModelSpec, target: ParamTarget, taken: Iterable<string>): ParamBinding {
  const used = new Set(taken);
  const base = BASE_NAME[target.kind];
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}${i}`;
  const value = paramTargets(model).find((p) => sameTarget(p.target, target))?.value ?? 1;
  return { name, target, range: { ...suggestRange(target.kind, value), label: name } };
}

function sum(constant: number, names: string[]): Expr {
  const c = round6(constant);
  if (!names.length) return c;
  const joined = names.join(' + ');
  return c === 0 ? joined : `${c} + ${joined}`;
}

function scaled(value: number, magnitude: number, name: string): Expr {
  const f = round6(value / magnitude);
  if (f === 1) return name;
  if (f === -1) return `-${name}`;
  return `${f} * ${name}`;
}

function coordinates(values: number[], bindings: ParamBinding[], kind: 'segX' | 'segY'): Expr[] {
  const st = stations(values);
  const named = new Map(bindings.filter((b) => b.target.kind === kind).map((b) => [b.target.index, b.name]));
  if (!named.size) return values;
  return values.map((v) => {
    const j = st.findIndex((s) => Math.abs(s - v) <= EPS);
    let constant = st[0]!;
    const names: string[] = [];
    for (let i = 0; i < j; i++) {
      const n = named.get(i);
      if (n) names.push(n); else constant += st[i + 1]! - st[i]!;
    }
    return sum(constant, names);
  });
}

/** Lengths are spans between the drawn stations, so moving one support keeps every overhang and every other span as drawn. */
export function parametrize(a: AuthoredParams): { model: ParametricModelSpec; params?: ExerciseParams } {
  const choices = a.supportChoices.filter((c) => c.types.length > 1);
  if (!a.bindings.length && !choices.length) return { model: a.model };
  const bind = (kind: ParamTarget['kind'], index: number) => a.bindings.find((b) => b.target.kind === kind && b.target.index === index)?.name;
  const xs = coordinates(a.model.nodes.map(([x]) => x), a.bindings, 'segX');
  const ys = coordinates(a.model.nodes.map(([, y]) => y), a.bindings, 'segY');
  const model: ParametricModelSpec = { ...a.model, nodes: a.model.nodes.map((_, i) => [xs[i]!, ys[i]!]) };
  if (a.model.nodalLoads) {
    model.nodalLoads = a.model.nodalLoads.map((l, i) => {
      const out: NonNullable<ParametricModelSpec['nodalLoads']>[number] = { node: l.node };
      for (const k of ['fx', 'fy', 'mz'] as const) {
        const v = l[k];
        if (v === undefined) continue;
        const name = bind(k, i);
        out[k] = name && v ? scaled(v, Math.abs(v), name) : v;
      }
      return out;
    });
  }
  if (a.model.distributedLoads) {
    model.distributedLoads = a.model.distributedLoads.map((l, i) => {
      const name = bind('q', i);
      const qJ = l.qJ ?? l.qI;
      const mag = Math.max(Math.abs(l.qI), Math.abs(qJ));
      if (!name || mag === 0) return { ...l };
      return { element: l.element, qI: scaled(l.qI, mag, name), qJ: scaled(qJ, mag, name) };
    });
  }
  const values: Record<string, ParamRange> = {};
  for (const b of a.bindings) values[b.name] = { ...b.range };
  return { model, params: { values, ...(choices.length ? { supportChoices: choices.map((c) => ({ support: c.support, types: [...c.types] })) } : {}) } };
}
