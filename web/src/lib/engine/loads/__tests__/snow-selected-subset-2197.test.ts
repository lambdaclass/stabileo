import { afterEach, expect, it, vi } from 'vitest';
import { snowLoadCases } from '../snow-loads';
import { planSnow } from '../load-plan-snow';
import type { PlanSink } from '../load-plan';
import { snow, regulations } from './snow-roof-plane-fixture';
import { gravityLayout } from '../plan-gravity';
import * as surfaces from '../snow-roof-surfaces';
import { roofSurfaceModel, SNOW_INTENSITY_RELATIVE_ERROR } from '../snow-roof-surfaces';
import { mesh, transform } from './snow-surface-round2-fixture';
import { memberResponse, remeshSnowRoof, snowDistributedResultant } from './snow-remesh-invariance';

const regression = it.skipIf(process.env.RUN_KNOWN_WRONG !== '2197');
afterEach(() => vi.restoreAllMocks());

const integral = (q: number[], a: number, b: number) => q.reduce((sum, c, k) => sum + c * (b ** (k + 1) - a ** (k + 1)) / (k + 1), 0);

for (const angle of [0, 0.37]) for (const mirror of [-1, 1]) for (const reverse of [false, true]) for (const selection of ['first', 'last', 'all', 'none'] as const) for (const quadratic of [true, false]) {
  const check = quadratic && (selection === 'first' || selection === 'last') ? regression : it;
  check(`known wrong result: #2197 selected quadratic strip ${angle} ${mirror} ${reverse} ${selection} ${quadratic}`, () => {
    for (const subdivisions of [1, 2, 3, 7]) {
      const base = mesh([[[0, 0, 3], [3, 0, 3], [8, 0, 3], [8, 8, 3], [0, 8, 3]]]);
      if (reverse) for (const id of [1, 2]) {
        const e = base.elements.get(id)!;
        [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
      }
      const { model: refined, segments } = remeshSnowRoof(base, new Map([[1, subdivisions], [2, subdivisions]]));
      const model = transform(refined, angle, 0, mirror);
      const carriers = segments.filter(s => s.source === 1 || s.source === 2);
      const selected = carriers.filter(s => selection === 'all' || selection === 'first' && s.source === 1 || selection === 'last' && s.source === 2);
      const ids = new Set(selected.map(s => s.id));
      const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
      layout.panels = [{ polygon: [[0, 0], [8, 0], [8, 8], [0, 8]].map(([x, y]) => [mirror * x! * Math.cos(angle) - y! * Math.sin(angle), mirror * x! * Math.sin(angle) + y! * Math.cos(angle)]), z: 3, roof: true }];
      layout.pieces = carriers.map(s => {
        const e = model.elements.get(s.id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        const x = (p: typeof a) => mirror * (p.x * Math.cos(angle) + p.y * Math.sin(angle));
        return { elementId: s.id, panel: 0, roof: true, a: 0, b: s.length / subdivisions, wI: x(a), wJ: x(b) };
      });
      const sf = roofSurfaceModel(model, ids);
      const loads = layout.pieces.filter(p => ids.has(p.elementId)).flatMap(pc => sf.pieceLoads(pc, layout, (_, pt) => 1 - (quadratic ? mirror * (pt[0] * Math.cos(angle) + pt[1] * Math.sin(angle)) / 16 : 0)));
      expect(loads.length > 0).toBe(selection !== 'none');
      expect(loads.every(d => ids.has(d.elementId) && d.frame === 'projected')).toBe(true);
      const lo = selection === 'last' ? 3 : 0, hi = selection === 'first' ? 3 : selection === 'none' ? 0 : 8;
      const q = [0, -1, quadratic ? 1 / 16 : 0];
      const force = integral(q, lo, hi), first = integral([0, ...q], lo, hi);
      for (const direction of [[1, 0], [0, 1]]) {
        const actual = snowDistributedResultant(model, loads, ids, [0, 0], direction);
        expect.soft(actual[0]).toBeCloseTo(force, 10);
        expect.soft(actual[1]).toBeCloseTo(first * mirror * (direction[0] === 1 ? Math.cos(angle) : Math.sin(angle)), 10);
      }
      const intervals = loads.map(d => {
        const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        const start = mirror * (a.x * Math.cos(angle) + a.y * Math.sin(angle));
        const sense = mirror * ((b.x - a.x) * Math.cos(angle) + (b.y - a.y) * Math.sin(angle)) > 0 ? 1 : -1;
        const from = start + sense * (d.a ?? 0), to = start + sense * d.b!;
        return from < to ? { a: from, b: to, q: d.q, qJ: d.qJ } : { a: to, b: from, q: d.qJ, qJ: d.q };
      });
      const bound = (quadratic ? 4 : 8) * SNOW_INTENSITY_RELATIVE_ERROR;
      for (const x of [0, 1, 2.999, 3.001, 4.5, 7.5]) {
        const a = Math.min(hi, Math.max(lo, x));
        const response = memberResponse(intervals, 8, x);
        const shear = integral(q, a, hi), moment = integral([0, ...q], a, hi) - x * shear;
        expect(Math.abs(response[0]! - shear)).toBeLessThanOrEqual(bound * (hi - a) + 1e-11);
        expect(Math.abs(response[1]! - moment)).toBeLessThanOrEqual(bound * (8 - x) ** 2 / 2 + 1e-11);
        const deflection = integral([0, 0, 0, -4, 1 / 6 + (quadratic ? 1 / 4 : 0), quadratic ? -1 / 96 : 0], lo, hi);
        expect(Math.abs(response[3]! - deflection)).toBeLessThanOrEqual(bound * 8 ** 4 / 8 + 1e-10);
      }
    }
  });
}

for (const angle of [0, 0.37]) for (const mirror of [-1, 1]) for (const selected of [true, false]) regression(`known wrong result: #2197 public selected dome member loading ${angle} ${mirror} ${selected}`, () => {
  for (const subdivisions of [1, 2, 3]) {
    vi.restoreAllMocks();
    const rim = [[0, 0, 3], [8, 0, 3], [8, 8, 3], [0, 8, 3]], crown = [4, 4, 5];
    const base = mesh(rim.map((p, k) => [p, rim[(k + 1) % rim.length]!, crown]));
    const coarse = remeshSnowRoof(base, new Map([[1, 8]]));
    const bottom = coarse.segments.filter(s => s.source === 1);
    const refined = remeshSnowRoof(coarse.model, new Map(bottom.map(s => [s.id, subdivisions])));
    const model = transform(refined.model, angle, 0, mirror);
    const ids = new Set(refined.segments.filter(s => bottom.some(b => b.id === s.source && b.to <= 3 / 8)).map(s => s.id));
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
    if (!selected) for (const pc of layout.pieces) pc.roof = ids.has(pc.elementId);
    const otherIds = refined.segments.filter(s => !bottom.some(b => b.id === s.source)).map(s => s.id);
    const options = { ...snow, roofKind: 'dome' as const, ...(selected ? { roof: [...ids, ...otherIds] } : {}) };
    if (selected) {
      const original = surfaces.roofSurfaceModel;
      vi.spyOn(surfaces, 'roofSurfaceModel').mockImplementation((m, only) => {
        const sf = original(m, only);
        return { ...sf, pressureProfile: (...args) => ({ ...sf.pressureProfile(...args), at: (_id, point) => 1 - mirror * (point.x * Math.cos(angle) + point.y * Math.sin(angle)) / 16 }) };
      });
    }
    const out = snowLoadCases({ model, layout, snow: options, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    expect(out.cases.length).toBeGreaterThan(selected ? 0 : 3);
    const sink: PlanSink = { cases: [], distributed: [], nodal: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    expect(planSnow({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, tributaryWidth: 1, snow: { ...options, enabled: true, source: 'site' } }, sink, layout)).toBe(true);
    for (const [k, c] of out.cases.entries()) expect(sink.distributed.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.distributed);
    const p = 2 * 0.7 * (70 - Math.atan(2 / Math.hypot(4, 4)) * 180 / Math.PI) / 65;
    const c = out.cases[selected ? 0 : 3];
    expect(c).toBeDefined();
    const slope = selected ? 1 : p, curvature = selected ? 1 / 16 : p / 8;
    const q = [0, -slope, curvature], force = integral(q, 0, 3), first = integral([0, ...q], 0, 3);
    const loads = c!.distributed.filter(d => ids.has(d.elementId));
    expect(loads.length).toBeGreaterThan(0);
    for (const direction of [[1, 0], [0, 1]]) {
      const actual = snowDistributedResultant(model, loads, ids, [0, 0], direction);
      expect.soft(actual[0]).toBeCloseTo(force, 10);
      expect.soft(actual[1]).toBeCloseTo(first * mirror * (direction[0] === 1 ? Math.cos(angle) : Math.sin(angle)), 10);
    }
    const intervals = loads.map(d => {
      const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!;
      const start = mirror * (a.x * Math.cos(angle) + a.y * Math.sin(angle));
      return { a: start + (d.a ?? 0), b: start + (d.b ?? 1 / subdivisions), q: d.q, qJ: d.qJ ?? d.q };
    });
    const bound = (selected ? 4 : 2 * p) * SNOW_INTENSITY_RELATIVE_ERROR;
    for (const x of [0, 0.5, 1.5, 2.9, 3.1]) {
      const a = Math.min(x, 3), response = memberResponse(intervals, 3, x);
      const shear = integral(q, a, 3), moment = integral([0, ...q], a, 3) - x * shear;
      expect(Math.abs(response[0]! - shear)).toBeLessThanOrEqual(bound * (3 - a) + 1e-11);
      expect(Math.abs(response[1]! - moment)).toBeLessThanOrEqual(bound * (3 - a) ** 2 / 2 + 1e-11);
      const deflection = integral([0, 0, 0, -3 * slope / 2, slope / 6 + 3 * curvature / 2, -curvature / 6], 0, 3);
      expect(Math.abs(response[3]! - deflection)).toBeLessThanOrEqual(bound * 3 ** 4 / 8 + 1e-10);
    }
    expect(c!.nodal).toHaveLength(0);
  }
});
