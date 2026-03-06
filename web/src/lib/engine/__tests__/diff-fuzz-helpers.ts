/**
 * Differential fuzzing helpers — seeded random model generator.
 * Produces reproducible 2D structural models for TS↔Rust parity testing.
 */

import type { SolverInput, SolverLoad } from '../types';

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
