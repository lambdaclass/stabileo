/**
 * Differential fuzzing helpers — seeded random model generator.
 * Produces reproducible 2D/3D structural models for TS↔Rust parity testing.
 */

import type { SolverInput, SolverLoad } from '../types';
import type { SolverInput3D, SolverLoad3D } from '../types-3d';

// ─── Seeded xorshift32 PRNG ──────────────────────────────────────

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0 || 1; // ensure non-zero
  }

  /** Returns a number in [0, 1) */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return (x >>> 0) / 0x100000000;
  }

  /** Random integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Random float in [min, max] */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

// ─── Random 2D model generator ───────────────────────────────────

export function makeRandomModel2D(seed: number): SolverInput {
  const rng = new Rng(seed);
  const nNodes = rng.int(2, 6);

  // Generate nodes along X with some Y variation
  const nodes = new Map<number, { id: number; x: number; y: number }>();
  for (let i = 1; i <= nNodes; i++) {
    nodes.set(i, {
      id: i,
      x: (i - 1) * rng.float(2.0, 6.0),
      y: rng.next() < 0.3 ? rng.float(0, 4.0) : 0,
    });
  }

  // Material and section
  const materials = new Map([[1, { id: 1, e: 200e3, nu: 0.3 }]]);
  const sections = new Map([[1, { id: 1, a: rng.float(0.005, 0.05), iz: rng.float(0.00005, 0.001) }]]);

  // Generate frame elements connecting sequential nodes
  const nElems = Math.min(nNodes - 1, rng.int(1, 4));
  const elements = new Map<number, {
    id: number; type: 'frame' | 'truss'; nodeI: number; nodeJ: number;
    materialId: number; sectionId: number; hingeStart: boolean; hingeEnd: boolean;
  }>();
  for (let i = 1; i <= nElems; i++) {
    elements.set(i, {
      id: i,
      type: 'frame',
      nodeI: i,
      nodeJ: i + 1,
      materialId: 1,
      sectionId: 1,
      hingeStart: false,
      hingeEnd: false,
    });
  }

  // Supports: pinned at node 1, rollerX at last connected node
  const lastNode = nElems + 1;
  const supports = new Map([
    [1, { id: 1, nodeId: 1, type: 'pinned' as const }],
    [2, { id: 2, nodeId: lastNode, type: 'rollerX' as const }],
  ]);

  // Random loads (1-3)
  const nLoads = rng.int(1, 3);
  const loads: SolverLoad[] = [];
  for (let i = 0; i < nLoads; i++) {
    if (rng.next() < 0.5) {
      // Nodal load
      const targetNode = rng.int(1, lastNode);
      loads.push({
        type: 'nodal',
        data: {
          nodeId: targetNode,
          fx: rng.next() < 0.3 ? rng.float(-20, 20) : 0,
          fy: rng.float(-50, -5),
          mz: rng.next() < 0.2 ? rng.float(-10, 10) : 0,
        },
      });
    } else {
      // Distributed load on a random element
      const elemId = rng.int(1, nElems);
      loads.push({
        type: 'distributed',
        data: {
          elementId: elemId,
          qI: rng.float(-20, -2),
          qJ: rng.float(-20, -2),
        },
      });
    }
  }

  return { nodes, materials, sections, elements, supports, loads };
}

// ─── Random 3D model generator ───────────────────────────────────

/**
 * Asymmetric section profiles — Iy ≠ Iz to detect local axis swaps.
 * Based on real European steel profiles.
 */
const ASYM_SECTIONS = [
  // IPE 300:  A=53.8cm², Iy=8356cm⁴, Iz=604cm⁴, J=20.1cm⁴
  { a: 53.8e-4, iy: 8356e-8, iz: 604e-8, j: 20.1e-8 },
  // HEB 200:  A=78.1cm², Iy=5696cm⁴, Iz=2003cm⁴, J=59.3cm⁴
  { a: 78.1e-4, iy: 5696e-8, iz: 2003e-8, j: 59.3e-8 },
  // IPE 200:  A=28.5cm², Iy=1943cm⁴, Iz=142cm⁴, J=6.98cm⁴
  { a: 28.5e-4, iy: 1943e-8, iz: 142e-8, j: 6.98e-8 },
  // HEA 300:  A=112.5cm², Iy=18263cm⁴, Iz=6310cm⁴, J=85cm⁴
  { a: 112.5e-4, iy: 18263e-8, iz: 6310e-8, j: 85e-8 },
];

export function makeRandomModel3D(seed: number): SolverInput3D {
  const rng = new Rng(seed);

  // Pick an asymmetric section
  const sec = ASYM_SECTIONS[rng.int(0, ASYM_SECTIONS.length - 1)];

  // Generate 3-6 nodes in 3D space, ensuring not all coplanar.
  // Strategy: place ground-level nodes, then some elevated nodes,
  // and at least one node with non-zero Z to break coplanarity.
  const nNodes = rng.int(3, 6);
  const nodes = new Map<number, { id: number; x: number; y: number; z: number }>();

  // Node 1: origin (ground, will be fixed support)
  nodes.set(1, { id: 1, x: 0, y: 0, z: 0 });

  // Node 2: along X (ground)
  const spanX = rng.float(3, 8);
  nodes.set(2, { id: 2, x: spanX, y: 0, z: 0 });

  // Node 3: offset in Z to guarantee 3D behavior (ground or elevated)
  const zOff = rng.float(2, 6);
  const y3 = rng.next() < 0.5 ? rng.float(2, 5) : 0; // sometimes elevated
  nodes.set(3, { id: 3, x: rng.float(0, spanX * 0.5), y: y3, z: zOff });

  // Remaining nodes: random positions
  for (let i = 4; i <= nNodes; i++) {
    const x = rng.float(-2, spanX + 2);
    const y = rng.next() < 0.4 ? rng.float(2, 6) : 0; // 40% chance elevated
    const z = rng.float(-zOff, zOff);
    nodes.set(i, { id: i, x, y, z });
  }

  // Material: structural steel
  const materials = new Map([[1, { id: 1, e: 200e3, nu: 0.3 }]]);
  const sections = new Map([[1, { id: 1, a: sec.a, iy: sec.iy, iz: sec.iz, j: sec.j }]]);

  // Generate frame elements: connect sequential nodes + maybe cross-links
  const elements = new Map<number, {
    id: number; type: 'frame' | 'truss'; nodeI: number; nodeJ: number;
    materialId: number; sectionId: number;
    releaseMyStart: boolean; releaseMyEnd: boolean;
    releaseMzStart: boolean; releaseMzEnd: boolean;
    releaseTStart: boolean; releaseTEnd: boolean;
  }>();

  let elemId = 0;

  // Chain: 1→2, 2→3, ... (ensures connectivity)
  for (let i = 1; i < nNodes; i++) {
    elemId++;
    elements.set(elemId, {
      id: elemId, type: 'frame', nodeI: i, nodeJ: i + 1,
      materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
    });
  }

  // Maybe add 1-2 extra cross-links for redundancy
  const nExtra = rng.int(0, 2);
  for (let i = 0; i < nExtra; i++) {
    const nI = rng.int(1, nNodes);
    let nJ = rng.int(1, nNodes);
    if (nI === nJ) nJ = (nI % nNodes) + 1;
    // Check no duplicate element
    const exists = [...elements.values()].some(
      e => (e.nodeI === nI && e.nodeJ === nJ) || (e.nodeI === nJ && e.nodeJ === nI)
    );
    if (!exists) {
      elemId++;
      elements.set(elemId, {
        id: elemId, type: 'frame', nodeI: nI, nodeJ: nJ,
        materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
      });
    }
  }

  const nElems = elements.size;

  // Supports: fixed at node 1, pinned at node 2 (guaranteed stability for chain)
  // If node 3 is on ground (y=0), add a pinned support there too for extra stability
  const supports = new Map<number, {
    nodeId: number; rx: boolean; ry: boolean; rz: boolean;
    rrx: boolean; rry: boolean; rrz: boolean;
  }>();

  // Fixed support at node 1
  supports.set(1, {
    nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
  });

  // Pinned at node 2 (translations restrained, rotations free)
  supports.set(2, {
    nodeId: 2, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false,
  });

  // If node 3 is at ground level, pin it
  const node3 = nodes.get(3)!;
  if (node3.y === 0) {
    supports.set(3, {
      nodeId: 3, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false,
    });
  }

  // Random loads (2-4): mix of nodal and distributed with BOTH qY and qZ
  const nLoads = rng.int(2, 4);
  const loads: SolverLoad3D[] = [];

  // Always include at least one distributed load with qY AND qZ on a non-vertical element
  // Find a non-vertical element (not purely Y-direction)
  const elemArr = [...elements.values()];
  const nonVertElems = elemArr.filter(e => {
    const nI = nodes.get(e.nodeI)!;
    const nJ = nodes.get(e.nodeJ)!;
    const dx = nJ.x - nI.x;
    const dz = nJ.z - nI.z;
    return Math.abs(dx) + Math.abs(dz) > 0.1; // not purely vertical
  });

  if (nonVertElems.length > 0) {
    const target = nonVertElems[rng.int(0, nonVertElems.length - 1)];
    loads.push({
      type: 'distributed',
      data: {
        elementId: target.id,
        qYI: rng.float(-15, -3),
        qYJ: rng.float(-15, -3),
        qZI: rng.float(-10, 10),
        qZJ: rng.float(-10, 10),
      },
    });
  }

  // Remaining loads
  for (let i = loads.length; i < nLoads; i++) {
    const r = rng.next();
    if (r < 0.4) {
      // Nodal load in all 3 directions
      const targetNode = rng.int(1, nNodes);
      loads.push({
        type: 'nodal',
        data: {
          nodeId: targetNode,
          fx: rng.float(-20, 20),
          fy: rng.float(-50, -5),
          fz: rng.float(-15, 15),
          mx: 0, my: 0, mz: 0,
        },
      });
    } else if (r < 0.7 && nonVertElems.length > 0) {
      // Distributed load with both qY and qZ
      const target = nonVertElems[rng.int(0, nonVertElems.length - 1)];
      loads.push({
        type: 'distributed',
        data: {
          elementId: target.id,
          qYI: rng.float(-20, -2),
          qYJ: rng.float(-20, -2),
          qZI: rng.float(-8, 8),
          qZJ: rng.float(-8, 8),
        },
      });
    } else {
      // Nodal load with only Y component (gravity-like)
      const targetNode = rng.int(1, nNodes);
      loads.push({
        type: 'nodal',
        data: {
          nodeId: targetNode,
          fx: 0,
          fy: rng.float(-30, -5),
          fz: 0,
          mx: 0, my: 0, mz: 0,
        },
      });
    }
  }

  return { nodes, materials, sections, elements, supports, loads };
}
