import { type AxesFrame, type AxisName, type Sign } from './frame';
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
  return { component, fields, range };
}
