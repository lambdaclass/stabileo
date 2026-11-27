import { expect, it } from 'vitest';
import { integrateWindPressure, windHeightField } from '../wind-pressure-field';
import { defaultRegulations } from '../../../codes/roles';
import { levelsWithPlanArea, type PlanSink } from '../load-plan';
import { planWind } from '../load-plan-wind';
import { columns, mesh, remeshWind, variants, windProject } from './wind-integration-fixture';

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

it('a storey column under a CIRSOC 102 pressure takes a few loads that carry its four work moments', () => {
  // From 2,8 m to 5,6 m: Kz constant up to 5 m, a power of the height above.
  const z0 = 2.8, length = 2.8, knee = 5 - z0;
  const p = Object.assign((s: number) => 0.62 * (Math.max(5, z0 + s) / 365.76) ** (2 / 7), { curvatureBreaks: [knee] });
  const parts = integrateWindPressure(length, [knee], p);
  expect(parts.length).toBeLessThanOrEqual(4);
  for (const part of parts) expect(Math.min(part.q, part.qJ)).toBeGreaterThan(0);
  const exact = (k: number) => {
    const n = 200_000, h = length / n;
    let sum = 0;
    for (let i = 0; i <= n; i++) { const s = i * h; sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * s ** k * p(s); }
    return (sum * h) / 3;
  };
  for (const k of [0, 1, 2, 3]) {
    const actual = parts.reduce((sum, q) => {
      const slope = (q.qJ - q.q) / (q.b - q.a), intercept = q.q - slope * q.a;
      return sum + intercept * (q.b ** (k + 1) - q.a ** (k + 1)) / (k + 1) + slope * (q.b ** (k + 2) - q.a ** (k + 2)) / (k + 2);
    }, 0);
    expect(actual).toBeCloseTo(exact(k), 8);
  }
});

for (const curvature of [-1, 0, 1]) it(`#2529 member cuts retain the pressure integral for curvature ${curvature}`, () => {
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

for (const side of [-1, 1]) it(`#2529 whole-band pressure compression on side ${side} of the midpoint limit`, () => {
  const curvature = 0.002 * (1 + side * 1e-5);
  const pressure = Object.assign((s: number) => 1 + curvature * (s - 0.5) ** 2, { curvatureBreaks: [] });
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

it('#2529 a storey column emits the compact pressure bands as member loads', () => {
  const model = mesh([[[0, 0, 2.8], [0, 0, 5.6]]]);
  const field = windHeightField({
    model, axis: 'x', width: 1, from: 2.8, to: 5.6, boundaries: [5],
    pressure: Object.assign((z: number) => 0.62 * (Math.max(5, z) / 365.76) ** (2 / 7), { curvatureBreaks: [5] }),
  });
  expect(field.members).toHaveLength(3);
  expect(field.members.every(p => p.elementId === 1 && p.q > 0 && p.qJ > 0)).toBe(true);
});

function shearAtCut(parts: ReadonlyArray<{ a: number; b: number; q: number; qJ: number }>, cut: number) {
  return parts.reduce((sum, { a, b, q, qJ }) => {
    const span = Math.max(0, Math.min(cut, b) - a);
    return sum + span * (q + (qJ - q) * span / (2 * (b - a)));
  }, 0);
}

function pulsedPressure(reflected: boolean, amplitude = 1, curvature = 0.001) {
  const at = (s: number) => {
    const x = reflected ? 1 - s : s;
    const pulse = [1, -4, 6, -4, 1].reduce((sum, h, i) =>
      sum + h / 12 * Math.max(0, 1 - Math.abs(64 * x - (12 + 2 * i))), 0);
    return 1 + curvature * (x - 0.5) ** 2 + amplitude * pulse;
  };
  const curvatureBreaks = Array.from({ length: 11 }, (_, i) => reflected ? 1 - (11 + i) / 64 : (11 + i) / 64);
  return Object.assign(at, { curvatureBreaks });
}

for (const entry of ['integral', 'member'] as const) for (const reflected of [false, true]) {
  it(`#2529 cancelled pressure pulses retain their interior shear through ${entry}, reflected=${reflected}`, () => {
    const law = pulsedPressure(reflected);
    const pressure = (s: number) => law(s);
    const cut = reflected ? 1 - 17 / 64 : 17 / 64;
    const parts = entry === 'integral' ? integrateWindPressure(1, [], pressure) : windHeightField({
      model: mesh([[[0, 0, 0], [0, 0, 1]]]), axis: 'x', width: 1, from: 0, to: 1, pressure,
    }).members;
    const actual = shearAtCut(parts, cut);
    const background = cut + 0.001 * ((cut - 0.5) ** 3 + 0.5 ** 3) / 3;
    expect(actual).toBeCloseTo(background + (reflected ? -1 : 1) / 256, 10);
  });
}

for (const sign of [-1, 1]) it(`#2529 rejects the single out-of-limit midpoint face for cubic sign ${sign}`, () => {
  const pressure = Object.assign((s: number) => {
    const y = s - 0.5;
    return 1 + 0.0015 * y ** 2 + sign * 0.001 * y ** 3;
  }, { curvatureBreaks: [] });
  expect(integrateWindPressure(1, [], pressure).length).toBeGreaterThan(2);
});

it('#2529 an opaque smooth law falls back without a whole-half error bound', () => {
  const pressure = (s: number) => 1 + 0.001 * (s - 0.5) ** 2;
  expect(integrateWindPressure(1, [], pressure).length).toBeGreaterThan(2);
});

for (const reflected of [false, true]) for (const amplitude of [1 / 1024, 1 / 256]) {
  it(`#2529 bounds cut-force error over the half with known pulses, amplitude=${amplitude}, reflected=${reflected}`, () => {
    const parts = integrateWindPressure(1, [], pulsedPressure(reflected, amplitude));
    if (amplitude === 1 / 1024) expect(parts).toHaveLength(2);
    else expect(parts.length).toBeGreaterThan(2);
  });
}

it('#2529 the building planner compresses the code pressure for design and service wind', () => {
  const model = columns([0, 2.8, 5.6]);
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  planWind({
    model, regulations: defaultRegulations(), tributaryWidth: 1, dead: [], occupancyKey: 'vivienda',
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false,
    wind: { ...windProject, enabled: true, enclosure: 'enclosed', senses: ['+x'], directions: { x: true, y: false },
      caseSet: 'case1', service: { enabled: true, v50: 20, mri: 50 } },
  }, levels, sink);
  expect(sink.blockedKeys).toEqual([]);
  for (const nameKey of ['autoLoad.windCase1', 'autoLoad.windCaseWa']) {
    const caseIndex = sink.cases.findIndex(c => c.nameKey === nameKey);
    expect(caseIndex).toBeGreaterThanOrEqual(0);
    const column = sink.distributed.filter(p => p.elementId === 2 && p.caseIndex === caseIndex);
    expect(column).toHaveLength(3);
    expect(column[2]!.qXJ!).toBeGreaterThan(column[1]!.qX!);
  }
});

type PressureLaw = ((s: number) => number) & { curvatureBreaks: number[] };

function projectedParts(entry: 'integral' | 'member', law: PressureLaw) {
  if (entry === 'integral') return integrateWindPressure(1, [], law);
  const from = 2, to = from + 1;
  const pressure = Object.assign((z: number) => law(z - from), { curvatureBreaks: law.curvatureBreaks.map(s => from + s) });
  return windHeightField({ model: mesh([[[0, 0, from], [0, 0, to]]]), axis: 'x', width: 1, from, to, pressure }).members;
}

for (const entry of ['integral', 'member'] as const) for (const reflected of [false, true]) {
  it(`#2529 constant background retains hidden cut force through ${entry}, reflected=${reflected}`, () => {
    const parts = projectedParts(entry, pulsedPressure(reflected, 1, 0));
    const cut = reflected ? 1 - 17 / 64 : 17 / 64;
    const shear = shearAtCut(parts, cut);
    expect(shear).toBeCloseTo(cut + (reflected ? -1 : 1) / 256, 10);
  });

  it(`#2529 narrow bump contributes its work moments to the accepted pair through ${entry}, reflected=${reflected}`, () => {
    const center = reflected ? 0.75 : 0.25, radius = 0.001, height = 0.01, curvature = 0.0002;
    const pressure = Object.assign((s: number) => 1 + curvature * s ** 2 + height * Math.max(0, 1 - Math.abs(s - center) / radius),
      { curvatureBreaks: [center + radius, center, center - radius, center] });
    const parts = projectedParts(entry, pressure);
    const area = height * radius;
    const bumpMoments = [1, center, center ** 2 + radius ** 2 / 6, center ** 3 + center * radius ** 2 / 2];
    for (const [k, bump] of bumpMoments.entries()) {
      const actual = parts.reduce((sum, { a, b, q, qJ }) => {
        const slope = (qJ - q) / (b - a);
        return sum + (q - a * slope) * (b ** (k + 1) - a ** (k + 1)) / (k + 1)
          + slope * (b ** (k + 2) - a ** (k + 2)) / (k + 2);
      }, 0);
      expect(actual).toBeCloseTo(1 / (k + 1) + curvature / (k + 3) + area * bump, 12);
    }
    expect(parts).toHaveLength(2);
  });
}

for (const amplitude of [1 / 512, 1 / 256]) it(`#2529 constant background single-line cut budget at amplitude ${amplitude}`, () => {
  const parts = integrateWindPressure(1, [], pulsedPressure(false, amplitude, 0));
  if (amplitude === 1 / 512) expect(parts).toHaveLength(1);
  else expect(parts.length).toBeGreaterThan(1);
});

it('#2529 an affine pressure crossing zero stays exact with declared curvature breaks', () => {
  const law = Object.assign((s: number) => 1 - 2 * s, { curvatureBreaks: [0.5, 0, 1, -1, 2] });
  const parts = integrateWindPressure(1, [], law);
  expect(parts).toHaveLength(1);
  expect(parts[0]!.q).toBeCloseTo(1, 12);
  expect(parts[0]!.qJ).toBeCloseTo(-1, 12);
});

function emittedWork(parts: ReadonlyArray<{ a: number; b: number; q: number; qJ: number }>, k: number) {
  let moment = 0;
  for (const { a, b, q, qJ } of parts) {
    const samples = [0, 1, 2, 3, 4].map(i => ((1 - i / 4) * q + i / 4 * qJ) * (a + (b - a) * i / 4) ** k);
    moment += (b - a) / 90 * (7 * samples[0]! + 32 * samples[1]! + 12 * samples[2]! + 32 * samples[3]! + 7 * samples[4]!);
  }
  return moment;
}

for (const entry of ['integral', 'member'] as const) {
  it(`#2529 review: split the declared kink at one third through ${entry}`, () => {
    const corner = 1 / 3;
    const parts = projectedParts(entry, Object.assign((s: number) => Math.abs(s - corner), { curvatureBreaks: [corner] }));
    expect(parts).toHaveLength(2);
    expect(parts[0]!.b).toBeCloseTo(corner, 15);
    expect(shearAtCut(parts, corner)).toBeCloseTo(corner ** 2 / 2, 14);
    expect(shearAtCut(parts, 1)).toBeCloseTo((corner ** 2 + (1 - corner) ** 2) / 2, 14);
  });

  for (const zero of [0, 0.5]) for (const sign of [-1, 1]) it(`#2529 review: smooth pressure touching zero at ${zero} sign=${sign} through ${entry}`, () => {
    const parts = projectedParts(entry, Object.assign((s: number) => sign * (s - zero) ** 2, { curvatureBreaks: [] }));
    expect(parts.every(p => sign * p.q >= 0 && sign * p.qJ >= 0)).toBe(true);
    const primitive = (s: number) => (s - zero) ** 3 / 3;
    for (const a of [0, 0.5]) {
      for (let i = 1; i <= 32; i++) {
        const cut = a + i / 64;
        const error = sign * (shearAtCut(parts, cut) - shearAtCut(parts, a)) - (primitive(cut) - primitive(a));
        expect(Math.abs(error)).toBeLessThanOrEqual(1e-4 * (primitive(a + 0.5) - primitive(a)));
      }
    }
    for (const k of [0, 1, 2, 3]) {
      expect(emittedWork(parts, k)).toBeCloseTo(sign * (1 / (k + 3) - 2 * zero / (k + 2) + zero ** 2 / (k + 1)), 13);
    }
  });

  for (const curvature of [6e-13, 2.4e-12]) for (const sign of [-1, 1]) it(`#2529 review: clamped pair work at curvature ${curvature} sign=${sign} through ${entry}`, () => {
    const parts = projectedParts(entry, Object.assign((s: number) => sign * (s + Math.max(0, s - 0.5) + curvature * s ** 2), { curvatureBreaks: [0.5] }));
    for (const k of [0, 1, 2, 3]) {
      const ramp = (1 - 0.5 ** (k + 2)) / (k + 2) - 0.5 * (1 - 0.5 ** (k + 1)) / (k + 1);
      const exact = 1 / (k + 2) + ramp + curvature / (k + 3);
      expect(Math.abs(emittedWork(parts, k) - sign * exact)).toBeLessThanOrEqual(1e-14);
    }
    if (curvature === 6e-13) expect(parts).toHaveLength(2);
  });
}

for (const axis of ['x', 'y'] as const) for (const height of [0, 0.01]) it(`#2529 review: varying tributary width preserves pressure breaks on ${axis} height=${height}`, () => {
  const from = 2, center = 0.25, radius = 1 / 1024;
  const cross = (width: number, z: number) => axis === 'x' ? [0, width, z] : [width, 0, z];
  const model = mesh([[cross(0, from), cross(0, from + 1)], [cross(2, from + 1), cross(1, from)]]);
  const law = (z: number) => 1 + height * Math.max(0, 1 - Math.abs(z - from - center) / radius);
  const pressure = Object.assign(law, { curvatureBreaks: [from + center - radius, from + center, from + center + radius] });
  const field = windHeightField({ model, axis, from, to: from + 1, pressure });
  const area = height * radius;
  const exactForce = 1.5 + area * (1 + center);
  for (const id of [1, 2]) {
    const parts = field.members.filter(p => p.elementId === id);
    expect(emittedWork(parts, 0)).toBeCloseTo(exactForce / 2, 12);
    const couple = parts.map(p => {
      if (p.torque !== 'resolved') throw new Error('expected resolved carrier torque');
      return { ...p, q: axis === 'x' ? p.cx : p.cy, qJ: axis === 'x' ? p.cxJ : p.cyJ };
    });
    const sign = (axis === 'x' ? 1 : -1) * (id === 1 ? 1 : -1);
    expect(emittedWork(couple, 0)).toBeCloseTo(sign * (1 + area), 12);
  }
  const endForces = [...field.loads, ...field.baseLoads];
  const first = endForces.reduce((sum, [id, f]) => sum + (model.nodes.get(id)!.z! - from) * f, 0);
  expect(first).toBeCloseTo(1 / 2 + 1 / 3 + area * (center + center ** 2 + radius ** 2 / 6), 12);
});

for (const entry of ['integral', 'member'] as const) {
  for (const jump of [0.5, 3 / 8]) for (const rising of [true, false]) {
    it(`#2529 declared step at ${jump} rising=${rising} through ${entry}`, () => {
      const left = rising ? 1 : 2, right = rising ? 2 : 1;
      const law = Object.assign((s: number) => (rising ? s < jump : s <= jump) ? left : right, { curvatureBreaks: [jump] });
      const parts = projectedParts(entry, law);
      expect(parts).toHaveLength(2);
      expect(parts[0]!.b).toBe(jump);
      expect(parts[1]!.a).toBe(jump);
      for (const [i, p] of parts.entries()) {
        expect(p.q).toBeCloseTo(i === 0 ? left : right, 12);
        expect(p.qJ).toBeCloseTo(i === 0 ? left : right, 12);
      }
      for (const k of [0, 1, 2, 3]) {
        const exact = (right + (left - right) * jump ** (k + 1)) / (k + 1);
        expect(Math.abs(emittedWork(parts, k) - exact)).toBeLessThanOrEqual(1e-14);
      }
    });
  }

  for (const steps of [1, 2]) {
    it(`#2529 breaks separated by ${steps} representable steps through ${entry}`, () => {
      const jump = 0.5, spacing = entry === 'integral' ? Number.EPSILON / 2 : 2 * Number.EPSILON;
      const law = Object.assign(() => 1, { curvatureBreaks: [jump, jump + steps * spacing] });
      if (steps === 1) {
        expect(() => projectedParts(entry, law)).toThrow('wind.pressure.integrationUnresolved');
      } else {
        const parts = projectedParts(entry, law);
        expect(parts).toHaveLength(1);
        expect(emittedWork(parts, 0)).toBeCloseTo(1, 14);
      }
    });
  }

  for (const sign of [-1, 0, 1]) for (const a of [1 / 16, 7 / 8]) {
    it(`#2529 confined parabolic pulse at ${a} sign=${sign} through ${entry}`, () => {
      const width = 1 / 16, b = a + width, center = a + width / 2;
      const law = Object.assign((s: number) => s > a && s < b ? sign * (s - a) * (b - s) : 0, { curvatureBreaks: [a, b] });
      const parts = projectedParts(entry, law);
      const area = sign * width ** 3 / 6, variance = width ** 2 / 20;
      const moments = [1, center, center ** 2 + variance, center ** 3 + 3 * center * variance];
      for (const [k, moment] of moments.entries()) {
        expect(Math.abs(emittedWork(parts, k) - area * moment)).toBeLessThanOrEqual(1e-14);
      }
      expect(shearAtCut(parts, a)).toBe(0);
      expect(Math.abs(shearAtCut(parts, center) - area / 2)).toBeLessThanOrEqual(1e-4 * Math.abs(area));
      expect(shearAtCut(parts, b)).toBeCloseTo(area, 14);
      if (sign === 0) expect(parts).toHaveLength(1);
    });
  }
}
