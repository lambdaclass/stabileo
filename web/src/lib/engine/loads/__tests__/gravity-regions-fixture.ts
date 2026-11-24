import type { LoadModelData } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';

export function bay(covered: number, angle = 0, mirror = 1, mesh = 1, subdivide = false, skew = 0) {
  const nodes: LoadModelData['nodes'] = new Map();
  const elements: LoadModelData['elements'] = new Map();
  const quads = new Map<number, { id: number; nodes: number[] }>();
  const physical = new Map<number, [number, number]>();
  function node(x: number, y: number) {
    const id = nodes.size + 1;
    nodes.set(id, { id, x: x * Math.cos(angle) - mirror * y * Math.sin(angle), y: x * Math.sin(angle) + mirror * y * Math.cos(angle), z: 3 });
    physical.set(id, [x, y]);
    return id;
  }
  const root = [node(0, 0), node(0, 6)];
  const ends = [node(10, 0), node(10, 6)];
  const beam = (nodeI: number, nodeJ: number) => {
    const id = elements.size + 1;
    elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1 });
  };
  for (const [k, y] of [0, 6].entries()) {
    const stations = subdivide ? [root[k]!, node(2, y), node(6, y), ends[k]!] : [root[k]!, ends[k]!];
    stations.slice(1).forEach((id, i) => beam(stations[i]!, id));
  }
  beam(root[0]!, root[1]!);
  beam(ends[0]!, ends[1]!);
  if (covered > 0) {
    const rows = Array.from({ length: mesh + 1 }, (_, k) => [node(0, 6 * k / mesh), node(covered + skew * k / mesh, 6 * k / mesh)]);
    rows.slice(1).forEach(([a, b], k) => quads.set(k + 1, { id: k + 1, nodes: [rows[k]![0]!, rows[k]![1]!, b!, a!] }));
  }
  const model = {
    nodes, elements, quads, sections: new Map([[1, { id: 1, a: 0.1 }]]),
    materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [],
  };
  return { model, physical, root, ends };
}

export function areaLoads(model: ReturnType<typeof bay>['model']) {
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
  return planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 0, liveOf: () => 0 } });
}
