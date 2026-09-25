// Structured bilinear quad-grid mesh generation (extracted from ProShellTab so
// the CAD → RC draft generator can reuse the exact same meshing behaviour).
//
// Given 4 corner positions defining a (possibly non-rectangular) quadrilateral
// region and nx × ny subdivisions, places intermediate nodes by bilinear
// interpolation and emits one quad element per cell. Node creation/welding is
// delegated to the caller through hooks, so the same routine drives both the
// live model store (ProShellTab) and the pure snapshot builder (cad/draft).
//
// Corner ordering (same convention as the original ProShellTab generator):
//   c3 --- c2
//   |       |
//   c0 --- c1

export interface MeshVec3 {
  x: number;
  y: number;
  z: number;
}

export interface QuadMeshHooks {
  /** Id of an existing node coincident with (x,y,z), or null. (Welding.) */
  findNode(x: number, y: number, z: number): number | null;
  /** Create a node and return its id. */
  addNode(x: number, y: number, z: number): number;
  /** Create a quad element from 4 node ids (cell corner order n0,n1,n2,n3). */
  addQuad(nodes: [number, number, number, number]): void;
}

export interface QuadGridResult {
  /** (ny+1) × (nx+1) grid of node ids, row-major bottom-to-top. */
  nodeGrid: number[][];
  newNodes: number;
  quadCount: number;
}

/**
 * Build the bilinear node grid + quad cells for one quadrilateral region.
 * When `cornerIds` is provided, those ids are used verbatim at the 4 corners
 * (the ProShellTab flow, where the user picked existing nodes); otherwise the
 * corners weld/create like any other grid node (the CAD draft flow).
 */
export function buildBilinearQuadGrid(
  corners: [MeshVec3, MeshVec3, MeshVec3, MeshVec3],
  nx: number,
  ny: number,
  hooks: QuadMeshHooks,
  cornerIds?: [number, number, number, number],
): QuadGridResult {
  // `nx`/`ny` are computed by callers from user input: ProShellTab's subdivision
  // fields and cad/draft's fixed-division mode. A non-finite count makes
  // `j <= ny` never go false, and unlike structuredBreakpoints this loop pushes
  // into `row` on every pass, so the tab dies of memory rather than merely
  // freezing. Clamp before either loop starts — 256 per axis is the cap the
  // target-size paths already apply, and a non-finite count falls back to the
  // coarsest honest mesh (1 cell) rather than a silent empty grid, which is
  // what NaN produced before (`j <= NaN` is false, so nothing was generated).
  const gx = Number.isFinite(nx) ? Math.min(256, Math.max(1, Math.round(nx))) : 1;
  const gy = Number.isFinite(ny) ? Math.min(256, Math.max(1, Math.round(ny))) : 1;

  const [c0, c1, c2, c3] = corners;
  const nodeGrid: number[][] = [];
  let newNodes = 0;

  for (let j = 0; j <= gy; j++) {
    const row: number[] = [];
    const v = j / gy;
    for (let i = 0; i <= gx; i++) {
      const u = i / gx;

      if (cornerIds) {
        if (i === 0 && j === 0) { row.push(cornerIds[0]); continue; }
        if (i === gx && j === 0) { row.push(cornerIds[1]); continue; }
        if (i === gx && j === gy) { row.push(cornerIds[2]); continue; }
        if (i === 0 && j === gy) { row.push(cornerIds[3]); continue; }
      }

      // Bilinear interpolation between the 4 corners.
      const x = (1 - u) * (1 - v) * c0.x + u * (1 - v) * c1.x + u * v * c2.x + (1 - u) * v * c3.x;
      const y = (1 - u) * (1 - v) * c0.y + u * (1 - v) * c1.y + u * v * c2.y + (1 - u) * v * c3.y;
      const z = (1 - u) * (1 - v) * c0.z + u * (1 - v) * c1.z + u * v * c2.z + (1 - u) * v * c3.z;

      // Weld to an existing coincident node if there is one, else create.
      const existing = hooks.findNode(x, y, z);
      if (existing != null) { row.push(existing); continue; }
      row.push(hooks.addNode(x, y, z));
      newNodes++;
    }
    nodeGrid.push(row);
  }

  let quadCount = 0;
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      hooks.addQuad([
        nodeGrid[j][i],
        nodeGrid[j][i + 1],
        nodeGrid[j + 1][i + 1],
        nodeGrid[j + 1][i],
      ]);
      quadCount++;
    }
  }

  return { nodeGrid, newNodes, quadCount };
}
