import { expect, it } from 'vitest';
import { localizeEngineText } from '../../i18n/engine-text';
import inclinedFixture from '../../../../../engine/tests/fixtures/moving-shear-2101.json';
import springFixture from '../../../../../engine/tests/fixtures/moving-shear-2104.json';
import { solveMovingLoads as solveNative2D, solveMovingLoads3D } from '../wasm-solver';
import { solveMovingLoads, solveMovingLoadsAsync } from '../moving-loads';
import { buildPath3D, sweepMovingLoad3D, sweepTrains3D, trainLoads } from '../moving-loads-3d';
import { trainModelLoads, vehicleFromJson } from '../vehicles';
import type { SolverInput } from '../types';
import type { SolverInput3D, SolverSupport3D } from '../types-3d';

const ids = [1, 2, 3, 4, 5, 6];
const step = 0.5;
const train = { name: 'two axles', axles: [{ offset: 0, weight: 50 }, { offset: 1.5, weight: 25 }] };

function byId<T>(object: Record<string, T>): Map<number, T> {
  return new Map(Object.entries(object).map(([id, value]) => [Number(id), value]));
}

function mirroredSpring(): SolverInput {
  return {
    nodes: byId(springFixture._transformedNodes),
    elements: byId(springFixture.elements),
    materials: byId(springFixture.materials),
    sections: byId(springFixture.sections),
    supports: byId(springFixture.supports),
    loads: springFixture.loads.map(({ data }) => ({ type: 'nodal', data: { ...data, fx: -data.fx } })),
  } as SolverInput;
}

function rotatedInclined(): SolverInput3D {
  const [x, y] = inclinedFixture._rotationDirection;
  const angle = Math.atan2(y, x);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const prop = inclinedFixture.supports['7'];
  const { data: axial } = inclinedFixture.loads[0];
  return {
    nodes: byId(inclinedFixture._transformedNodes),
    elements: byId(inclinedFixture.elements),
    materials: byId(inclinedFixture.materials),
    sections: byId(inclinedFixture.sections),
    supports: new Map<number, SolverSupport3D>([
      [1, inclinedFixture.supports['1']],
      [7, { ...prop, normalX: prop.normalX * cos, normalY: prop.normalX * sin }],
    ]),
    loads: [{ type: 'nodal', data: { ...axial, fx: axial.fx * cos, fy: axial.fx * sin } }],
  } as SolverInput3D;
}

it('#2101 WASM resolves the axle at the inclined support', () => {
  for (const constraints of [[], [{ type: 'equalDOF', masterNode: 1, slaveNode: 7, dofs: [5] }]] as SolverInput3D['constraints'][]) {
    const result = solveMovingLoads3D({ solver: { ...rotatedInclined(), constraints }, train, step, pathElementIds: ids });
    expect(result.structuredDiagnostics.every((d: { severity: string }) => d.severity === 'info')).toBe(true);
    expect(result.elements['6'].vzMaxNeg).toBeCloseTo(-47.852317077234325, 9);
  }
});

it('#2104 WASM resolves the axle at the mirrored spring model joint', () => {
  for (const constraints of [[], [{ type: 'equalDOF', masterNode: 1, slaveNode: 7, dofs: [0] }]] as SolverInput['constraints'][]) {
    const result = solveNative2D({ solver: { ...mirroredSpring(), constraints }, train, step, pathElementIds: ids });
    expect(result.structuredDiagnostics.every((d: { severity: string }) => d.severity === 'info')).toBe(true);
    expect(result.elements['2'].vMaxPos).toBeCloseTo(0.865788246268656, 9);
  }
});

it('#2104 browser sync and async sweeps recover the mirrored spring shear', async () => {
  const solver = mirroredSpring();
  const config = { train: { name: 'single axle', axles: train.axles.slice(0, 1) }, step, pathElementIds: ids };
  const rigidity = springFixture.materials['1'].e * 1000 * springFixture.sections['1'].iz;
  const length = springFixture.nodes['7'].x;
  const station = 1.5;
  const flexibility = station ** 2 * (3 * length - station) / (6 * rigidity);
  const expected = config.train.axles[0].weight * flexibility / (1 / springFixture.supports['2'].ky + length ** 3 / (3 * rigidity));
  for (const run of [solveMovingLoads, solveMovingLoadsAsync]) {
    const result = await run(solver, config);
    if (typeof result === 'string') throw new Error(result);
    expect.soft(result.elements.get(2)?.vMaxPos).toBeCloseTo(expected, 9);
  }
});

it('#2101 the browser spatial sweep resolves an axle at the inclined tip', async () => {
  const solver = { ...rotatedInclined(), loads: [] };
  const path = buildPath3D(solver, ids)!;
  const single = { ...train, axles: train.axles.slice(0, 1) };
  expect(trainLoads(solver, path, single, 6)).toEqual([
    { type: 'nodal', data: { nodeId: 7, fx: 0, fy: 0, fz: -single.axles[0].weight, mx: 0, my: 0, mz: 0 } },
  ]);
  const result = await sweepMovingLoad3D(solver, path, single, { step });
  const section = inclinedFixture.sections['6'];
  const e = inclinedFixture.materials['1'].e * 1000;
  const length = inclinedFixture.nodes['7'].x;
  const axial = length / (e * section.a);
  const { normalX: nx, normalZ: nz } = inclinedFixture.supports['7'];
  const x = length - step;
  const freeTip = train.axles[0].weight * x ** 2 * (3 * length - x) / (6 * e * section.iy);
  const support = nz ** 2 * freeTip
    / (nx ** 2 * axial + nz ** 2 * length ** 3 / (3 * e * section.iy));
  expect(result.elements.get(6)?.vz.min.value).toBeCloseTo(-support, 9);
  const tipFlexibility = length ** 3 / (3 * e * section.iy);
  const tipAxial = Math.abs(nx * nz) * single.axles[0].weight * tipFlexibility
    / (nx ** 2 * axial + nz ** 2 * tipFlexibility);
  const { min, max } = result.elements.get(6)!.n;
  const governing = Math.abs(min.value) > Math.abs(max.value) ? min : max;
  expect(governing.position).toBe(6);
  expect(Math.abs(governing.value)).toBeCloseTo(tipAxial, 9);
});

it('#2101 an imported vehicle applied at the inclined tip uses the endpoint', () => {
  const imported = vehicleFromJson(JSON.stringify({ name: 'single axle', axles: [{ offset: 0, weight: 50 }] }));
  expect(imported).not.toBeNull();
  const path = buildPath3D(rotatedInclined(), ids)!;
  const [load] = trainModelLoads(imported!, 6, path, null, 1);
  expect(load).toMatchObject({ type: 'nodal3d', data: { nodeId: 7, fz: -50, caseId: 1 } });
});

it('#2101 — a sampled entrance axle governs planar and spatial shear', async () => {
  const plane = mirroredSpring();
  plane.nodes = new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0.01, z: 0 }]]);
  plane.elements = new Map([[1, plane.elements.get(1)!]]);
  plane.supports = new Map([[2, { id: 2, nodeId: 2, type: 'fixed' }]]);
  plane.loads = [];
  const space = rotatedInclined();
  space.nodes = new Map([...plane.nodes].map(([id, n]) => [id, { ...n, y: 0 }]));
  space.elements = new Map([[1, space.elements.get(1)!]]);
  space.supports = new Map([[2, { ...space.supports.get(1)!, nodeId: 2 }]]);
  space.loads = [];
  const path = buildPath3D(space, [1])!;
  for (const [step, offset, expected] of [[0.1, 1, 100], [0.3, 0.9000000000000001, 100], [0.3, 0.90000000000001, 1]]) {
    const train = { name: 'entrance', axles: [{ offset: 0, weight: 100 }, { offset, weight: 1 }] };
    const config = { train, step, pathElementIds: [1] };
    const nativePlane = solveNative2D({ ...config, solver: plane }).elements['1'];
    expect.soft(Math.max(nativePlane.vMaxPos, -nativePlane.vMaxNeg)).toBeCloseTo(expected, 9);
    const nativeSpace = solveMovingLoads3D({ ...config, solver: space }).elements['1'];
    expect.soft(Math.max(nativeSpace.vzMaxPos, -nativeSpace.vzMaxNeg)).toBeCloseTo(expected, 9);
    for (const run of [solveMovingLoads, solveMovingLoadsAsync]) {
      const result = await run(plane, config);
      if (typeof result === 'string') throw new Error(result);
      const entrance = result.positions[Math.round(offset / step)];
      expect.soft(entrance.results.reactions[0].rz).toBeCloseTo(expected === 100 ? 100 : 0, 9);
      const shear = result.elements.get(1)!;
      expect.soft(Math.max(shear.vMaxPos, -shear.vMaxNeg)).toBeCloseTo(expected, 9);
    }
    const env = await sweepTrains3D(space, path, [train, train], { step });
    expect.soft(env.failed).toBe(0);
    const shear = env.elements.get(1)!.vz;
    expect.soft(Math.max(shear.max.value, -shear.min.value)).toBeCloseTo(expected, 9);
  }
  const limit = 0.01 / (8 * Number.EPSILON);
  for (const [offset, accepted] of [[limit * (1 - Number.EPSILON), true], [limit, false]] as const) {
    const train = { name: 'resolution', axles: [{ offset: 0, weight: 100 }, { offset, weight: 1 }] };
    const config = { train, step: offset, pathElementIds: [1] };
    const message = 'Moving loads: axle position cannot be resolved at a path joint';
    if (accepted) {
      expect(solveNative2D({ ...config, solver: plane }).numPositions).toBe(2);
      expect(solveMovingLoads3D({ ...config, solver: space }).numPositions).toBe(2);
      for (const run of [solveMovingLoads, solveMovingLoadsAsync]) {
        const result = await run(plane, config);
        if (typeof result === 'string') throw new Error(result);
        expect(result.positions).toHaveLength(4);
      }
      const result = await sweepMovingLoad3D(space, path, train, { step: offset });
      expect(result.positions).toBe(4);
    } else {
      expect(() => solveNative2D({ ...config, solver: plane })).toThrow(message);
      expect(() => solveMovingLoads3D({ ...config, solver: space })).toThrow(message);
      for (const run of [solveMovingLoads, solveMovingLoadsAsync]) {
        expect(await run(plane, config)).toBe(localizeEngineText(message));
      }
      await expect(sweepMovingLoad3D(space, path, train, { step: offset })).rejects.toBe(message);
    }
  }
});

it('#2104 — browser loads preserve the reversed member station', async () => {
  const solver = rotatedInclined();
  solver.nodes = new Map([
    [1, { id: 1, x: 0, y: 0, z: 0 }],
    [2, { id: 2, x: 0, y: 0, z: 64 }],
    [3, { id: 3, x: 0.1, y: 0, z: 64 }],
  ]);
  solver.elements = new Map([[1, solver.elements.get(1)!], [2, { ...solver.elements.get(2)!, nodeI: 3, nodeJ: 2 }]]);
  const path = buildPath3D(solver, [1, 2])!;
  const single = { name: 'one axle', axles: [{ offset: 0, weight: 100 }] };
  const station = 0.1 - 0.0625;
  const plane = mirroredSpring();
  plane.nodes = new Map([...solver.nodes].map(([id, { x, z }]) => [id, { id, x, z }]));
  plane.elements = new Map([
    [1, plane.elements.get(1)!],
    [2, { ...plane.elements.get(2)!, nodeI: 3, nodeJ: 2 }],
  ]);
  plane.supports = new Map([2, 3].map((id) => [id, { id, nodeId: id, type: 'fixed' as const }]));
  plane.loads = [];
  for (const run of [solveMovingLoads, solveMovingLoadsAsync]) {
    const result = await run(plane, { train: single, step: 64.0625, pathElementIds: [1, 2] });
    if (typeof result === 'string') throw new Error(result);
    const member = result.positions[1].results.elementForces.find((force) => force.elementId === 2)!;
    expect.soft(member.pointLoads[0].a).toBe(station);
  }
  expect.soft(trainLoads(solver, path, single, 64.0625)[0]).toMatchObject({
    type: 'pointOnElement', data: { elementId: 2, a: station },
  });
  expect.soft(trainModelLoads(single, 64.0625, path, null, 1)[0]).toMatchObject({
    type: 'pointOnElement3d', data: { elementId: 2, a: station },
  });
});
