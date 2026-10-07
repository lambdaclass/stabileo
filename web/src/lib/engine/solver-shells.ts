/**
 * solver-shells.ts — PRO-only shell element solver helpers.
 *
 * Extracts all plate/quad (DKT, MITC4) logic from the main solver-service
 * so that Basic 3D mode never touches shell code paths.
 *
 * Used exclusively when analysisMode === 'pro'.
 */

import type { SolverLoad3D, AnalysisResults3D } from './types-3d';
import type { Node, Material, SurfaceLoad3D, ThermalLoadQuad3D } from '../store/model.svelte';
import { shellLoadForces } from './shell-load-integration';
// Shell stress recovery now handled by WASM solver — TS fallback removed

// ─── Types ───────────────────────────────────────────────────────

interface PlateData {
  id: number;
  nodes: [number, number, number];
  materialId: number;
  thickness: number;
}

interface QuadData {
  id: number;
  nodes: [number, number, number, number];
  materialId: number;
  thickness: number;
}

// ─── Geometry helpers ────────────────────────────────────────────

function triArea3D(a: Node, b: Node, c: Node): number {
  const ex = b.x - a.x, ey = b.y - a.y, ez = (b.z ?? 0) - (a.z ?? 0);
  const fx = c.x - a.x, fy = c.y - a.y, fz = (c.z ?? 0) - (a.z ?? 0);
  return 0.5 * Math.sqrt(
    (ey * fz - ez * fy) ** 2 + (ez * fx - ex * fz) ** 2 + (ex * fy - ey * fx) ** 2,
  );
}

/**
 * Each corner's share of a uniform load over a quad: ∫ Nᵢ dA, with Nᵢ the bilinear shape
 * functions, by 2×2 Gauss over the quad's own surface. The shares add up to its area.
 *
 * A quarter of the area to each corner puts the resultant at the average of the corners, which is
 * the centroid only for a parallelogram; on an irregular mesh that moves the moment of every
 * pressure and of the shells' self-weight. These are the loads the element itself is consistent
 * with, and their resultant is at the area's centroid.
 */
export function quadCornerShares(p: readonly [Node, Node, Node, Node]): [number, number, number, number] {
  const g = 1 / Math.sqrt(3);
  const xi = [-1, 1, 1, -1], eta = [-1, -1, 1, 1];
  const out: [number, number, number, number] = [0, 0, 0, 0];
  const z = (n: Node) => n.z ?? 0;
  for (const a of [-g, g]) {
    for (const b of [-g, g]) {
      const dxi = [0, 0, 0], deta = [0, 0, 0];
      for (let i = 0; i < 4; i++) {
        const dNdxi = 0.25 * xi[i]! * (1 + b * eta[i]!), dNdeta = 0.25 * eta[i]! * (1 + a * xi[i]!);
        const c = [p[i]!.x, p[i]!.y, z(p[i]!)];
        for (let k = 0; k < 3; k++) { dxi[k] += dNdxi * c[k]!; deta[k] += dNdeta * c[k]!; }
      }
      const J = Math.hypot(dxi[1]! * deta[2]! - dxi[2]! * deta[1]!, dxi[2]! * deta[0]! - dxi[0]! * deta[2]!, dxi[0]! * deta[1]! - dxi[1]! * deta[0]!);
      for (let i = 0; i < 4; i++) out[i] += 0.25 * (1 + a * xi[i]!) * (1 + b * eta[i]!) * J;
    }
  }
  return out;
}

// ─── Surface loads (PRO-only load type) ──────────────────────────

/**
 * A surface load on a quad or a triangle as its consistent nodal forces
 * (`shell-load-integration.ts`): the engine's own pressure load vector for a uniform normal
 * pressure, and the same integral for every other direction, field and extent.
 */
export function convertSurfaceLoad(
  load: SurfaceLoad3D,
  quads: Map<number, QuadData> | undefined,
  nodes: Map<number, Node>,
  plates?: Map<number, PlateData>,
): SolverLoad3D[] {
  const shell = load.on === 'plate' ? plates?.get(load.quadId) : quads?.get(load.quadId);
  if (!shell) return [];
  const ns = shell.nodes.map((nid) => nodes.get(nid));
  if (ns.some((n) => !n)) return [];
  const r = shellLoadForces(load.on === 'plate' ? 'plate' : 'quad', ns as Node[], load);
  if (!r) return [];
  return shell.nodes.map((nid, i) => ({
    type: 'nodal' as const,
    data: { nodeId: nid, fx: r.forces[i]![0], fy: r.forces[i]![1], fz: r.forces[i]![2], mx: 0, my: 0, mz: 0 },
  }));
}

/**
 * A surface load's weight spread over its shell, kN/m², positive downward: its downward resultant
 * over the shell's area. What a mass source or a slab design reads as "the load per m²"; a
 * suction or a wall pressure gives nothing downward. Null when the shell is missing.
 */
export function surfaceDownwardPressure(
  load: SurfaceLoad3D,
  quads: Map<number, QuadData> | undefined,
  nodes: Map<number, Node>,
  plates?: Map<number, PlateData>,
): number | null {
  const shell = load.on === 'plate' ? plates?.get(load.quadId) : quads?.get(load.quadId);
  const pts = shell?.nodes.map((id) => nodes.get(id));
  if (!shell || !pts || pts.some((p) => !p)) return null;
  const r = shellLoadForces(load.on === 'plate' ? 'plate' : 'quad', pts as Node[], load);
  if (!r || !(r.area > 0)) return null;
  return -r.forces.reduce((s, f) => s + f[2], 0) / r.area;
}

/**
 * A temperature change on a quad, as the engine's `quadThermal` load.
 *
 * It used to return nothing — "not yet implemented in solver" — while the solver has taken
 * `quadThermal` all along (`SolverPlateThermalLoad`: the element, a uniform ΔT and a through-
 * thickness gradient). So a thermal load added to a slab in PRO was stored, drawn, and never
 * analysed: a model with ΔT on every plate solved identically to one without. The quad's
 * material α is sent with it (`thermal-alpha.ts`); without it the engine applies 1,2·10⁻⁵ /°C.
 */
export function convertThermalQuadLoad(load: ThermalLoadQuad3D, alpha?: number): SolverLoad3D[] {
  return [{
    // A triangle takes the engine's `plateThermal`, the same fields.
    type: load.on === 'plate' ? 'plateThermal' : 'quadThermal',
    data: { elementId: load.quadId, dtUniform: load.dtUniform, dtGradient: load.dtGradient ?? 0, ...(alpha !== undefined ? { alpha } : {}) },
    // Not a member of `SolverLoad3D`'s union, which types the member loads the app reads back;
    // this one only travels to the engine, which knows the tag.
  } as unknown as SolverLoad3D];
}

// ─── Self-weight for shell elements ──────────────────────────────

/** Compute self-weight nodal loads for DKT plate elements. */
export function plateSelfWeightLoads(
  plates: Map<number, PlateData>,
  nodes: Map<number, Node>,
  materials: Map<number, Material>,
): SolverLoad3D[] {
  const out: SolverLoad3D[] = [];
  for (const plate of plates.values()) {
    const mat = materials.get(plate.materialId);
    if (!mat) continue;
    const ns = plate.nodes.map(nid => nodes.get(nid));
    if (ns.some(n => !n)) continue;
    const [p0, p1, p2] = ns as [Node, Node, Node];
    const area = triArea3D(p0, p1, p2);
    const totalWeight = mat.rho * plate.thickness * area;
    const wPerNode = -totalWeight / 3;
    for (const nid of plate.nodes) {
      out.push({
        type: 'nodal',
        data: { nodeId: nid, fx: 0, fy: 0, fz: wPerNode, mx: 0, my: 0, mz: 0 },
      });
    }
  }
  return out;
}

/** Compute self-weight nodal loads for MITC4 quad elements. */
export function quadSelfWeightLoads(
  quads: Map<number, QuadData>,
  nodes: Map<number, Node>,
  materials: Map<number, Material>,
): SolverLoad3D[] {
  const out: SolverLoad3D[] = [];
  for (const quad of quads.values()) {
    const mat = materials.get(quad.materialId);
    if (!mat) continue;
    const ns = quad.nodes.map(nid => nodes.get(nid));
    if (ns.some(n => !n)) continue;
    const shares = quadCornerShares(ns as [Node, Node, Node, Node]);
    quad.nodes.forEach((nid, i) => {
      out.push({
        type: 'nodal',
        data: { nodeId: nid, fx: 0, fy: 0, fz: -mat.rho * quad.thickness * shares[i]!, mx: 0, my: 0, mz: 0 },
      });
    });
  }
  return out;
}

// ─── Shell connectivity for validation ───────────────────────────

/** Add plate/quad node IDs to a connected-nodes set. */
export function addShellConnectivity(
  connectedNodes: Set<number>,
  plates?: Map<number, PlateData>,
  quads?: Map<number, QuadData>,
): void {
  if (plates) {
    for (const plate of plates.values()) {
      for (const nid of plate.nodes) connectedNodes.add(nid);
    }
  }
  if (quads) {
    for (const quad of quads.values()) {
      for (const nid of quad.nodes) connectedNodes.add(nid);
    }
  }
}

/** Add plate/quad edge adjacency to a graph adjacency map. */
export function addShellAdjacency(
  adj: Map<number, Set<number>>,
  plates?: Map<number, PlateData>,
  quads?: Map<number, QuadData>,
): void {
  if (plates) {
    for (const plate of plates.values()) {
      for (let i = 0; i < plate.nodes.length; i++) {
        for (let j = i + 1; j < plate.nodes.length; j++) {
          adj.get(plate.nodes[i])?.add(plate.nodes[j]);
          adj.get(plate.nodes[j])?.add(plate.nodes[i]);
        }
      }
    }
  }
  if (quads) {
    for (const quad of quads.values()) {
      for (let i = 0; i < quad.nodes.length; i++) {
        for (let j = i + 1; j < quad.nodes.length; j++) {
          adj.get(quad.nodes[i])?.add(quad.nodes[j]);
          adj.get(quad.nodes[j])?.add(quad.nodes[i]);
        }
      }
    }
  }
}

// ─── Shell stress post-processing ────────────────────────────────

/** Shell stress post-processing — now a no-op, WASM solver provides stress data directly. */
export function postProcessShellStresses(
  _results: AnalysisResults3D,
  _nodes: Map<number, Node>,
  _quads: Map<number, QuadData>,
  _plates: Map<number, PlateData>,
  _materials: Map<number, Material>,
): void {
  // WASM solver returns plateStresses/quadStresses directly — no JS fallback needed
}
