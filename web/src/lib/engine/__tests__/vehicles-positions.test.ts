/**
 * Vehicles, after review: the position cases take every spacing and both ways, as the sweep does,
 * within the cap checked before building; a vehicle file that does not hold together is refused;
 * the second wheel line runs the first one's way and is checked against the gauge.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import { buildSolverInput3D, validateAndSolve3D } from '../solver-service';
import { buildPath3D, sweepTrains3D } from '../moving-loads-3d';
import {
  AASHTO_VEHICLES, MAX_SPACINGS, alignSecondLine, positionCount, positionsAlong, trainModelLoads, vehicleFromJson,
  vehicleProblem, vehicleToJson, vehicleTrains, type Vehicle,
} from '../vehicles';
import { addPositionCases, MAX_POSITION_CASES } from '../../store/moving-cases';
import { buildCriticalStations, extractForcesAtStation } from '../station-forces';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

/** A pin (or a roller along X) that also holds the twist about X. */
function hold(n: number, pin: boolean) {
  modelStore.addSupport(n, 'custom3d' as never, undefined, { dofRestraints: { tx: pin, ty: true, tz: true, rx: true, ry: false, rz: false } });
}
/** A continuous beam along X at `y`, two members a span, supported at each pier unless `free`. */
function beam(spans: number[], y = 0, free = false) {
  const xs = [0];
  for (const s of spans) xs.push(xs.at(-1)! + s / 2, xs.at(-1)! + s);
  const n = xs.map((x) => modelStore.addNode(x, y, 0));
  const ids = n.slice(0, -1).map((a, i) => modelStore.addElement(a, n[i + 1]!));
  if (!free) n.forEach((id, i) => { if (i % 2 === 0) hold(id, i === 0); });
  return ids;
}
/** My over the cases written, at each member's critical stations, as the sweep reads them. */
function casesMy() {
  let max = -Infinity, min = Infinity;
  for (const lc of modelStore.model.loadCases.filter((c) => c.alternatives?.startsWith('move:'))) {
    const loads = modelStore.model.loads.filter((l) => (l.data as { caseId: number }).caseId === lc.id);
    const res = validateAndSolve3D({ ...modelStore.model, loads } as never, false, false);
    if (!res || typeof res === 'string') throw new Error(`${lc.name}: ${String(res)}`);
    for (const ef of res.elementForces) for (const t of buildCriticalStations(ef)) { const v = extractForcesAtStation(ef, t).my; max = Math.max(max, v); min = Math.min(min, v); }
  }
  return { max, min };
}
async function sweepMy(ids: number[], trains: ReturnType<typeof vehicleTrains>, step: number) {
  const base = buildSolverInput3D(modelStore.model as never, false, false)!;
  const env = await sweepTrains3D({ ...base, loads: [] }, buildPath3D(base, ids)!, trains, { step });
  return {
    max: Math.max(...[...env.elements.values()].map((e) => e.my.max.value)),
    min: Math.min(...[...env.elements.values()].map((e) => e.my.min.value)),
  };
}
const HS20 = AASHTO_VEHICLES.find((v) => v.name === 'AASHTO HS20-44')!;
const HL93 = AASHTO_VEHICLES.find((v) => v.name === 'AASHTO HL-93')!;

describe('position cases: every spacing, both ways', () => {
  // The first spacing alone read −205,3 kN·m at the pier of 2 × 8 m for the sweep's −219,4.
  for (const span of [8, 10]) {
    it(`HS20 over 2 × ${span} m: the pier moment is the sweep’s`, async () => {
      const ids = beam([span, span]);
      const trains = vehicleTrains(HS20, 2.5);
      expect(trains).toHaveLength(3);
      const r = addPositionCases(HS20.name, trains, ids, [], 2);
      if (!('cases' in r)) throw new Error(r.error);
      expect(r.cases).toBeLessThanOrEqual(MAX_POSITION_CASES);
      // One group for every spacing and position: a combination takes one of them.
      const tr = modelStore.model.loadCases.filter((c) => c.type === 'Tr');
      expect(tr).toHaveLength(r.cases);
      expect(new Set(tr.map((c) => c.alternatives))).toEqual(new Set(['move:AASHTO HS20-44']));
      const cases = casesMy(), sweep = await sweepMy(ids, trains, 2);
      expect(cases.min / sweep.min).toBeCloseTo(1, 6);
    });
  }

  it('HL-93 over 8 + 16 m, one spacing: the reversed pass too (661,8 for the sweep’s 681,3)', async () => {
    const ids = beam([8, 16]);
    const trains = vehicleTrains({ ...HL93, variable: undefined });
    const r = addPositionCases(HL93.name, trains, ids, [], 1);
    if (!('cases' in r)) throw new Error(r.error);
    // Forward and back: the truck is not symmetric.
    expect(r.cases).toBe(2 * positionsAlong(trains[0]!, 24, 1).length);
    expect(modelStore.model.loadCases.some((c) => /reversed|invers/i.test(c.name))).toBe(true);
    const cases = casesMy(), sweep = await sweepMy(ids, trains, 1);
    expect(cases.max / sweep.max).toBeCloseTo(1, 6);
  });

  it('the cap is checked before building, over every spacing and pass', () => {
    const ids = beam([8, 8]);
    const r = addPositionCases(HS20.name, vehicleTrains(HS20, 0.5), ids, [], 1);
    expect('error' in r).toBe(true);
    expect(modelStore.model.loadCases.filter((c) => c.type === 'Tr')).toHaveLength(0);
    // Counted, not built: a step of a micrometre is read as the least step.
    expect(positionCount({ name: 't', axles: [{ offset: 0, weight: 1 }] }, 16, 1e-6)).toBe(321);
    expect(positionsAlong({ name: 't', axles: [{ offset: 0, weight: 1 }] }, 16, 0)).toHaveLength(17);
  });

  it('a second vehicle’s cases: the combinations multiply, and it is said', () => {
    const ids = beam([8, 8]);
    const tandem = AASHTO_VEHICLES.find((v) => v.name === 'AASHTO HL-93 tandem')!;
    addPositionCases(tandem.name, vehicleTrains(tandem), ids, [], 4);
    const r = addPositionCases('Other', vehicleTrains({ ...tandem, name: 'Other' }), ids, [], 4);
    expect('notes' in r && r.notes.map((n) => n.key)).toContain('moving.groupsMultiply');
  });
});

describe('a vehicle that does not hold together', () => {
  const axles = [{ offset: 0, weight: 10 }, { offset: 4, weight: 20 }];
  const file = (v: unknown) => JSON.stringify({ kind: 'stabileo-vehicle', version: 1, vehicle: v });

  it('is refused from a file', () => {
    // 0 to 100 km made 200 001 trains; a gap before axle 0,5 threw.
    expect(vehicleFromJson(file({ name: 'a', axles, variable: { axle: 1, min: 0, max: 1e5 } }))).toBeNull();
    expect(vehicleFromJson(file({ name: 'a', axles, variable: { axle: 0.5, min: 1, max: 2 } }))).toBeNull();
    expect(vehicleFromJson(file({ name: 'a', axles, variable: { axle: 2, min: 1, max: 2 } }))).toBeNull();
    expect(vehicleFromJson(file({ name: 'a', axles, variable: { axle: 1, min: 3, max: 2 } }))).toBeNull();
    expect(vehicleFromJson(file({ name: 'a', axles, gauge: -1 }))).toBeNull();
    expect(vehicleFromJson(file({ name: 'a', axles, dynamicFactor: 'x' }))).toBeNull();
    expect(vehicleFromJson(file({ name: 'a', axles, dynamicFactor: 0 }))).toBeNull();
    expect(vehicleFromJson(file({ name: 'a', axles: [] }))).toBeNull();
    for (const v of AASHTO_VEHICLES) expect(vehicleFromJson(vehicleToJson(v))).toEqual(v);
  });

  it('says why', () => {
    expect(vehicleProblem({ name: 'a', axles, variable: { axle: 0.5, min: 1, max: 2 } })).toBe('moving.bad.variableAxle');
    expect(vehicleProblem({ name: 'a', axles, variable: { axle: 1, min: 0, max: 2 } })).toBe('moving.bad.variableRange');
    expect(vehicleProblem({ name: 'a', axles, gauge: 0 })).toBe('moving.bad.gauge');
    expect(vehicleProblem({ name: 'a', axles, dynamicFactor: Number.NaN })).toBe('moving.bad.dynamicFactor');
    expect(vehicleProblem({ name: 'a', axles: [{ offset: 0, weight: 0 }] })).toBe('moving.noAxles');
    expect(vehicleProblem({ ...HS20, dynamicFactor: 1.33 })).toBeNull();
  });

  it('its trains: no endless loop on a step of 0, a capped count, a bad gap not run', () => {
    const v: Vehicle = { name: 'a', axles, variable: { axle: 1, min: 4, max: 9 } };
    expect(vehicleTrains(v, 0)).toHaveLength(11);              // the default 0,5 m
    expect(vehicleTrains(v, 1e-9)).toHaveLength(MAX_SPACINGS);  // at least 0,05 m, at most the cap
    expect(vehicleTrains({ ...v, variable: { axle: 0.5, min: 4, max: 9 } })).toHaveLength(1);
  });

  it('a weightless row keeps the variable gap on its axle', () => {
    // The panel dropped it and the gap moved onto the next axle; the row stays and writes nothing.
    const v: Vehicle = { name: 'a', axles: [{ offset: 0, weight: 0 }, { offset: 2, weight: 50 }, { offset: 6, weight: 50 }], variable: { axle: 2, min: 4, max: 5 } };
    const trains = vehicleTrains(v, 1);
    expect(trains.map((tr) => tr.axles[2]!.offset - tr.axles[1]!.offset)).toEqual([4, 5]);
    const ids = beam([16]);
    const base = buildSolverInput3D(modelStore.model as never, false, false)!;
    expect(trainModelLoads(trains[0]!, 4, buildPath3D(base, ids)!, null, 1)).toHaveLength(2);
  });
});

describe('the second wheel line', () => {
  it('picked right to left, it runs the first one’s way: both halves at the same x', () => {
    const ids = beam([16]);
    const ids2 = beam([16], 2);
    const base = buildSolverInput3D(modelStore.model as never, false, false)!;
    const path = buildPath3D(base, ids)!;
    const { path2, notes } = alignSecondLine(base.nodes, path, buildPath3D(base, [...ids2].reverse())!, 1.8);
    const loads = trainModelLoads({ name: 'axle', axles: [{ offset: 0, weight: 100 }] }, 2, path, path2, 1);
    const xOf = (l: (typeof loads)[number]) => {
      const d = l.data as { elementId: number; a: number };
      return modelStore.nodes.get(modelStore.elements.get(d.elementId)!.nodeI)!.x + d.a;
    };
    // It put the halves at 2 m and at 14 m.
    expect(loads.map(xOf)).toEqual([2, 2]);
    expect(notes).toEqual([]);
  });

  it('not the gauge apart, not parallel, not as long: said', () => {
    const ids = beam([16]);
    const far = beam([16], 5, true);
    const n = [modelStore.addNode(0, 1.8, 0), modelStore.addNode(10, 6, 0)];
    const skew = [modelStore.addElement(n[0]!, n[1]!)];
    const short = beam([8], 1.8, true);
    const base = buildSolverInput3D(modelStore.model as never, false, false)!;
    const path = buildPath3D(base, ids)!;
    const keys = (other: number[]) => alignSecondLine(base.nodes, path, buildPath3D(base, other)!, 1.8).notes.map((m) => m.key);
    expect(keys(far)).toEqual(['moving.line2Gauge']);
    expect(keys(skew)).toContain('moving.line2NotParallel');
    expect(keys(short)).toEqual(['moving.line2Length']);
    // Without a gauge, its distance is not checked.
    expect(alignSecondLine(base.nodes, path, buildPath3D(base, far)!, null).notes).toEqual([]);
  });

  it('the position cases take it oriented', () => {
    const ids = beam([16]);
    const ids2 = beam([16], 1.8);
    const r = addPositionCases('axle', [{ name: 'axle', axles: [{ offset: 0, weight: 100 }] }], ids, [...ids2].reverse(), 8, 1.8);
    expect('cases' in r && r.notes).toEqual([]);
    const mid = modelStore.model.loadCases.find((c) => c.name.includes('8.00'))!;
    const loads = modelStore.model.loads.filter((l) => l.data.caseId === mid.id);
    expect(loads.every((l) => l.type === 'nodal3d')).toBe(true);
    const xs = loads.map((l) => modelStore.nodes.get((l.data as { nodeId: number }).nodeId)!.x);
    expect(xs).toEqual([8, 8]);
  });
});
