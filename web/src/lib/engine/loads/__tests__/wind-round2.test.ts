import { expect, it } from 'vitest';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type PlanSink, type LoadPlanInput } from '../load-plan';
import { otherStructureWind } from '../wind-other';
import { columns, mesh, remeshWind, windProject, variants, windEndResultants, windResultants, assertWindResultants } from './wind-integration-fixture';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../../wasm-solver';
import type { SolverInput3D } from '../../types-3d';
import type { SolverInput } from '../../types';
import { solidSignCf } from '../../../codes/cirsoc102/other-structures';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { velocityPressure } from '../../../codes/cirsoc102/wind';


const generate = (model: ReturnType<typeof mesh>, region?: number[]) => {
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  planWind({ model, tributaryWidth: 1, wind: { region, enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+x', '-x', '+y', '-y'], directions: { x: true, y: true }, bothSenses: true, caseSet: 'all', service: { enabled: true, v50: 20, mri: 50 } } } as LoadPlanInput, levels, sink);
  expect(sink.blockedKeys).toEqual([]);
  return sink;
};
const hand = (model: ReturnType<typeof mesh>, c: PlanSink['cases'][number]) => {
  const scale = c.type === 'Wa' ? 0.25 : 1;
  const torsion = ['autoLoad.windCase2', 'autoLoad.windCase4'].includes(c.nameKey);
  const k = c.nameKey === 'autoLoad.windCase4' ? 0.563 : ['autoLoad.windCase1', 'autoLoad.windCaseWa', 'autoLoad.windMinimumCase'].includes(c.nameKey) ? 1 : 0.75;
  const es = c.nameParams?.e === '−' ? -1 : 1;
  const dirs = c.nameKey === 'autoLoad.windCase3' || c.nameKey === 'autoLoad.windCase4' ? [String(c.nameParams?.dirX), String(c.nameParams?.dirY)] : [String(c.nameParams?.dir)];
  const nodes = [...model.nodes.values()];
  const minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y)), maxY = Math.max(...nodes.map(n => n.y));
  const length = maxX - minX, width = maxY - minY;
  const cx = (maxX + minX) / 2, cy = (maxY + minY) / 2, polar = length ** 2 + width ** 2;
  return nodes.map(n => {
    let fx = 0, fy = 0;
    for (const dir of dirs) {
      const x = dir.endsWith('X'), sign = dir.startsWith('−') ? -1 : 1;
      const exponent = 2 / 9.8, factor = 0.613 * 2.41 * 0.85 * 40 ** 2 / 750 ** exponent;
      const across = x ? width : length;
      const lee = (x ? length / width : width / length) >= 2 ? 0.3 : 0.5;
      const integral = 0.85 / 1000 * (0.8 * factor * (5 * 5 ** exponent + (6 ** (exponent + 1) - 5 ** (exponent + 1)) / (exponent + 1)) + lee * factor * 6 ** exponent * 6);
      const first = 0.85 / 1000 * (0.8 * factor * (25 / 2 * 5 ** exponent + (6 ** (exponent + 2) - 5 ** (exponent + 2)) / (exponent + 2)) + lee * factor * 6 ** exponent * 18);
      const minimum = c.nameKey === 'autoLoad.windMinimumCase';
      const force = across * (minimum ? 4.5 : integral) * k * scale;
      const share = minimum ? 0.5 : n.z === 6 ? first / (6 * integral) : 1 - first / (6 * integral);
      if (x) fx += sign * force * share / 4; else fy += sign * force * share / 4;
      if (torsion) {
        const mt = force * es * 0.15 * across;
        fx -= mt * (n.y - cy) / polar * share;
        fy += mt * (n.x - cx) / polar * share;
      }
    }
    return { nodeId: n.id, fx, fy, mz: 0 };
  });
};

for (const variant of variants) it(`#2204 integrated eccentric wind stays a plan force couple ${variant}`, () => {
  const model = remeshWind(columns(), variant).model;
  const sink = generate(model);
  expect(sink.cases.length).toBeGreaterThan(0);
  for (const [caseIndex, c] of sink.cases.entries()) {
    const loads = windEndResultants(model, sink.distributed.filter(n => n.caseIndex === caseIndex), sink.nodal.filter(n => n.caseIndex === caseIndex));
    expect(loads.length).toBeGreaterThan(0);
    expect(loads.every(n => n.mz === 0)).toBe(true);
    const reference = remeshWind(columns(), variant === 'rotate' || variant === 'mirror' ? variant : 'base').model;
    assertWindResultants(windResultants(model, [], loads), windResultants(reference, [], hand(reference, c)));
    if (variant !== 'base') continue;
    const expected = hand(model, c);
    for (const n of expected) {
      const actual = loads.filter(p => p.nodeId === n.nodeId);
      for (const key of ['fx', 'fy', 'mz'] as const) expect(actual.reduce((s, p) => s + (p[key] ?? 0), 0)).toBeCloseTo(n[key], 10);
    }
  }
});

function compareWindMemberForces(ids: Iterable<number>, a: { elementId: number }[], b: { elementId: number }[], compare: (x: unknown, y: unknown) => void) {
  const expected = [...ids].sort((a, b) => a - b);
  for (const rows of [a, b]) expect(rows.map(f => f.elementId).sort((a, b) => a - b)).toEqual(expected);
  for (const f of b) { const actual = a.find(p => p.elementId === f.elementId)!;
    for (const [key, value] of Object.entries(f)) if (key.endsWith('Start') || key.endsWith('End')) compare((actual as unknown as Record<string, unknown>)[key], value);
  }
}

for (const missing of ['both-empty', 'both-partial', 'actual', 'reference', 'duplicate', 'extra']) it(`#2220 member-force comparison rejects ${missing}`, () => {
  const row = (elementId: number) => ({ elementId, vStart: 1, vEnd: 0 });
  const complete = [row(1), row(2)];
  const a = missing === 'both-empty' ? [] : missing === 'duplicate' ? [row(1), row(1)] : missing === 'extra' ? [...complete, row(3)] : missing === 'reference' ? complete : [row(1)];
  const b = missing === 'both-empty' ? [] : ['both-partial', 'reference'].includes(missing) ? [row(1)] : complete;
  expect(() => compareWindMemberForces([1, 2], a, b, (x, y) => expect(x).toEqual(y))).toThrow();
});
it('#2220 member-force comparison accepts every model member in either order', () => {
  const rows = [{ elementId: 1, vStart: 1, vEnd: 0 }, { elementId: 2, vStart: 2, vEnd: 0 }];
  compareWindMemberForces([1, 2], rows, rows.toReversed(), (x, y) => expect(x).toEqual(y));
});

const round10 = process.env.RUN_KNOWN_WRONG === '2220' ? it : it.skip;
for (const dimension of ['2d', '3d'] as const) for (const side of ['actual', 'reference', 'both'] as const) for (const defect of ['id-only', 'missing-start', 'missing-end', 'wrong-dimension', 'nan', 'infinity', 'string'] as const) round10(`known wrong result: #2220 force comparison rejects ${dimension} ${side} ${defect}`, () => {
  const components = dimension === '2d' ? ['n', 'v', 'm'] : ['n', 'vy', 'vz', 'mx', 'my', 'mz'];
  const row = { elementId: 1, ...Object.fromEntries(components.flatMap(c => [[`${c}Start`, 1], [`${c}End`, 0]])) };
  const broken: Record<string, unknown> = { ...row };
  if (defect === 'id-only') for (const key of Object.keys(broken)) { if (key !== 'elementId') delete broken[key]; }
  else if (defect === 'wrong-dimension') { delete broken[`${components[1]}Start`]; broken[dimension === '2d' ? 'vyStart' : 'vStart'] = 1; }
  else if (defect.startsWith('missing')) delete broken[`${components[1]}${defect === 'missing-start' ? 'Start' : 'End'}`];
  else broken[`${components[1]}Start`] = defect === 'nan' ? NaN : defect === 'infinity' ? Infinity : '1';
  const a = side === 'reference' ? row : broken as typeof row, b = side === 'actual' ? row : broken as typeof row;
  expect(() => compareWindMemberForces([1], [a], [b], (x, y) => expect(x).toEqual(y))).toThrow();
});

for (const diaphragm of [false, true]) for (const nonlinear of [false, true]) for (const dimension of ['2d', '3d']) it(`#2204 hand wind distribution matches member forces and reactions ${dimension} nonlinear=${nonlinear} diaphragm=${diaphragm}`, () => {
  const model = columns();
  const sink = generate(model);
  for (const [caseIndex, c] of sink.cases.entries()) {
    if (!['autoLoad.windCase2', 'autoLoad.windCase4', 'autoLoad.windCase1', 'autoLoad.windCase3'].includes(c.nameKey)) continue;
    const reference = handMembers(model, c);
    const actual = sink.distributed.filter(n => n.caseIndex === caseIndex);
    const top = [...model.nodes.values()].filter(n => n.z === 6).map(n => n.id);
    const run = (lines: Array<{ elementId: number; a?: number; b?: number; qX?: number; qXJ?: number; qY?: number; qYJ?: number }>) => {
      const input: SolverInput3D = {
        nodes: new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }])),
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', localYx: 0, localYy: 1, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
        materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
        sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]),
        supports: new Map([...model.nodes.values()].filter(n => n.z === 0).map(n => [n.id, { nodeId: n.id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }])),
        loads: lines.map(p => ({ type: 'distributed', data: { elementId: p.elementId, a: p.a, b: p.b, qYI: p.qY ?? 0, qYJ: p.qYJ ?? p.qY ?? 0, qZI: -(p.qX ?? 0), qZJ: -(p.qXJ ?? p.qX ?? 0) } })),
        constraints: diaphragm && dimension === '3d' ? [{ type: 'diaphragm', masterNode: top[0]!, slaveNodes: top.slice(1), plane: 'XY' }] : [],
      };
      if (dimension === '3d') {
        const out = nonlinear ? solvePDelta3D(input).results : solve3D(input);
        if (diaphragm) {
          const rotations = top.map(id => out.displacements.find((d: { nodeId: number; rz: number }) => d.nodeId === id)!.rz);
          for (const rotation of rotations) expect(rotation).toBeCloseTo(rotations[0]!, 12);
          if (c.nameKey === 'autoLoad.windCase2') expect(Math.abs(rotations[0]!)).toBeGreaterThan(0);
        }
        return out;
      }
      const planar: SolverInput = {
        ...input, nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z ?? 0 }])),
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
        supports: new Map([...input.supports].map(([id]) => [id, { id, nodeId: id, type: 'fixed' }])),
        loads: lines.map(p => ({ type: 'distributed', data: { elementId: p.elementId, a: p.a, b: p.b, qI: -(p.qX ?? 0), qJ: -(p.qXJ ?? p.qX ?? 0) } })),
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
    compare(a.reactions, b.reactions);
    compareWindMemberForces(model.elements.keys(), a.elementForces, b.elementForces, compare);
    compare(a.displacements, b.displacements);
  }
});

for (const axis of ['x', 'y'] as const) for (const clearance of [-1e-5, 0, 1, 2 - 1e-5, 2, 2 + 1e-5, 4, 6 - 1e-5, 6, 6 + 1e-5]) it(`#2206 solid sign width excludes supports and clips at clearance ${axis} ${clearance}`, () => {
  const model = mesh([-1, 1].flatMap(sign => [[[0, 3 * sign, 0], [0, sign, 2]], [[0, sign, 2], [0, sign, 6]]]));
  if (axis === 'y') for (const n of model.nodes.values()) { n.x = n.y; n.y = 0; }
  const result = otherStructureWind({ model, structure: { kind: 'solidSign', clearance }, project: windProject, directions: [axis === 'x' ? '+x' : '-y'], tributaryWidth: 1 });
  if (clearance < 0 || clearance >= 6) { expect(result.cases).toEqual([]); expect(result.notes.map(n => n.key)).toContain('wind.other.noSign'); return; }
  const B = clearance < 2 ? 6 - 2 * clearance : 2;
  const line = result.derivation.find(n => n.key === 'wind.other.solidSign')!;
  expect(line.params?.b).toBe(Math.round(B * 100) / 100);
  const cf = solidSignCf(B / (6 - clearance), (6 - clearance) / 6);
  expect(line.params?.cf).toBe(Math.round(cf * 1000) / 1000);
  const a = result.cases.find(c => c.nameParams.c === 'A')!;
  const b = result.cases.find(c => c.nameParams.c === 'B+')!;
  expect(b.nodal.every(p => p.mz === 0)).toBe(true);
  const resultant = (c: typeof a) => windResultants(model, c.distributed.map(p => ({ ...p, q: p.qZ, qJ: p.qZJ })), c.nodal);
  const sumForce = (c: typeof a) => (axis === 'x' ? resultant(c)[0]! : -resultant(c)[1]!);
  const moment = (c: typeof a) => resultant(c)[5]!;
  expect((moment(b) - moment(a)) / sumForce(a)).toBeCloseTo((axis === 'x' ? 1 : -1) * 0.2 * B, 10);
  const area = clearance < 2 ? (B + 2) * (2 - clearance) / 2 + 2 * 4 : B * (6 - clearance);
  const expectedForce = velocityPressure(6, windProject) / 1000 * 0.85 * cf * area;
  expect(sumForce(a)).toBeCloseTo(expectedForce, 10);
  for (const c of result.cases.filter(c => c.nameKey === 'wind.other.signCase')) expect(sumForce(c)).toBeCloseTo(expectedForce, 10);
  expect(line.params?.f).toBe(Math.round(expectedForce * 10) / 10);
  expect(line.params?.f).toBe(Math.round(sumForce(a) * 10) / 10);
});

for (const ratio of [0.999, 1, 1.001]) it(`physical cross-section retains both sides of the plan-couple fallback ${ratio}`, () => {
  const width = Math.sqrt(2e-9) * ratio;
  const model = mesh([[[0, -width / 2, 0], [0, -width / 2, 6]], [[0, width / 2, 0], [0, width / 2, 6]]]);
  const field = windHeightField({ model, axis: 'x', from: 0, to: 6, width: 2, pressure: () => 1 });
  if (ratio < 1) { expect(() => windHeightLoads(field, 1, 0, 0.4)).toThrow('wind.pressure.distributedTorqueUnsupported'); return; }
  const generated = windHeightLoads(field, 1, 0, 0.4);
  const loads = { ...generated, nodal: windEndResultants(model, generated.distributed, generated.nodal) };
  expect(loads.nodal.reduce((sum, p) => sum + p.fx, 0)).toBeCloseTo(12, 10);
  const torque = loads.nodal.reduce((sum, p) => sum - model.nodes.get(p.nodeId)!.y * p.fx + (p.mz ?? 0), 0);
  expect(torque).toBeCloseTo(4.8, 10);
  expect(loads.nodal.some(p => p.mz !== 0)).toBe(ratio < 1);
});

for (const region of [false, true]) it(`#2204 an intermediate node on one carrier cannot collapse the active plan couple region=${region}`, () => {
  const model = columns([0, 4]);
  const original = model.elements.get(1)!;
  const a = model.nodes.get(original.nodeI)!, b = model.nodes.get(original.nodeJ)!;
  const id = model.nodes.size + 1;
  model.nodes.set(id, { id, x: a.x, y: a.y, z: 2 });
  model.elements.set(1, { ...original, nodeJ: id });
  model.elements.set(5, { ...original, id: 5, nodeI: id, nodeJ: b.id });
  const selected = region ? [...model.nodes.values()].filter(n => n.x === 0).map(n => n.id) : undefined;
  const sink = generate(model, selected);
  const coefficient = 0.613 * 2.41 * (5 / 750) ** (2 / 9.8) * 0.85 * 40 ** 2 * 0.85 / 1000;
  for (const [caseIndex, c] of sink.cases.entries()) {
    const actual = windEndResultants(model, sink.distributed.filter(n => n.caseIndex === caseIndex), sink.nodal.filter(n => n.caseIndex === caseIndex));
    const es = c.nameParams?.e === '−' ? -1 : 1;
    const eccentric = ['autoLoad.windCase2', 'autoLoad.windCase4'].includes(c.nameKey);
    const k = c.nameKey === 'autoLoad.windCase4' ? 0.563 : ['autoLoad.windCase2', 'autoLoad.windCase3'].includes(c.nameKey) ? 0.75 : 1;
    const dirs = c.nameKey === 'autoLoad.windCase3' || c.nameKey === 'autoLoad.windCase4' ? [String(c.nameParams?.dirX), String(c.nameParams?.dirY)] : [String(c.nameParams?.dir)];
    for (const n of model.nodes.values()) {
      let fx = 0, fy = 0;
      const loaded = !region || n.x === 0;
      const height = [...model.elements.values()].filter(e => e.nodeI === n.id || e.nodeJ === n.id).reduce((sum, e) => sum + Math.abs(model.nodes.get(e.nodeJ)!.z! - model.nodes.get(e.nodeI)!.z!) / 2, 0);
      for (const d of dirs) {
        const x = d.endsWith('X');
        if (!loaded || region && !x) continue;
        const B = x ? 6 : 12, lee = region || !x ? 0.5 : 0.3;
        const p = c.nameKey === 'autoLoad.windMinimumCase' ? 0.75 : coefficient * (0.8 + lee);
        const f = p * B * height * k * (c.type === 'Wa' ? 0.25 : 1);
        const count = region ? 2 : 4;
        if (x) fx += (d.startsWith('−') ? -1 : 1) * f / count;
        else fy += (d.startsWith('−') ? -1 : 1) * f / count;
        if (eccentric) {
          const mt = es * 0.15 * B * f, ip = region ? 18 : 180;
          fx -= mt * (n.y - 3) / ip;
          fy += mt * (n.x - (region ? 0 : 6)) / ip;
        }
      }
      const rows = actual.filter(p => p.nodeId === n.id);
      expect(rows.reduce((sum, p) => sum + p.fx, 0)).toBeCloseTo(fx, 10);
      expect(rows.reduce((sum, p) => sum + p.fy, 0)).toBeCloseTo(fy, 10);
      expect(rows.reduce((sum, p) => sum + (p.mz ?? 0), 0)).toBe(0);
    }
  }
});

function handMembers(model: ReturnType<typeof mesh>, c: PlanSink['cases'][number]) {
  const scale = c.type === 'Wa' ? 0.25 : 1;
  const torsion = ['autoLoad.windCase2', 'autoLoad.windCase4'].includes(c.nameKey);
  const k = c.nameKey === 'autoLoad.windCase4' ? 0.563 : c.nameKey === 'autoLoad.windCase1' ? 1 : 0.75;
  const es = c.nameParams?.e === '−' ? -1 : 1;
  const dirs = c.nameKey === 'autoLoad.windCase3' || c.nameKey === 'autoLoad.windCase4' ? [String(c.nameParams?.dirX), String(c.nameParams?.dirY)] : [String(c.nameParams?.dir)];
  const lines = [];
  for (const e of model.elements.values()) {
    const n = model.nodes.get(e.nodeI)!;
    const cuts = [0, 5, ...Array.from({ length: 64 }, (_, i) => 5 + (i + 1) / 64)];
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1]!, b = cuts[i]!, length = b - a;
      const endpoints = [0, 0].map(() => ({ fx: 0, fy: 0 }));
      for (const dir of dirs) {
        const x = dir.endsWith('X'), sign = dir.startsWith('−') ? -1 : 1;
        const exponent = 2 / 9.8, factor = 0.613 * 2.41 * 0.85 * 40 ** 2 / 750 ** exponent;
        const powerIntegral = b <= 5 ? 5 ** exponent * length : (b ** (exponent + 1) - a ** (exponent + 1)) / (exponent + 1);
        const firstIntegral = b <= 5 ? 5 ** exponent * (b ** 2 - a ** 2) / 2 : (b ** (exponent + 2) - a ** (exponent + 2)) / (exponent + 2);
        const lee = (x ? 0.3 : 0.5) * 6 ** exponent;
        const force = (0.8 * powerIntegral + lee * length) * factor * 0.85 / 1000;
        const first = (0.8 * firstIntegral + lee * (b ** 2 - a ** 2) / 2) * factor * 0.85 / 1000;
        const mean = force / length, delta = 6 * (first - (a + b) / 2 * force) / length ** 2;
        for (const [j, intensity] of [mean - delta, mean + delta].entries()) {
          const f = intensity * (x ? 6 : 12) * k * scale, p = endpoints[j]!;
          if (x) p.fx += sign * f / 4; else p.fy += sign * f / 4;
          if (torsion) { const torque = f * es * 0.15 * (x ? 6 : 12); p.fx -= torque * (n.y - 3) / 180; p.fy += torque * (n.x - 6) / 180; }
        }
      }
      lines.push({ elementId: e.id, a, b, qX: endpoints[0]!.fx, qXJ: endpoints[1]!.fx, qY: endpoints[0]!.fy, qYJ: endpoints[1]!.fy });
    }
  }
  return lines;
}
