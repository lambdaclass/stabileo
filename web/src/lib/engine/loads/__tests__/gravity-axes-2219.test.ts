import { afterEach, expect, it, vi } from 'vitest';
import * as floor from '../floor-loads';
import { gravityLayout } from '../plan-gravity';
import { regionModel } from './physical-region-invariance';
import { quadraticAt as evaluateQuadratic } from '../../member-moments';
import { skewCarriers } from './gravity-axes-fixture';

const regression = process.env.RUN_KNOWN_WRONG === '2219' ? it : it.skip;
afterEach(() => vi.restoreAllMocks());

for (const rollAngle of [0, 30, 90]) for (const custom of [false, true]) {
  regression(`known wrong result: #2219 gravity converts the actual floor frame roll=${rollAngle} custom=${custom}`, () => {
    const m = regionModel([[[0, 0], [6, 2], [6, 6], [0, 4]]]);
    const orientation = { rollAngle, ...(custom ? { localYx: 0, localYy: 0, localYz: 1 } : {}) };
    const actual = floor.physicalFloorLoad;
    vi.spyOn(floor, 'physicalFloorLoad').mockImplementation(input => actual({ ...input, beams: input.beams.map(e => ({ ...e, ...orientation })) }));
    const out = gravityLayout(m, { mode: 'panels', slab: 'oneWay', spanAxis: 'y', tributaryWidth: 1, loadEveryPanel: true });
    const L = Math.sqrt(40), x = L / 2;
    const loads = out.moments.filter(p => p.elementId === 1 && (p.a ?? 0) < x && (p.b ?? L) > x);
    expect(loads.length).toBeGreaterThan(0);
    const couple = [0, 0, 0];
    for (const p of loads) {
      const t = (x - (p.a ?? 0)) / ((p.b ?? L) - (p.a ?? 0));
      [p.moments.x, p.moments.y, p.moments.z].forEach((v, i) => { couple[i]! += evaluateQuadratic(v, t); });
    }
    expect(couple[0]).toBeCloseTo(-12 / L, 10);
    expect(couple[1]).toBeCloseTo(0, 10);
    expect(couple[2]).toBeCloseTo(0, 10);
    expect((6 * couple[0]! + 2 * couple[1]!) / L).toBeCloseTo(-1.8, 10);
  });
}

for (const roll of [0, 30, 90]) for (const custom of [false, true]) for (const angle of [0, Math.PI / 2]) for (const mirror of [1, -1]) for (const divided of [false, true]) {
  it(`gravity carrier loading hand solution roll=${roll} custom=${custom} angle=${angle} mirror=${mirror} divided=${divided}`, () => {
    const { model, fractions, point, spanAxis } = skewCarriers(roll, custom, angle, mirror, divided);
    const out = gravityLayout(model, { mode: 'panels', slab: 'oneWay', spanAxis, tributaryWidth: 1, loadEveryPanel: true });
    const L = Math.sqrt(40), count = fractions.length;
    for (const side of [0, 2]) for (let index = 0; index < count; index++) {
      const id = side * count + index + 1;
      const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      for (const t of [0.25, 0.5, 0.75]) {
        const x = t * length;
        let force = 0;
        for (const p of out.pieces.filter(p => p.elementId === id)) {
          const lo = p.a ?? 0, hi = p.b ?? length;
          if (lo < x && x < hi) force += p.wI + (p.wJ - p.wI) * (x - lo) / (hi - lo);
        }
        expect(force).toBeCloseTo(12 / L, 9);
        const couple = [0, 0, 0];
        for (const p of out.moments.filter(p => p.elementId === id)) {
          const lo = p.a ?? 0, hi = p.b ?? length;
          if (lo < x && x < hi) [p.moments.x, p.moments.y, p.moments.z].forEach((v, k) => { couple[k]! += evaluateQuadratic(v, (x - lo) / (hi - lo)); });
        }
        const expected = point([side === 0 ? -12 / L : 12 / L, 0]).map(v => mirror * v);
        expect(couple[0]).toBeCloseTo(expected[0]!, 9);
        expect(couple[1]).toBeCloseTo(expected[1]!, 9);
        expect(couple[2]).toBeCloseTo(0, 9);
        expect(((b.x - a.x) * couple[0]! + (b.y - a.y) * couple[1]!) / length).toBeCloseTo(-mirror * 1.8, 9);
      }
    }
    expect(out.points).toHaveLength(0);
    expect(out.concentrated).toHaveLength(0);
  });
}
