/**
 * An IFC mapping as a fragment, so an IFC file can be placed into the current model through the
 * placement (ghost, anchor, welds) or replace it in one undo step, by the same insertion every
 * other source uses.
 */
import type { Element, Material, Section } from '../store/model.svelte';
import type { Fragment } from '../model/edit/fragment';
import type { IfcMappingResult } from './ifc-mapper';

const NO_RELEASE = { my: false, mz: false, t: false };

export function fragmentFromIfc(m: IfcMappingResult): Fragment {
  return {
    nodes: m.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })),
    elements: m.elements.map((e, k) => ({
      id: k + 1, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ,
      materialId: e.material + 1, sectionId: e.section + 1,
      releaseI: { ...NO_RELEASE }, releaseJ: { ...NO_RELEASE },
    }) as Element),
    quads: [], plates: [], supports: [], loads: [], groups: [],
    materials: m.materials.map((x, i) => ({ id: i + 1, ...x }) as Material),
    sections: m.sections.map((x, i) => ({ id: i + 1, ...x }) as unknown as Section),
    loadCases: [],
    local: false,
  };
}
