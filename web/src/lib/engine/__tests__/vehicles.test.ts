/**
 * Vehicles: the AASHTO trucks' axles, the spacings of a variable gap, the dynamic factor, a file
 * round trip, and the static cases by position against the moving-load envelope at the same
 * positions; two wheel lines half and half.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store';
import { initSolver, solve3D } from '../wasm-solver';
import { buildSolverInput3D, buildSolverLoads3D, validateAndSolve3D } from '../solver-service';
import { buildPath3D, sweepMovingLoad3D, sweepTrains3D } from '../moving-loads-3d';
import { AASHTO_VEHICLES, vehicleTrains, vehicleToJson, vehicleFromJson, trainModelLoads, positionsAlong } from '../vehicles';
import { evaluateDiagramAt } from '../diagrams-3d';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

describe('the catalog and its spacings', () => {
  it('HS20-44: 35.6, 142.3 and 142.3 kN, the rear gap from 4.27 to 9.14 m', () => {
    const hs20 = AASHTO_VEHICLES.find((v) => v.name === 'AASHTO HS20-44')!;
    expect(hs20.axles.map((a) => +a.weight.toFixed(1))).toEqual([35.6, 142.3, 142.3]);
    const trains = vehicleTrains({ ...hs20, dynamicFactor: 1.3 }, 0.5);
    expect(trains[0]!.axles[2]!.offset - trains[0]!.axles[1]!.offset).toBeCloseTo(4.267, 3);
    expect(trains.at(-1)!.axles[2]!.offset - trains.at(-1)!.axles[1]!.offset).toBeCloseTo(9.144, 3);
    expect(trains[0]!.axles[1]!.weight).toBeCloseTo(142.34 * 1.3, 1);
    expect(vehicleFromJson(vehicleToJson(hs20))).toEqual(hs20);
    expect(vehicleFromJson('{"nope": 1}')).toBeNull();
  });
});

/** A pin (or a roller along X) that also holds the twist about X. */
function hold(n: number, pin: boolean) {
  modelStore.addSupport(n, 'custom3d' as never, undefined, { dofRestraints: { tx: pin, ty: true, tz: true, rx: true, ry: false, rz: false } });
}

describe('static cases by position', () => {
  /** A two-span continuous beam, 8 + 8 m, along X. */
  function beam() {
    const n = [0, 4, 8, 12, 16].map((x) => modelStore.addNode(x, 0, 0));
    const ids = n.slice(0, -1).map((a, i) => modelStore.addElement(a, n[i + 1]!));
    hold(n[0]!, true); hold(n[2]!, false); hold(n[4]!, false);
    return ids;
  }

  it('their envelope is the moving load’s at the same positions', async () => {
    const ids = beam();
    const base = buildSolverInput3D(modelStore.model as never, false, false)!;
    const path = buildPath3D(base, ids)!;
    const train = vehicleTrains(AASHTO_VEHICLES[4]!)[0]!;
    const env = await sweepMovingLoad3D({ ...base, loads: [] }, path, train, { step: 1 });
    // One case per position, solved as an ordinary case; the forward pass's positions.
    const refs = positionsAlong(train, 16, 1);
    let maxMy = -Infinity, minMy = Infinity;
    for (const r of refs) {
      const loads = trainModelLoads(train, r, path, null, 1);
      const res = validateAndSolve3D({ ...modelStore.model, loads } as never, false, false) as AnalysisResults3D;
      for (const ef of res.elementForces) for (let k = 0; k <= 20; k++) { const v = evaluateDiagramAt(ef, 'momentY', k / 20); maxMy = Math.max(maxMy, v); minMy = Math.min(minMy, v); }
    }
    const envMax = Math.max(...[...env.elements.values()].map((e) => e.my.max.value));
    const envMin = Math.min(...[...env.elements.values()].map((e) => e.my.min.value));
    // The sweep reads critical stations, the cases twenty points a member: at least as far.
    expect(maxMy).toBeGreaterThan(0.98 * envMax);
    expect(minMy).toBeLessThan(0.98 * envMin);
    expect(maxMy).toBeLessThanOrEqual(envMax * 1.0001 + 1e-9);
  });

  it('a model load and the sweep’s solver load at one position solve alike', () => {
    const ids = beam();
    const base = buildSolverInput3D(modelStore.model as never, false, false)!;
    const path = buildPath3D(base, ids)!;
    const train = vehicleTrains(AASHTO_VEHICLES[5]!)[0]!;
    const modelLoads = trainModelLoads(train, 5, path, null, 1);
    const a = validateAndSolve3D({ ...modelStore.model, loads: modelLoads } as never, false, false) as AnalysisResults3D;
    const b = solve3D({ ...base, loads: buildSolverLoads3D(modelStore.model as never, modelLoads, false, false) });
    expect(a.reactions.reduce((s, r) => s + r.fz, 0)).toBeCloseTo(220, 9);
    expect(b.reactions.reduce((s, r) => s + r.fz, 0)).toBeCloseTo(220, 9);
  });

  it('two wheel lines: half of each axle on each path', async () => {
    const ids = beam();
    const m = [0, 4, 8, 12, 16].map((x) => modelStore.addNode(x, 2, 0));
    const ids2 = m.slice(0, -1).map((a, i) => modelStore.addElement(a, m[i + 1]!));
    for (const i of [0, 2, 4]) hold(m[i]!, i === 0);
    const base = buildSolverInput3D(modelStore.model as never, false, false)!;
    const path = buildPath3D(base, ids)!, path2 = buildPath3D(base, ids2)!;
    const train = { name: 'axle', axles: [{ offset: 0, weight: 100 }] };
    const loads = trainModelLoads(train, 4, path, path2, 1);
    expect(loads.map((l) => (l.data as { pz: number }).pz)).toEqual([-50, -50]);
    const env = await sweepTrains3D({ ...base, loads: [] }, path, [train], { step: 4, path2 });
    expect(env.positions).toBeGreaterThan(0);
  });
});
