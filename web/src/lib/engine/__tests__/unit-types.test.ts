import { describe, it, expect } from 'vitest';
import { elasticFromDisplay, elasticToDisplay, materialToWire, sectionToWire, section3DToWire, modulusInternal, nodeToWire, node3DToWire, loadToWire, load3DToWire } from '../unit-types';
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
