import { describe, it, expect } from 'vitest';
import { elasticFromDisplay, elasticToDisplay, materialToWire, sectionToWire, modulusInternal } from '../unit-types';
import { fromDisplay, toDisplay, UNIT_SYSTEMS } from '../../utils/units';
import { input2DToWireObject, solve } from '../wasm-solver';
import type { SolverInput } from '../types';
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
