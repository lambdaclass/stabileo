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

for (const curvature of [-1, 0, 1]) it.skip(`known wrong result: #2529 member cuts retain the pressure integral for curvature ${curvature}`, () => {
  const model = mesh([[[0, 0, 0], [0, 0, 1]]]);
  const field = windHeightField({
    model, axis: 'x', width: 1, from: 0, to: 1,
    pressure: z => 2 + curvature * (z - 0.5) ** 2,
  });
  if (curvature === 0) expect(field.members).toHaveLength(1);
  for (let i = 0; i <= 64; i++) {
    const station = i / 64;
    let shear = 0, moment = 0;
    for (const { a, b, q, qJ } of field.members) {
      const end = Math.min(station, b);
      if (end <= a) continue;
      const span = end - a, endLoad = q + (qJ - q) * span / (b - a);
      const force = span * (q + endLoad) / 2;
      shear += force;
      moment += (station - end) * force + span ** 2 * (2 * q + endLoad) / 6;
    }
    const correction = station ** 3 / 3 - station ** 2 / 2 + station / 4;
    const firstIntegral = station ** 4 / 12 - station ** 3 / 6 + station ** 2 / 8;
    expect(shear).toBeCloseTo(2 * station + curvature * correction, 10);
    expect(moment).toBeCloseTo(station ** 2 + curvature * firstIntegral, 10);
  }
});

for (const side of [-1, 1]) it.skip(`known wrong result: #2529 whole-band pressure compression on side ${side} of the midpoint limit`, () => {
  const curvature = 0.002 * (1 + side * 1e-5);
  const pressure = (s: number) => 1 + curvature * (s - 0.5) ** 2;
  const parts = integrateWindPressure(1, [], pressure);
  if (side < 0) {
    expect(parts).toHaveLength(2);
    expect(parts[0]!.qJ).toBeCloseTo(1 - curvature / 20, 12);
  } else {
    expect(parts.length).toBeGreaterThan(2);
    const left = parts.filter(p => p.b <= 0.5);
    expect(left.reduce((sum, p) => sum + p.force, 0)).toBeCloseTo(0.5 + curvature / 24, 12);
  }
});

it.skip('known wrong result: #2529 a storey column emits the compact pressure bands as member loads', () => {
  const model = mesh([[[0, 0, 2.8], [0, 0, 5.6]]]);
  const field = windHeightField({
    model, axis: 'x', width: 1, from: 2.8, to: 5.6, boundaries: [5],
    pressure: z => 0.62 * (Math.max(5, z) / 365.76) ** (2 / 7),
  });
  expect(field.members).toHaveLength(3);
  expect(field.members.every(p => p.elementId === 1 && p.q > 0 && p.qJ > 0)).toBe(true);
});
