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
 * Below this, a projected load carries nothing and is not a load.
 *
 * Not a tolerance on geometry — a threshold on FORCE. A load whose in-plane
 * component is this small acts on nothing, and the 2D solver would integrate
 * it to zero anyway; the only question is whether anyone is told it is gone.
 */
export const LOAD_EPS = 1e-12;

/**
 * What a load still carries once projected onto a plane, as a magnitude.
 *
 * Existence is not the same question as effect, and for a slice they come
 * apart: a roof load pointing down the global Z has no component in a
 * HORIZONTAL frame, so it survives the cut as an object and acts on nothing.
 * Counting objects made that invisible — the dialog advertised forty loads,
 * the frame carried none, and the utilisation map painted it uniformly green.
 *
 * Summed componentwise rather than normed: this decides "is there anything
 * here at all", and for that a sum of absolute values is both cheaper and
 * strictly safer than a norm — it cannot cancel.
 *
 * Kinds with no 2D form (a surface load carries `quadId`, and a quad is not
 * something a plane frame can hold) return 0, which is what makes them show
 * up as dropped rather than vanish.
 */
export function inPlaneLoadMagnitude(
  load: { type: string; data: Record<string, unknown> },
  plane: DrawPlane,
): number {
  const d = load.data as Record<string, number | undefined>;
  const abs = (v: number | undefined) => Math.abs(v ?? 0);

  switch (load.type) {
    case 'nodal3d': {
      const f = remapNodalLoad2D(plane, d.fx ?? 0, d.fy ?? 0, d.fz ?? 0);
      return Math.abs(f.fx) + Math.abs(f.fy)
        + Math.abs(remapMoment2D(plane, d.mx ?? 0, d.my ?? 0, d.mz ?? 0));
    }
    case 'nodal': {
      // The legacy 2D shape stores the vertical in `fz`, falling back to `fy`.
      const f = remapNodalLoad2D(plane, d.fx ?? 0, d.fz ?? d.fy ?? 0, 0);
      return Math.abs(f.fx) + Math.abs(f.fy)
        + Math.abs(remapMoment2D(plane, 0, 0, d.my ?? d.mz ?? 0));
    }
    case 'distributed3d':
      return plane === 'xy'
        ? abs(d.qYI) + abs(d.qYJ)
        : abs(d.qZI) + abs(d.qZJ);
    case 'distributed':
      return abs(d.qI) + abs(d.qJ);
    case 'pointOnElement':
      return abs(d.p) + abs(d.px) + abs(d.my);
    case 'thermal':
      return abs(d.dtUniform) + abs(d.dtGradient);
    default:
      return 0;
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
  elements: Map<number, { id: number; type: string; nodeI: number; nodeJ: number; materialId: number; sectionId: number; releaseI?: { my: boolean; mz: boolean; t: boolean }; releaseJ?: { my: boolean; mz: boolean; t: boolean } }>;
  supports: Map<number, { id: number; nodeId: number; type: string; [k: string]: unknown }>;
  loads: Array<{ type: string; data: Record<string, unknown> }>;
  /** Original model's materials/sections passed through unchanged */
  materials: Map<number, any>;
  sections: Map<number, any>;
  /** Stats about the reduction */
  stats: {
    mergedNodes: number; removedElements: number; duplicateElements: number;
    droppedLoads: number;
    /**
     * How many of the INPUT loads reached the 2D model carrying something.
     *
     * Not `loads.length`: the builder sums nodal loads that land on one merged
     * node, so three loads can leave as one and counting the output would say
     * two went missing when none did. Counting sources keeps
     * `carriedLoads + droppedLoads` equal to what came in, which is the
     * property that makes either number trustworthy.
     */
    carriedLoads: number;
  };
}

export type SimplifiedResult = { ok: true; model: SimplifiedModel } | { ok: false; error: string };

/**
 * The builder's one failure, as a named constant: the store maps it onto an
 * i18n key for the dialog, while the legacy toolbar modal still toasts the
 * sentence itself — which is why it stays an English string at the source.
 */
export const PROJECTION_COLLAPSE_ERROR =
  'All elements collapse or are duplicates in this projection. Use 3D mode.';

const MERGE_TOL = 1e-4;

type ReleaseShape = { my: boolean; mz: boolean; t: boolean };

/**
 * Which local bending axis is the IN-PLANE one for a member, given the plane
 * its 2D image will live in.
 *
 * The 2D solver reads only `release.mz` as the bending hinge, but a 3D model
 * stores the in-plane hinge under whichever LOCAL axis is normal to the
 * plane, and that is not always z: with the canonical auto-orient (local z =
 * global up projected ⊥ the member; see engine/local-axes-3d.ts), a member
 * lying in the XZ plane has local y as the plane normal, so its in-plane
 * hinge is `my` — copying releases verbatim would lose it, and would invent
 * a phantom hinge from the out-of-plane `mz`. YZ is split: horizontal members
 * get the normal from local y, vertical (Z-aligned) ones from local z, via
 * the same near-vertical fallback the solver uses.
 */
function inPlaneBendingAxis(
  plane: DrawPlane,
  dx: number, dy: number, dz: number,
): 'my' | 'mz' {
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (L < 1e-10) return 'mz';
  const ex = [dx / L, dy / L, dz / L];
  // Plane normal: the axis the plane does not contain.
  const n = plane === 'xy' ? [0, 0, 1] : plane === 'xz' ? [0, 1, 0] : [1, 0, 0];
  // Replicate the auto-orient: ez = up projected ⊥ ex, horizontal fallback
  // for near-vertical members, ey = ez × ex.
  const up = [0, 0, 1];
  const dotUp = ex[0] * up[0] + ex[1] * up[1] + ex[2] * up[2];
  let ezRaw: number[];
  if (Math.abs(dotUp) > 0.999) {
    const ref = [1, 0, 0];
    const dotH = ex[0] * ref[0] + ex[1] * ref[1] + ex[2] * ref[2];
    ezRaw = [ref[0] - dotH * ex[0], ref[1] - dotH * ex[1], ref[2] - dotH * ex[2]];
  } else {
    ezRaw = [up[0] - dotUp * ex[0], up[1] - dotUp * ex[1], up[2] - dotUp * ex[2]];
  }
  const ezLen = Math.sqrt(ezRaw[0] ** 2 + ezRaw[1] ** 2 + ezRaw[2] ** 2);
  if (ezLen < 1e-10) return 'mz';
  const ez = [ezRaw[0] / ezLen, ezRaw[1] / ezLen, ezRaw[2] / ezLen];
  const ey = [
    ez[1] * ex[2] - ez[2] * ex[1],
    ez[2] * ex[0] - ez[0] * ex[2],
    ez[0] * ex[1] - ez[1] * ex[0],
  ];
  const eyDot = Math.abs(ey[0] * n[0] + ey[1] * n[1] + ey[2] * n[2]);
  const ezDot = Math.abs(ez[0] * n[0] + ez[1] * n[1] + ez[2] * n[2]);
  return eyDot >= ezDot ? 'my' : 'mz';
}

/**
 * Rewrite a 3D release for the 2D model: the hinge about the plane normal
 * lands in `mz`, where the 2D solver looks for it, and the out-of-plane
 * bending release is dropped rather than left to masquerade as an in-plane
 * hinge. Torsion passes through; it means nothing to the 2D solver either
 * way, and dropping it would only hide what the 3D model said.
 */
function remapReleaseToPlane(r: ReleaseShape | undefined, axis: 'my' | 'mz'): ReleaseShape | undefined {
  if (!r) return r;
  return { ...r, my: false, mz: axis === 'my' ? r.my : r.mz };
}

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
  elements: Iterable<{ id: number; type: string; nodeI: number; nodeJ: number; materialId: number; sectionId: number; releaseI?: { my: boolean; mz: boolean; t: boolean }; releaseJ?: { my: boolean; mz: boolean; t: boolean } }>,
  supports: Iterable<{ id: number; nodeId: number; type: string; [k: string]: unknown }>,
  loads: Iterable<{ type: string; data: Record<string, unknown> }>,
  materials: Map<number, any>,
  sections: Map<number, any>,
): SimplifiedResult {
  // 1. Project nodes and merge coincident ones
  const projected = new Map<number, { x: number; y: number }>();
  // Original 3D coordinates, kept for the release remap: which local axis is
  // the in-plane one depends on the member's 3D direction (see step 3).
  const orig3D = new Map<number, { x: number; y: number; z: number }>();
  for (const n of nodes) {
    projected.set(n.id, to2D(plane, n.x, n.y, n.z ?? 0));
    orig3D.set(n.id, { x: n.x, y: n.y, z: n.z ?? 0 });
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
  const outElements = new Map<number, { id: number; type: string; nodeI: number; nodeJ: number; materialId: number; sectionId: number; releaseI?: { my: boolean; mz: boolean; t: boolean }; releaseJ?: { my: boolean; mz: boolean; t: boolean } }>();

  for (const e of elemArr) {
    const nI = mergeMap.get(e.nodeI) ?? e.nodeI;
    const nJ = mergeMap.get(e.nodeJ) ?? e.nodeJ;
    if (nI === nJ) { removedElements++; continue; } // collapsed

    const edgeKey = nI < nJ ? `${nI}-${nJ}` : `${nJ}-${nI}`;
    if (edgeSet.has(edgeKey)) { duplicateElements++; continue; } // duplicate
    edgeSet.add(edgeKey);

    /*
     * Releases cannot cross the projection verbatim: the 2D solver reads only
     * `mz` as the bending hinge, and a 3D frame's IN-PLANE hinge lives under
     * whichever local axis is normal to the plane (for an XZ frame that is
     * `my`, not `mz`). Remap so the hinge survives and the out-of-plane
     * release does not become a phantom in-plane one.
     */
    let releaseI = e.releaseI;
    let releaseJ = e.releaseJ;
    if (releaseI || releaseJ) {
      const a = orig3D.get(e.nodeI);
      const b = orig3D.get(e.nodeJ);
      if (a && b) {
        const axis = inPlaneBendingAxis(plane, b.x - a.x, b.y - a.y, b.z - a.z);
        releaseI = remapReleaseToPlane(releaseI, axis);
        releaseJ = remapReleaseToPlane(releaseJ, axis);
      }
    }

    outElements.set(e.id, { ...e, nodeI: nI, nodeJ: nJ, releaseI, releaseJ });
  }

  if (outElements.size === 0) {
    return { ok: false, error: PROJECTION_COLLAPSE_ERROR };
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
  // `sources` is how many of the model's loads fed each sum, so a sum that
  // vanishes can report how many loads went with it rather than counting as one.
  const nodalSums = new Map<number, { fx: number; fy: number; my: number; caseId?: number; sources: number }>();
  const outLoads: Array<{ type: string; data: Record<string, unknown> }> = [];
  let loadId = 1;
  /*
   * Counted, not silently swallowed: a load attached to something the
   * projection removed, or of a kind 2D cannot carry, is a modelling fact
   * the user should hear about — "eight loads were left behind" is the
   * difference between a clean reduction and a quietly weaker structure.
   */
  let droppedLoads = 0;
  // Counted in SOURCE loads, not emitted ones — see `carriedLoads` on the type.
  let carriedLoads = 0;

  /*
   * ONE rule for "this carries nothing", shared with the preview.
   *
   * Applied per type it drifted immediately: the distributed branch got the
   * check and `pointOnElement` and `thermal` did not, so a point load of 0 kN
   * was advertised as nothing by the preview and counted as carried here.
   * That is the same lie this whole count exists to stop, in a rarer type —
   * and the library sweep could not see it, because no shipped fixture holds
   * a zero-magnitude load of those kinds.
   *
   * Nodal loads are NOT checked here: several can land on one merged node, and
   * two that individually carry something can still sum to nothing. That is
   * decided on the sum, below.
   */
  const carriesNothing = (l: { type: string; data: Record<string, unknown> }) =>
    inPlaneLoadMagnitude(l, plane) < LOAD_EPS;

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
        prev.fx += fx; prev.fy += fy; prev.my += my; prev.sources++;
      } else {
        nodalSums.set(key, { fx, fy, my, caseId: d.caseId, sources: 1 });
      }
    } else if (l.type === 'distributed' || l.type === 'distributed3d') {
      const d = l.data as any;
      const elemId = d.elementId;
      if (!outElements.has(elemId)) { droppedLoads++; continue; } // element was removed
      let qI: number, qJ: number;
      if (l.type === 'distributed3d') {
        if (plane === 'xz' || plane === 'yz') { qI = d.qZI ?? 0; qJ = d.qZJ ?? 0; }
        else { qI = d.qYI ?? 0; qJ = d.qYJ ?? 0; }
      } else {
        qI = d.qI ?? 0; qJ = d.qJ ?? 0;
      }
      if (carriesNothing(l)) { droppedLoads++; continue; }
      carriedLoads++;
      outLoads.push({ type: 'distributed', data: { id: loadId++, elementId: elemId, qI, qJ, angle: d.angle, isGlobal: d.isGlobal, caseId: d.caseId } });
    } else if (l.type === 'pointOnElement') {
      const d = l.data as any;
      if (!outElements.has(d.elementId)) { droppedLoads++; continue; }
      if (carriesNothing(l)) { droppedLoads++; continue; }
      carriedLoads++;
      outLoads.push({ type: 'pointOnElement', data: { ...d, id: loadId++ } });
    } else if (l.type === 'thermal') {
      const d = l.data as any;
      if (!outElements.has(d.elementId)) { droppedLoads++; continue; }
      if (carriesNothing(l)) { droppedLoads++; continue; }
      carriedLoads++;
      outLoads.push({ type: 'thermal', data: { ...d, id: loadId++ } });
    } else {
      // 3D-only load types (surface3d, pointOnElement3d, …) have no 2D form.
      droppedLoads++;
    }
  }

  // Emit summed nodal loads
  for (const [key, sum] of nodalSums) {
    const nodeId = Math.floor(key / 1000);
    // Both of these are losses, and both are counted by how many of the
    // model's loads went into the sum — a node that merged three loads and
    // then dropped out took three with it, not one.
    if (!outNodes.has(nodeId)) { droppedLoads += sum.sources; continue; }
    if (Math.abs(sum.fx) < LOAD_EPS && Math.abs(sum.fy) < LOAD_EPS && Math.abs(sum.my) < LOAD_EPS) {
      droppedLoads += sum.sources;
      continue;
    }
    carriedLoads += sum.sources;
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
      stats: { mergedNodes: totalMergedAway, removedElements, duplicateElements, droppedLoads, carriedLoads },
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
