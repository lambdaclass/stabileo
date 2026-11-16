import { afterAll, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { windLoadCases } from '../wind-cases';
import { otherStructureWind } from '../wind-other';
import { planWind } from '../load-plan-wind';
import { buildLoadPlan, levelsWithPlanArea, type LoadPlanInput, type PlanSink } from '../load-plan';
import { defaultRegulations } from '../../../codes/roles';
import { solidSignCf } from '../../../codes/cirsoc102/other-structures';
import { velocityPressure } from '../../../codes/cirsoc102/wind';
import { mesh, remeshWind, variants, windAxis, windProject, windResultants } from './wind-integration-fixture';
import { input2DToWireObject, input3DToWireObject, solve, solvePDelta, solve3D, solvePDelta3D } from '../../wasm-solver';
import { computeDiagramValueAt } from '../../diagrams';
import { evaluateDiagramAt } from '../../diagrams-3d';
import type { SolverInput } from '../../types';
import type { SolverInput3D } from '../../types-3d';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2220' ? it : it.skip;
const entries = ['field', 'cases', 'sign', 'planner', 'load-plan'] as const;
const fixtures: Array<Record<string, unknown>> = [];
afterAll(() => {
  if (!fixtures.length) return;
  if (process.env.WIND_ENDPOINT_CASES) { writeFileSync(process.env.WIND_ENDPOINT_CASES, JSON.stringify(fixtures) + '\n'); return; }
  const saved = JSON.parse(readFileSync(new URL('../../../../../../engine/tests/integration/wind_endpoint_2220.json', import.meta.url), 'utf8')) as typeof fixtures;
  for (const candidate of fixtures) expect(saved.find(c => c.kind === candidate.kind && c.variant === candidate.variant && c.dimension === candidate.dimension)).toEqual(JSON.parse(JSON.stringify(candidate)));
});

for (const entry of entries) for (const variant of variants) for (const upper of [false, true]) for (const eccentricSign of [-1, 1]) knownWrong(`known wrong result: #2220 finite endpoint torque ${entry} ${variant} upper=${upper} e=${eccentricSign}`, () => {
  const source = mesh([-1, 1].map(side => [[0, upper ? side : 0, 0], [0, upper ? 0 : side, 4]]));
  const { model, sources, back } = remeshWind(source, variant), axis = variant === 'rotate' ? 'y' : 'x';
  let pressure = 1, eccentricity = eccentricSign * 0.3;
  let lines: ReturnType<typeof windHeightLoads>['distributed'];
  if (entry === 'field' || entry === 'cases') {
    const field = windHeightField({ model, axis, from: 0, to: 4, pressure: () => pressure });
    if (entry === 'field') lines = windHeightLoads(field, axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, eccentricity).distributed;
    else {
      const cases = windLoadCases({ model, axes: [{ ...windAxis, axis, across: 2, pressureField: field }], set: 'all', directions: [axis === 'x' ? '+x' : '+y'], tributaryWidth: 2, speed: windProject.basicSpeed });
      const c = cases.find(c => c.nameKey === 'autoLoad.windCase2' && (c.nameParams.e === '−' ? -1 : 1) === eccentricSign)!;
      expect(c).toBeDefined();
      pressure *= 0.75;
      lines = c.distributed;
    }
  } else if (entry === 'sign') {
    const result = otherStructureWind({ model, structure: { kind: 'solidSign', clearance: 0 }, project: windProject, directions: [axis === 'x' ? '+x' : '+y'], tributaryWidth: 2 });
    expect(result.notes).toEqual([]);
    const c = result.cases.find(c => c.nameKey === 'wind.other.signCase' && c.nameParams.c === (eccentricSign > 0 ? 'B+' : 'B−'))!;
    expect(c).toBeDefined();
    pressure = velocityPressure(4, windProject) / 1000 * 0.85 * solidSignCf(2 / 4, 1);
    eccentricity = eccentricSign * 0.2 * 2;
    lines = c.distributed.map(p => ({ ...p, q: p.qZ }));
  } else {
    const input = { model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: [axis === 'x' ? '+x' : '+y'], caseSet: 'all' } } as LoadPlanInput;
    const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
    let result = sink;
    if (entry === 'load-plan') {
      const regulations = defaultRegulations();
      for (const key of Object.keys(regulations) as Array<keyof typeof regulations>) if (regulations[key].adapterId) regulations[key] = { ...regulations[key], configComplete: true, state: 'applied' };
      result = buildLoadPlan({ ...input, regulations, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false });
    } else planWind(input, levels, sink);
    expect(result.blockedKeys).toEqual([]);
    for (const key of ['autoLoad.windCase2', 'autoLoad.windCase4']) expect(result.cases.some(c => c.nameKey === key)).toBe(true);
    const index = result.cases.findIndex(c => c.nameKey === 'autoLoad.windCase2' && (c.nameParams?.e === '−' ? -1 : 1) === eccentricSign);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(result.nodal.filter(p => p.caseIndex === index)).toEqual([]);
    lines = result.distributed.filter(p => p.caseIndex === index);
    pressure = velocityPressure(4, windProject) / 1000 * 0.85 * (0.8 + 0.5) * 0.75;
  }
  expect([...new Set(lines.map(p => p.elementId))].sort((a, b) => a - b)).toEqual([...model.elements.keys()].sort((a, b) => a - b));
  const totals = windResultants(model, lines, [], back);
  expect(totals[0]).toBeCloseTo(4 * pressure, 10);
  expect(totals[5]).toBeCloseTo(4 * pressure * eccentricity, 10);
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const side = sources.get(e.id) === 1 ? -1 : 1;
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z! - a.z!), scale = (b.z! - a.z!) / length;
    const polynomial = [pressure * scale * ((upper ? 1 - a.z! / 4 : a.z! / 4) - side * eccentricity), pressure * scale ** 2 * (upper ? -1 : 1) / 4];
    const parts = lines.filter(p => p.elementId === e.id);
    expect(parts.length).toBeGreaterThan(0);
    const component = (p: typeof parts[number], end = false) => back(end ? p.qXJ ?? p.qX ?? 0 : p.qX ?? 0, end ? p.qYJ ?? p.qY ?? 0 : p.qY ?? 0)[0];
    for (const p of parts) for (const end of [false, true]) expect(component(p, end)).toBeCloseTo(polynomial[0]! + polynomial[1]! * (end ? p.b! : p.a!), 10);
    const integral = (at: number, power: number) => polynomial.reduce((sum, c, k) => sum + c * (length ** (k + power + 1) - at ** (k + power + 1)) / (k + power + 1), 0);
    const common = { materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]) };
    for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
      let out: ReturnType<typeof solve> | ReturnType<typeof solve3D>, wire: unknown;
      if (spatial) {
        const input: SolverInput3D = { ...common, nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: length }]]), elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame', localYx: 1, localYy: 0, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]), supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]), loads: parts.map(p => ({ type: 'distributed', data: { elementId: 1, a: p.a, b: p.b, qYI: component(p), qYJ: component(p, true), qZI: 0, qZJ: 0 } })) };
        wire = input3DToWireObject(input);
        out = nonlinear ? solvePDelta3D(input).results : solve3D(input);
      } else {
        const input: SolverInput = { ...common, nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: length }]]), elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame', hingeStart: false, hingeEnd: false }]]), supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]), loads: parts.map(p => ({ type: 'distributed', data: { elementId: 1, a: p.a, b: p.b, qI: -component(p), qJ: -component(p, true) } })) };
        wire = input2DToWireObject(input);
        out = nonlinear ? solvePDelta(input).results : solve(input);
      }
      expect(out.elementForces.map(f => f.elementId)).toEqual([1]);
      expect(out.displacements.find(d => d.nodeId === 2)!.ux).toBeCloseTo((3 * length * integral(0, 2) - integral(0, 3)) / (6 * 200000 * 1000 * 1e-4), 10);
      const force = out.elementForces[0]!;
      for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        const at = t * length, shear = integral(at, 0), moment = integral(at, 1) - at * shear;
        if ('vyStart' in force) {
          expect(evaluateDiagramAt(force, 'shearY', t)).toBeCloseTo(-shear, 10);
          expect(evaluateDiagramAt(force, 'momentZ', t)).toBeCloseTo(-moment, 10);
          expect(evaluateDiagramAt(force, 'torsion', t)).toBeCloseTo(0, 10);
        } else {
          expect(computeDiagramValueAt('shear', t, force)).toBeCloseTo(shear, 10);
          expect(computeDiagramValueAt('moment', t, force)).toBeCloseTo(moment, 10);
        }
      }
      if (variant === 'base' && !nonlinear) fixtures.push({ kind: `endpoint:${entry}`, variant: `${upper}:${eccentricSign}:${side}`, dimension: spatial ? 3 : 2, axis: 'z', displacement: 'ux', tip: 2, length, polynomial, input: wire });
    }
  }
});
