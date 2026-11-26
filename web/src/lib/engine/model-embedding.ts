import type { ModelData } from './solver-service';
import type { Node } from '../store/model.svelte';
import { projectNodeToScene, shouldProjectModelToXZ } from '../geometry/coordinate-system';

export function shouldEmbedFlat2DModelIn3D(model: ModelData): boolean {
  return shouldProjectModelToXZ({
    nodes: model.nodes.values(),
    supports: model.supports.values(),
    loads: model.loads,
    plateCount: model.plates?.size ?? 0,
    quadCount: model.quads?.size ?? 0,
  });
}

export function mapModelNodeToSolver3D(node: Node, project2DToXZ: boolean): { id: number; x: number; y: number; z: number } {
  const pos = projectNodeToScene(node, project2DToXZ);
  return { id: node.id, x: pos.x, y: pos.y, z: pos.z };
}
