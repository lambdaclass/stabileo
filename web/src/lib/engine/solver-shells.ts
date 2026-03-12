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
import { enrichWithShellStresses } from './shell-stress-recovery';

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

// ─── Surface loads (PRO-only load type) ──────────────────────────

/** Convert a surface3d pressure load on a quad to equivalent nodal loads. */
export function convertSurfaceLoad(
  load: SurfaceLoad3D,
  quads: Map<number, QuadData>,
  nodes: Map<number, Node>,
): SolverLoad3D[] {
  const out: SolverLoad3D[] = [];
  const quad = quads.get(load.quadId);
  if (!quad) return out;

  const ns = quad.nodes.map(nid => nodes.get(nid));
  if (ns.some(n => !n)) return out;
  const [p0, p1, p2, p3] = ns as [Node, Node, Node, Node];

  const area = triArea3D(p0, p1, p2) + triArea3D(p0, p2, p3);
  const F = -load.q * area / 4; // negative Y = downward

  for (const nid of quad.nodes) {
    out.push({
      type: 'nodal',
      data: { nodeId: nid, fx: 0, fy: F, fz: 0, mx: 0, my: 0, mz: 0 },
    });
  }
  return out;
}

/** Placeholder for thermal quad loads (not yet implemented in solver). */
export function convertThermalQuadLoad(_load: ThermalLoadQuad3D): SolverLoad3D[] {
  // TODO: Convert quad thermal loads when solver exposes SolverThermalLoadQuad.
  return [];
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
        data: { nodeId: nid, fx: 0, fy: wPerNode, fz: 0, mx: 0, my: 0, mz: 0 },
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
    const [p0, p1, p2, p3] = ns as [Node, Node, Node, Node];
    const area = triArea3D(p0, p1, p2) + triArea3D(p0, p2, p3);
    const totalWeight = mat.rho * quad.thickness * area;
    const wPerNode = -totalWeight / 4;
    for (const nid of quad.nodes) {
      out.push({
        type: 'nodal',
        data: { nodeId: nid, fx: 0, fy: wPerNode, fz: 0, mx: 0, my: 0, mz: 0 },
      });
    }
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

/** Run shell stress recovery on solver results (PRO-only post-processing). */
export function postProcessShellStresses(
  results: AnalysisResults3D,
  nodes: Map<number, Node>,
  quads: Map<number, QuadData>,
  plates: Map<number, PlateData>,
  materials: Map<number, Material>,
): void {
  if (quads.size > 0 || plates.size > 0) {
    enrichWithShellStresses(results, nodes, quads as any, plates as any, materials);
  }
}
