import { afterEach, expect, it, vi } from 'vitest';
import * as surfaces from '../snow-roof-surfaces';
import { snowLoadCases } from '../snow-loads';
import { gravityLayout } from '../plan-gravity';
import { distributedGlobalEnds, dot, type Vec3 } from '../../member-loads';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow } from './snow-roof-plane-fixture';
import { remeshSnowRoof } from './snow-remesh-invariance';

const regression = it.skipIf(process.env.RUN_KNOWN_WRONG !== '2197');
afterEach(() => vi.restoreAllMocks());

for (const mode of ['projected', 'width'] as const) for (const angle of [0, 0.37]) for (const mirror of [-1, 1]) {
  regression(`known wrong result: #2197 inclined partial snow retains member axial force and displacement ${mode} ${angle} ${mirror}`, () => {
    const original = surfaces.roofSurfaceModel;
    for (const split of [1, 2, 3, 8]) for (const start of [0.5, 0, 0.999, 1]) {
      vi.restoreAllMocks();
      const base = transform(mesh([[[0, 0, 3], [8, 0, 7]]]), angle, 0, mirror);
      const { model, segments } = remeshSnowRoof(base, new Map([[1, split]]));
      const L = Math.sqrt(80), cos = 8 / L, sin = 4 / L;
      vi.spyOn(surfaces, 'roofSurfaceModel').mockImplementation((m, only) => {
        const actual = original(m, only);
        return { ...actual, pressureProfile: (...args) => {
          const profile = actual.pressureProfile(...args);
          return { ...profile, memberLoads: (id, from = 0, to) => {
            const segment = segments.find(s => s.id === id)!;
            const lo = Math.max(from, (start - segment.from) * L), hi = Math.min(to ?? (segment.to - segment.from) * L, (segment.to - segment.from) * L);
            return hi > lo ? [{ a: lo, b: hi, q: 1, qJ: 1 }] : [];
          } };
        } };
      });
      const layout = mode === 'width' ? gravityLayout(model, { mode, tributaryWidth: 1 }) : undefined;
      const out = snowLoadCases({ model, layout, snow: { ...snow, roofKind: 'mono' }, tributaryWidth: 1 })!;
      expect(out.result.refused).toBeUndefined();
      const c = out.cases[0]!;
      const ex: Vec3 = [mirror * cos * Math.cos(angle), mirror * cos * Math.sin(angle), sin];
      const ey: Vec3 = [-Math.sin(angle), Math.cos(angle), 0];
      const ez: Vec3 = [-sin * mirror * Math.cos(angle), -sin * mirror * Math.sin(angle), cos];
      const loads = c.distributed.map(d => {
        const segment = segments.find(s => s.id === d.elementId)!;
        const ends = distributedGlobalEnds({ elementId: d.elementId, qYI: 0, qYJ: 0, qZI: d.q, qZJ: d.qJ ?? d.q, frame: d.frame, a: d.a, b: d.b }, { ex, ey, ez, L: L / split });
        return { a: segment.from * L + ends.a, b: segment.from * L + ends.b, axial: dot(ends.gI, ex), transverse: dot(ends.gI, ez), lateral: dot(ends.gI, ey) };
      });
      const tipForce = c.nodal.filter(n => n.nodeId === 2).reduce((sum, n) => sum + dot([n.fx, n.fy, n.fz], ex), 0);
      const qAxial = -cos * sin, qTransverse = -cos * cos, a = start * L;
      for (const station of [0.1, 0.4, 0.6, 0.9]) {
        const s = station * L, lo = Math.max(s, a);
        const axial = tipForce + loads.reduce((sum, d) => sum + d.axial * Math.max(0, d.b - Math.max(s, d.a)), 0);
        expect(axial).toBeCloseTo(qAxial * (L - lo), 11);
        const shear = loads.reduce((sum, d) => sum + d.transverse * Math.max(0, d.b - Math.max(s, d.a)), 0);
        const moment = loads.reduce((sum, d) => sum + (d.b > s ? d.transverse * ((d.b - s) ** 2 - (Math.max(s, d.a) - s) ** 2) / 2 : 0), 0);
        expect(shear).toBeCloseTo(qTransverse * (L - lo), 11);
        expect(moment).toBeCloseTo(qTransverse * ((L - s) ** 2 - (lo - s) ** 2) / 2, 11);
      }
      const displacement = tipForce * L + loads.reduce((sum, d) => sum + d.axial * (d.b ** 2 - d.a ** 2) / 2, 0);
      expect(displacement).toBeCloseTo(qAxial * (L * L - a * a) / 2, 11);
      const primitive = (x: number) => L * x ** 3 / 6 - x ** 4 / 24;
      const deflection = loads.reduce((sum, d) => sum + d.transverse * (primitive(d.b) - primitive(d.a)), 0);
      expect(deflection).toBeCloseTo(qTransverse * (primitive(L) - primitive(a)), 10);
      expect(loads.every(d => Math.abs(d.lateral) < 1e-12)).toBe(true);
      expect(c.nodal).toHaveLength(0);
      expect(c.distributed.every(d => d.frame === 'projected')).toBe(true);
    }
  });
}

for (const angle of [0, 0.37]) for (const mirror of [-1, 1]) regression(`known wrong result: #2197 connected roof panels own a complete rafter ${angle} ${mirror}`, () => {
  for (const panels of [1, 2, 4]) for (const split of [1, 2, 3, 8]) {
    const rings = Array.from({ length: panels }, (_, k) => [[8 * k / panels, -1, 3], [8 * (k + 1) / panels, -1, 3], [8 * (k + 1) / panels, 1, 3], [8 * k / panels, 1, 3]]);
    const base = mesh([...rings, [[0, 0, 3], [8, 0, 7]]]);
    const model = transform(remeshSnowRoof(base, new Map([[base.elements.size, split]])).model, angle, 0, mirror);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
    expect(layout.panels).toHaveLength(panels);
    expect(layout.panels.every(p => p.roof)).toBe(true);
    expect(layout.pieces.every(p => p.roof)).toBe(true);
    expect([...layout.roofAreaOf.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(24, 10);
  }
});
