import { describe, it, expect, beforeAll } from 'vitest';
import * as engine from '../../../lib/engine/wasm-solver';
import { defaults, type Outcome, type Values } from '../define';
import { rcPushover, build, crackedStiffness, nominalMoment, sectionPeak, layers, concreteModulus, fiberSection, concreteLayers, baseCompression, LAYERS, SEGMENTS, EPS_CU, INCREMENTS } from '../rc-pushover';

beforeAll(async () => { await engine.initSolver(); });

type Ok = Extract<Outcome, { status: 'ok' }>;
function run(extra: Values = {}): Ok {
  const v = { ...defaults(rcPushover.params), ...extra };
  const out = rcPushover.analyses(build(v), v, engine);
  if (out.status !== 'ok') throw new Error(`refused: ${out.code} ${out.reason ?? ''}`);
  return out;
}
const readout = (out: Ok, key: string) => out.readouts.find(x => x.key === key)!;

describe('rc-pushover', () => {
  it('the cracked transformed section matches a hand calculation', () => {
    const v = defaults(rcPushover.params);
    const { area, depth, cover } = layers(v);
    const n = 200000 / concreteModulus(v.fc);
    const { depth: x, inertia, topRatio } = crackedStiffness(v);
    expect(x).toBeGreaterThan(cover);
    expect(topRatio).toBe(n - 1);
    expect(v.b * x * x / 2 + (n - 1) * area * (x - cover)).toBeCloseTo(n * area * (depth - x), 9);
    expect(inertia).toBeCloseTo(v.b * x ** 3 / 3 + (n - 1) * area * (x - cover) ** 2 + n * area * (depth - x) ** 2, 12);
    expect(inertia).toBeLessThan(v.b * v.h ** 3 / 12);
  });

  it('the concrete fibres leave out the area the bars displace, in the engine section and the reference alike', () => {
    for (const extra of [{}, { b: 0.25, h: 0.3, barDia: 32 }, { perFace: 2, barDia: 12 }] as Values[]) {
      const v = { ...defaults(rcPushover.params), ...extra };
      const { area } = layers(v);
      const section = fiberSection(v);
      const concrete = section.fibers.filter(f => f.materialIdx === 0);
      expect(concrete).toHaveLength(LAYERS);
      expect(concrete.reduce((sum, f) => sum + f.area, 0)).toBeCloseTo(v.b * v.h - 2 * area, 12);
      for (const f of concrete) expect(f.area).toBeGreaterThan(0);
      expect(concreteLayers(v, 400).reduce((sum, f) => sum + f.area, 0)).toBeCloseTo(v.b * v.h - 2 * area, 12);
      expect(section.fibers.filter(f => f.materialIdx === 1).reduce((sum, f) => sum + f.area, 0)).toBeCloseTo(2 * area, 15);
    }
  });

  it('below capacity the run completes, carries the full target and the base shear balances it', () => {
    const out = run({ target: 0.6 });
    expect(out.stopped).toBeUndefined();
    const peak = readout(out, 'peakShear');
    expect(peak.value / (0.6 * readout(out, 'nominalShear').value)).toBeCloseTo(1, 12);
    expect(readout(out, 'baseShear').value / peak.value).toBeCloseTo(1, 8);
    expect(readout(out, 'residual').value).toBeLessThan(1e-6);
  });

  it('the initial stiffness lies between the cracked and the gross section', () => {
    const v = defaults(rcPushover.params);
    const out = run();
    const k = readout(out, 'crackedStiffness');
    const gross = 3 * concreteModulus(v.fc) * 1000 * (v.b * v.h ** 3 / 12) / v.height ** 3 / 1000;
    expect(k.value).toBeGreaterThan(0.9 * k.reference!.value);
    expect(k.value).toBeLessThan(gross);
  });

  it('past the capacity the run stops, carrying slightly more than the section peak and never less', () => {
    for (const extra of [{}, { target: 1.6 }, { h: 0.7, barDia: 25, fc: 40, steel: 1, target: 1.5 }, { height: 5, barDia: 16 }, { fc: 20, barDia: 32, target: 1.6 }] as Values[]) {
      const out = run(extra);
      expect(out.stopped).toBeDefined();
      expect(out.stopped!.reason).toMatch(out.stopped!.crushed ? /εcu/ : /no convergence|singular/);
      expect(out.stopped!.loadFactor).toBeLessThan(1);
      const peak = readout(out, 'peakShear');
      expect(peak.value / peak.reference!.value).toBeGreaterThan(0.98);
      expect(peak.value / peak.reference!.value).toBeLessThan(1.08);
      expect(peak.value).toBeLessThan(readout(out, 'nominalShear').value * (extra.target ?? 1.3));
      expect(readout(out, 'baseShear').value / peak.value).toBeCloseTo(1, 6);
      expect(readout(out, 'yieldedElements').value).toBeGreaterThan(0);
    }
  });

  it('the run ends at the last step before the base concrete passes εcu, where the section peak ends', () => {
    const v = { ...defaults(rcPushover.params), height: 5, barDia: 16 };
    const model = build(v);
    const full = engine.solveFiberNonlinear2D({
      solver: model.solver, fiberSections: { 1: fiberSection(v) },
      nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-8, nIncrements: INCREMENTS, modifiedNr: false,
    }) as { lastConvergedLoadFactor: number; history: { loadFactor: number; displacements: { nodeId: number; ux: number; uz: number; ry: number }[] }[] };
    const crushed = full.history.findIndex(h => baseCompression(v, h.displacements) > EPS_CU);
    expect(crushed).toBeGreaterThan(0);
    expect(full.lastConvergedLoadFactor).toBeGreaterThan(full.history[crushed - 1].loadFactor);
    const out = run({ height: 5, barDia: 16 });
    expect(out.stopped).toEqual({ loadFactor: full.history[crushed - 1].loadFactor, reason: 'εc > εcu at the base', crushed: true });
    expect(readout(out, 'peakShear').value).toBeCloseTo(full.history[crushed - 1].loadFactor * model.lateral, 9);
    expect(readout(out, 'peakShear').value / readout(out, 'peakShear').reference!.value).toBeLessThan(1.08);
    expect(out.charts[0].points).toHaveLength(crushed + 1);
  });

  it('reads the base strain the way the element does: a uniform curvature gives κh/2 at the extreme fibre', () => {
    const v = defaults(rcPushover.params);
    const l = v.height / SEGMENTS, kappa = 2e-3, axial = 1e-4;
    const top = { nodeId: 2, ux: kappa * l * l / 2, uz: axial * l, ry: -kappa * l };
    expect(baseCompression(v, [top])).toBeCloseTo(kappa * v.h / 2 - axial, 15);
    expect(baseCompression(v, [{ ...top, ux: -top.ux, ry: -top.ry }])).toBeCloseTo(kappa * v.h / 2 - axial, 15);
  });

  it('the curve rises monotonically from the origin to the stop', () => {
    const out = run();
    const curve = out.charts[0].points;
    expect(curve[0]).toEqual([0, 0]);
    for (let k = 1; k < curve.length; k++) {
      expect(curve[k][0]).toBeGreaterThan(curve[k - 1][0]);
      expect(curve[k][1]).toBeGreaterThan(curve[k - 1][1]);
    }
    expect(curve[curve.length - 1][1]).toBeCloseTo(readout(out, 'peakShear').value, 9);
  });

  it('Mn is the kernel pure-bending moment', () => {
    const v = defaults(rcPushover.params);
    const { area, depth } = layers(v);
    const a = area * 420 / (0.85 * v.fc * v.b);
    const lever = nominalMoment(v) / (area * 420 * 1000);
    expect(lever).toBeGreaterThan(depth - a);
    expect(lever).toBeLessThan(depth);
  });
});

describe('rc-pushover section peak', () => {
  it('refuses bars that do not fit, before running the solver', () => {
    const v = { ...defaults(rcPushover.params), b: 0.25, perFace: 6, barDia: 32 };
    const out = rcPushover.analyses(build(v), v, engine);
    expect(out.status === 'refused' && out.code).toBe('barsDoNotFit');
  });
  it('converges with the strip count', () => {
    const v = defaults(rcPushover.params);
    expect(sectionPeak(v) / sectionPeak(v, 4000, 800, 200)).toBeCloseTo(1, 4);
  });
  it('sits between the code nominal moment and the hardened ultimate', () => {
    const v = defaults(rcPushover.params);
    expect(sectionPeak(v)).toBeGreaterThan(nominalMoment(v));
    expect(sectionPeak(v)).toBeLessThan(1.2 * nominalMoment(v));
  });
});
