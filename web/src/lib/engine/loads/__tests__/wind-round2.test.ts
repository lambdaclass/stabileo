import { expect, it } from 'vitest';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type PlanSink, type LoadPlanInput } from '../load-plan';
import { otherStructureWind } from '../wind-other';
import { columns, mesh, remeshWind, windProject, variants } from './wind-integration-fixture';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../../wasm-solver';
import type { SolverInput3D } from '../../types-3d';
import type { SolverInput } from '../../types';
import { solidSignCf } from '../../../codes/cirsoc102/other-structures';
import { velocityPressure } from '../../../codes/cirsoc102/wind';

const wrongWall = process.env.RUN_KNOWN_WRONG === '2204' ? it : it.skip;
const wrongSign = process.env.RUN_KNOWN_WRONG === '2206' ? it : it.skip;
const generate = (model: ReturnType<typeof mesh>) => {
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+x', '-x', '+y', '-y'], directions: { x: true, y: true }, bothSenses: true, caseSet: 'all', service: { enabled: true, v50: 20, mri: 50 } } } as LoadPlanInput, levels, sink);
  expect(sink.blockedKeys).toEqual([]);
  return sink;
};
const hand = (model: ReturnType<typeof mesh>, c: PlanSink['cases'][number]) => {
  const scale = c.type === 'Wa' ? 0.25 : 1;
  const torsion = ['autoLoad.windCase2', 'autoLoad.windCase4'].includes(c.nameKey);
  const k = c.nameKey === 'autoLoad.windCase4' ? 0.563 : ['autoLoad.windCase1', 'autoLoad.windCaseWa', 'autoLoad.windMinimumCase'].includes(c.nameKey) ? 1 : 0.75;
  const es = c.nameParams?.e === '−' ? -1 : 1;
  const dirs = c.nameKey === 'autoLoad.windCase3' || c.nameKey === 'autoLoad.windCase4' ? [String(c.nameParams?.dirX), String(c.nameParams?.dirY)] : [String(c.nameParams?.dir)];
  return [...model.nodes.values()].map(n => {
    let fx = 0, fy = 0;
    for (const dir of dirs) {
      const x = dir.endsWith('X'), sign = dir.startsWith('−') ? -1 : 1;
      const exponent = 2 / 9.8, factor = 0.613 * 2.41 * 0.85 * 40 ** 2 / 750 ** exponent;
      const lee = x ? 0.3 : 0.5;
      const integral = 0.85 / 1000 * (0.8 * factor * (5 * 5 ** exponent + (6 ** (exponent + 1) - 5 ** (exponent + 1)) / (exponent + 1)) + lee * factor * 6 ** exponent * 6);
      const first = 0.85 / 1000 * (0.8 * factor * (25 / 2 * 5 ** exponent + (6 ** (exponent + 2) - 5 ** (exponent + 2)) / (exponent + 2)) + lee * factor * 6 ** exponent * 18);
      const minimum = c.nameKey === 'autoLoad.windMinimumCase';
      const force = (x ? 6 : 12) * (minimum ? 4.5 : integral) * k * scale;
      const share = minimum ? 0.5 : n.z === 6 ? first / (6 * integral) : 1 - first / (6 * integral);
      if (x) fx += sign * force * share / 4; else fy += sign * force * share / 4;
      if (torsion) {
        const mt = force * es * 0.15 * (x ? 6 : 12);
        fx -= mt * (n.y - 3) / 180 * share;
        fy += mt * (n.x - 6) / 180 * share;
      }
    }
    return { nodeId: n.id, fx, fy, mz: 0 };
  });
};

for (const variant of variants) wrongWall(`known wrong result: #2204 integrated eccentric wind stays a plan force couple ${variant}`, () => {
  const model = remeshWind(columns(), variant).model;
  const sink = generate(model);
  for (const [caseIndex, c] of sink.cases.entries()) {
    const loads = sink.nodal.filter(n => n.caseIndex === caseIndex);
    expect(loads.every(n => n.mz === 0)).toBe(true);
    if (variant !== 'base') continue;
    const expected = hand(model, c);
    for (const n of expected) {
      const actual = loads.filter(p => p.nodeId === n.nodeId);
      for (const key of ['fx', 'fy', 'mz'] as const) expect(actual.reduce((s, p) => s + (p[key] ?? 0), 0)).toBeCloseTo(n[key], 10);
    }
  }
});

for (const diaphragm of [false, true]) for (const nonlinear of [false, true]) for (const dimension of ['2d', '3d']) wrongWall(`known wrong result: #2204 hand wind distribution matches member forces and reactions ${dimension} nonlinear=${nonlinear} diaphragm=${diaphragm}`, () => {
  const model = columns();
  const sink = generate(model);
  for (const [caseIndex, c] of sink.cases.entries()) {
    if (!['autoLoad.windCase2', 'autoLoad.windCase4', 'autoLoad.windCase1', 'autoLoad.windCase3'].includes(c.nameKey)) continue;
    const reference = hand(model, c);
    const actual = sink.nodal.filter(n => n.caseIndex === caseIndex);
    const top = [...model.nodes.values()].filter(n => n.z === 6).map(n => n.id);
    const run = (points: typeof reference) => {
      const input: SolverInput3D = {
        nodes: new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }])),
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', localYx: 0, localYy: 1, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
        materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
        sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]),
        supports: new Map([...model.nodes.values()].filter(n => n.z === 0).map(n => [n.id, { nodeId: n.id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }])),
        loads: points.map(p => ({ type: 'nodal', data: { ...p, fz: 0, mx: 0, my: 0 } })),
        constraints: diaphragm && dimension === '3d' ? [{ type: 'diaphragm', masterNode: top[0]!, slaveNodes: top.slice(1), plane: 'XY' }] : [],
      };
      if (dimension === '3d') return nonlinear ? solvePDelta3D(input).results : solve3D(input);
      const planar: SolverInput = {
        ...input, nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z ?? 0 }])),
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
        supports: new Map([...input.supports].map(([id]) => [id, { id, nodeId: id, type: 'fixed' }])),
        loads: points.map(p => ({ type: 'nodal', data: { nodeId: p.nodeId, fx: p.fx, fz: 0, my: 0 } })),
      };
      return nonlinear ? solvePDelta(planar).results : solve(planar);
    };
    const a = run(actual), b = run(reference);
    expect(a).toBeDefined(); expect(b).toBeDefined();
    const compare = (x: unknown, y: unknown) => {
      if (typeof y === 'number') expect(x).toBeCloseTo(y, 8);
      else if (Array.isArray(y)) { expect(x).toHaveLength(y.length); y.forEach((v, i) => compare((x as unknown[])[i], v)); }
      else if (y && typeof y === 'object') for (const [key, value] of Object.entries(y)) compare((x as Record<string, unknown>)[key], value);
      else expect(x).toEqual(y);
    };
    compare(a.reactions, b.reactions); compare(a.elementForces, b.elementForces);
  }
});

for (const axis of ['x', 'y'] as const) for (const clearance of [0, 1, 2 - 1e-5, 2, 2 + 1e-5, 4, 6 - 1e-5, 6, 6 + 1e-5]) wrongSign(`known wrong result: #2206 solid sign width excludes supports and clips at clearance ${axis} ${clearance}`, () => {
  const model = mesh([-1, 1].flatMap(sign => [[[0, 3 * sign, 0], [0, sign, 2]], [[0, sign, 2], [0, sign, 6]]]));
  if (axis === 'y') for (const n of model.nodes.values()) { n.x = n.y; n.y = 0; }
  const result = otherStructureWind({ model, structure: { kind: 'solidSign', clearance }, project: windProject, directions: [axis === 'x' ? '+x' : '-y'], tributaryWidth: 1 });
  if (clearance >= 6) { expect(result.cases).toEqual([]); expect(result.notes.map(n => n.key)).toContain('wind.other.noSign'); return; }
  const B = clearance < 2 ? 6 - 2 * clearance : 2;
  const line = result.derivation.find(n => n.key === 'wind.other.solidSign')!;
  expect(line.params?.b).toBe(Math.round(B * 100) / 100);
  const cf = solidSignCf(B / (6 - clearance), (6 - clearance) / 6);
  expect(line.params?.cf).toBe(Math.round(cf * 1000) / 1000);
  const a = result.cases.find(c => c.nameParams.c === 'A')!;
  const b = result.cases.find(c => c.nameParams.c === 'B+')!;
  const sumForce = (c: typeof a) => c.nodal.reduce((s, p) => s + (axis === 'x' ? p.fx : -p.fy), 0);
  const moment = (c: typeof a) => c.nodal.reduce((s, p) => { const n = model.nodes.get(p.nodeId)!; return s + n.x * p.fy - n.y * p.fx + p.mz; }, 0);
  expect((moment(b) - moment(a)) / sumForce(a)).toBeCloseTo((axis === 'x' ? 1 : -1) * 0.2 * B, 10);
  if (clearance >= 2) expect(sumForce(a)).toBeCloseTo(velocityPressure(6, windProject) / 1000 * 0.85 * cf * B * (6 - clearance), 10);
});
