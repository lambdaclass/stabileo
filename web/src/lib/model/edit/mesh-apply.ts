/**
 * Put a mesh from `mesher.ts` into the model: its points welded onto nodes already there, its
 * cells as quadrilateral or triangular shells, and the members along its boundary cut at the
 * mesh's boundary nodes so slab and beam share them. One undo step.
 */
import { modelStore } from '../../store/model.svelte';
import { findCoincidentNode } from '../../engine/mesh-weld';
import { splitAtNodes } from './cut-members';
import { generateMesh, type MeshInput, type MeshOutput } from './mesher';
import type { Vec3 } from './affine';

export interface MeshApplyOptions { materialId: number; thickness: number; splitBeams: boolean }

export interface MeshApplyResult { newNodes: number; quads: number[]; plates: number[]; splitCount: number; structured: boolean; nodeIds: number[] }

/** Every model node, as the points a boundary may have to pass through. */
export const modelPoints = (): Vec3[] => [...modelStore.nodes.values()].map((n) => [n.x, n.y, n.z ?? 0]);

export function applyMesh(input: MeshInput, o: MeshApplyOptions, mesh: MeshOutput | null = generateMesh({ ...input, fixedPoints: input.fixedPoints ?? modelPoints() })): MeshApplyResult | null {
  if (!mesh) return null;
  const out: MeshApplyResult = { newNodes: 0, quads: [], plates: [], splitCount: 0, structured: mesh.structured, nodeIds: [] };
  modelStore.batch(() => {
    const ids = mesh.points.map((p) => {
      const hit = findCoincidentNode(modelStore.nodes.values(), p[0], p[1], p[2]);
      if (hit !== null) return hit;
      out.newNodes++;
      return modelStore.addNode(p[0], p[1], p[2] !== 0 ? p[2] : undefined);
    });
    out.nodeIds = ids;
    for (const c of mesh.cells) {
      const n = c.map((i) => ids[i]!);
      if (n.length === 4) out.quads.push(modelStore.addQuad(n as [number, number, number, number], o.materialId, o.thickness));
      else out.plates.push(modelStore.addPlate(n as [number, number, number], o.materialId, o.thickness));
    }
    if (o.splitBeams) {
      const edge = [...mesh.boundary].map((i) => ids[i]!);
      const cut = splitAtNodes([...modelStore.elements.keys()], edge);
      out.splitCount = cut.cut.reduce((s, x) => s + x.segments.length - 1, 0);
    }
  });
  return out;
}
