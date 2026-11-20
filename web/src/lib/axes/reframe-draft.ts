import { planeSigns, type AxesFrame, type AxisName, type Sign } from './frame';
import { parseDecimal } from '../utils/numeric-input';
import { quantityTransform, type QuantityKind } from './quantity-transform';

type N = number | null;
const names = ['X', 'Y', 'Z'] as const;

export function reframeDraft(from: AxesFrame, to: AxesFrame) {
  const intoModel = quantityTransform(from, 'toModel');
  const intoUser = quantityTransform(to);
  const component = (axis: AxisName, value: N, kind: QuantityKind = 'vector') => {
    const model = intoModel.component(names.indexOf(axis), 1, kind);
    const user = intoUser.component(model.index, model.value, kind);
    return { axis: user.name, sign: user.value as Sign, value: value === null ? null : user.value * value + 0 };
  };
  const fields = <K extends string>(draft: Record<K, N>, keys: readonly [K, K, K], kind: QuantityKind = 'vector'): Record<K, N> => {
    const out = { ...draft };
    keys.forEach((key, index) => {
      const moved = component(names[index]!, draft[key], kind);
      out[keys[names.indexOf(moved.axis)]!] = moved.value;
    });
    return out;
  };
  const range = (axis: AxisName, min: number, max: number) => {
    const moved = component(axis, 1);
    return { axis: moved.axis, min: moved.sign > 0 ? min : -max + 0, max: moved.sign > 0 ? max : -min + 0 };
  };
  const triple = (values: readonly [N, N, N], kind: QuantityKind = 'vector'): [N, N, N] => {
    const moved = fields({ x: values[0], y: values[1], z: values[2] }, ['x', 'y', 'z'], kind);
    return [moved.x, moved.y, moved.z];
  };
  const signedText = (value: string, sign: number): string => {
    const v = value.trim();
    return sign > 0 || v === '' || parseDecimal(v) === null ? value : v.startsWith('-') ? v.slice(1) : '-' + v.replace(/^\+/, '');
  };
  const planText = (values: readonly [string, string]): [string, string] => {
    const sign = (f: AxesFrame, k: number) => quantityTransform(f).component(k, 1, 'vector').value;
    return [signedText(values[0], sign(from, 0) * sign(to, 0)), signedText(values[1], sign(from, 1) * sign(to, 1))];
  };
  const planeVector = (values: readonly [number, number]): [number, number] => {
    const a = planeSigns(from), b = planeSigns(to);
    return [values[0] * a.sx * b.sx + 0, values[1] * a.sz * b.sz + 0];
  };
  const text = (values: readonly [string, string, string]): [string, string, string] => {
    const out: [string, string, string] = ['', '', ''];
    values.forEach((value, i) => {
      const moved = component(names[i]!, 1);
      out[names.indexOf(moved.axis)] = signedText(value, moved.sign);
    });
    return out;
  };
  const flags = <T>(values: readonly T[]): T[] => {
    const out = [...values];
    values.forEach((v, i) => { out[names.indexOf(component(names[i % 3]!, 1).axis) + (i >= 3 ? 3 : 0)] = v; });
    return out;
  };
  const plane = (value: string): 'XY' | 'XZ' | 'YZ' => [...value].map(a => component(a as AxisName, 1).axis).sort().join('') as 'XY' | 'XZ' | 'YZ';
  return { component, fields, range, triple, text, flags, plane, planText, planeVector };
}
