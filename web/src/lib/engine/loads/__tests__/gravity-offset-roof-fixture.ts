import type { RigidLinkConstraint } from '../../types-3d';
import { buildLoadPlan, type LoadModelData } from '../load-plan';
import { input } from './gravity-width-mass-fixture';

export function offsetRoof(offset: number, angle = 0, mirror = 1, subdivide = false, gap: boolean | readonly [number, number] = false, width = 4, endWidth = width, gapCenter = gap ? 0 : width / 2) {
  const nodes: LoadModelData['nodes'] = new Map();
  const elements: LoadModelData['elements'] = new Map();
  const quads = new Map<number, { id: number; nodes: number[]; materialId: number; thickness: number }>();
  const constraints: RigidLinkConstraint[] = [];
  function node(x: number, y: number, z: number) {
    const id = nodes.size + 1;
    nodes.set(id, { id, x: x * Math.cos(angle) - mirror * y * Math.sin(angle), y: x * Math.sin(angle) + mirror * y * Math.cos(angle), z });
    return id;
  }
  const elevation = (x: number) => 3 + x / 5;
  const row = (x: number) => {
    const end = x === 0 || x === 10;
    return [node(x, end ? 0 : gapCenter - width / 2, elevation(x)),
      node(x, end ? endWidth : gapCenter + width / 2, elevation(x))] as const;
  };
  const first = row(0), last = row(10);
  function shell([a, d]: ReturnType<typeof row>, [b, c]: ReturnType<typeof row>) {
    const id = quads.size + 1;
    quads.set(id, { id, nodes: [a, b, c, d], materialId: 1, thickness: 0.1 });
  }
  const [gapStart, gapEnd] = typeof gap === 'boolean' ? [2, 4] as const : gap;
  if (gap) {
    shell(first, row(gapStart));
    shell(row(gapEnd), last);
  } else if (subdivide) {
    const seam = row(7);
    shell(first, seam);
    shell(seam, last);
  } else {
    shell(first, last);
  }
  const stations = subdivide ? (gap ? [0, gapStart, gapEnd, 10] : [0, 2, 8, 10]) : [0, 10];
  const rafter = stations.map(x => node(x, 0, elevation(x) - offset));
  rafter.slice(1).forEach((nodeJ, index) => {
    const id = index + 1;
    elements.set(id, { id, nodeI: rafter[index]!, nodeJ, sectionId: 1, materialId: 1, type: 'frame' });
  });
  constraints.push(
    { type: 'rigidLink', masterNode: first[0], slaveNode: rafter[0]!, dofs: [0, 1, 2, 3, 4, 5] },
    { type: 'rigidLink', masterNode: last[0], slaveNode: rafter.at(-1)!, dofs: [0, 1, 2, 3, 4, 5] },
  );
  const model = {
    nodes, elements, quads, constraints,
    sections: new Map([[1, { id: 1, a: 0.1 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [],
  };
  return { model, stations, rafter };
}

export function doubleAttachedRoof(subdivide: boolean, secondGap: readonly [number, number] = [4, 6], stacked = false) {
  const [edgeWidth, endWidth] = stacked ? [3, 5] : [1.5, 6.5];
  const { model, rafter } = offsetRoof(0.04, 0, 1, subdivide, [4, 6], edgeWidth, endWidth, edgeWidth / 2);
  const { model: second } = offsetRoof(0.04, 0, stacked ? 1 : -1, subdivide, secondGap, edgeWidth, endWidth, edgeWidth / 2);
  const start = model.nodes.size;
  for (const { nodes, ...quad } of second.quads.values()) {
    for (const nodeId of nodes) {
      const id = start + nodeId;
      const node = second.nodes.get(nodeId)!;
      model.nodes.set(id, { ...node, id, z: node.z! - (stacked ? 0.08 : 0) });
    }
    const id = model.quads.size + 1;
    model.quads.set(id, { ...quad, id, nodes: nodes.map(nodeId => start + nodeId) });
  }
  second.constraints.forEach((link, index) => model.constraints.push({
    ...link, masterNode: index === 0 ? rafter[0]! : rafter.at(-1)!, slaveNode: start + link.masterNode,
  }));
  return model;
}

export function triangulateRoof<T extends ReturnType<typeof offsetRoof>['model']>(model: T) {
  const plates = [...model.quads.values()].flatMap(({ id, nodes: [a, b, c, d], ...shell }) => [
    { ...shell, id: 2 * id - 1, nodes: [a!, b!, c!] },
    { ...shell, id: 2 * id, nodes: [a!, c!, d!] },
  ]);
  return { ...model, quads: new Map<number, never>(), plates: new Map(plates.map(shell => [shell.id, shell])) };
}

export function roofPlan(model: LoadModelData, mode: 'panels' | 'width' = 'panels') {
  return buildLoadPlan(input(model, { gravity: { mode } }));
}
