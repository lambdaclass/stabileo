import { expect, it } from 'vitest';
import * as engine from '../../../lib/engine/wasm-solver';
import { slab } from '../../examples/slab';
import { defaults, type Values, type View } from '../../examples/define';
import { modelSketch } from '../figures/model-sketch';

it('marks the largest deflection at the node that has it, on columns and on walls', () => {
  for (const extra of [{}, { supports: 1 }, { bays: 3, spacing: 9, thickness: 0.15 }] as Values[]) {
    const view = sketch(extra);
    const top = view.values.reduce((best, v, k) => (v > view.values[best] ? k : best), 0);
    expect(view.peak!.value).toBe(view.values[top]);
    expect(view.peak!.at).toEqual([view.xy[2 * top], view.xy[2 * top + 1]]);
    expect(view.peak!.at.every(Number.isFinite)).toBe(true);
  }
});

function sketch(extra: Values): View {
  const values = { ...defaults(slab.params), ...extra };
  const result = slab.analyses(slab.build(values), values, engine);
  if (result.status !== 'ok') throw new Error(result.code);
  const view = result.views.deflection;
  const original = structuredClone(view);
  const drawn = modelSketch(slab.id, 'deflection', view);
  expect(view).toEqual(original);
  expect(view).not.toHaveProperty('peak');
  return drawn;
}

const view: View = {
  xy: [0, 0, 1, 0, 1, 1, 0, 1], cells: [0, 1, 2, 3], cellSize: 4,
  values: [0, 2, 2, 0], perCell: false, range: { min: 0, max: 2 },
  field: 'deflection', unit: 'mm', geometryOnly: false, bounds: [0, 0, 1, 1],
};

it('decorates the first maximum without mutating the analysis view', () => {
  const source = structuredClone(view);
  Object.freeze(source);
  const drawn = modelSketch(slab.id, 'deflection', source);
  expect(drawn.peak).toEqual({ value: 2, at: [1, 0] });
  const { peak, ...rest } = drawn;
  expect(peak).toBeDefined();
  expect(rest).toEqual(source);
  expect(source).not.toHaveProperty('peak');
});

it('keeps other model views and empty slab views unchanged', () => {
  expect(modelSketch('beam-and-frame', 'deflection', view)).toBe(view);
  expect(modelSketch(slab.id, 'moment', view)).toBe(view);
  const empty = { ...view, values: [] };
  expect(modelSketch(slab.id, 'deflection', empty)).toBe(empty);
});

it('marks a zero field at its first node', () => {
  expect(modelSketch(slab.id, 'deflection', { ...view, values: [0, 0, 0, 0] }).peak)
    .toEqual({ value: 0, at: [0, 0] });
});
