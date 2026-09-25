/**
 * Mesh a four-cornered region with quads, and connect it to the members around it.
 *
 * The one implementation behind the shell tab's quick mesher and hole filling: a bilinear grid
 * between the four corners, by target element size or by a fixed count, welded to any node
 * already there; then every member the mesh's edge nodes lie on is cut there, so beam and slab
 * share nodes and load passes between them. One undo step.
 */

import { modelStore } from '../../store/model.svelte';
import { buildBilinearQuadGrid } from '../../engine/shell-mesh-gen';
import { findCoincidentNode } from '../../engine/mesh-weld';
import { splitAtNodes } from './cut-members';

export type MeshDensity = { mode: 'targetSize'; size: number } | { mode: 'fixedDivisions'; nx: number; ny: number };

export interface MeshRegionOptions {
  density: MeshDensity;
  materialId: number;
  thickness: number;
  /** Cut surrounding members at the mesh's edge nodes. */
  splitBeams: boolean;
}

export interface MeshRegionResult { newNodes: number; quadCount: number; quads: number[]; splitCount: number }

/** Subdivisions for a region, from its own edge lengths when meshing by element size. */
export function divisionsFor(corners: ReadonlyArray<{ x: number; y: number; z?: number }>, d: MeshDensity): { nx: number; ny: number } {
  if (d.mode === 'fixedDivisions') return { nx: Math.max(1, Math.floor(d.nx)), ny: Math.max(1, Math.floor(d.ny)) };
  const len = (a: typeof corners[number], b: typeof corners[number]) => Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
  return {
    nx: Math.max(1, Math.round(len(corners[0]!, corners[1]!) / d.size)),
    ny: Math.max(1, Math.round(len(corners[0]!, corners[3]!) / d.size)),
  };
}

export function meshQuadRegion(cornerIds: [number, number, number, number], o: MeshRegionOptions): MeshRegionResult {
  const corners = cornerIds.map((id) => modelStore.nodes.get(id)!);
  const { nx, ny } = divisionsFor(corners, o.density);
  const out: MeshRegionResult = { newNodes: 0, quadCount: 0, quads: [], splitCount: 0 };
  modelStore.batch(() => {
    const r = buildBilinearQuadGrid(
      corners.map((c) => ({ x: c.x, y: c.y, z: c.z ?? 0 })) as never,
      nx, ny,
      {
        findNode: (x, y, z) => findCoincidentNode(modelStore.nodes.values(), x, y, z),
        addNode: (x, y, z) => modelStore.addNode(x, y, z !== 0 ? z : undefined),
        addQuad: (nodes) => { out.quads.push(modelStore.addQuad(nodes, o.materialId, o.thickness)); },
      },
      cornerIds,
    );
    out.newNodes = r.newNodes;
    out.quadCount = r.quadCount;
    if (o.splitBeams) {
      const cut = splitAtNodes([...modelStore.elements.keys()], r.nodeGrid.flat());
      out.splitCount = cut.cut.reduce((s, c) => s + c.segments.length - 1, 0);
    }
  });
  return out;
}
