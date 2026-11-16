import { expect, it } from 'vitest';
import { roofCp, velocityPressure } from '../../../codes/cirsoc102/wind';
import { freeRoofCn } from '../../../codes/cirsoc102/other-structures';
import { windLoadCases, type WindAxis } from '../wind-cases';
import { otherStructureWind } from '../wind-other';
import { mesh, windProject, windAxis, remeshWind, variants, assertWindResultants, windResultants } from './wind-integration-fixture';

for (const variant of variants) for (const dir of ['+x', '-x', '+y', '-y'] as const) {
  it(`#2205 each flat roof carrier preserves force and both moments ${variant} ${dir}`, () => {
    const original = mesh([[[0, 0, 3], [10, 0, 3], [10, 6, 3], [0, 6, 3]]]);
    const { model, sources, back, direction } = remeshWind(original, variant);
    const d = direction(dir), x = d.endsWith('x');
    const axis: WindAxis = { ...windAxis, axis: x ? 'x' : 'y', along: dir.endsWith('x') ? 10 : 6, across: dir.endsWith('x') ? 6 : 10 };
    const c = windLoadCases({ model, axes: [axis], set: 'case1', directions: [d], tributaryWidth: 1, speed: 40 }).cases[0]!;
    for (const e of original.elements.values()) {
      const a = original.nodes.get(e.nodeI)!, b = original.nodes.get(e.nodeJ)!;
      const coord = (p: { x: number; y: number }) => dir.endsWith('x') ? p.x : p.y;
      const span = dir.endsWith('x') ? 10 : 6;
      const s0 = dir.startsWith('+') ? coord(a) : span - coord(a), s1 = dir.startsWith('+') ? coord(b) : span - coord(b);
      const cuts = [0, ...[3, 6].map(z => (z - s0) / (s1 - s0)).filter(t => t > 0 && t < 1), 1].sort((a, b) => a - b);
      const expected = [0, 0, 0, 0, 0, 0];
      for (let k = 1; k < cuts.length; k++) {
        const t = (cuts[k - 1]! + cuts[k]!) / 2, s = s0 + (s1 - s0) * t;
        const F = 0.85 * (s <= 3 ? 0.9 : s <= 6 ? 0.5 : 0.3) * Math.hypot(b.x - a.x, b.y - a.y) * (cuts[k]! - cuts[k - 1]!);
        expected[2]! += F; expected[3]! += F * (a.y + (b.y - a.y) * t); expected[4]! -= F * (a.x + (b.x - a.x) * t);
      }
      assertWindResultants(windResultants(model, c.distributed.filter(l => sources.get(l.elementId) === e.id), [], back), expected);
    }
  });
}
it('#2205 the two 12 m carriers retain the independent 45.9 kNm first moment', () => {
  const model = mesh([[[0, 0, 3], [12, 0, 3]], [[0, 6, 3], [12, 6, 3]]]);
  const c = windLoadCases({ model, axes: [{ ...windAxis, along: 12 }], set: 'case1', directions: ['+x'], tributaryWidth: 1, speed: 40 }).cases[0]!;
  const r = windResultants(model, c.distributed);
  expect(r[2]).toBeCloseTo(10.2, 10); expect(r[4]).toBeCloseTo(-45.9, 10);
});
for (const kind of ['monoslope', 'pitched', 'troughed'] as const) for (const blocked of [false, true]) for (const variant of variants) {
  it(`#2205 free roof zones preserve each carrier ${kind} ${blocked} ${variant}`, () => {
    const original = mesh([[[0, 0, 3], [10, 0, 3], [10, 6, 3], [0, 6, 3]]]);
    const generate = (v: typeof variants[number]) => {
      const m = remeshWind(original, v);
      const out = otherStructureWind({ model: m.model, structure: { kind: 'freeRoof', roof: kind, blocked, area: { x: 12, y: 20 } }, project: { ...windProject, basicSpeed: 1 }, directions: ['+x', '-x', '+y', '-y'].map(d => m.direction(d as '+x')), tributaryWidth: 1 });
      return { ...m, out };
    };
    const base = generate('base'), current = generate(variant);
    const [c0, c1, c2] = blocked ? [1.2, 0.9, 0.6] : [0.8, 0.6, 0.3];
    const q = velocityPressure(3, { ...windProject, basicSpeed: 1 }) / 1000 * 0.85;
    const force = q * (2 * (c0! * 3 + c1! * 3 + c2! * 4) + 6 * (c0! + c2!));
    const first = q * (2 * (c0! * 9 / 2 + c1! * 27 / 2 + c2! * 64 / 2) + 6 * c2! * 10);
    assertWindResultants(windResultants(current.model, current.out.cases[0]!.distributed.map(p => ({ ...p, q: p.qZ })), [], current.back), [0, 0, force, force * 3, -first, 0]);
    for (const k of current.out.cases.keys()) {
      for (const id of original.elements.keys()) {
        const lines = (m: typeof base, n: number) => m.out.cases[n]!.distributed.filter(d => m.sources.get(d.elementId) === id).map(d => ({ ...d, q: d.qZ }));
        assertWindResultants(windResultants(current.model, lines(current, k), [], current.back), windResultants(base.model, lines(base, k)));
      }
    }
  });
}

for (const shape of ['mono', 'gable', 'trough'] as const) for (const free of [false, true]) for (const variant of variants) {
  it(`#2205 sloped surface normals and zones survive mesh and plan transforms ${shape} ${free} ${variant}`, () => {
    const heights = shape === 'mono' ? [3, 4, 5] : shape === 'gable' ? [3, 4, 3] : [4, 3, 4];
    const original = mesh([[[0, 0, heights[0]!], [5, 0, heights[1]!], [10, 0, heights[2]!], [10, 6, heights[2]!], [5, 6, heights[1]!], [0, 6, heights[0]!]], [[5, 0, heights[1]!], [5, 6, heights[1]!]]]);
    const generate = (v: typeof variants[number]) => {
      const m = remeshWind(original, v);
      const directions = (['+x', '-x', '+y', '-y'] as const).map(m.direction);
      if (free) {
        const out = otherStructureWind({ model: m.model, structure: { kind: 'freeRoof', roof: shape === 'mono' ? 'monoslope' : shape === 'gable' ? 'pitched' : 'troughed', blocked: false }, project: windProject, directions, tributaryWidth: 1 });
        return { ...m, cases: out.cases.filter(c => c.distributed.length).map(c => c.distributed.map(p => ({ ...p, q: p.qZ }))) };
      }
      const swapped = v === 'rotate';
      const axes: WindAxis[] = ['x', 'y'].map(axis => ({ ...windAxis, axis: axis as 'x' | 'y', project: { ...windProject, meanRoofHeight: 4, roofSlopeDeg: Math.atan(0.2) * 180 / Math.PI }, along: (axis === 'x') !== swapped ? 10 : 6, across: (axis === 'x') !== swapped ? 6 : 10 }));
      const out = directions.flatMap(d => windLoadCases({ model: m.model, axes: axes.filter(a => d.endsWith(a.axis)), set: 'case1', directions: [d], tributaryWidth: 1, speed: 40 }).cases);
      return { ...m, cases: out.map(c => c.distributed) };
    };
    const base = generate('base'), current = generate(variant);
    expect(current.cases).toHaveLength(base.cases.length);
    const theta = Math.atan(0.2) * 180 / Math.PI, gradient = shape === 'trough' ? -0.2 : 0.2;
    const cp = roofCp(4 / 10, theta);
    const pressure = free ? velocityPressure(shape === 'mono' ? 4 : 3.5, windProject) / 1000 * 0.85 * freeRoofCn(shape === 'mono' ? 'monoslope' : shape === 'gable' ? 'pitched' : 'troughed', theta, 'A', false, true).cnw
      : 0.85 * Math.min(...(gradient > 0 ? cp.windward : cp.leeward));
    const force = -pressure * 6 / Math.hypot(gradient, 1), fx = -gradient * force;
    assertWindResultants(windResultants(current.model, current.cases[0]!.filter(p => current.sources.get(p.elementId) === 6), [], current.back), [fx, 0, force, 3 * force, heights[0]! * fx, -3 * fx]);
    for (const [k, lines] of current.cases.entries()) for (const id of original.elements.keys()) {
      assertWindResultants(windResultants(current.model, lines.filter(p => current.sources.get(p.elementId) === id), [], current.back), windResultants(base.model, base.cases[k]!.filter(p => base.sources.get(p.elementId) === id)));
    }
  });
}

for (const set of ['cases13', 'all'] as const) for (const variant of ['uniform', 'uneven'] as const) it(`#2205 combined-axis roof zones preserve each surface under ${set} ${variant}`, () => {
  const original = mesh([[[0, 0, 3], [5, 0, 4], [10, 0, 3], [10, 6, 3], [5, 6, 4], [0, 6, 3]], [[5, 0, 4], [5, 6, 4]]]);
  const generate = (v: typeof variants[number]) => {
    const m = remeshWind(original, v);
    const axes: WindAxis[] = ['x', 'y'].map(axis => ({ ...windAxis, axis: axis as 'x' | 'y', gcpi: 0.18, project: { ...windProject, meanRoofHeight: 4, roofSlopeDeg: Math.atan(0.2) * 180 / Math.PI }, along: axis === 'x' ? 10 : 6, across: axis === 'x' ? 6 : 10 }));
    return { ...m, out: windLoadCases({ model: m.model, axes, set, directions: ['+x', '-x', '+y', '-y'], tributaryWidth: 1, speed: 40 }) };
  };
  const a = generate('base'), b = generate(variant);
  expect(b.out.cases.map(c => [c.nameKey, c.nameParams])).toEqual(a.out.cases.map(c => [c.nameKey, c.nameParams]));
  for (const [k, c] of b.out.cases.entries()) for (const id of original.elements.keys()) assertWindResultants(windResultants(b.model, c.distributed.filter(p => b.sources.get(p.elementId) === id)), windResultants(a.model, a.out.cases[k]!.distributed.filter(p => a.sources.get(p.elementId) === id)));
});
