import { AXIS_NAMES, planeSigns, toUser, toModel, pseudoToUser, pseudoToModel, type AxesFrame, type Vec3 } from './frame';

export type QuantityKind = 'vector' | 'pseudovector' | 'magnitude';
export type PlaneQuantity =
  | { kind: 'vector'; value: number; axis: 'x' | 'z' }
  | { kind: 'pseudovector'; value: number; axis: 'rot' }
  | { kind: 'magnitude'; value: number; axis: 'x' | 'z' | 'rot' };
export type TransformWay = 'toUser' | 'toModel';
export type SpringPair = readonly [displacement: number, force: number];
export type SpringCurves = Partial<Record<'x' | 'y' | 'z', readonly SpringPair[]>>;
export type Tensor = Record<'xx' | 'yy' | 'zz' | 'xy' | 'yz' | 'zx', number>;

type Triple<T> = readonly [T, T, T];

export function quantityTransform(frame: AxesFrame, way: TransformWay = 'toUser') {
  const slots = [0, 1, 2].map(source => {
    const target = way === 'toUser' ? frame.rows.findIndex(row => row[source] !== 0) : frame.rows[source]!.findIndex(x => x !== 0);
    const sign = way === 'toUser' ? frame.rows[target]![source]! : frame.rows[source]![target]!;
    return { source, target, sign, name: AXIS_NAMES[target]! };
  });
  const component = (source: number, value: number, kind: QuantityKind) => {
    const slot = slots[source]!;
    return { index: slot.target, name: slot.name, value: value * (kind === 'magnitude' ? 1 : slot.sign * (kind === 'pseudovector' ? frame.det : 1)) + 0 };
  };
  const permute = <T>(values: Triple<T>): [T, T, T] => {
    const out = [...values] as [T, T, T];
    for (const s of slots) out[s.target] = values[s.source]!;
    return out;
  };
  const triple = (quantity: { kind: QuantityKind; values: Vec3 }): [number, number, number] => {
    if (quantity.kind === 'magnitude') return permute(quantity.values);
    const transform = quantity.kind === 'pseudovector' ? way === 'toUser' ? pseudoToUser : pseudoToModel : way === 'toUser' ? toUser : toModel;
    return transform(frame, quantity.values);
  };
  const plane = (quantity: PlaneQuantity): number => {
    const p = planeSigns(frame);
    return quantity.value * (quantity.kind === 'magnitude' ? 1 : quantity.axis === 'x' ? p.sx : quantity.axis === 'z' ? p.sz : p.sr);
  };
  const springCurves = (curves: SpringCurves): SpringCurves => {
    const out: SpringCurves = {};
    for (const s of slots) {
      const pairs = curves['xyz'[s.source] as 'x' | 'y' | 'z'];
      if (pairs) out['xyz'[s.target] as 'x' | 'y' | 'z'] = pairs.map(([d, f]): SpringPair => [s.sign * d + 0, s.sign * f + 0]).sort((a, b) => a[0] - b[0]);
    }
    return out;
  };
  const tensor = (t: Tensor): Tensor => {
    const indices = { xx: [0, 0], yy: [1, 1], zz: [2, 2], xy: [0, 1], yz: [1, 2], zx: [2, 0] } as const;
    const out = {} as Tensor;
    for (const [key, [a, b]] of Object.entries(indices)) {
      const sa = slots[a]!, sb = slots[b]!;
      const target = (Object.keys(indices) as (keyof Tensor)[]).find(k => {
        const [i, j] = indices[k];
        return i === sa.target && j === sb.target || i === sb.target && j === sa.target;
      })!;
      out[target] = sa.sign * sb.sign * t[key as keyof Tensor] + 0;
    }
    return out;
  };
  const box = <T extends { kind: string; x?: [number, number]; y?: [number, number]; z?: [number, number] }>(region: T): T => {
    if (region.kind !== 'box') return region;
    const out: Record<string, unknown> = { kind: 'box' };
    for (const s of slots) {
      const range = region['xyz'[s.source] as 'x' | 'y' | 'z'];
      if (range) out['xyz'[s.target]!] = range.map(v => s.sign * v + 0).sort((a, b) => a - b);
    }
    return out as T;
  };
  return { triple, component, permute, plane, springCurves, tensor, box };
}
