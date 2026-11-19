import { globalAxes } from '../features';
import { makeFrame, type AxesChoice, type AxesFrame, type AxisName } from '../axes/frame';
import { quantityTransform } from '../axes/quantity-transform';
import { is3DWorkspace } from '../utils/workspace';
import { transformSnapshot } from '../model/code/frame';
import type { Tensor6 } from '../engine/shell-results';
import type { MassWeight } from '../engine/dynamics/mass-source';

type Obj = Record<string, any>;
type Triple = [number, number, number];

export function workbookFrame(axes: AxesChoice | null | undefined): AxesFrame | null {
  if (!globalAxes() || !axes) return null;
  const f = makeFrame(axes);
  return f.identity ? null : f;
}

const zero = (v: number[]): Triple => v.map((x) => x + 0) as Triple;
export const vecToUser = (f: AxesFrame, v: readonly number[]): Triple => zero(quantityTransform(f).triple({ kind: 'vector', values: [v[0]!, v[1]!, v[2]!] }));
export const rotToUser = (f: AxesFrame, v: readonly number[]): Triple => zero(quantityTransform(f).triple({ kind: 'pseudovector', values: [v[0]!, v[1]!, v[2]!] }));

export function flagsToUser<T>(f: AxesFrame, v: readonly [T, T, T]): [T, T, T] {
  return quantityTransform(f).permute(v);
}

export function tensorToUser(f: AxesFrame, t: Tensor6): Tensor6 {
  return quantityTransform(f).tensor(t);
}

export function boxToUser(f: AxesFrame, region: MassWeight['region']): MassWeight['region'] {
  return quantityTransform(f).box(region);
}

export function axisToUser(f: AxesFrame, axis: AxisName, factor: number): { direction: AxisName; factor: number } {
  const a = quantityTransform(f).component(['X', 'Y', 'Z'].indexOf(axis), factor, 'vector');
  return { direction: a.name, factor: a.value };
}

const entries = <T>(m: Map<number, T> | undefined): Array<[number, T]> => [...(m ?? new Map<number, T>())];

export function isPlaneWorkbook(model: { analysisMode?: string }): boolean {
  return model.analysisMode !== undefined && !is3DWorkspace(model.analysisMode);
}

export function modelToUser<M extends Obj>(m: M, f: AxesFrame): M {
  const snap = transformSnapshot({
    analysisMode: m.analysisMode ?? 'pro',
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
