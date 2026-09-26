/**
 * An IFC mapping enters the model as a fragment: its materials and sections by definition, its
 * members on them, and a replace that is one undo step.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import '../../store';
import { fragmentFromIfc } from '../ifc-fragment';
import { insertFragment } from '../../model/edit/transformed-copy';
import { IDENTITY, translation } from '../../model/edit/affine';
import type { IfcMappingResult } from '../ifc-mapper';

const MAPPING: IfcMappingResult = {
  nodes: [{ id: 10, x: 0, y: 0, z: 0 }, { id: 11, x: 0, y: 0, z: 3 }, { id: 12, x: 5, y: 0, z: 3 }],
  elements: [
    { nodeI: 10, nodeJ: 11, type: 'frame', material: 0, section: 1 },
    { nodeI: 11, nodeJ: 12, type: 'frame', material: 0, section: 0 },
  ],
  materials: [{ name: 'S275', e: 200000, nu: 0.3, rho: 78.5 }],
  sections: [{ name: 'IPE 300', a: 0.00538, iz: 8.356e-5 }, { name: 'HEB 200', a: 0.00781, iz: 5.696e-5 }],
  warnings: [],
};

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe('IFC as a fragment', () => {
  it('keeps each member on its own section', () => {
    const r = insertFragment(fragmentFromIfc(MAPPING), [translation([20, 0, 0])]);
    expect(r.elements).toHaveLength(2);
    const [col, beam] = r.elements.map((id) => modelStore.elements.get(id)!);
    expect(modelStore.sections.get(col!.sectionId)!.name).toBe('HEB 200');
    expect(modelStore.sections.get(beam!.sectionId)!.name).toBe('IPE 300');
    expect(modelStore.materials.get(col!.materialId)!.name).toBe('S275');
    expect(modelStore.nodes.get(r.nodes[0]!)!.x).toBe(20);
  });

  it('replacing the model is one undo step', () => {
    modelStore.addNode(1, 1, 1);
    const before = modelStore.nodes.size;
    modelStore.batch(() => {
      modelStore.clear();
      insertFragment(fragmentFromIfc(MAPPING), [{ A: IDENTITY, t: [0, 0, 0] }]);
    });
    expect(modelStore.elements.size).toBe(2);
    historyStore.undo();
    expect(modelStore.nodes.size).toBe(before);
    expect(modelStore.elements.size).toBe(0);
  });
});
