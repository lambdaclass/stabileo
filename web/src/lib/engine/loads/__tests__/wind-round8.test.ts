import { afterAll, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { mesh, remeshWind, variants, windResultants, assertWindResultants } from './wind-integration-fixture';
import { apexEntries, apexSource, apexLoads, apexIntegral, apexPressure } from './wind-round8-fixture';
import { input2DToWireObject, input3DToWireObject, solve, solvePDelta, solve3D, solvePDelta3D } from '../../wasm-solver';
import { computeDiagramValueAt } from '../../diagrams';
import { evaluateDiagramAt } from '../../diagrams-3d';
import { expectWindTips } from './wind-tip-assertions';
import type { SolverInput } from '../../types';
import type { SolverInput3D } from '../../types-3d';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2220' ? it : it.skip;
const nativeCases: Array<Record<string, unknown>> = [];
afterAll(() => {
  if (!nativeCases.length) return;
  for (const candidate of nativeCases) {
    const input = candidate.input as { loads: Array<{ data: Record<string, number> }> };
    candidate.memberLoads = input.loads.map(({ data: p }) => [p.elementId, p.a, p.b, p.qI ?? p.qYI, p.qJ ?? p.qYJ]);
    input.loads = [];
  }
  if (process.env.WIND_APEX_CASES) { writeFileSync(process.env.WIND_APEX_CASES, JSON.stringify(nativeCases) + '\n'); return; }
  const fixtures = JSON.parse(readFileSync(new URL('../../../../../../engine/tests/integration/wind_apex_2220.json', import.meta.url), 'utf8')) as typeof nativeCases;
  for (const candidate of nativeCases) expect(fixtures.find(c => c.kind === candidate.kind && c.variant === candidate.variant && c.dimension === candidate.dimension)).toEqual(JSON.parse(JSON.stringify(candidate)));
});

for (const entry of apexEntries) for (const variant of variants) knownWrong(`known wrong result: #2220 lower apex above clamp ${entry} ${variant}`, () => {
  const { model, sources } = remeshWind(apexSource(), variant), axis = variant === 'rotate' ? 'y' : 'x';
  const lines = apexLoads(model, axis, entry);
  expect([...new Set(lines.map(p => p.elementId))].sort((a, b) => a - b)).toEqual([...model.elements.keys()]);
  const { exponent, factor } = apexPressure(entry);
  const upper = lines.filter(p => sources.get(p.elementId)! > 1);
  const force = 2 * apexIntegral(6, 10, 0, exponent, factor), moment = 2 * apexIntegral(6, 10, 1, exponent, factor);
  assertWindResultants(windResultants(model, upper.map(p => ({ ...p, q: 0 }))), axis === 'x' ? [force, 0, 0, 0, moment, 0] : [0, force, 0, -moment, 0, 0]);
});

for (const end of ['lower', 'upper'] as const) for (const offset of [0, 1e-7]) for (const sign of [-1, 1]) knownWrong(`known wrong result: #2220 physical apex ${end} offset=${offset} sign=${sign}`, () => {
  const model = mesh([-1, 1].map(side => [[0, side * (end === 'lower' ? offset : 1), 6], [0, side * (end === 'lower' ? 1 : offset), 10]]));
  const pressure = (z: number, width: number) => { expect(width).toBeGreaterThan(0); return sign * (end === 'lower' ? z : 16 - z); };
  const loads = windHeightLoads(windHeightField({ model, axis: 'x', from: 6, to: 10, pressure }), 1, 0).distributed;
  expect([...new Set(loads.map(p => p.elementId))]).toEqual([1, 2]);
  expect(loads.every(p => sign * p.qX >= 0 && sign * p.qXJ! >= 0)).toBe(true);
  const force = sign * (104 / 3 + offset * 88 / 3);
  expect(windResultants(model, loads)[0]).toBeCloseTo(force, 10);
});

for (const span of [0.05 - 1e-7, 0.05, 0.05 + 1e-7]) for (const width of [undefined, -1e-7, 0, 1e-7, 2]) knownWrong(`known wrong result: #2220 apex width boundary span=${span} declared=${width}`, () => {
  const model = mesh([-1, 1].map(side => [[0, 0, 6], [0, side * span / 2, 10]]));
  const run = () => windHeightField({ model, axis: 'x', from: 6, to: 10, width, pressure: z => z });
  if (span <= 0.05 && !(width !== undefined && width > 0)) expect(run).toThrow('wind.pressure.missingWidth');
  else {
    const field = run();
    expect([...field.loads.values(), ...field.baseLoads.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(span > 0.05 ? span * 52 / 3 : 32 * width!, 10);
  }
});

for (const entry of apexEntries) for (const variant of variants) for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const sign of [-1, 1]) knownWrong(`known wrong result: #2220 apex mechanics ${entry} ${variant} spatial=${spatial} nonlinear=${nonlinear} sign=${sign}`, () => {
  const { model, sources } = remeshWind(apexSource(), variant), axis = variant === 'rotate' ? 'y' : 'x';
  const lines = apexLoads(model, axis, entry), { exponent, factor } = apexPressure(entry);
  for (const e of model.elements.values()) {
    if (sources.get(e.id) === 1) continue;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z! - a.z!), scale = (b.z! - a.z!) / length;
    const integral = (at: number, power: number) => {
      let result = 0, binomial = 1;
      for (let k = 0; k <= power; k++) {
        result += binomial * (-a.z!) ** (power - k) * apexIntegral(a.z! + at * scale, b.z!, k, exponent, sign * factor) / scale ** power;
        binomial *= (power - k) / (k + 1);
      }
      return result;
    };
    const parts = lines.filter(p => p.elementId === e.id);
    expect(parts.length).toBeGreaterThan(0);
    const component = (p: typeof parts[number], end = false) => sign * (axis === 'x' ? end ? p.qXJ ?? p.qX : p.qX : end ? p.qYJ ?? p.qY : p.qY);
    const common = { materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]) };
    const check = (out: ReturnType<typeof solve> | ReturnType<typeof solve3D>) => {
      expectWindTips(out.displacements, [2], 'ux', (3 * length * integral(0, 2) - integral(0, 3)) / (6 * 200000 * 1000 * 1e-4), 10);
      expect(out.elementForces).toHaveLength(1);
      const f = out.elementForces[0]!;
      for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        const at = t * length, shear = integral(at, 0), moment = integral(at, 1) - at * shear;
        if ('vyStart' in f) {
          expect(evaluateDiagramAt(f, 'shearY', t)).toBeCloseTo(-shear, 10);
          expect(evaluateDiagramAt(f, 'momentZ', t)).toBeCloseTo(-moment, 10);
          expect(evaluateDiagramAt(f, 'torsion', t)).toBeCloseTo(0, 10);
        } else {
          expect(computeDiagramValueAt('shear', t, f)).toBeCloseTo(shear, 10);
          expect(computeDiagramValueAt('moment', t, f)).toBeCloseTo(moment, 10);
        }
      }
    };
    let wire: unknown;
    if (spatial) {
      const input: SolverInput3D = { ...common, nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: length }]]), elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame', localYx: 1, localYy: 0, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]), supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]), loads: parts.map(p => ({ type: 'distributed', data: { elementId: 1, a: p.a, b: p.b, qYI: component(p), qYJ: component(p, true), qZI: 0, qZJ: 0 } })) };
      wire = input3DToWireObject(input); check(nonlinear ? solvePDelta3D(input).results : solve3D(input));
    } else {
      const input: SolverInput = { ...common, nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: length }]]), elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame', hingeStart: false, hingeEnd: false }]]), supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]), loads: parts.map(p => ({ type: 'distributed', data: { elementId: 1, a: p.a, b: p.b, qI: -component(p), qJ: -component(p, true) } })) };
      wire = input2DToWireObject(input); check(nonlinear ? solvePDelta(input).results : solve(input));
    }
    if (variant === 'base' && !nonlinear) nativeCases.push({ kind: `apex:${entry}`, variant: `${e.id}:${sign}`, dimension: spatial ? 3 : 2, axis: 'z', displacement: 'ux', tip: 2, length, heightDensity: { from: a.z, scale, exponent, factor: sign * factor }, input: wire });
  }
});
