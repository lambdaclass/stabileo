import { expect, it } from 'vitest';
import { windLoadCases, type WindAxis } from '../wind-cases';
import { otherStructureWind } from '../wind-other';
import { mesh, windProject, windAxis, remeshWind, variants, assertWindResultants, windResultants } from './wind-integration-fixture';

const wrong = process.env.RUN_KNOWN_WRONG === '2205' ? it : it.skip;
for (const variant of variants) for (const dir of ['+x', '-x', '+y', '-y'] as const) {
  wrong(`known wrong result: #2205 each flat roof carrier preserves force and both moments ${variant} ${dir}`, () => {
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
wrong('known wrong result: #2205 the two 12 m carriers retain the independent 45.9 kNm first moment', () => {
  const model = mesh([[[0, 0, 3], [12, 0, 3]], [[0, 6, 3], [12, 6, 3]]]);
  const c = windLoadCases({ model, axes: [{ ...windAxis, along: 12 }], set: 'case1', directions: ['+x'], tributaryWidth: 1, speed: 40 }).cases[0]!;
  const r = windResultants(model, c.distributed);
  expect(r[2]).toBeCloseTo(10.2, 10); expect(r[4]).toBeCloseTo(-45.9, 10);
});
for (const kind of ['monoslope', 'pitched', 'troughed'] as const) for (const blocked of [false, true]) for (const variant of variants) {
  wrong(`known wrong result: #2205 free roof zones preserve each carrier ${kind} ${blocked} ${variant}`, () => {
    const original = mesh([[[0, 0, 3], [10, 0, 3], [10, 6, 3], [0, 6, 3]]]);
    const generate = (v: typeof variants[number]) => {
      const m = remeshWind(original, v);
      const out = otherStructureWind({ model: m.model, structure: { kind: 'freeRoof', roof: kind, blocked, area: { x: 12, y: 20 } }, project: { ...windProject, basicSpeed: 1 }, directions: ['+x', '-x', '+y', '-y'].map(d => m.direction(d as '+x')), tributaryWidth: 1 });
      return { ...m, out };
    };
    const base = generate('base'), current = generate(variant);
    for (const [k, c] of current.out.cases.entries()) {
      for (const id of original.elements.keys()) {
        const lines = (m: typeof base, n: number) => m.out.cases[n]!.distributed.filter(d => m.sources.get(d.elementId) === id).map(d => ({ ...d, q: d.qZ }));
        assertWindResultants(windResultants(current.model, lines(current, k), [], current.back), windResultants(base.model, lines(base, k)));
      }
    }
  });
}
