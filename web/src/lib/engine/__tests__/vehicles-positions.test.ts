/**
 * Vehicles, after review: the position cases take every spacing and both ways, as the sweep does,
 * within the cap checked before building; a vehicle file that does not hold together is refused;
 * the second wheel line runs the first one's way and is checked against the gauge.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store';
import { initSolver, solve3D, solveCorotational3D, solvePDelta3D, solvePDelta3DWire } from '../wasm-solver';
import { solve_3d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';
import { finishSolve3D } from '../solve-finish';
import { setWorkerFactoryForTests } from '../solver-pool';
import {
  buildSolverInput3D, solveCombinations3D, solveCombinations3DParallel, validateAndSolve3D, validateAndSolve3DAsync,
} from '../solver-service';
import { buildPath3D, sweepTrains3D, trainLoads } from '../moving-loads-3d';
import {
  AASHTO_VEHICLES, MAX_SPACINGS, alignSecondLine, positionCount, positionsAlong, trainModelLoads, vehicleFromJson,
  vehicleProblem, vehicleToJson, vehicleTrains, type Vehicle,
} from '../vehicles';
import { addPositionCases, MAX_POSITION_CASES } from '../../store/moving-cases';
import { buildCriticalStations, extractForcesAtStation } from '../station-forces';
import type { AnalysisResults3D } from '../types-3d';
import { lumpedNodalForces } from '../advanced-analyses';
import { mainThreadPDelta, nodeGravity, runDirectAnalysis, workerPDelta } from '../direct-analysis';
import { withCaseEffects } from '../case-effects';
import { solveForceMethod3D } from '../force-method/solve-3d';

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

it('#2101 — an imported vehicle keeps an indexed tip sample on both wheel lines', () => {
  const length = 0.1234567894;
  const ids = beam([2 * length]);
  const other = beam([2 * length], 1);
  const imported = vehicleFromJson(JSON.stringify({ name: 'one axle', axles: [{ offset: 0, weight: 100 }] }))!;
  const result = addPositionCases(imported.name, [imported], ids, other, length);
  if (!('cases' in result)) throw new Error(result.error);
  expect(result.cases).toBe(3);
  const last = modelStore.model.loadCases.filter((c) => c.type === 'Tr').at(-1)!;
  const loads = modelStore.model.loads.filter((l) => l.data.caseId === last!.id);
  const tips = [ids, other].map((line) => modelStore.model.elements.get(line[1])!.nodeJ);
  expect(loads.map((load) => [load.type, 'nodeId' in load.data ? load.data.nodeId : undefined, 'fz' in load.data ? load.data.fz : undefined]))
    .toEqual(tips.map((node) => ['nodal3d', node, -50]));
});

function inclinedCantilever(type: 'frame' | 'truss') {
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(3, 0, 4);
  const member = modelStore.addElement(root, tip, type);
  modelStore.addSupport(root, 'fixed3d');
  if (type === 'truss') {
    const braceRoot = modelStore.addNode(7, 0, 1);
    modelStore.addElement(tip, braceRoot, 'truss');
    modelStore.addSupport(braceRoot, 'fixed3d');
    modelStore.addSupport(tip, 'custom3d', undefined, {
      dofRestraints: { tx: false, ty: true, tz: false, rx: true, ry: true, rz: true },
    });
  }
  return member;
}

function useAxleTestWorker(requests: string[]) {
  setWorkerFactoryForTests(() => ({
    onmessage: null,
    onerror: null,
    postMessage(raw) {
      const msg = structuredClone(raw);
      queueMicrotask(() => {
        const reply = (data: unknown) => this.onmessage?.({ data: structuredClone(data) } as MessageEvent);
        if (msg.type === 'init') {
          reply({ type: 'ready' });
          return;
        }
        requests.push(msg.type);
        try {
          const result = msg.type === 'pdelta3d'
            ? solvePDelta3DWire(msg.input, msg.maxIter, msg.tol, solve_pdelta_3d)
            : finishSolve3D(solve_3d(msg.input), msg.input);
          reply({ type: 'result', id: msg.id, result });
        } catch (error) {
          reply({ type: 'result', id: msg.id, error: String(error) });
        }
      });
    },
    terminate() {},
  }));
}

async function checkSavedMidpoint(type: 'frame' | 'truss') {
  const member = inclinedCantilever(type);
  const weight = 10, length = 5, station = length / 2;
  const train = { name: 'one axle', axles: [{ offset: 0, weight }] };
  const base = buildSolverInput3D(modelStore.model)!;
  const path = buildPath3D(base, [member])!;
  expect(addPositionCases(train.name, [train], [member], [], station)).toMatchObject({ cases: 3 });
  const [first, midpoint, last] = modelStore.model.loadCases.filter(c => c.alternatives === 'move:one axle');
  const saved = JSON.parse(JSON.stringify(modelStore.model.loads)) as typeof modelStore.model.loads;
  expect(saved.filter(l => l.data.caseId === first!.id).map(l => l.type)).toEqual(['nodal3d']);
  expect(saved.filter(l => l.data.caseId === last!.id).map(l => l.type)).toEqual(['nodal3d']);
  const loads = saved.filter(l => l.data.caseId === midpoint!.id);
  expect(loads).toHaveLength(1);
  expect(loads[0]).toMatchObject({ type: 'pointOnElement3d', data: { a: station, frame: 'global', pz: -weight } });
  const model = { ...modelStore.model, loads };
  const cuts = (result: Pick<AnalysisResults3D, 'elementForces'> | string | null | undefined) => {
    if (!result || typeof result === 'string') throw new Error(String(result));
    const ef = result.elementForces.find(f => f.elementId === member)!;
    return [0.25, 0.75].map(t => extractForcesAtStation(ef, t).n);
  };
  const sampled = { ...base, loads: trainLoads(base, path, train, station) };
  const sample = cuts(solve3D(sampled));
  expect(sample[0]).toBeCloseTo(-weight * 4 / 5, 9);
  expect(sample[1]).toBeCloseTo(0, 9);

  const expectCuts = (observed: number[], reference = sample) => {
    expect.soft(observed[0]).toBeCloseTo(reference[0]!, 9);
    expect.soft(observed[1]).toBeCloseTo(reference[1]!, 9);
  };
  expectCuts(cuts(validateAndSolve3D(model)));
  expectCuts(cuts(await validateAndSolve3DAsync(model)));
  const combinations = [{ id: 1, name: 'At midpoint', factors: [{ caseId: midpoint!.id, factor: 1 }] }];
  for (const method of ['linear', 'pdelta'] as const) {
    const input = { ...model, analysis: { ...model.analysis, perCombination: method } };
    const reference = method === 'linear' || type === 'frame' ? sample : cuts(solvePDelta3D(sampled).results);
    for (const solve of [solveCombinations3D, solveCombinations3DParallel]) {
      const bundle = await solve(input, [midpoint!], combinations);
      expectCuts(cuts(typeof bundle === 'string' ? bundle : bundle?.perCombo.get(1)), reference);
    }
  }
  if (type === 'truss') {
    const sweepResult = solveCorotational3D(sampled);
    const savedInput = buildSolverInput3D(model)!;
    const { gravity, lateral } = nodeGravity(savedInput, savedInput.loads);
    expect([...gravity.values()]).toHaveLength(2);
    for (const share of gravity.values()) expect(share).toBeCloseTo(weight / 2, 9);
    expect(Math.hypot(lateral.x, lateral.y)).toBeCloseTo(0, 9);
    for (const [fx, fy, fz] of lumpedNodalForces(savedInput).values()) {
      expect(Math.hypot(fx, fy)).toBeCloseTo(0, 9);
      expect(fz).toBeCloseTo(-weight / 2, 9);
    }
    expect(() => solveForceMethod3D(savedInput)).toThrow('axialTrussPoint3d');
    const savedResult = solveCorotational3D(savedInput);
    expect(sweepResult.converged && savedResult.converged).toBe(true);
    expectCuts(cuts(savedResult.results), cuts(sweepResult.results));

    const partial = solveCorotational3D(savedInput, 1);
    expect(partial.converged).toBe(false);
    expect(partial.loadFactor).toBe(0);
    expectCuts(cuts(partial.results), [0, 0]);

    const legacyLoads = loads.map(load => {
      if (load.type !== 'pointOnElement3d') return load;
      const { vehicleAxle, ...data } = load.data;
      expect(vehicleAxle).toBe(true);
      return { ...load, data };
    });
    const legacy = { ...model, loads: legacyLoads };
    expectCuts(cuts(validateAndSolve3D(legacy)));
    for (const end of [0, length]) {
      const endLoads = legacyLoads.map(load => load.type === 'pointOnElement3d'
        ? { ...load, data: { ...load.data, a: end } } : load);
      const endInput = buildSolverInput3D({ ...legacy, loads: endLoads })!;
      expect(endInput.loads.every(load => load.type === 'nodal')).toBe(true);
      expectCuts(cuts(solve3D(endInput)), cuts(solve3D({ ...base, loads: trainLoads(base, path, train, end) })));
    }
    const included = { id: midpoint!.id + 10, name: 'Included axle', type: 'Tr' as const,
      includes: [{ caseId: midpoint!.id, factor: 2 }] };
    const bundle = solveCombinations3D(legacy, [midpoint!, included], [
      { id: 1, name: 'Included axle', factors: [{ caseId: included.id, factor: 1 }] },
    ]);
    expectCuts(cuts(typeof bundle === 'string' ? bundle : bundle?.perCombo.get(1)), sample.map(n => 2 * n));
  }
}

it('#2101 — a saved truss midpoint axle preserves the spatial sweep axial cuts', async () => {
  const requests: string[] = [];
  useAxleTestWorker(requests);
  try {
    await checkSavedMidpoint('truss');
    expect(requests.filter(type => type === 'solve3d')).toHaveLength(2);
    expect(requests.filter(type => type === 'pdelta3d')).toHaveLength(1);
  } finally {
    setWorkerFactoryForTests(null);
  }
});

it('a saved frame midpoint axle preserves the spatial sweep axial cuts', () => checkSavedMidpoint('frame'));

it('#2101 — a saved rolled truss axle has the same gravity in either display convention', async () => {
  const member = inclinedCantilever('truss');
  modelStore.updateElement(member, { rollAngle: 90 });
  const weight = 10, station = 2.5, ratio = 0.002;
  const train = { name: 'one axle', axles: [{ offset: 0, weight }] };
  expect(addPositionCases(train.name, [train], [member], [], station)).toMatchObject({ cases: 3 });
  const midpoint = modelStore.model.loadCases.filter(c => c.alternatives === 'move:one axle')[1]!;
  const model = { ...modelStore.model, loads: modelStore.model.loads.filter(l => l.data.caseId === midpoint.id) };
  const notional = { id: midpoint.id + 10, name: 'Axle notional', type: 'N' as const,
    notional: { sourceCaseId: midpoint.id, ratio, dir: '+X' as const } };
  const combo = { id: 1, name: 'At midpoint', factors: [{ caseId: midpoint.id, factor: 1 }] };
  const worker = workerPDelta(async (wire, maxIter, tol) =>
    solvePDelta3DWire(wire as Parameters<typeof solvePDelta3DWire>[0], maxIter, tol, solve_pdelta_3d));
  const memberEnds = model.elements.get(member)!;
  for (const leftHand of [false, true]) {
    const opts = { leftHand, includeSelfWeight: false };
    const input = buildSolverInput3D(model, false, leftHand)!;
    const { gravity, lateral } = nodeGravity(input, input.loads, leftHand);
    expect.soft(gravity.get(memberEnds.nodeI), `gravity at I, leftHand=${leftHand}`).toBeCloseTo(weight / 2, 9);
    expect.soft(gravity.get(memberEnds.nodeJ), `gravity at J, leftHand=${leftHand}`).toBeCloseTo(weight / 2, 9);
    expect.soft(Math.hypot(lateral.x, lateral.y), `lateral resultant, leftHand=${leftHand}`).toBeCloseTo(0, 9);

    const prepared = withCaseEffects(model, [midpoint, notional], opts);
    const notionalLoads = prepared.loads.filter(l => l.data.caseId === notional.id);
    expect(notionalLoads).toHaveLength(2);
    for (const load of notionalLoads) {
      expect(load.type).toBe('nodal3d');
      if (load.type === 'nodal3d') expect.soft(load.data.fx, `notional case, leftHand=${leftHand}`).toBeCloseTo(ratio * weight / 2, 9);
    }

    for (const run of [mainThreadPDelta, worker]) {
      const result = await runDirectAnalysis(model, [midpoint], [combo], { ...opts, run });
      if (typeof result === 'string') throw new Error(result);
      expect(result.perCombo.has(combo.id)).toBe(true);
      const info = result.info.get(combo.id)!;
      expect.soft(['+X', '-X', '+Y', '-Y'], `notional direction, leftHand=${leftHand}`).toContain(info.notional);
      const reactions = result.perCombo.get(combo.id)!.reactions;
      const forceX = reactions.reduce((sum, reaction) => sum + reaction.fx, 0);
      const forceY = reactions.reduce((sum, reaction) => sum + reaction.fy, 0);
      expect.soft(Math.hypot(forceX, forceY), `notional resultant, leftHand=${leftHand}`).toBeCloseTo(ratio * weight, 9);
    }
  }
});
