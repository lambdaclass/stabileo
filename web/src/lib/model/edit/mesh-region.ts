/**
 * Mesh a four-cornered region with quads, and connect it to the members around it.
 *
 * The one implementation behind the shell tab's quick mesher and hole filling: a bilinear grid
 * between the four corners, by target element size or by a fixed count, welded to any node
 * already there; then every member the mesh's edge nodes lie on is cut there, so beam and slab
 * share nodes and load passes between them. One undo step.
 */

import { modelStore } from '../../store/model.svelte';
import { applyMesh } from './mesh-apply';
import { generateMesh, MAX_MESH_CELLS, type MeshInput, type MeshOutput } from './mesher';
import { MAX_DIVISIONS_PER_AXIS } from '../../engine/shell-mesh-gen';

export type MeshDensity = { mode: 'targetSize'; size: number } | { mode: 'fixedDivisions'; nx: number; ny: number };

export interface MeshRegionOptions {
  density: MeshDensity;
  materialId: number;
  thickness: number;
  /** Cut surrounding members at the mesh's edge nodes. */
  splitBeams: boolean;
}

export interface MeshRegionResult { newNodes: number; quadCount: number; quads: number[]; splitCount: number }

/**
 * A region refused before anything is built: past the caps, or one the mesher cannot mesh — its
 * corners out of one plane, or a grid that folds.
 */
export interface MeshRegionRefusal { refused: 'tooManyDivisions' | 'cannotMesh' }

/** Subdivisions for a region, from its own edge lengths when meshing by element size. */
export function divisionsFor(corners: ReadonlyArray<{ x: number; y: number; z?: number }>, d: MeshDensity): { nx: number; ny: number } {
  if (d.mode === 'fixedDivisions') return { nx: Math.max(1, Math.floor(d.nx)), ny: Math.max(1, Math.floor(d.ny)) };
  const len = (a: typeof corners[number], b: typeof corners[number]) => Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
  return {
    nx: Math.max(1, Math.round(len(corners[0]!, corners[1]!) / d.size)),
    ny: Math.max(1, Math.round(len(corners[0]!, corners[3]!) / d.size)),
  };
}

/**
 * Whether a region would need more subdivisions per side than the mesher
 * makes. `buildBilinearQuadGrid` caps each axis at MAX_DIVISIONS_PER_AXIS so
 * no input can hang the tab, but a cap applied silently hands the user a
 * coarser mesh than they asked for — 300 divisions, or a 1 mm target on a
 * 1 m edge, came back as 256 cells. `meshQuadRegion` refuses such a request
 * itself, so no caller can forget to ask; a caller that meshes several regions
 * asks first, so that it refuses before building any of them.
 */
export function exceedsDivisionCap(corners: ReadonlyArray<{ x: number; y: number; z?: number }>, d: MeshDensity): boolean {
  const { nx, ny } = divisionsFor(corners, d);
  // The mesher's own cap on the whole grid too: 150 × 150 is within 256 a side, not 20 000 cells.
  return nx > MAX_DIVISIONS_PER_AXIS || ny > MAX_DIVISIONS_PER_AXIS || nx * ny > MAX_MESH_CELLS;
}

type Corner = { x: number; y: number; z?: number };

/** The structured path of the one mesher: four sides, nx and ny divisions on opposite sides. */
function regionMeshInput(corners: ReadonlyArray<Corner>, d: MeshDensity): MeshInput {
  const { nx, ny } = divisionsFor(corners, d);
  return {
    outer: { kind: 'polygon', points: corners.map((c) => [c.x, c.y, c.z ?? 0] as [number, number, number]) },
    holes: [], size: 1, element: 'quad', fixedPoints: [],
    sides: [{ divisions: nx }, { divisions: ny }, { divisions: nx }, { divisions: ny }],
  };
}

/**
 * Why a region would be refused, or null with the mesh it would get. The mesher is pure, so a
 * caller meshing several regions asks for each first and refuses before building any.
 */
export function regionMesh(corners: ReadonlyArray<Corner>, d: MeshDensity): MeshRegionRefusal | { mesh: MeshOutput } {
  if (exceedsDivisionCap(corners, d)) return { refused: 'tooManyDivisions' };
  const mesh = generateMesh(regionMeshInput(corners, d));
  return mesh ? { mesh } : { refused: 'cannotMesh' };
}

export function meshQuadRegion(cornerIds: [number, number, number, number], o: MeshRegionOptions): MeshRegionResult | MeshRegionRefusal {
  const corners = cornerIds.map((id) => modelStore.nodes.get(id)!);
  const planned = regionMesh(corners, o.density);
  if ('refused' in planned) return planned;
  const r = applyMesh(regionMeshInput(corners, o.density), { materialId: o.materialId, thickness: o.thickness, splitBeams: o.splitBeams }, planned.mesh)!;
  return { newNodes: r.newNodes, quadCount: r.quads.length, quads: r.quads, splitCount: r.splitCount };
}
