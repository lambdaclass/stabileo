import type { ModelSnapshot } from '../../../lib/store/history.svelte';
import { inputFor, type BenchmarkCase, type RunParameters } from './benchmark';

export function editorSnapshot(c: BenchmarkCase, parameters: RunParameters): ModelSnapshot {
  const input = inputFor(c, parameters).solver;
  const nodes = Object.values(input.nodes).sort((a, b) => a.id - b.id);
  const materials = Object.values(input.materials).sort((a, b) => a.id - b.id);
  const sections = Object.values(input.sections).sort((a, b) => a.id - b.id);
  const elements = Object.values(input.elements).sort((a, b) => a.id - b.id);
  const supports = Object.values(input.supports).sort((a, b) => a.id - b.id);
  return {
    name: `Research: ${c.name}`,
    analysisMode: '2d',
    nodes: nodes.map((node) => [node.id, { id: node.id, x: node.x, y: node.z }]),
    materials: materials.map((material) => [material.id, { id: material.id, name: `Research material ${material.id}`, e: material.e * 1000, nu: material.nu, rho: 78.5 }]),
    sections: sections.map((section) => [section.id, { id: section.id, name: `Research section ${section.id}`, a: section.a, iz: section.iz }]),
    elements: elements.map((element) => [element.id, {
      id: element.id,
      type: element.type as 'frame' | 'truss',
      nodeI: element.nodeI,
      nodeJ: element.nodeJ,
      materialId: element.materialId,
      sectionId: element.sectionId,
      releaseI: { my: false, mz: element.hingeStart, t: false },
      releaseJ: { my: false, mz: element.hingeEnd, t: false },
    }]),
    supports: supports.map((support) => [support.id, { ...support }]),
    loads: input.loads.map((load, index) => ({ type: load.type, data: { id: index + 1, ...load.data } })),
    loadCases: [{ id: 1, type: 'D', name: 'Research reference load' }],
    combinations: [],
    plates: [],
    quads: [],
    constraints: [],
    nextId: {
      node: Math.max(...nodes.map((node) => node.id)) + 1,
      material: Math.max(...materials.map((item) => item.id)) + 1,
      section: Math.max(...sections.map((item) => item.id)) + 1,
      element: Math.max(...elements.map((item) => item.id)) + 1,
      support: Math.max(...supports.map((item) => item.id)) + 1,
      load: input.loads.length + 1,
      loadCase: 2,
      combination: 1,
      plate: 1,
      quad: 1,
      connector: 1,
    },
  };
}
