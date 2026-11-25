import { expect, it } from 'vitest';
import inclinedFixture from '../../../../../engine/tests/fixtures/moving-shear-2101.json';
import springFixture from '../../../../../engine/tests/fixtures/moving-shear-2104.json';
import { solveMovingLoads as solveNative2D, solveMovingLoads3D } from '../wasm-solver';
import { solveMovingLoads, solveMovingLoadsAsync } from '../moving-loads';
import { buildPath3D, sweepMovingLoad3D } from '../moving-loads-3d';
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
  const result = await sweepMovingLoad3D(solver, path, { ...train, axles: train.axles.slice(0, 1) }, { step });
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
});

it('#2101 an imported vehicle applied at the inclined tip uses the endpoint', () => {
  const imported = vehicleFromJson(JSON.stringify({ name: 'single axle', axles: [{ offset: 0, weight: 50 }] }));
  expect(imported).not.toBeNull();
  const path = buildPath3D(rotatedInclined(), ids)!;
  const [load] = trainModelLoads(imported!, 6, path, null, 1);
  expect(load).toMatchObject({ type: 'nodal3d', data: { nodeId: 7, fz: -50, caseId: 1 } });
});
