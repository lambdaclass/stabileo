import type { ModelData } from './solver-service';
import { shouldProjectModelToXZ } from '../geometry/coordinate-system';

export function shouldEmbedFlat2DModelIn3D(model: ModelData): boolean {
  return shouldProjectModelToXZ({
    nodes: model.nodes.values(),
    supports: model.supports.values(),
    loads: model.loads,
    plateCount: model.plates?.size ?? 0,
    quadCount: model.quads?.size ?? 0,
  });
}
