import { modelStore } from '../store/model.svelte';
import { uiStore } from '../store/ui.svelte';
import { shouldProjectModelToXZ } from '../geometry/coordinate-system';
import { modelVec, userVec } from './display';

export function standingPlane(): boolean {
  return shouldProjectModelToXZ({
    analysisMode: uiStore.analysisMode,
    viewportPresentation3D: uiStore.viewportPresentation3D,
    nodes: modelStore.nodes.values(),
    supports: modelStore.supports.values(),
    loads: modelStore.loads,
    plateCount: modelStore.plates.size,
    quadCount: modelStore.quads.size,
  });
}

export function nodeShown3D(node: { x: number; y: number; z?: number }, plane = standingPlane()): [number, number, number] {
  return plane ? userVec(node.x, 0, node.y) : userVec(node.x, node.y, node.z ?? 0);
}

export function nodeMoveArgs3D(shown: readonly number[], plane = standingPlane()): [number, number, number] {
  const [x, y, z] = modelVec(shown[0], shown[1], shown[2]);
  return plane ? [x, z, y] : [x, y, z];
}
