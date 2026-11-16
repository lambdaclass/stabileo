import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow } from './snow-roof-plane-fixture';
import { assertSnowRemeshInvariant, memberResponse, snowDistributedResultant } from './snow-remesh-invariance';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import type { LoadModelData } from '../load-plan';

const regression = it;

for (const mode of ['projected', 'width', 'panels'] as const) for (const angle of [0, 0.37]) for (const selected of [false, true]) for (const W of [2, 6 - 1e-12, 6, 6 + 1e-12]) {
  const check = () => {
    const model = transform(mesh([[[0, -W, 3], [16, -W, 3], [16, W, 3], [0, W, 3]]]), angle, 0);
    const polygon = [...model.nodes.values()].map(n => [n.x, n.y] as [number, number]);
    const generate = (m: LoadModelData) => {
      const layout = mode === 'projected' ? undefined : gravityLayout(m, { mode, tributaryWidth: 1 });
      if (mode === 'panels' && layout) {
        layout.panels = [{ polygon, z: 3, roof: true }];
        layout.widthMembers = []; layout.points = [];
        layout.pieces = [...m.elements.values()].map(e => {
          const a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!;
          return { elementId: e.id, panel: 0, roof: true, a: 0, b: Math.hypot(b.x - a.x, b.y - a.y), wI: 1, wJ: 1 };
        });
      }
      const out = snowLoadCases({ model: m, layout, snow: { ...snow, roofSlopeDeg: 20, ...(selected ? { roof: [...m.elements.keys()] } : {}) }, tributaryWidth: 1 })!;
      expect(out.result.refused).toBeUndefined();
      return out;
    };
    const out = generate(model), ps = 0.7 * (70 - 20) / (70 - 5);
    const windward = W <= 6 ? 0 : 0.3 * ps, leeward = W <= 6 ? 1.5 * ps : 1.2 * 1.5 * ps;
    for (const id of [2, 4]) for (const [k, sign] of [[1, 1], [2, -1]]) {
      const [force, moment] = snowDistributedResultant(model, out.cases[k!]!.distributed, new Set([id]), [0, 0], [-Math.sin(angle), Math.cos(angle)]);
      expect(force).toBeCloseTo(-W * (leeward + windward), 10);
      expect(moment).toBeCloseTo(-sign! * W * W * (leeward - windward) / 2, 10);
      for (const side of [-1, 1]) {
        const p = side === sign ? leeward : windward;
        const region: [number, number] = side < 0 ? [-W, 0] : [0, W];
        const values = snowDistributedResultant(model, out.cases[k!]!.distributed, new Set([id]), [0, 0], [-Math.sin(angle), Math.cos(angle)], region);
        expect(values[0]).toBeCloseTo(-p * W, 10);
        expect(values[1]).toBeCloseTo(-side * p * W * W / 2, 10);
      }
    }
    for (const id of [2, 4]) for (const k of [1, 2]) {
      const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const length = 2 * W, increasing = b.x * -Math.sin(angle) + b.y * Math.cos(angle) > a.x * -Math.sin(angle) + a.y * Math.cos(angle);
      const positiveLeeward = k === 1;
      const q0 = -(increasing === positiveLeeward ? windward : leeward), q1 = -(increasing === positiveLeeward ? leeward : windward);
      const c = out.cases[k]!;
      const intervals = c.distributed.filter(d => d.elementId === id).map(d => ({ a: d.a ?? 0, b: d.b ?? length, q: d.q, qJ: d.qJ ?? d.q }));
      const integral = (q: number, lo: number, hi: number, f: (x: number) => number) => q * (f(hi) - f(lo));
      for (const t of [0.1, 0.3, 0.6, 0.9]) {
        const x = t * length, mid = length / 2;
        const shear = (x < mid ? q0 * (mid - x) : 0) + q1 * (length - Math.max(x, mid));
        const moment = (x < mid ? q0 * (mid - x) ** 2 / 2 : 0) + q1 * ((length - x) ** 2 - (Math.max(x, mid) - x) ** 2) / 2;
        const primitive = (s: number) => length * s ** 3 / 6 - s ** 4 / 24;
        const deflection = integral(q0, 0, mid, primitive) + integral(q1, mid, length, primitive);
        const actual = memberResponse(intervals, length, x);
        expect(actual[0]).toBeCloseTo(shear, 10);
        expect(actual[1]).toBeCloseTo(moment, 10);
        expect(actual[3]).toBeCloseTo(deflection, 10);
      }
      expect(c.nodal).toHaveLength(0);
    }
    for (const subdivisions of [new Map([[2, 2], [4, 2]]), new Map([[2, 3], [4, 5]]), new Map([[1, 8], [2, 5], [3, 3], [4, 7]])]) assertSnowRemeshInvariant(model, subdivisions, generate);
  };
  if (mode === 'panels' && angle === 0 && !selected && W === 2) it('#2176 physical ridge force and moment panels 0 false 2', check);
  else regression(`#2176 physical ridge force and moment ${mode} ${angle} ${selected} ${W}`, check);
}
