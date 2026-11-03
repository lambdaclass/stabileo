import { describe, it, expect, beforeAll } from 'vitest';
import * as engine from '../../../lib/engine/wasm-solver';
import { defaults, type Outcome, type Values } from '../define';
import { rcColumn, build as buildColumn, squashLoad, balancedPoint, beta1, tieSpacing } from '../rc-column';
import { outrigger, build as buildOutrigger, closedForm as outriggerClosedForm, coreInertia, CONCRETE_E } from '../outrigger';
import { tower, cantileverRoots, closedForm as towerClosedForm, tube, STEEL } from '../tower';

beforeAll(async () => { await engine.initSolver(); });

type Ok = Extract<Outcome, { status: 'ok' }>;
function run(example: { params: any; build: (v: Values) => any; analyses: (m: any, v: Values, e: typeof engine) => Outcome }, extra: Values = {}): Ok {
  const v = { ...defaults(example.params), ...extra };
  const out = example.analyses(example.build(v), v, engine);
  if (out.status !== 'ok') throw new Error(`refused: ${out.code} ${out.reason ?? ''}`);
  return out;
}
const readout = (out: Ok, key: string) => {
  const r = out.readouts.find(x => x.key === key);
  if (!r) throw new Error(`no readout ${key}`);
  return r;
};
const gap = (out: Ok, key: string) => {
  const r = readout(out, key);
  return Math.abs(r.value / r.reference!.value - 1);
};

describe('rc-column', () => {
  it('squash load equals 0.85 f′c (Ag − Ast) + fy Ast', () => {
    for (const extra of [{}, { b: 0.3, h: 0.6, perFace: 4, barDia: 25, fc: 40, steel: 1 }, { b: 0.25, h: 0.25, perFace: 2, barDia: 12, fc: 20 }] as Values[]) {
      const out = run(rcColumn, extra);
      expect(gap(out, 'squashLoad')).toBeLessThan(1e-9);
    }
  });
  it('the balanced point matches the hand calculation', () => {
    for (const extra of [{}, { b: 0.3, h: 0.8, perFace: 5, barDia: 25, fc: 35, steel: 1 }, { fc: 50 }] as Values[]) {
      const out = run(rcColumn, extra);
      expect(gap(out, 'balancedP')).toBeLessThan(1e-6);
      expect(gap(out, 'balancedM')).toBeLessThan(1e-6);
    }
  });
  it('hand calculation spot check: 400×500, 2×3 Ø20, H-25, ADN 420', () => {
    const m = buildColumn(defaults(rcColumn.params));
    const ast = 6 * Math.PI * 0.02 ** 2 / 4;
    expect(squashLoad(m)).toBeCloseTo((0.85 * 25 * (0.2 - ast) + 420 * ast) * 1000, 6);
    expect(beta1(25)).toBe(0.85);
    expect(beta1(35)).toBeCloseTo(0.80, 12);
    expect(beta1(70)).toBe(0.65);
    const d = 0.25 + (0.25 - 0.04 - 0.01 - 0.01);
    expect(balancedPoint(m).c).toBeCloseTo(d * 0.003 / (0.003 + 420 / 200000), 12);
    expect(tieSpacing(m)).toBeCloseTo(0.24, 12);
  });
  it('utilisation is below one inside the diagram and above it outside', () => {
    expect(readout(run(rcColumn, { pu: 1000, mu: 50 }), 'utilisation').value).toBeLessThan(1);
    expect(readout(run(rcColumn, { pu: 1000, mu: 1200 }), 'utilisation').value).toBeGreaterThan(1);
  });
  it('the diagram reaches the axial cap and the demand point is drawn', () => {
    const out = run(rcColumn);
    const chart = out.charts[0];
    expect(Math.max(...chart.points.map(p => p[1]))).toBeCloseTo(readout(out, 'axialCap').value, 6);
    expect(chart.overlays![0].points).toEqual([[200, 1500]]);
  });
});

describe('outrigger', () => {
  it('top drift without an outrigger is wH⁴/8EI', () => {
    const out = run(outrigger);
    expect(gap(out, 'bareDrift')).toBeLessThan(1e-6);
  });
  it('top drift and column force match the Smith & Coull closed form at every level', () => {
    for (const position of [0.1, 0.3, 0.5, 0.75, 1]) {
      const out = run(outrigger, { position });
      expect(gap(out, 'topDrift')).toBeLessThan(1e-6);
      expect(gap(out, 'columnForce')).toBeLessThan(1e-6);
    }
  });
  it('the sweep reproduces the closed form and its optimum', () => {
    const v = defaults(outrigger.params);
    const out = run(outrigger);
    const sweep = out.charts[0].points;
    expect(sweep).toHaveLength(v.storeys);
    for (const [z, drift] of sweep) expect(drift / (outriggerClosedForm(v, Math.round(z / v.storeyHeight)).drift * 1000)).toBeCloseTo(1, 6);
    const exact = Array.from({ length: v.storeys }, (_, k) => [k + 1, outriggerClosedForm(v, k + 1).drift] as const).reduce((a, b) => b[1] < a[1] ? b : a);
    expect(readout(out, 'bestLevel').value).toBeCloseTo(exact[0] / v.storeys, 12);
  });
  it('a rigid, inextensible outrigger system tends to the classical optimum near 0.455 H from the top', () => {
    const v = { ...defaults(outrigger.params), storeys: 200, columnArea: 1e6 };
    const best = Array.from({ length: v.storeys }, (_, k) => [k + 1, outriggerClosedForm(v, k + 1, 1e12).drift] as const).reduce((a, b) => b[1] < a[1] ? b : a);
    expect(1 - best[0] / v.storeys).toBeCloseTo(0.455, 2);
  });
  it('the load on the core sums to wH', () => {
    const v = defaults(outrigger.params);
    const m = buildOutrigger(v);
    const r = engine.solve(m);
    const total = r.reactions.reduce((s, x) => s + x.rx, 0);
    expect(Math.abs(total)).toBeCloseTo(v.wind * v.storeys * v.storeyHeight, 6);
    expect(coreInertia(9)).toBeCloseTo((9 ** 4 - 8.4 ** 4) / 12, 12);
    expect(CONCRETE_E).toBe(30000);
  });
});

describe('tower', () => {
  it('cantilever roots are the classical ones without a tip mass', () => {
    const [a, b, c] = cantileverRoots(0);
    expect(a).toBeCloseTo(1.875104, 5);
    expect(b).toBeCloseTo(4.694091, 5);
    expect(c).toBeCloseTo(7.854757, 5);
  });
  it('a heavy tip mass tends to the massless-beam spring–mass frequency √(3EI/MH³)', () => {
    const v: Values = { ...defaults(tower.params), topMass: 300 };
    const t = tube(v.diameter, v.thickness), EI = STEEL.e * 1000 * t.i, m = STEEL.density / 1000 * t.a;
    const rayleigh = Math.sqrt(3 * EI / ((v.topMass + 0.2235 * m * v.height) * v.height ** 3)) / (2 * Math.PI);
    expect(towerClosedForm(v).frequencies[0] / rayleigh).toBeCloseTo(1, 2);
  });
  it('frequencies match the frequency equation, with and without a tip mass', () => {
    for (const extra of [{}, { topMass: 50 }, { topMass: 300, height: 100 }, { height: 30, diameter: 2 }] as Values[]) {
      const out = run(tower, extra);
      expect(gap(out, 'f1')).toBeLessThan(1e-4);
      expect(gap(out, 'f2')).toBeLessThan(1e-3);
      expect(gap(out, 'f3')).toBeLessThan(5e-3);
    }
  });
  it('the buckling factor matches π²EI/4H²P', () => {
    for (const extra of [{}, { height: 150, topLoad: 500 }, { diameter: 1, thickness: 8 }] as Values[]) {
      const out = run(tower, extra);
      expect(gap(out, 'bucklingFactor')).toBeLessThan(1e-4);
      expect(gap(out, 'criticalLoad')).toBeLessThan(1e-4);
    }
  });
  it('the buckling certificate brackets the factor', () => {
    const out = run(tower);
    expect(out.certificate.status).toBe('certified');
    if (out.certificate.status === 'certified') expect(out.certificate.bound).toBeLessThan(1e-3);
  });
  it('draws three mode shapes and the buckling mode', () => {
    expect(Object.keys(run(tower).views)).toEqual(['mode1', 'mode2', 'mode3', 'buckling']);
  });
});
