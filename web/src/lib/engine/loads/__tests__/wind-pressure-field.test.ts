import { expect, it } from 'vitest';
import { integrateWindPressure, windHeightField } from '../wind-pressure-field';
import { columns, mesh, remeshWind, variants } from './wind-integration-fixture';

it('the shared pressure primitive conserves signed force and first moment at both sides of every zone', () => {
  for (const epsilon of [-1e-7, 0, 1e-7]) {
    const boundary = 3 + epsilon;
    const parts = integrateWindPressure(10, [-1, boundary, boundary, 11], x => x < boundary ? -2 : 4);
    expect(parts.reduce((s, p) => s + p.force, 0)).toBeCloseTo(-2 * boundary + 4 * (10 - boundary), 10);
    expect(parts.reduce((s, p) => s + p.first, 0)).toBeCloseTo(-(boundary ** 2) + 2 * (100 - boundary ** 2), 10);
    for (const p of parts) {
      const length = p.b - p.a;
      expect((p.q + p.qJ) / 2 * length).toBeCloseTo(p.force, 10);
      expect(length * (p.q * (2 * p.a + p.b) + p.qJ * (p.a + 2 * p.b)) / 6).toBeCloseTo(p.first, 10);
    }
  }
});
it('a linear pressure is preserved exactly, including a zero crossing', () => {
  const [p] = integrateWindPressure(6, [], x => 2 * x - 4);
  expect(p!.q).toBeCloseTo(-4, 10); expect(p!.qJ).toBeCloseTo(8, 10);
  expect(p!.force).toBeCloseTo(12, 10); expect(p!.first).toBeCloseTo(72, 10);
});
it('invalid fields and missing height carriers refuse rather than emit non-finite or empty loads', () => {
  for (const n of [0, -1, NaN, Infinity]) expect(() => integrateWindPressure(n, [], () => 1)).toThrow(/invalidCarrier/);
  for (const n of [NaN, Infinity]) expect(() => integrateWindPressure(1, [], () => n)).toThrow(/nonFinite/);
  expect(() => windHeightField({ model: mesh([]), axis: 'x', from: 0, to: 6, pressure: () => 1 })).toThrow(/noHeightCarriers/);
});
for (const width of [0.05 - 1e-7, 0.05, 0.05 + 1e-7]) {
  it(`height carriers require a declared width on the stick side of the limit ${width}`, () => {
    const input = { model: columns([0, 6], width), axis: 'x' as const, from: 0, to: 6, pressure: () => 1 };
    if (width <= 0.05) expect(() => windHeightField(input)).toThrow(/missingWidth/);
    else expect([...windHeightField(input).loads.values(), ...windHeightField(input).baseLoads.values()].reduce((s, n) => s + n, 0)).toBeCloseTo(width * 6, 10);
    const field = windHeightField({ ...input, width: 2 });
    expect([...field.loads.values(), ...field.baseLoads.values()].reduce((s, n) => s + n, 0)).toBeCloseTo((width <= 0.05 ? 2 : width) * 6, 10);
  });
}
for (const variant of variants) it(`tapered physical width and varying pressure retain force and centroid ${variant}`, () => {
  const original = columns([0, 6]);
  for (const n of original.nodes.values()) if (n.z === 6) n.y = 1 + n.y * 2 / 3;
  const m = remeshWind(original, variant), axis = variant === 'rotate' ? 'y' : 'x';
  const f = windHeightField({ model: m.model, axis, from: 0, to: 6, pressure: z => 1 + z / 6, boundaries: [3] });
  let force = 0, first = 0;
  for (const [id, value] of [...f.loads, ...f.baseLoads]) { force += value; first += value * m.model.nodes.get(id)!.z!; }
  expect(force).toBeCloseTo(44, 9); expect(first).toBeCloseTo(138, 9);
});

for (const offset of [0, 1]) for (const sign of [-1, 1]) it(`#2220 cubic Gauss alias retains all four moments offset=${offset} sign=${sign}`, () => {
  const parts = integrateWindPressure(1, [], s => sign * (offset + s ** 2 * (1.5 - s)));
  expect(parts.length).toBeGreaterThan(1);
  for (const p of parts) { expect(sign * p.q).toBeGreaterThanOrEqual(0); expect(sign * p.qJ).toBeGreaterThanOrEqual(0); }
  for (const power of [0, 1, 2, 3]) {
    const actual = parts.reduce((sum, p) => {
      const slope = (p.qJ - p.q) / (p.b - p.a), intercept = p.q - slope * p.a;
      return sum + intercept * (p.b ** (power + 1) - p.a ** (power + 1)) / (power + 1) + slope * (p.b ** (power + 2) - p.a ** (power + 2)) / (power + 2);
    }, 0);
    expect(actual).toBeCloseTo(sign * (offset / (power + 1) + 1.5 / (power + 3) - 1 / (power + 4)), 10);
  }
});

for (const offset of [-1e-7, 0, 1e-7]) it(`#2220 quadratic pressure keeps its physical sign at zero offset=${offset}`, () => {
  const parts = integrateWindPressure(1, [], s => s ** 2 + offset);
  for (const p of parts) if (p.a ** 2 + offset >= 0) { expect(p.q).toBeGreaterThanOrEqual(0); expect(p.qJ).toBeGreaterThanOrEqual(0); }
  expect(parts.reduce((sum, p) => sum + p.force, 0)).toBeCloseTo(1 / 3 + offset, 10);
});
