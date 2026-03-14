// Rigid Diaphragm Pre-Processor
// Implements rigid floor diaphragm constraint as a model transformation.
// Does NOT modify the solver — transforms the input before solving.
//
// Strategy: For each floor level (group of nodes at same Z), add very stiff
// "penalty" beams connecting all nodes at that level to enforce rigid body motion
// (same ux, uy, θz). This preserves the existing solver interface.

import type { SolverInput3D, SolverNode3D, SolverElement3D, SolverSection3D, SolverMaterial } from './types-3d';
import type { SolverDiagnostic } from './types';

export interface DiaphragmLevel {
  z: number;          // floor elevation (m)
  nodeIds: number[];  // nodes at this level
  masterNodeId: number; // center of mass node
  tolerance: number;  // z-tolerance for grouping
}

export interface DiaphragmConfig {
  levels: number[];         // Z elevations to apply diaphragm
  tolerance?: number;       // default 0.05m (5cm) for grouping
  stiffnessMultiplier?: number; // default 1e6
}

/**
 * Detect floor levels by grouping nodes at similar Z coordinates
 */
export function detectFloorLevels(
  nodes: Map<number, SolverNode3D>,
  tolerance: number = 0.05,
): number[] {
  const zValues: number[] = [];
  for (const n of nodes.values()) {
    const z = n.z ?? 0;
    if (!zValues.some(zv => Math.abs(zv - z) < tolerance)) {
      zValues.push(z);
    }
  }
  zValues.sort((a, b) => a - b);
  // Return levels with more than 1 node (exclude base)
  return zValues.filter(z => {
    let count = 0;
    for (const n of nodes.values()) {
      if (Math.abs((n.z ?? 0) - z) < tolerance) count++;
    }
    return count >= 2;
  });
}

/**
 * Find the centroid (center of mass) of nodes at a given Z level
 */
function findCentroid(nodes: Map<number, SolverNode3D>, z: number, tol: number): { x: number; y: number } {
  let sx = 0, sy = 0, n = 0;
  for (const node of nodes.values()) {
    if (Math.abs((node.z ?? 0) - z) < tol) {
      sx += node.x;
      sy += node.y;
      n++;
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

/**
 * Apply rigid diaphragm constraints to a 3D model by adding very stiff
 * horizontal beams at each floor level.
 *
 * Returns a modified copy of the input — does NOT mutate the original.
 */
export function applyRigidDiaphragm(
  input: SolverInput3D,
  config: DiaphragmConfig,
): SolverInput3D {
  const tol = config.tolerance ?? 0.05;
  const mult = config.stiffnessMultiplier ?? 1e6;

  // Deep clone maps
  const nodes = new Map(input.nodes);
  const elements = new Map(input.elements);
  const materials = new Map(input.materials);
  const sections = new Map(input.sections);
  const supports = new Map(input.supports);
  const loads = [...input.loads];

  // Find max IDs to avoid collisions
  let maxNodeId = 0, maxElemId = 0, maxMatId = 0, maxSecId = 0;
  for (const id of nodes.keys()) maxNodeId = Math.max(maxNodeId, id);
  for (const id of elements.keys()) maxElemId = Math.max(maxElemId, id);
  for (const id of materials.keys()) maxMatId = Math.max(maxMatId, id);
  for (const id of sections.keys()) maxSecId = Math.max(maxSecId, id);

  // Find typical stiffness for scaling
  let typicalEA = 0;
  for (const [, mat] of materials) {
    for (const [, sec] of sections) {
      typicalEA = Math.max(typicalEA, mat.e * 1000 * sec.a); // kN
    }
  }
  if (typicalEA === 0) typicalEA = 1e8;

  // Create rigid diaphragm material (very stiff)
  const diagMatId = maxMatId + 1;
  materials.set(diagMatId, {
    id: diagMatId,
    e: 200000 * mult, // MPa × multiplier
    g: 80000 * mult,
    nu: 0.3,
    rho: 0, // massless
    fy: 0,
  });

  // Create rigid diaphragm section (large area, minimal inertia in vertical direction)
  const diagSecId = maxSecId + 1;
  sections.set(diagSecId, {
    id: diagSecId,
    a: 0.01 * mult,    // very large area
    iy: 1e-4 * mult,   // large horizontal inertia
    iz: 1e-4 * mult,   // large horizontal inertia
    j: 1e-4 * mult,    // large torsional stiffness
  });

  let nextElemId = maxElemId + 1;

  for (const zLevel of config.levels) {
    // Collect nodes at this level
    const levelNodeIds: number[] = [];
    for (const [id, n] of nodes) {
      if (Math.abs((n.z ?? 0) - zLevel) < tol) {
        levelNodeIds.push(id);
      }
    }

    if (levelNodeIds.length < 2) continue;

    // Find centroid — use first node as master hub
    const centroid = findCentroid(nodes, zLevel, tol);

    // Find node closest to centroid as master
    let masterNodeId = levelNodeIds[0];
    let minDist = Infinity;
    for (const nid of levelNodeIds) {
      const n = nodes.get(nid)!;
      const dist = Math.sqrt((n.x - centroid.x) ** 2 + (n.y - centroid.y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        masterNodeId = nid;
      }
    }

    // Connect all other nodes to master with rigid beams
    for (const nid of levelNodeIds) {
      if (nid === masterNodeId) continue;

      const ni = nodes.get(masterNodeId)!;
      const nj = nodes.get(nid)!;
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.001) continue; // skip coincident nodes

      elements.set(nextElemId, {
        id: nextElemId,
        type: 'frame',
        nodeI: masterNodeId,
        nodeJ: nid,
        materialId: diagMatId,
        sectionId: diagSecId,
        hingeStart: false,
        hingeEnd: false,
      });
      nextElemId++;
    }
  }

  return { nodes, elements, materials, sections, supports, loads };
}

/**
 * Get center of rigidity and center of mass for each floor level
 * (useful for eccentricity calculations per CIRSOC 103)
 */
export function getFloorProperties(
  nodes: Map<number, SolverNode3D>,
  levels: number[],
  tolerance: number = 0.05,
): Array<{ z: number; centerOfMass: { x: number; y: number }; nodeCount: number }> {
  return levels.map(z => {
    const cm = findCentroid(nodes, z, tolerance);
    let count = 0;
    for (const n of nodes.values()) {
      if (Math.abs((n.z ?? 0) - z) < tolerance) count++;
    }
    return { z, centerOfMass: cm, nodeCount: count };
  });
}
