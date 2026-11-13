import { makeFrame, pseudoToUser, toUser, userAxisAlong, type AxesChoice, type AxesFrame, type AxisName } from '../axes/frame';
import { transformSnapshot } from '../model/code/frame';
import type { Tensor6 } from '../engine/shell-results';
import type { MassWeight } from '../engine/dynamics/mass-source';

type Obj = Record<string, any>;
type Triple = [number, number, number];

export function workbookFrame(axes: AxesChoice | null | undefined): AxesFrame | null {
  if (!axes) return null;
  const f = makeFrame(axes);
  return f.identity ? null : f;
}

const zero = (v: number[]): Triple => v.map((x) => x + 0) as Triple;
export const vecToUser = (f: AxesFrame, v: readonly number[]): Triple => zero(toUser(f, [v[0]!, v[1]!, v[2]!]));
export const rotToUser = (f: AxesFrame, v: readonly number[]): Triple => zero(pseudoToUser(f, [v[0]!, v[1]!, v[2]!]));

export function flagsToUser<T>(f: AxesFrame, v: readonly [T, T, T]): [T, T, T] {
  return f.rows.map((r) => v[r.findIndex((c) => c !== 0)]!) as [T, T, T];
}

const T6_INDEX: Record<keyof Tensor6, [number, number]> = { xx: [0, 0], yy: [1, 1], zz: [2, 2], xy: [0, 1], yz: [1, 2], zx: [2, 0] };

export function tensorToUser(f: AxesFrame, t: Tensor6): Tensor6 {
  const at = (a: number, b: number) => {
    const k = (Object.keys(T6_INDEX) as Array<keyof Tensor6>).find((key) => {
      const [i, j] = T6_INDEX[key];
      return (i === a && j === b) || (i === b && j === a);
    })!;
    return t[k];
  };
  const out = {} as Tensor6;
  for (const key of Object.keys(T6_INDEX) as Array<keyof Tensor6>) {
    const [i, j] = T6_INDEX[key];
    const mi = f.rows[i]!.findIndex((c) => c !== 0), mj = f.rows[j]!.findIndex((c) => c !== 0);
    out[key] = f.rows[i]![mi]! * f.rows[j]![mj]! * at(mi, mj) + 0;
  }
  return out;
}

export function boxToUser(f: AxesFrame, region: MassWeight['region']): MassWeight['region'] {
  if (region.kind !== 'box') return region;
  const keys = ['x', 'y', 'z'] as const;
  const out: { kind: 'box'; x?: [number, number]; y?: [number, number]; z?: [number, number] } = { kind: 'box' };
  f.rows.forEach((row, i) => {
    const m = row.findIndex((c) => c !== 0);
    const range = region[keys[m]!];
    if (!range) return;
    const a = row[m]! * range[0] + 0, b = row[m]! * range[1] + 0;
    out[keys[i]!] = a <= b ? [a, b] : [b, a];
  });
  return out;
}

export function axisToUser(f: AxesFrame, axis: AxisName, factor: number): { direction: AxisName; factor: number } {
  const a = userAxisAlong(f, ['X', 'Y', 'Z'].indexOf(axis));
  return { direction: a.name, factor: a.sign * factor + 0 };
}

const entries = <T>(m: Map<number, T> | undefined): Array<[number, T]> => [...(m ?? new Map<number, T>())];

export function modelToUser<M extends Obj>(m: M, f: AxesFrame): M {
  const snap = transformSnapshot({
    analysisMode: 'pro',
    nodes: entries(m.nodes), elements: entries(m.elements), supports: entries(m.supports),
    quads: entries(m.quads), plates: entries(m.plates), loads: m.loads ?? [], constraints: m.constraints ?? [],
  }, f.choice, 'toUser') as Obj;
  const map = (list: Array<[number, unknown]>) => new Map(list);
  return {
    ...m,
    nodes: map(snap.nodes), elements: map(snap.elements), supports: map(snap.supports),
    ...(m.quads ? { quads: map(snap.quads) } : {}), ...(m.plates ? { plates: map(snap.plates) } : {}),
    loads: snap.loads, ...(m.constraints ? { constraints: snap.constraints } : {}),
  };
}
