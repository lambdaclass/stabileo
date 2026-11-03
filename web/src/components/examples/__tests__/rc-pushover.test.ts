import { describe, it, expect, beforeAll } from 'vitest';
import * as engine from '../../../lib/engine/wasm-solver';
import { defaults, type Outcome, type Values } from '../define';
import { rcPushover, build, crackedStiffness, nominalMoment, sectionPeak, layers, concreteModulus } from '../rc-pushover';

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
    const { depth: x, inertia } = crackedStiffness(v);
    expect(v.b * x * x / 2 + (n - 1 + 1) * area * (x - cover)).toBeCloseTo(n * area * (depth - x), 9);
    expect(inertia).toBeGreaterThan(0);
    expect(inertia).toBeLessThan(v.b * v.h ** 3 / 12);
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
    for (const extra of [{}, { target: 1.6 }, { h: 0.7, perFace: 4, fc: 40, steel: 1, target: 1.5 }, { height: 5, barDia: 16 }, { fc: 20, perFace: 4, barDia: 28, target: 1.6 }] as Values[]) {
      const out = run(extra);
      expect(out.stopped).toBeDefined();
      expect(out.stopped!.reason).toMatch(/no convergence|singular/);
      expect(out.stopped!.loadFactor).toBeLessThan(1);
      const peak = readout(out, 'peakShear');
      expect(peak.value / peak.reference!.value).toBeGreaterThan(0.98);
      expect(peak.value / peak.reference!.value).toBeLessThan(1.08);
      expect(peak.value).toBeLessThan(readout(out, 'nominalShear').value * (extra.target ?? 1.3));
      expect(readout(out, 'baseShear').value / peak.value).toBeCloseTo(1, 6);
      expect(readout(out, 'yieldedElements').value).toBeGreaterThan(0);
    }
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
