import { describe, it, expect } from 'vitest';
import * as engine from '../../../lib/engine/wasm-solver';
import { codeToModel } from '../../../lib/model/code/format';
import { EXAMPLES } from '../catalog';
import { EXAMPLE_IDS } from '../ids';
import { defaults, readValues, writeValues, mergeQuery, clampValue, referenceGap, type Outcome, type Values } from '../define';
import { exampleStrings } from '../strings';
import { proCode } from '../editor';
import { beamFrame, EI, build as buildBeam } from '../beam-frame';
import { slab, navierCentre } from '../slab';
import { earthquake, G, DT, DURATION, CYCLES, BEAM, COLUMN, baseShear, timeCertificate } from '../earthquake';

function run(example: typeof EXAMPLES[number], extra: Values = {}): Extract<Outcome, { status: 'ok' }> {
  const v = { ...defaults(example.params), ...extra };
  const out = example.analyses(example.build(v), v, engine);
  if (out.status !== 'ok') throw new Error(`refused: ${out.code} ${out.reason ?? ''}`);
  return out;
}
const readout = (out: Extract<Outcome, { status: 'ok' }>, key: string) => out.readouts.find(r => r.key === key)!;

describe('catalog and contract', () => {
  it('lists the ids the routes and the prerender use', () => {
    expect(EXAMPLES.map(e => e.id)).toEqual([...EXAMPLE_IDS]);
  });
  it('compares against a zero reference by absolute difference', () => {
    expect(referenceGap(81, 80)).toEqual({ value: expect.closeTo(1.25, 12), relative: true });
    expect(referenceGap(-3e-15, 0)).toEqual({ value: 3e-15, relative: false });
    expect(referenceGap(0, 0)).toEqual({ value: 0, relative: false });
  });
  it('reads, clamps and writes the share query', () => {
    const params = beamFrame.params;
    expect(readValues(params, '?span=8&load=12.4&point=1000&system=x')).toEqual({ ...defaults(params), span: 8, load: 12, point: 100 });
    expect(writeValues(params, defaults(params))).toBe('');
    const changed = { ...defaults(params), span: 7.5, supports: 2 };
    expect(readValues(params, writeValues(params, changed))).toEqual(changed);
    expect(clampValue(params[2], 2.26)).toBe(2.5);
    expect(mergeQuery(params, changed, '?e2e=1&span=3')).toBe('?e2e=1&supports=2&span=7.5');
    expect(mergeQuery(params, defaults(params), '?e2e=1&span=3')).toBe('?e2e=1');
  });
  it('has every string in all six languages', () => {
    const keys = Object.keys(exampleStrings.en).sort();
    for (const locale of ['es', 'pt', 'de', 'fr', 'tr']) expect(Object.keys(exampleStrings[locale]).sort()).toEqual(keys);
    for (const e of EXAMPLES) {
      for (const key of ['title', 'subtitle', 'about', 'benchmark']) expect(keys).toContain(`${e.id}.${key}`);
      for (const p of e.params) {
        expect(keys).toContain(`${e.id}.p.${p.key}`);
        for (const o of p.options ?? []) expect(keys).toContain(`${e.id}.o.${o}`);
      }
      const out = run(e);
      for (const r of out.readouts) expect(keys).toContain(`r.${r.key}`);
      for (const c of out.charts) expect(keys).toContain(`c.${c.key}`);
      for (const v of Object.keys(out.views)) expect(keys).toContain(`pane.${v}`);
      for (const n of out.notes) expect(keys).toContain(`note.${n}`);
    }
    for (const code of ['engine', 'noExport', 'notStable', 'noResidual']) expect(keys).toContain(`cert.code.${code}`);
    for (const code of ['engine', 'noLoad', 'nonFinite']) expect(keys).toContain(`refuse.${code}`);
    for (const measure of ['errorBound', 'residual']) expect(keys).toContain(`cert.${measure}`);
  });
});

describe('beam and frame playground', () => {
  it('matches the closed forms of a simply supported beam under uniform load', () => {
    const out = run(beamFrame);
    expect(readout(out, 'maxMoment').value).toBeCloseTo(10 * 36 / 8, 9);
    expect(readout(out, 'maxShear').value).toBeCloseTo(30, 9);
    expect(readout(out, 'maxDeflection').value / (5 * 10 * 6 ** 4 / (384 * EI) * 1000)).toBeCloseTo(1, 9);
    expect(out.certificate.status).toBe('certified');
    const moment = out.charts.find(c => c.key === 'moment')!;
    expect(moment.marker).toBeCloseTo(3, 9);
    expect(Math.max(...moment.points.map(p => p[1]))).toBeCloseTo(45, 9);
  });
  it('matches wL²/12 for a fixed beam and Pab/L for a point load', () => {
    expect(readout(run(beamFrame, { supports: 2, span: 8 }), 'maxMoment').value).toBeCloseTo(10 * 64 / 12, 8);
    const point = run(beamFrame, { load: 0, point: 40, position: 0.25 });
    expect(readout(point, 'maxMoment').value).toBeCloseTo(40 * 1.5 * 4.5 / 6, 9);
    expect(readout(point, 'maxMoment').reference!.value).toBeCloseTo(45, 12);
  });
  it('a fixed and pinned beam has a pin, not a roller, and its fixed-end moment is wL²/8', () => {
    const v = { ...defaults(beamFrame.params), supports: 1, span: 8 };
    expect([...buildBeam(v).supports.values()].map(s => s.type)).toEqual(['fixed', 'pinned']);
    expect(readout(run(beamFrame, { supports: 1, span: 8 }), 'maxMoment').value).toBeCloseTo(10 * 64 / 8, 8);
  });
  it('keeps a portal frame in equilibrium and reports its sway', () => {
    const v = { ...defaults(beamFrame.params), system: 1, supports: 2, point: 20 };
    const model = beamFrame.build(v);
    const results = engine.solve(model);
    expect(results.reactions.reduce((s, r) => s + r.rx, 0)).toBeCloseTo(-20, 8);
    expect(results.reactions.reduce((s, r) => s + r.rz, 0)).toBeCloseTo(60, 8);
    const out = run(beamFrame, { system: 1, supports: 2, point: 20 });
    expect(readout(out, 'drift').value).toBeCloseTo(Math.abs(results.displacements.find(d => d.nodeId === 2)!.ux) * 1000, 9);
    expect(out.charts).toEqual([]);
  });
  it('refuses a model with no load instead of drawing zeros', () => {
    const v = { ...defaults(beamFrame.params), load: 0, point: 0 };
    expect(beamFrame.analyses(beamFrame.build(v), v, engine)).toEqual({ status: 'refused', code: 'noLoad' });
  });
});

describe('slab on columns', () => {
  it('agrees with Navier for a plate on walls', () => {
    const out = run(slab, { supports: 1, bays: 1, spacing: 8, thickness: 0.2, load: 10 });
    const reference = navierCentre(8, 0.2, 10) * 1000;
    expect(readout(out, 'maxDeflection').reference!.value).toBeCloseTo(reference, 12);
    expect(Math.abs(readout(out, 'maxDeflection').value / reference - 1)).toBeLessThan(0.02);
    expect(readout(out, 'totalLoad').value).toBeCloseTo(640, 8);
  });
  it('carries the whole load to the columns, symmetric about the centre', () => {
    const v = { ...defaults(slab.params) };
    const model = slab.build(v);
    const results = engine.solve3D(model);
    expect(results.reactions.reduce((s, r) => s + r.fz, 0)).toBeCloseTo(8 * 12 * 12, 6);
    expect(model.supports.size).toBe(9);
    const uz = new Map(results.displacements.map(d => [d.nodeId, d.uz]));
    const n = model.n;
    const at = (i: number, j: number) => uz.get(j * (n + 1) + i + 1)!;
    expect(at(4, 4)).toBeCloseTo(at(n - 4, n - 4), 12);
    expect(at(4, 4)).toBeCloseTo(at(4, n - 4), 12);
    const out = run(slab);
    expect(readout(out, 'maxDeflection').value).toBeCloseTo(-Math.min(...uz.values()) * 1000, 9);
    expect(readout(out, 'maxDeflection').reference).toBeUndefined();
    expect(out.certificate.status).toBe('certified');
  });
});

function sdofPeak(periodN: number, pga: number, periodG: number): number {
  const wn = 2 * Math.PI / periodN, wg = 2 * Math.PI / periodG, r = wg / wn, ag = pga * G;
  const st = ag / (wn * wn);
  const u = (t: number) => -st / (1 - r * r) * (Math.sin(wg * t) - r * Math.sin(wn * t));
  const v = (t: number) => -st / (1 - r * r) * (wg * Math.cos(wg * t) - r * wn * Math.cos(wn * t));
  const t1 = CYCLES * periodG, u1 = u(t1), v1 = v(t1);
  let max = 0;
  for (let t = 0; t <= DURATION; t += DT / 10) max = Math.max(max, Math.abs(t <= t1 ? u(t) : u1 * Math.cos(wn * (t - t1)) + v1 / wn * Math.sin(wn * (t - t1))));
  return max;
}

describe('earthquake frame', () => {
  it('has the portal frame period of Chopra eq. 1.3.5', () => {
    const v: Values = { ...defaults(earthquake.params), storeys: 1, floorMass: 80 };
    const h = v.storeyHeight, L = v.bay, e = 30000 * 1000;
    const rho = (BEAM.iy / L) / (2 * COLUMN.iy / h);
    const k = 24 * e * COLUMN.iy / h ** 3 * (12 * rho + 1) / (12 * rho + 4);
    const mass = v.floorMass + BEAM.a * L * 2.5 + 2 * 13 / 35 * COLUMN.a * h * 2.5;
    const out = run(earthquake, { storeys: 1, floorMass: 80 });
    expect(Math.abs(readout(out, 'period').value / (2 * Math.PI * Math.sqrt(mass / k)) - 1)).toBeLessThan(0.01);
  });
  it('matches the exact undamped single-storey response to the sine pulse', () => {
    const out = run(earthquake, { storeys: 1, floorMass: 80, damping: 0 });
    const exact = sdofPeak(readout(out, 'period').value, 0.2, 0.5) * 1000;
    expect(Math.abs(readout(out, 'peakRoof').value / exact - 1)).toBeLessThan(0.02);
    expect(out.certificate.status).toBe('certified');
  });
  it('computes base shear from the column forces that balance a static lateral load', () => {
    const v: Values = { ...defaults(earthquake.params), storeys: 1 };
    const model = earthquake.build(v);
    const results = engine.solve3D({ ...model, loads: [3, 4].map(nodeId => ({ type: 'nodal' as const, data: { nodeId, fx: 50, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } })) });
    const histories = new Map(results.displacements.map(d => [d.nodeId, { ux: [d.ux], ry: [d.ry] }]));
    expect(baseShear(model, histories, 0)).toBeCloseTo(100, 6);
    expect(results.reactions.filter(r => r.nodeId <= 2).reduce((s, r) => s + r.fx, 0)).toBeCloseTo(-100, 6);
  });
  it('reports the elastic base shear k·u at the peak, and says it is only the elastic part', () => {
    const v: Values = { ...defaults(earthquake.params), storeys: 1, damping: 0 };
    const model = earthquake.build(v);
    const results = engine.solve3D({ ...model, loads: [3, 4].map(nodeId => ({ type: 'nodal' as const, data: { nodeId, fx: 50, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } })) });
    const k = 100 / results.displacements.find(d => d.nodeId === 3)!.ux;
    const out = run(earthquake, v);
    expect(readout(out, 'peakElasticBaseShear').value / (k * readout(out, 'peakRoof').value / 1000)).toBeCloseTo(1, 2);
    expect(out.notes).toContain('elasticShear');
  });
  it('certifies a time history only with stability and certified residuals', () => {
    expect(timeCertificate(null)).toEqual({ status: 'unavailable', kind: 'timeHistory', code: 'noExport' });
    expect(timeCertificate({ certificate: { stabilityCertified: false, stabilityReason: 'x' } })).toMatchObject({ status: 'uncertified', code: 'notStable' });
    expect(timeCertificate({ certificate: { stabilityCertified: true, residual: null, residualReason: 'y' } })).toMatchObject({ status: 'uncertified', code: 'noResidual', reason: 'y' });
    expect(timeCertificate({ certificate: { stabilityCertified: true, residual: { maxRelEquation: 1e-13 } } })).toEqual({ status: 'certified', kind: 'timeHistory', bound: 1e-13, measure: 'residual' });
    const out = run(earthquake);
    expect(out.certificate).toMatchObject({ status: 'certified', measure: 'residual' });
  });
  it('scales linearly with the ground acceleration and is damped', () => {
    const base = readout(run(earthquake), 'peakRoof').value;
    expect(base).toBeGreaterThan(0);
    expect(readout(run(earthquake, { pga: 0.4 }), 'peakRoof').value / base).toBeCloseTo(2, 9);
    expect(readout(run(earthquake, { damping: 0 }), 'peakRoof').value).toBeGreaterThan(base);
    const out = run(earthquake);
    expect(out.charts.find(c => c.key === 'ground')!.points.length).toBe(DURATION / DT + 1);
    expect(readout(out, 'peakDrift').value).toBeGreaterThan(0);
  });
});

describe('open in editor', () => {
  it('writes model code the editor reads back without errors', () => {
    for (const e of [slab, earthquake]) {
      const model = e.build(defaults(e.params)) as Parameters<typeof proCode>[0];
      const parsed = codeToModel(proCode(model, e.id));
      expect(parsed.errors).toEqual([]);
      expect((parsed.snapshot as { nodes: unknown[] }).nodes.length).toBe(model.nodes.size);
    }
  });
});
