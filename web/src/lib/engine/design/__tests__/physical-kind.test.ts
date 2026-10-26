import { describe, it, expect } from 'vitest';
import { buildMemberContext } from '../member-context';

// An inclined bar, 40° from horizontal: the geometry reads it as a beam.
const model = {
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 3, y: 0, z: 2.5 }]]),
  elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
  sections: new Map([[1, { id: 1, name: '30x30', b: 0.3, h: 0.3 }]]),
  materials: new Map([[1, { id: 1, name: 'H-25', fy: 25 }]]),
} as never;

describe('the physical kind a person declared', () => {
  it('reads the geometry when no physical element says otherwise', () => {
    expect(buildMemberContext(1, model, {})!.elementType).toBe('beam');
  });
  it('designs a bar declared a column as a column', () => {
    expect(buildMemberContext(1, model, { physicalKindOf: () => 'column' })!.elementType).toBe('column');
  });
});
