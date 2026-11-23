import { afterEach, expect, it, vi } from 'vitest';
import * as surfaces from '../snow-roof-surfaces';
import { snowLoadCases } from '../snow-loads';
import { connectedRoofFootprints, gravityLayout } from '../plan-gravity';
import { distributedGlobalEnds, dot, type Vec3 } from '../../member-loads';
import { mesh, transform } from './snow-surface-round2-fixture';
import { regulations, snow } from './snow-roof-plane-fixture';
import * as floorOwnership from '../gravity-floor-ownership';
import { planAreaLoads } from '../plan-area-loads';
import { planSnow } from '../load-plan-snow';
import type { PlanSink } from '../load-plan';
import { memberResponse, remeshSnowRoof } from './snow-remesh-invariance';

const regression = it;
afterEach(() => vi.restoreAllMocks());

for (const mode of ['projected', 'width'] as const) for (const angle of [0, 0.37]) for (const mirror of [-1, 1]) {
  regression(`#2197 inclined partial snow retains member axial force and displacement ${mode} ${angle} ${mirror}`, () => {
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
      const sink: PlanSink = { cases: [], distributed: [], nodal: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
      expect(planSnow({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, tributaryWidth: 1, snow: { ...snow, roofKind: 'mono', enabled: true, source: 'site' } }, sink, layout)).toBe(true);
      expect(sink.distributed.filter(d => d.caseIndex === 0).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.distributed);
      expect(sink.nodal).toHaveLength(0);

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

for (const angle of [0, 0.37]) for (const mirror of [-1, 1]) regression(`#2197 connected roof panels own a complete rafter ${angle} ${mirror}`, () => {
  for (const panels of [1, 2, 4]) for (const split of [1, 2, 3, 8]) {
    const rings = Array.from({ length: panels }, (_, k) => [[8 * k / panels, -1, 3], [8 * (k + 1) / panels, -1, 3], [8 * (k + 1) / panels, 1, 3], [8 * k / panels, 1, 3]]);
    const base = mesh([...rings, [[0, 0, 3], [8, 0, 7]]]);
    const model = transform(remeshSnowRoof(base, new Map([[base.elements.size, split]])).model, angle, 0, mirror);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
    expect(layout.panels).toHaveLength(panels);
    expect(layout.panels.every(p => p.roof)).toBe(true);
    expect(layout.pieces.every(p => p.roof)).toBe(true);
    const out = snowLoadCases({ model, layout, snow: { ...snow, roofKind: 'mono', roofSlopeDeg: 20 }, tributaryWidth: 1 })!;
    expect(out.result.refused).toBe('snow.refused.roofPlane');
    expect(out.cases).toHaveLength(0);

    expect([...layout.roofAreaOf.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(24, 10);
  }
});

for (const angle of [0, 0.37]) for (const gap of [0, 0.01]) it(`#2197 roof footprint ownership does not cross a gap ${angle} ${gap}`, () => {
  const model = transform(mesh([[[0, -1, 3], [4 - gap, -1, 3], [4 - gap, 1, 3], [0, 1, 3]], [[4 + gap, -1, 3], [8, -1, 3], [8, 1, 3], [4 + gap, 1, 3]], [[0, 0, 3], [8, 0, 7]]]), angle, 0);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
  expect(layout.panels).toHaveLength(2);
  expect(layout.panels.every(p => p.roof)).toBe(gap === 0);
});

for (const angle of [0, 0.37]) it(`#2197 connected roof ownership does not fill a footprint hole ${angle}`, () => {
  const rings = [
    [[0, -2, 3], [3, -2, 3], [3, 2, 3], [0, 2, 3]],
    [[5, -2, 3], [8, -2, 3], [8, 2, 3], [5, 2, 3]],
    [[3, -2, 3], [5, -2, 3], [5, -1, 3], [3, -1, 3]],
    [[3, 1, 3], [5, 1, 3], [5, 2, 3], [3, 2, 3]],
  ];
  const polygons = rings.map(ring => ring.map(([x, y]) => [x! * Math.cos(angle) - y! * Math.sin(angle), x! * Math.sin(angle) + y! * Math.cos(angle)] as [number, number]));
  const footprints = connectedRoofFootprints(polygons);
  expect(footprints).toHaveLength(1);
  expect(footprints[0]).toHaveLength(2);
  const area = (ring: Array<[number, number]>) => Math.abs(ring.reduce((sum, p, k) => { const q = ring[(k + 1) % ring.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  expect(area(footprints[0]![0]!)).toBeCloseTo(32, 10);
  expect(area(footprints[0]![1]!)).toBeCloseTo(4, 10);
});

for (const angle of [0, 0.37]) for (const mirror of [-1, 1]) for (const panels of [1, 2, 4]) for (const split of [1, 2, 3, 8]) it(`#2197 a resolved roof retains member snow across adjoining panels ${angle} ${mirror} ${panels} ${split}`, () => {
  const rings = Array.from({ length: panels }, (_, k) => [[8 * k / panels, -1, 3], [8 * (k + 1) / panels, -1, 3], [8 * (k + 1) / panels, 1, 3], [8 * k / panels, 1, 3]]);
  const base = mesh([...rings, [[0, -1, 3], [8, -1, 7]], [[0, 1, 3], [8, 1, 7]], [[0, 0, 3], [8, 0, 7]]]);
  const rafter = base.elements.size;
  const { model: refined, segments } = remeshSnowRoof(base, new Map([[rafter, split]]));
  const model = transform(refined, angle, 0, mirror);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
  expect(layout.panels).toHaveLength(panels);
  expect(layout.panels.every(p => p.roof)).toBe(true);
  const out = snowLoadCases({ model, layout, snow: { ...snow, roofKind: 'mono' }, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  const ids = new Set(segments.filter(s => s.source === rafter).map(s => s.id));
  const loads = out.cases[0]!.distributed.filter(d => ids.has(d.elementId));
  expect(loads.length).toBeGreaterThan(0);
  const ps = 0.7 * (70 - Math.atan(0.5) * 180 / Math.PI) / 65;
  for (const load of loads) {
    expect(load.frame).toBe('projected');
    expect(load.q).toBeCloseTo(-ps, 11);
    expect(load.qJ ?? load.q).toBeCloseTo(-ps, 11);
  }
  const L = Math.sqrt(80), cos = 8 / L, sin = 4 / L;
  const intervals = loads.map(d => {
    const segment = segments.find(s => s.id === d.elementId)!;
    return { a: segment.from * L + (d.a ?? 0), b: segment.from * L + (d.b ?? (segment.to - segment.from) * L), q: d.q, qJ: d.qJ ?? d.q };
  });
  for (const t of [0.1, 0.3, 0.6, 0.9]) {
    const response = memberResponse(intervals, L, t * L);
    expect(response[0]! * cos * sin).toBeCloseTo(-ps * cos * sin * L * (1 - t), 10);
    expect(response[0]! * cos * cos).toBeCloseTo(-ps * cos * cos * L * (1 - t), 10);
    expect(response[1]! * cos * cos).toBeCloseTo(-ps * cos * cos * (L * (1 - t)) ** 2 / 2, 10);
    expect(response[2]! * cos * sin).toBeCloseTo(-ps * cos * sin * L ** 2 / 2, 10);
    expect(response[3]! * cos * cos).toBeCloseTo(-ps * cos * cos * L ** 4 / 8, 10);
  }
});

for (const angle of [0, 0.37]) for (const mirror of [-1, 1]) it(`#2197 hole-crossing rafters retain covered floor panels ${angle} ${mirror}`, () => {
  const xs = [0, 3, 5, 8], ys = [-2, -1, 1, 2];
  const rings = xs.slice(1).flatMap((x, i) => ys.slice(1).map((y, j) => [[xs[i]!, ys[j]!, 3], [x, ys[j]!, 3], [x, y, 3], [xs[i]!, y, 3]]));
  const partitionGravityFloors = floorOwnership.partitionGravityFloors;
  vi.spyOn(floorOwnership, 'partitionGravityFloors').mockImplementation((...args) => {
    const ownership = partitionGravityFloors(...args);
    for (const bay of ownership.bays.keys()) {
      const polygon = bay.boundary[0]!;
      const x = polygon.reduce((v, p) => v + mirror * (p[0] * Math.cos(angle) + p[1] * Math.sin(angle)), 0) / polygon.length;
      const y = polygon.reduce((v, p) => v - p[0] * Math.sin(angle) + p[1] * Math.cos(angle), 0) / polygon.length;
      if (x > 3 && x < 5 && y > -1 && y < 1) ownership.bays.set(bay, { partition: { kind: 'shell' }, region: [] });
    }
    return ownership;
  });
  for (const split of [1, 2, 3, 8]) {
    const base = mesh([...rings, [[0, 0, 3], [8, 0, 7]]]);
    const model = transform(remeshSnowRoof(base, new Map([[base.elements.size, split]])).model, angle, 0, mirror);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
    expect(layout.panels).toHaveLength(8);
    const footprints = connectedRoofFootprints(layout.panels.map(p => p.polygon));
    expect(footprints).toHaveLength(1);
    expect(footprints[0]).toHaveLength(2);
    const affected = new Set(layout.panels.flatMap((p, i) => {
      const y = p.polygon.reduce((v, p) => v - p[0] * Math.sin(angle) + p[1] * Math.cos(angle), 0) / p.polygon.length;
      return Math.abs(y) < 1e-8 ? [i] : [];
    }));
    expect(affected.size).toBe(2);
    for (const i of affected) expect(layout.panels[i]!.roof).toBe(false);
    const pieces = layout.pieces.filter(p => affected.has(p.panel));
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces.every(p => !p.roof)).toBe(true);
    const panelAreas = layout.panelAreas.map((areas, index) => affected.has(index) ? areas : new Map<number, number>());
    const floor = { ...layout, panelAreas, pieces, points: layout.points.filter(p => affected.has(p.panel)), widthMembers: [] };
    const loads = planAreaLoads({ layout: floor, tributaryWidth: 1, floor: { dead: 1, lo: 2, liveOf: () => 2 }, roof: { dead: 3, use: 'occupancy', weight: 'light', slopePercent: 0, lo: 4, liveOf: () => 4 } });
    for (const [kind, expected] of [['D', 12], ['L', 24]] as const) {
      const force = loads.distributed.filter(d => d.caseType === kind).reduce((sum, d) => {
        const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        return sum - (d.q + (d.qJ ?? d.q)) / 2 * ((d.b ?? Math.hypot(b.x - a.x, b.y - a.y)) - (d.a ?? 0));
      }, 0);
      expect(force).toBeCloseTo(expected, 10);
    }
  }
});
