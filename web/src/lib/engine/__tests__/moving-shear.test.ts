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

function tipFlexibility(x: number, length: number, ei: number): number {
  return x ** 2 * (3 * length - x) / (6 * ei);
}

function cantileverMinimumShear(
  axles: typeof train.axles, length: number, member: number, tipReaction: (flexibility: number) => number,
): number {
  const start = member - 1, end = member;
  let minimum = 0;
  for (let reference = -Math.max(...axles.map(axle => axle.offset)); reference <= length; reference += step) {
    const positions = axles.map(axle => ({ x: reference + axle.offset, weight: axle.weight }));
    for (const side of [-1, 0, 1]) {
      const active = positions.filter(({ x }) => x >= 0 && x <= length && (x !== 0 || side >= 0) && (x !== length || side <= 0));
      const reaction = tipReaction(active.reduce((sum, axle) => sum + axle.weight * tipFlexibility(axle.x, length, 1), 0));
      const shear = (cut: number, includeAtCut = false) => active.reduce((sum, { x, weight }) => (
        x > cut || (includeAtCut && x === cut) ? sum + weight : sum
      ), -reaction);
      const cuts = [start, ...active.map(({ x }) => x).filter(x => x > start && x < end).sort((a, b) => a - b), end];
      for (let i = 1; i < cuts.length; i++) minimum = Math.min(minimum, shear((cuts[i - 1] + cuts[i]) / 2));
      if (side > 0 && active.some(({ x }) => x === start)) minimum = Math.min(minimum, shear(start, true));
      if (side < 0 && active.some(({ x }) => x === end)) minimum = Math.min(minimum, shear(end));
    }
  }
  return minimum;
}

function inclinedTipReaction(flexibility: number, axialForce: number): number {
  const section = inclinedFixture.sections['6'];
  const e = inclinedFixture.materials['1'].e * 1000;
  const length = inclinedFixture.nodes['7'].x;
  const axial = length / (e * section.a), ei = e * section.iy;
  const { normalX: nx, normalZ: nz } = inclinedFixture.supports['7'];
  return nz * (-nx * axialForce * axial + nz * flexibility / ei)
    / (nx ** 2 * axial + nz ** 2 * tipFlexibility(length, length, ei));
}

function springTipReaction(flexibility: number): number {
  const ei = springFixture.materials['1'].e * 1000 * springFixture.sections['1'].iz;
  const length = springFixture.nodes['7'].x;
  return flexibility / ei / (1 / springFixture.supports['2'].ky + tipFlexibility(length, length, ei));
}

it('#2101 WASM resolves the axle at the inclined support', () => {
  const rotated = rotatedInclined();
  const original: SolverInput3D = {
    ...rotated,
    nodes: byId(inclinedFixture.nodes),
    supports: new Map<number, SolverSupport3D>([
      [1, inclinedFixture.supports['1']],
      [7, inclinedFixture.supports['7']],
    ]),
    loads: [{ type: 'nodal', data: inclinedFixture.loads[0].data }],
  };
  const expected = cantileverMinimumShear(train.axles, inclinedFixture.nodes['7'].x, 6,
    (flexibility) => inclinedTipReaction(flexibility, inclinedFixture.loads[0].data.fx));
  for (const solver of [original, rotated]) {
    for (const constraints of [[], [{ type: 'equalDOF', masterNode: 1, slaveNode: 7, dofs: [5] }]] as SolverInput3D['constraints'][]) {
      const result = solveMovingLoads3D({ solver: { ...solver, constraints }, train, step, pathElementIds: ids });
      expect(result.structuredDiagnostics.every((d: { severity: string }) => d.severity === 'info')).toBe(true);
      expect.soft(result.elements['6'].vzMaxNeg).toBeCloseTo(expected, 9);
    }
  }
});

it('#2104 WASM resolves the axle at the mirrored spring model joint', () => {
  const mirrored = mirroredSpring();
  const original: SolverInput = {
    ...mirrored,
    nodes: byId(springFixture.nodes),
    loads: springFixture.loads.map(({ data }) => ({ type: 'nodal', data })),
  };
  const expected = cantileverMinimumShear(train.axles, springFixture.nodes['7'].x, 2, springTipReaction);
  for (const [solver, reflected] of [[original, false], [mirrored, true]] as const) {
    for (const constraints of [[], [{ type: 'equalDOF', masterNode: 1, slaveNode: 7, dofs: [0] }]] as SolverInput['constraints'][]) {
      const result = solveNative2D({ solver: { ...solver, constraints }, train, step, pathElementIds: ids });
      expect(result.structuredDiagnostics.every((d: { severity: string }) => d.severity === 'info')).toBe(true);
      const member = result.elements['2'];
      expect.soft(reflected ? -member.vMaxPos : member.vMaxNeg).toBeCloseTo(expected, 9);
    }
  }
});

it('#2104 browser sync and async sweeps recover the mirrored spring shear', async () => {
  const solver = mirroredSpring();
  const config = { train: { name: 'single axle', axles: train.axles.slice(0, 1) }, step, pathElementIds: ids };
  const expected = -cantileverMinimumShear(config.train.axles, springFixture.nodes['7'].x, 2, springTipReaction);
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
  const expected = cantileverMinimumShear(single.axles, length, 6, (flexibility) => inclinedTipReaction(flexibility, 0));
  expect(result.elements.get(6)?.vz.min.value).toBeCloseTo(expected, 9);
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

it('#2104 spatial wheel lines retain both member faces at a joint', async () => {
  const solver = { ...rotatedInclined(), loads: [] };
  solver.nodes = new Map();
  solver.elements = new Map();
  solver.supports = new Map();
  for (const line of [0, 1]) {
    for (const x of [0, 1, 2]) {
      const id = line * 3 + x + 1;
      solver.nodes.set(id, { id, x, y: line, z: 0 });
      solver.supports.set(id, { ...inclinedFixture.supports['1'], nodeId: id });
      if (x < 2) {
        const element = line * 2 + x + 1;
        solver.elements.set(element, { ...inclinedFixture.elements['1'], type: 'frame', id: element, nodeI: id, nodeJ: id + 1 });
      }
    }
  }
  const path = buildPath3D(solver, [1, 2])!;
  const path2 = buildPath3D(solver, [3, 4])!;
  const weight = train.axles[0].weight;
  const vehicle = { ...train, axles: [{ weight, offset: 0 }] };
  const checkFaces = (env: Awaited<ReturnType<typeof sweepMovingLoad3D>>, left: number, right: number, load: number) => {
    expect(env.failed).toBe(0);
    const before = env.elements.get(left)!.vz.min;
    const after = env.elements.get(right)!.vz.max;
    expect(before.value).toBeCloseTo(-load, 9);
    expect(after.value).toBeCloseTo(load, 9);
    expect(before).toMatchObject({ x: 1, position: 1 });
    expect(after).toMatchObject({ x: 0, position: 1 });
  };
  checkFaces(await sweepMovingLoad3D(solver, path, vehicle, { step: 1 }), 1, 2, weight);
  const split = await sweepTrains3D(solver, path, [vehicle, vehicle], { step: 1, path2 });
  checkFaces(split, 1, 2, weight / 2);
  checkFaces(split, 3, 4, weight / 2);
});

it('#2101 — endpoint-only spatial sweeps recover axial face limits', async () => {
  const length = 1;
  const weight = 100;
  const train = { name: 'one axle', axles: [{ offset: 0, weight }] };
  for (const vertical of [true, false]) {
    const plane = mirroredSpring();
    const space = rotatedInclined();
    plane.nodes = new Map([
      [1, { id: 1, x: 0, z: 0 }],
      [2, { id: 2, x: vertical ? 0 : length, z: vertical ? length : 0 }],
    ]);
    space.nodes = new Map([...plane.nodes].map(([id, node]) => [id, { ...node, y: 0 }]));
    plane.elements = new Map([[1, plane.elements.get(1)!]]);
    space.elements = new Map([[1, space.elements.get(1)!]]);
    plane.supports = new Map([1, 2].map(id => [id, { id, nodeId: id, type: 'fixed' as const }]));
    space.supports = new Map([1, 2].map(id => [id, { ...inclinedFixture.supports['1'], id, nodeId: id }]));
    plane.loads = [];
    space.loads = [];
    const config = { train, step: length, pathElementIds: [1] };
    const axial = vertical ? weight : 0;
    const nativePlane = solveNative2D({ ...config, solver: plane }).elements['1'];
    const nativeSpace = solveMovingLoads3D({ ...config, solver: space }).elements['1'];
    for (const e of [nativePlane, nativeSpace]) {
      expect.soft(e.nMaxPos).toBeCloseTo(axial, 9);
      expect.soft(e.nMaxNeg).toBeCloseTo(-axial, 9);
    }
    for (const run of [solveMovingLoads, solveMovingLoadsAsync]) {
      const result = await run(plane, config);
      if (typeof result === 'string') throw new Error(result);
      const e = result.elements.get(1)!;
      expect.soft(e.nMaxPos).toBeCloseTo(axial, 9);
      expect.soft(e.nMaxNeg).toBeCloseTo(-axial, 9);
      expect(result.positions).toHaveLength(2);
    }
    const path = buildPath3D(space, [1])!;
    const env = await sweepMovingLoad3D(space, path, train, { step: length });
    const aggregate = await sweepTrains3D(space, path, [train, train], { step: length });
    for (const sweep of [env, aggregate]) {
      const e = sweep.elements.get(1)!;
      expect.soft(e.n.max.value).toBeCloseTo(axial, 9);
      expect.soft(e.n.min.value).toBeCloseTo(-axial, 9);
      expect.soft(e.vy.max.value).toBeCloseTo(0, 9);
      expect.soft(e.vy.min.value).toBeCloseTo(0, 9);
      expect.soft(e.vz.max.value).toBeCloseTo(weight - axial, 9);
      expect.soft(e.vz.min.value).toBeCloseTo(axial - weight, 9);
      if (vertical) {
        expect.soft(e.n.max).toMatchObject({ x: length, position: length });
        expect.soft(e.n.min).toMatchObject({ x: 0, position: 0 });
      }
    }
  }
});
