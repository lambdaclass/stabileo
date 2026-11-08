import { describe, it, expect } from 'vitest';
import { elasticFromDisplay, elasticToDisplay, materialToWire, sectionToWire, section3DToWire, modulusInternal, nodeToWire, node3DToWire, loadToWire, load3DToWire, supportToWire, support3DToWire, element3DToWire, plateThermalToWire, pressureToWire, quadEdgeToWire } from '../unit-types';
import { convertThermalQuadLoad } from '../solver-shells';
import { unitInputCommit } from '../../utils/unit-input';
import { fromDisplay, toDisplay, UNIT_SYSTEMS } from '../../utils/units';
import { input2DToWireObject, input3DToWireObject, solve } from '../wasm-solver';
import type { SolverInput, SolverLoad } from '../types';
import type { SolverInput3D, SolverLoad3D, SolverSection3D } from '../types-3d';
const input = (): SolverInput => ({
  nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 3, z: 0 }]]),
  materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iz: 0.0001 }]]),
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
  loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
});
describe('elastic unit boundary', () => {
  for (const system of UNIT_SYSTEMS) {
    it(`preserves existing conversion arithmetic in ${system}`, () => {
      for (const q of ['stress', 'sectionArea', 'sectionInertia'] as const) {
        const value = elasticFromDisplay(123.456, q, system);
        expect(value).toBe(fromDisplay(123.456, q, system));
        expect(elasticToDisplay(value, q, system)).toBe(toDisplay(value, q, system));
      }
    });
  }
  it('keeps numeric wire fields, optional shear area and extension properties', () => {
    const m = { id: 9, e: 200000, nu: 0.3 };
    const s = { id: 7, name: 'test', a: 0.01, iz: 0.0001, asY: 0.006, extension: 12 };
    expect(materialToWire(m)).toStrictEqual(m);
    expect(sectionToWire(s)).toStrictEqual(s);
    expect(sectionToWire({ id: 1, a: 0.01, iz: 0.0001 })).not.toHaveProperty('asY');
    expect(modulusInternal(materialToWire(m).e)).toBe(200000000);
    const wire = input2DToWireObject(input());
    expect(wire.materials['1']).toStrictEqual({ id: 1, e: 200000, nu: 0.3 });
    expect(wire.sections['1']).toStrictEqual({ id: 1, a: 0.01, iz: 0.0001 });
  });
  it('display → canonical → wire → WASM gives identical full results', () => {
    const canonical = input();
    const converted = input();
    converted.materials.get(1)!.e = elasticFromDisplay(200000, 'stress', 'SImm');
    converted.sections.get(1)!.a = elasticFromDisplay(10000, 'sectionArea', 'SImm');
    converted.sections.get(1)!.iz = elasticFromDisplay(100000000, 'sectionInertia', 'SImm');
    expect(solve(converted)).toEqual(solve(canonical));
  });
});

describe('3D elastic unit boundary', () => {
  const sections: SolverSection3D[] = [
    { id: 1, name: 'C', a: 0.0137, iy: 0.000173, iz: 0.0001234567, j: 1.7e-6, cw: 3.3e-9, asY: 0.006127, asZ: 0.0041, shearCenterY: -0.0213, shearCenterZ: 1e-17 },
    { shearCenterZ: -0, id: 2, a: 0.01, j: 0, iy: 1e-4, iz: 2e-4, asY: undefined, bucklingCw: 4e-9, torsionGap: 'shearCentre' },
    { id: 3, a: 0.02, iy: 3e-4, iz: 1e-4, j: 2e-5, bucklingCw: 1e-8 },
    { id: 4, a: 0.02, iy: 3e-4, iz: 1e-4, j: 2e-5, asZ: null as unknown as number, torsionGap: 'j' },
  ];
  const input3D = (): SolverInput3D => ({
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }], [2, { id: 2, e: 27123.456789, nu: 0.2, fy: 355 } as never]]),
    sections: new Map(sections.map((s) => [s.id, s])),
    elements: new Map(),
    supports: new Map(),
    loads: [],
  });
  const legacyWire = (input: SolverInput3D) => ({
    materials: Object.fromEntries(Array.from(input.materials, ([id, m]) => [String(id), m])),
    sections: Object.fromEntries(Array.from(input.sections, ([id, s]) => {
      const { bucklingCw: _cw, torsionGap: _gap, ...wire } = s;
      return [String(id), wire];
    })),
  });
  it('sends the same JSON text, key order and absent keys as before', () => {
    const wire = input3DToWireObject(input3D());
    const legacy = legacyWire(input3D());
    expect(JSON.stringify(wire.materials)).toBe(JSON.stringify(legacy.materials));
    expect(JSON.stringify(wire.sections)).toBe(JSON.stringify(legacy.sections));
    for (const id of Object.keys(legacy.sections)) {
      expect(Object.keys(wire.sections[id])).toStrictEqual(Object.keys(legacy.sections[id]));
      expect(wire.sections[id]).toStrictEqual(legacy.sections[id]);
    }
    expect(Object.is(wire.sections['2'].shearCenterZ, -0)).toBe(true);
    expect(wire.sections['3']).not.toHaveProperty('cw');
    expect(wire.sections['2']).not.toHaveProperty('torsionGap');
  });
  it('adapts a section without converting, rounding or adding keys', () => {
    const s = { id: 1, a: 0.01, iy: 1e-4, iz: 2e-4, j: 1e-5 };
    expect(section3DToWire(s)).toStrictEqual(s);
    expect(Object.keys(section3DToWire(s))).toStrictEqual(Object.keys(s));
  });
});

const keyPaths = (value: unknown, path = ''): string[] =>
  value !== null && typeof value === 'object'
    ? Object.keys(value).flatMap((k) => [`${path}.${k}`, ...keyPaths((value as Record<string, unknown>)[k], `${path}.${k}`)])
    : [];

describe('node and load unit boundary', () => {
  const loads2D = (): SolverLoad[] => [
    { type: 'nodal', data: { nodeId: 2, fx: 1.25, fz: -10, my: 0.3 } },
    { type: 'nodal', data: { my: -0, nodeId: 3, fx: -0, fz: 7.1, caseId: 4 } as never },
    { type: 'pointOnElement', data: { elementId: 1, a: 1.1, p: -4.4, px: 0.7, my: 1.9 } },
    { type: 'pointOnElement', data: { elementId: 1, a: 0.4, p: 3, px: undefined } },
    { type: 'distributed', data: { elementId: 1, qI: -5, qJ: -2 } },
    { type: 'thermal', data: { elementId: 1, dtUniform: 10, dtGradient: 0 } },
    { type: 'gravity', data: { g: 9.81 } } as never,
  ];
  const loads3D = (): SolverLoad3D[] => [
    { type: 'nodal', data: { nodeId: 2, fx: 1, fy: -10, fz: 2.5, mx: 0.3, my: -0, mz: 0, axialOf: { elementId: 1, end: 'j', p: 3 }, tendonOf: 2 } },
    { type: 'nodal', data: { bw: -0, nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } },
    { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, bw: 0.02 } },
    { type: 'pointOnElement', data: { pz: -1e-9, elementId: 1, a: 0, py: 3 } },
    { type: 'distributed', data: { elementId: 1, qYI: -5, qYJ: -2, qZI: 0, qZJ: 1 } },
    { type: 'quadPressure', data: { elementId: 1, pressure: 2 } } as never,
  ];
  const model2D = (): SolverInput => ({
    ...input(),
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { z: -0, id: 2, x: 3.14159 }], [10, { id: 10, x: 1e-17, z: 6 }]]),
    loads: loads2D(),
  });
  const model3D = (): SolverInput3D => ({
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { z: -0, id: 2, x: 3.14159, y: 0.1 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-5 }]]),
    elements: new Map(),
    supports: new Map(),
    loads: loads3D(),
  });
  const legacy = (input: { nodes: Map<number, unknown>; loads: unknown[] }) => ({
    nodes: Object.fromEntries(Array.from(input.nodes, ([id, n]) => [String(id), n])),
    loads: input.loads,
  });
  it('sends the same 2D node and load JSON text, keys and signed zeros as before', () => {
    const wire = input2DToWireObject(model2D());
    const before = legacy(model2D());
    expect(JSON.stringify(wire.nodes)).toBe(JSON.stringify(before.nodes));
    expect(JSON.stringify(wire.loads)).toBe(JSON.stringify(before.loads));
    expect(keyPaths(wire.nodes)).toStrictEqual(keyPaths(before.nodes));
    expect(keyPaths(wire.loads)).toStrictEqual(keyPaths(before.loads));
    expect(wire.nodes).toStrictEqual(before.nodes);
    expect(wire.loads).toStrictEqual(before.loads);
    expect(Object.is(wire.nodes['2'].z, -0)).toBe(true);
    expect(Object.hasOwn(wire.loads[3].data, 'px')).toBe(true);
    expect(wire.loads[1].data).toHaveProperty('caseId', 4);
  });
  it('sends the same 3D node and load JSON text, keys and signed zeros as before', () => {
    const wire = input3DToWireObject(model3D());
    const before = legacy(model3D());
    expect(JSON.stringify(wire.nodes)).toBe(JSON.stringify(before.nodes));
    expect(JSON.stringify(wire.loads)).toBe(JSON.stringify(before.loads));
    expect(keyPaths(wire.nodes)).toStrictEqual(keyPaths(before.nodes));
    expect(keyPaths(wire.loads)).toStrictEqual(keyPaths(before.loads));
    expect(wire.nodes).toStrictEqual(before.nodes);
    expect(wire.loads).toStrictEqual(before.loads);
    expect(Object.is(wire.nodes['2'].z, -0)).toBe(true);
    const nodal = wire.loads[0];
    expect(nodal.type === 'nodal' && Object.is(nodal.data.my, -0)).toBe(true);
    const bimoment = wire.loads[1];
    expect(bimoment.type === 'nodal' && Object.is(bimoment.data.bw, -0)).toBe(true);
    expect(Object.keys(wire.loads[1].data)[0]).toBe('bw');
    expect(wire.loads[0].data).not.toHaveProperty('bw');
  });
  it('adapts nodes and loads without converting, rounding, adding keys or touching the stored model', () => {
    const node = { id: 1, x: 0.1, z: -0 };
    expect(nodeToWire(node)).toStrictEqual(node);
    expect(Object.keys(node3DToWire({ z: 1, id: 1, x: 2, y: 3 }))).toStrictEqual(['z', 'id', 'x', 'y']);
    for (const load of loads2D()) expect(loadToWire(load)).toStrictEqual(load);
    for (const load of loads3D()) expect(load3DToWire(load)).toStrictEqual(load);
    const stored = model2D();
    const wire = input2DToWireObject(stored);
    (wire.loads[0].data as { fx: number }).fx = 99;
    expect((stored.loads[0].data as { fx: number }).fx).toBe(1.25);
    const pointWithoutOptionals = loadToWire({ type: 'pointOnElement', data: { elementId: 1, a: 1, p: 2 } });
    expect(Object.keys(pointWithoutOptionals.data)).toStrictEqual(['elementId', 'a', 'p']);
  });
});

describe('distributed, thermal and support unit boundary', () => {
  const loads2D = (): SolverLoad[] => [
    { type: 'distributed', data: { elementId: 1, qI: -5.5, qJ: -2.25 } },
    { type: 'distributed', data: { qJ: 1e-9, elementId: 1, qI: -0, a: 0.25, b: undefined, caseId: 2 } as never },
    { type: 'axialDistributed', data: { elementId: 1, qI: 1.5, qJ: -0, a: 0 } },
    { type: 'thermal', data: { elementId: 1, dtUniform: 20.5, dtGradient: -7.25 } },
    { type: 'thermal', data: { dtGradient: 3, elementId: 1, dtUniform: -0, alpha: 1e-5, depth: 0.45 } },
  ];
  const loads3D = (): SolverLoad3D[] => [
    { type: 'distributed', data: { elementId: 1, qYI: -5, qYJ: -2.5, qZI: 0, qZJ: 1.25 } },
    { type: 'distributed', data: { qXI: 0.5, qXJ: -0, elementId: 1, qYI: 1e-9, qYJ: 0, qZI: -3, qZJ: -3, a: 0.5, b: 1.75 } },
    { type: 'thermal', data: { elementId: 1, dtUniform: 15.5, dtGradientY: -4, dtGradientZ: 2.5 } },
    { type: 'thermal', data: { depthZ: 0.2, elementId: 1, dtUniform: -0, dtGradientY: 0, dtGradientZ: 6, alpha: 1e-5, depthY: undefined } },
    { type: 'quadThermal', data: { elementId: 8, dtUniform: -8, dtGradient: 0 } } as never,
  ];
  const supports2D = (): SolverInput['supports'] => new Map([
    [1, { id: 1, nodeId: 1, type: 'fixed', dx: 0.001, dz: -0, dry: 1e-4 }],
    [2, { kz: 321.25, id: 2, nodeId: 2, type: 'spring', kx: 1234.5, ky: 9876.5, angle: 0.3 }],
    [3, { id: 3, nodeId: 3, type: 'pinned', dx: -0, dz: -0.002, dry: undefined }],
  ]);
  const supports3D = (): SolverInput3D['supports'] => new Map([
    [1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true, dz: -0.001, dry: -0, drz: 2e-4 }],
    [4, { krx: 89.125, nodeId: 4, rx: true, ry: true, rz: false, rrx: false, rry: true, rrz: true, kz: 4567.5, dx: 0, stabilised: 'springs', stabilisedAxes: [true, false, false] }],
    [2, { nodeId: 2, rx: false, ry: false, rz: true, rrx: false, rry: false, rrz: false, kx: 1e4, ky: 2e4, kry: 3.5, krz: -0, drx: undefined, normalX: 0, normalY: 0, normalZ: 1, isInclined: true }],
  ]);
  const element3D = (id: number, extra: object) => ({
    id, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false, ...extra,
  });
  const elements3D = (): SolverInput3D['elements'] => new Map([
    [1, element3D(1, { rollAngle: 30 })],
    [2, element3D(2, { rollAngle: -0, localYx: 0, localYy: 0, localYz: 1 })],
    [3, element3D(3, {})],
  ]);
  const model2D = (): SolverInput => ({ ...input(), supports: supports2D(), loads: loads2D() });
  const model3D = (): SolverInput3D => ({
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 3, y: 0, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-5 }]]),
    elements: elements3D(),
    supports: supports3D(),
    loads: loads3D(),
  });
  const before = (input: { supports: Map<number, unknown>; elements: Map<number, unknown>; loads: unknown[] }) => ({
    supports: Object.fromEntries(Array.from(input.supports, ([id, s]) => [String(id), s])),
    elements: Object.fromEntries(Array.from(input.elements, ([id, e]) => [String(id), e])),
    loads: input.loads,
  });
  const same = (wire: unknown, legacy: unknown) => {
    expect(JSON.stringify(wire)).toBe(JSON.stringify(legacy));
    expect(keyPaths(wire)).toStrictEqual(keyPaths(legacy));
    expect(wire).toStrictEqual(legacy);
  };
  it('sends the same 2D support, distributed and thermal JSON text, keys and signed zeros as before', () => {
    const wire = input2DToWireObject(model2D());
    const legacy = before(model2D());
    same(wire.supports, legacy.supports);
    same(wire.loads, legacy.loads);
    same(wire.elements, legacy.elements);
    expect(Object.is(wire.supports['1'].dz, -0)).toBe(true);
    expect(Object.is(wire.supports['3'].dx, -0)).toBe(true);
    expect(Object.hasOwn(wire.supports['3'], 'dry')).toBe(true);
    expect(wire.supports['2']).not.toHaveProperty('dz');
    expect(Object.keys(wire.supports['2'])[0]).toBe('kz');
    const d = wire.loads[1];
    expect(d.type === 'distributed' && Object.is(d.data.qI, -0)).toBe(true);
    expect(Object.hasOwn(d.data, 'b')).toBe(true);
    expect(d.data).toHaveProperty('caseId', 2);
    const t = wire.loads[3];
    expect(t.type === 'thermal' && !Object.hasOwn(t.data, 'alpha') && !Object.hasOwn(t.data, 'depth')).toBe(true);
  });
  it('sends the same 3D support, element, distributed and thermal JSON text, keys and signed zeros as before', () => {
    const wire = input3DToWireObject(model3D());
    const legacy = before(model3D());
    same(wire.supports, legacy.supports);
    same(wire.elements, legacy.elements);
    same(wire.loads, legacy.loads);
    expect(Object.is(wire.elements['2'].rollAngle, -0)).toBe(true);
    expect(wire.elements['3']).not.toHaveProperty('rollAngle');
    expect(Object.is(wire.supports['1'].dry, -0)).toBe(true);
    expect(Object.is(wire.supports['2'].krz, -0)).toBe(true);
    expect(wire.supports['4']).toHaveProperty('stabilised', 'springs');
    expect(Object.keys(wire.supports)).toStrictEqual(['1', '2', '4']);
    const d = wire.loads[0];
    expect(d.type === 'distributed' && !Object.hasOwn(d.data, 'qXI')).toBe(true);
    const t = wire.loads[3];
    expect(t.type === 'thermal' && Object.is(t.data.dtUniform, -0) && Object.hasOwn(t.data, 'depthY')).toBe(true);
    expect(Object.keys(wire.loads[3].data)[0]).toBe('depthZ');
  });
  it('adapts supports, elements and loads without converting, rounding, adding keys or touching the stored model', () => {
    for (const s of supports2D().values()) expect(supportToWire(s)).toStrictEqual(s);
    for (const s of supports3D().values()) expect(support3DToWire(s)).toStrictEqual(s);
    for (const e of elements3D().values()) expect(element3DToWire(e)).toStrictEqual(e);
    for (const load of loads2D()) expect(loadToWire(load)).toStrictEqual(load);
    for (const load of loads3D()) expect(load3DToWire(load)).toStrictEqual(load);
    const plate = { elementId: 7, dtUniform: 10, dtGradient: -0, alpha: 1.1e-5 };
    expect(plateThermalToWire(plate)).toStrictEqual(plate);
    expect(Object.keys(plateThermalToWire({ elementId: 7, dtUniform: 1, dtGradient: 0 }))).toStrictEqual(['elementId', 'dtUniform', 'dtGradient']);
    for (const p of [{ elementId: 7, pressure: -0 }, { pressure: 2.75, elementId: 8 }]) {
      expect(pressureToWire(p)).toStrictEqual(p);
      expect(Object.keys(pressureToWire(p))).toStrictEqual(Object.keys(p));
    }
    for (const e of [{ elementId: 8, edge: 3 }, { qt: -0, elementId: 8, edge: 1, qn: 2.5 }]) {
      expect(quadEdgeToWire(e)).toStrictEqual(e);
      expect(Object.keys(quadEdgeToWire(e))).toStrictEqual(Object.keys(e));
    }
    const stored = model3D();
    const wire = input3DToWireObject(stored);
    (wire.supports['2'] as { kx?: number }).kx = 99;
    (wire.elements['1'] as { rollAngle?: number }).rollAngle = 99;
    expect(stored.supports.get(2)!.kx).toBe(1e4);
    expect(stored.elements.get(1)!.rollAngle).toBe(30);
  });
  it('sends a quad temperature load with the same keys as before', () => {
    const [load] = convertThermalQuadLoad({ quadId: 8, dtUniform: -0, dtGradient: 4 } as never, 1.2e-5);
    expect(JSON.stringify(load)).toBe(JSON.stringify({ type: 'quadThermal', data: { elementId: 8, dtUniform: 0, dtGradient: 4, alpha: 1.2e-5 } }));
    expect(Object.is((load.data as { dtUniform: number }).dtUniform, -0)).toBe(true);
    const [plate] = convertThermalQuadLoad({ quadId: 3, on: 'plate', dtUniform: 5 } as never);
    expect(plate).toStrictEqual({ type: 'plateThermal', data: { elementId: 3, dtUniform: 5, dtGradient: 0 } });
  });
  for (const system of UNIT_SYSTEMS) {
    it(`commits the same canonical numbers for the slice 4 quantities in ${system}`, () => {
      for (const q of ['distributedLoad', 'areaLoad', 'temperatureDelta', 'springK', 'springKr', 'displacement', 'rotation'] as const) {
        expect(elasticFromDisplay(123.456, q, system)).toBe(fromDisplay(123.456, q, system));
        expect(elasticToDisplay(elasticFromDisplay(7.25, q, system), q, system)).toBe(toDisplay(fromDisplay(7.25, q, system), q, system));
        expect(unitInputCommit('123.456', 0, q, system)).toBe(fromDisplay(123.456, q, system));
      }
      expect(unitInputCommit('68', 0, 'temperature', system)).toBe(fromDisplay(68, 'temperature', system));
    });
  }
});
