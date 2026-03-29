/**
 * Central plane projection helpers for 3D→2D workflow.
 *
 * When a 3D model is viewed/analyzed in 2D mode with a selected drawing plane
 * (XY, XZ, YZ), all coordinate mappings flow through these helpers:
 *
 * - forward: 3D → 2D (for rendering, hit-testing, solver input)
 * - inverse: 2D → 3D (for editing, node creation, drag back-projection)
 *
 * The 2D convention is always: first axis = horizontal, second axis = vertical.
 *   XY: x→horizontal, y→vertical  (default, classic 2D)
 *   XZ: x→horizontal, z→vertical  (structural frame convention)
 *   YZ: y→horizontal, z→vertical
 */

export type DrawPlane = 'xy' | 'xz' | 'yz';

/** Project a 3D point to 2D coordinates in the selected plane. */
export function to2D(plane: DrawPlane, x: number, y: number, z: number): { x: number; y: number } {
  switch (plane) {
    case 'xz': return { x, y: z };
    case 'yz': return { x: y, y: z };
    default:   return { x, y };
  }
}

/** Back-project a 2D point to 3D, keeping the off-plane coordinate fixed. */
export function to3D(plane: DrawPlane, u: number, v: number, original: { x: number; y: number; z?: number }): { x: number; y: number; z: number } {
  switch (plane) {
    case 'xz': return { x: u, y: original.y, z: v };
    case 'yz': return { x: original.x, y: u, z: v };
    default:   return { x: u, y: v, z: original.z ?? 0 };
  }
}

/** Project a node-like object to 2D. Returns a new object with projected x/y. */
export function projectNode<T extends { x: number; y: number; z?: number }>(plane: DrawPlane, node: T): T {
  const p = to2D(plane, node.x, node.y, node.z ?? 0);
  return { ...node, x: p.x, y: p.y };
}

/**
 * Remap a 2D-convention nodal load (fx, fy with fy=vertical) to 3D components
 * so the 2D solver receives loads in the correct orientation.
 *
 * In 2D solver convention: fx = horizontal force, fy = vertical force (gravity direction).
 * When the drawing plane is XZ, the 2D "vertical" maps to the 3D Z axis.
 */
export function remapNodalLoad2D(plane: DrawPlane, fx3d: number, fy3d: number, fz3d: number): { fx: number; fy: number } {
  switch (plane) {
    case 'xz': return { fx: fx3d, fy: fz3d };
    case 'yz': return { fx: fy3d, fy: fz3d };
    default:   return { fx: fx3d, fy: fy3d };
  }
}

/**
 * Remap a 3D moment about each axis to the single 2D rotation (about the
 * out-of-plane axis).
 *   XY plane → rotation about Z
 *   XZ plane → rotation about Y (sign flip: right-hand rule)
 *   YZ plane → rotation about X
 */
export function remapMoment2D(plane: DrawPlane, mx: number, my: number, mz: number): number {
  switch (plane) {
    case 'xz': return -my;  // RH rule: XZ plane, out-of-plane = -Y
    case 'yz': return mx;
    default:   return mz;
  }
}

/**
 * Map 2D solver displacement results back to 3D coordinates.
 * 2D solver returns (ux, uy, rz) where uy = vertical displacement.
 */
export function remapDisplacement3D(plane: DrawPlane, ux2d: number, uy2d: number, rz2d: number): { ux: number; uy: number; uz: number; ry: number } {
  switch (plane) {
    case 'xz': return { ux: ux2d, uy: 0, uz: uy2d, ry: -rz2d };
    case 'yz': return { ux: 0, uy: ux2d, uz: uy2d, ry: rz2d };
    default:   return { ux: ux2d, uy: uy2d, uz: 0, ry: rz2d };
  }
}

// ─── Simplified 2D model builder ─────────────────────────────

export interface SimplifiedModel {
  nodes: Map<number, { id: number; x: number; y: number }>;
  elements: Map<number, { id: number; type: string; nodeI: number; nodeJ: number; materialId: number; sectionId: number; hingeStart: boolean; hingeEnd: boolean }>;
  supports: Map<number, { id: number; nodeId: number; type: string; [k: string]: unknown }>;
  loads: Array<{ type: string; data: Record<string, unknown> }>;
  /** Original model's materials/sections passed through unchanged */
  materials: Map<number, any>;
  sections: Map<number, any>;
  /** Stats about the reduction */
  stats: { mergedNodes: number; removedElements: number; duplicateElements: number };
}

export type SimplifiedResult = { ok: true; model: SimplifiedModel } | { ok: false; error: string };

const MERGE_TOL = 1e-4;

/**
 * Build a simplified 2D model by projecting 3D geometry onto a plane.
 * - Merges coincident projected nodes
 * - Removes zero-length elements
 * - Detects duplicate projected elements (same endpoints) and keeps only one
 * - Sums nodal loads at merged nodes
 * - Resolves supports conservatively
 */
export function buildSimplified2DModel(
  plane: DrawPlane,
  nodes: Iterable<{ id: number; x: number; y: number; z?: number }>,
  elements: Iterable<{ id: number; type: string; nodeI: number; nodeJ: number; materialId: number; sectionId: number; hingeStart: boolean; hingeEnd: boolean }>,
  supports: Iterable<{ id: number; nodeId: number; type: string; [k: string]: unknown }>,
  loads: Iterable<{ type: string; data: Record<string, unknown> }>,
  materials: Map<number, any>,
  sections: Map<number, any>,
): SimplifiedResult {
  // 1. Project nodes and merge coincident ones
  const projected = new Map<number, { x: number; y: number }>();
  for (const n of nodes) {
    projected.set(n.id, to2D(plane, n.x, n.y, n.z ?? 0));
  }

  // Group nodes by proximity: map original ID → merged ID
  const mergeMap = new Map<number, number>(); // old ID → new ID (the first one encountered)
  const mergedCoords: Array<{ id: number; x: number; y: number; sourceIds: number[] }> = [];
  for (const [id, p] of projected) {
    let found = false;
    for (const mc of mergedCoords) {
      if (Math.abs(mc.x - p.x) < MERGE_TOL && Math.abs(mc.y - p.y) < MERGE_TOL) {
        mergeMap.set(id, mc.id);
        mc.sourceIds.push(id);
        found = true;
        break;
      }
    }
    if (!found) {
      mergeMap.set(id, id);
      mergedCoords.push({ id, x: p.x, y: p.y, sourceIds: [id] });
    }
  }
  const mergedNodes = mergedCoords.filter(mc => mc.sourceIds.length > 1).length;
  const totalMergedAway = [...projected.keys()].length - mergedCoords.length;

  // 2. Build reduced node map
  const outNodes = new Map<number, { id: number; x: number; y: number }>();
  for (const mc of mergedCoords) {
    outNodes.set(mc.id, { id: mc.id, x: mc.x, y: mc.y });
  }

  // 3. Project elements, remove collapsed, detect duplicates
  const elemArr = [...elements];
  let removedElements = 0;
  let duplicateElements = 0;
  const edgeSet = new Set<string>();
  const outElements = new Map<number, { id: number; type: string; nodeI: number; nodeJ: number; materialId: number; sectionId: number; hingeStart: boolean; hingeEnd: boolean }>();

  for (const e of elemArr) {
    const nI = mergeMap.get(e.nodeI) ?? e.nodeI;
    const nJ = mergeMap.get(e.nodeJ) ?? e.nodeJ;
    if (nI === nJ) { removedElements++; continue; } // collapsed

    const edgeKey = nI < nJ ? `${nI}-${nJ}` : `${nJ}-${nI}`;
    if (edgeSet.has(edgeKey)) { duplicateElements++; continue; } // duplicate
    edgeSet.add(edgeKey);

    outElements.set(e.id, { ...e, nodeI: nI, nodeJ: nJ });
  }

  // Reject if too many elements were lost (duplicates + collapsed > 30% of total).
  // A high loss ratio means the structure is genuinely 3D and the reduction is misleading.
  const totalLost = removedElements + duplicateElements;
  const lossRatio = elemArr.length > 0 ? totalLost / elemArr.length : 0;
  if (lossRatio > 0.30 && totalLost > 3) {
    const planeLabel = plane.toUpperCase();
    const pct = Math.round(lossRatio * 100);
    return { ok: false, error: `This model is too 3D for a ${planeLabel} reduction: ${pct}% of elements (${totalLost}/${elemArr.length}) are lost. Use 3D mode for accurate analysis.` };
  }

  if (outElements.size === 0) {
    return { ok: false, error: 'All elements collapse or are duplicates in this projection. Use 3D mode.' };
  }

  // 4. Resolve supports — map to merged nodes, remap 3D types to 2D
  const sup3dTo2d: Record<string, string> = {
    'fixed3d': 'fixed', 'pinned3d': 'pinned', 'spring3d': 'spring',
    'rollerXZ': 'rollerX', 'rollerXY': 'rollerX', 'rollerYZ': 'rollerX',
    'custom3d': 'pinned',
  };
  const outSupports = new Map<number, { id: number; nodeId: number; type: string; [k: string]: unknown }>();
  const supByMergedNode = new Map<number, { id: number; type: string; [k: string]: unknown }>();

  for (const s of supports) {
    const mergedId = mergeMap.get(s.nodeId) ?? s.nodeId;
    const type2d = sup3dTo2d[s.type] ?? s.type;
    const existing = supByMergedNode.get(mergedId);
    if (existing) {
      // Multiple supports merge to same node: check compatibility
      if (existing.type !== type2d) {
        // Take the most restrictive: fixed > pinned > roller
        const rank: Record<string, number> = { 'fixed': 3, 'pinned': 2, 'rollerX': 1, 'rollerY': 1, 'rollerZ': 1, 'spring': 1 };
        if ((rank[type2d] ?? 0) > (rank[existing.type] ?? 0)) {
          supByMergedNode.set(mergedId, { ...s, nodeId: mergedId, type: type2d });
        }
      }
    } else {
      supByMergedNode.set(mergedId, { ...s, nodeId: mergedId, type: type2d });
    }
  }
  let supId = 1;
  for (const [_nodeId, s] of supByMergedNode) {
    outSupports.set(supId, { ...s, id: supId });
    supId++;
  }

  // 5. Remap loads — sum nodal loads at merged nodes, remap types
  const nodalSums = new Map<number, { fx: number; fy: number; my: number; caseId?: number }>();
  const outLoads: Array<{ type: string; data: Record<string, unknown> }> = [];
  let loadId = 1;

  for (const l of loads) {
    if (l.type === 'nodal' || l.type === 'nodal3d') {
      const d = l.data as any;
      const mergedId = mergeMap.get(d.nodeId) ?? d.nodeId;
      let fx: number, fy: number, my: number;
      if (l.type === 'nodal3d') {
        const f = remapNodalLoad2D(plane, d.fx ?? 0, d.fy ?? 0, d.fz ?? 0);
        fx = f.fx; fy = f.fy;
        my = remapMoment2D(plane, d.mx ?? 0, d.my ?? 0, d.mz ?? 0);
      } else {
        const f = remapNodalLoad2D(plane, d.fx ?? 0, d.fz ?? d.fy ?? 0, 0);
        fx = f.fx; fy = f.fy;
        my = remapMoment2D(plane, 0, 0, d.my ?? d.mz ?? 0);
      }
      const key = mergedId * 1000 + (d.caseId ?? 1);
      const prev = nodalSums.get(key);
      if (prev) {
        prev.fx += fx; prev.fy += fy; prev.my += my;
      } else {
        nodalSums.set(key, { fx, fy, my, caseId: d.caseId });
      }
    } else if (l.type === 'distributed' || l.type === 'distributed3d') {
      const d = l.data as any;
      const elemId = d.elementId;
      if (!outElements.has(elemId)) continue; // element was removed
      let qI: number, qJ: number;
      if (l.type === 'distributed3d') {
        if (plane === 'xz' || plane === 'yz') { qI = d.qZI ?? 0; qJ = d.qZJ ?? 0; }
        else { qI = d.qYI ?? 0; qJ = d.qYJ ?? 0; }
      } else {
        qI = d.qI ?? 0; qJ = d.qJ ?? 0;
      }
      outLoads.push({ type: 'distributed', data: { id: loadId++, elementId: elemId, qI, qJ, angle: d.angle, isGlobal: d.isGlobal, caseId: d.caseId } });
    } else if (l.type === 'pointOnElement') {
      const d = l.data as any;
      if (!outElements.has(d.elementId)) continue;
      outLoads.push({ type: 'pointOnElement', data: { ...d, id: loadId++ } });
    } else if (l.type === 'thermal') {
      const d = l.data as any;
      if (!outElements.has(d.elementId)) continue;
      outLoads.push({ type: 'thermal', data: { ...d, id: loadId++ } });
    }
    // Other 3D-only load types (surface3d, etc.) are silently dropped
  }

  // Emit summed nodal loads
  for (const [key, sum] of nodalSums) {
    const nodeId = Math.floor(key / 1000);
    if (!outNodes.has(nodeId)) continue;
    if (Math.abs(sum.fx) < 1e-15 && Math.abs(sum.fy) < 1e-15 && Math.abs(sum.my) < 1e-15) continue;
    outLoads.push({ type: 'nodal', data: { id: loadId++, nodeId, fx: sum.fx, fz: sum.fy, my: sum.my, caseId: sum.caseId } });
  }

  return {
    ok: true,
    model: {
      nodes: outNodes,
      elements: outElements,
      supports: outSupports,
      loads: outLoads,
      materials,
      sections,
      stats: { mergedNodes: totalMergedAway, removedElements, duplicateElements },
    },
  };
}

/**
 * Check whether projecting a model onto a plane would collapse any elements.
 * Returns the number of elements that would become zero-length.
 */
export function countCollapsedElements(
  plane: DrawPlane,
  nodes: Iterable<{ id: number; x: number; y: number; z?: number }>,
  elements: Iterable<{ nodeI: number; nodeJ: number }>,
): number {
  const nodeMap = new Map<number, { x: number; y: number }>();
  for (const n of nodes) {
    const p = to2D(plane, n.x, n.y, n.z ?? 0);
    nodeMap.set(n.id, p);
  }
  let collapsed = 0;
  for (const e of elements) {
    const ni = nodeMap.get(e.nodeI), nj = nodeMap.get(e.nodeJ);
    if (!ni || !nj) continue;
    const L = Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2);
    if (L < 1e-8) collapsed++;
  }
  return collapsed;
}
