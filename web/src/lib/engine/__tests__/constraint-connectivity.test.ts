/**
 * Pre-flight validator coverage for constraint-only-connected nodes.
 *
 * Verifies that nodes coupled solely through a Constraint3D variant
 * (rigidLink, equalDOF, eccentricConnection, diaphragm, linearMPC) are NOT
 * incorrectly flagged as orphans by the JS preflight in solver-service.ts.
 *
 * The Rust solver itself is untouched. This is purely about the JS
 * validator's connectivity rule (see constraint-connectivity.ts).
 *
 * We assert against the validator's RETURN VALUE rather than the WASM
 * solve result: if the validator emits the disconnected-node error string
 * before reaching the solver, that's the regression we're guarding against.
 * Any post-validator outcome (mechanism, hypostatic, success) is fine for
 * this purpose — the orphan branch must not fire.
 */

import { describe, it, expect } from 'vitest';
import { validateAndSolve2D, validateAndSolve3D, type ModelData } from '../solver-service';
import type { Constraint3D } from '../types-3d';

// Build a minimal 2D model: two valid nodes connected by one frame element,
// with a fixed support at node 1, plus an extra "constraint-only" node 3.
function baseModel2D(extraNodeId: number): ModelData {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: 5, y: 0 }],
      [extraNodeId, { id: extraNodeId, x: 5, y: 1 }],
    ]),
    materials: new Map([
      [1, { id: 1, name: 'steel', E: 210e9, nu: 0.3, density: 7850, fy: 250e6 }],
    ]),
    sections: new Map([
      [1, { id: 1, name: 's', shape: 'IPE', label: 'IPE200', A: 0.0029, Iz: 1.94e-5, Iy: 1.42e-6, J: 6.98e-8, h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085 }],
    ]),
    elements: new Map([
      [1, {
        id: 1, type: 'frame', nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1,
        releaseI: { my: false, mz: false, t: false },
        releaseJ: { my: false, mz: false, t: false },
      }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed' }],
    ]),
    loads: [],
  };
}

// Same idea in 3D, with a 3D-shaped element + 3D-shaped support.
function baseModel3D(extraNodeId: number): ModelData {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 5, y: 0, z: 0 }],
      [extraNodeId, { id: extraNodeId, x: 5, y: 0, z: 1 }],
    ]),
    materials: new Map([
      [1, { id: 1, name: 'steel', E: 210e9, nu: 0.3, density: 7850, fy: 250e6 }],
    ]),
    sections: new Map([
      [1, { id: 1, name: 's', shape: 'IPE', label: 'IPE200', A: 0.0029, Iz: 1.94e-5, Iy: 1.42e-6, J: 6.98e-8, h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085 }],
    ]),
    elements: new Map([
      [1, {
        id: 1, type: 'frame', nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1,
        releaseI: { my: false, mz: false, t: false },
        releaseJ: { my: false, mz: false, t: false },
      }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed3d' }],
    ]),
    loads: [],
  };
}

const ORPHAN_RX = /is not connected to any element|no está conectado a ningún elemento/i;
const DISCONNECTED_GRAPH_RX = /disconnected.*graph|grafo desconectado/i;

function assertNotOrphanError(result: unknown, label: string) {
  if (typeof result === 'string') {
    expect(result, `${label} — orphan-node error must not fire`).not.toMatch(ORPHAN_RX);
    expect(result, `${label} — disconnected-graph error must not fire`).not.toMatch(DISCONNECTED_GRAPH_RX);
  }
  // Else (object | null) → passed orphan + BFS gates → success.
}

describe('JS preflight validator: constraint-linked nodes are not orphans', () => {
  describe('2D (validateAndSolve2D)', () => {
    it('rigidLink master ↔ slave: the slave-only-via-constraint node passes the orphan check', () => {
      const m = baseModel2D(3);
      const c: Constraint3D = { type: 'rigidLink', masterNode: 2, slaveNode: 3, dofs: [0, 1, 2] };
      m.constraints = [c];
      const result = validateAndSolve2D(m);
      assertNotOrphanError(result, 'rigidLink');
    });

    it('equalDOF master ↔ slave: same', () => {
      const m = baseModel2D(3);
      const c: Constraint3D = { type: 'equalDOF', masterNode: 2, slaveNode: 3, dofs: [0, 1] };
      m.constraints = [c];
      const result = validateAndSolve2D(m);
      assertNotOrphanError(result, 'equalDOF');
    });

    it('eccentricConnection master ↔ slave: same', () => {
      const m = baseModel2D(3);
      const c: Constraint3D = {
        type: 'eccentricConnection', masterNode: 2, slaveNode: 3,
        offsetX: 0, offsetY: 1, offsetZ: 0,
        releases: [false, false, false],
      };
      m.constraints = [c];
      const result = validateAndSolve2D(m);
      assertNotOrphanError(result, 'eccentricConnection');
    });

    it('diaphragm master + multiple slaves: extra slave-only node passes', () => {
      const m = baseModel2D(3);
      const c: Constraint3D = { type: 'diaphragm', masterNode: 2, slaveNodes: [3], plane: 'XY' };
      m.constraints = [c];
      const result = validateAndSolve2D(m);
      assertNotOrphanError(result, 'diaphragm');
    });

    it('linearMPC term set covers a constraint-only node', () => {
      const m = baseModel2D(3);
      const c: Constraint3D = {
        type: 'linearMPC',
        terms: [
          { nodeId: 2, dof: 0, coefficient: 1 },
          { nodeId: 3, dof: 0, coefficient: -1 },
        ],
      };
      m.constraints = [c];
      const result = validateAndSolve2D(m);
      assertNotOrphanError(result, 'linearMPC');
    });
  });

  describe('3D (validateAndSolve3D)', () => {
    it('rigidLink covers the orphan node in 3D', () => {
      const m = baseModel3D(3);
      const c: Constraint3D = { type: 'rigidLink', masterNode: 2, slaveNode: 3, dofs: [0, 1, 2, 3, 4, 5] };
      m.constraints = [c];
      const result = validateAndSolve3D(m);
      assertNotOrphanError(result, '3D rigidLink');
    });

    it('equalDOF covers the orphan node in 3D', () => {
      const m = baseModel3D(3);
      const c: Constraint3D = { type: 'equalDOF', masterNode: 2, slaveNode: 3, dofs: [0, 1, 2] };
      m.constraints = [c];
      const result = validateAndSolve3D(m);
      assertNotOrphanError(result, '3D equalDOF');
    });

    it('eccentricConnection covers the orphan node in 3D', () => {
      const m = baseModel3D(3);
      const c: Constraint3D = {
        type: 'eccentricConnection', masterNode: 2, slaveNode: 3,
        offsetX: 0, offsetY: 0, offsetZ: 1,
        releases: [false, false, false, false, false, false],
      };
      m.constraints = [c];
      const result = validateAndSolve3D(m);
      assertNotOrphanError(result, '3D eccentricConnection');
    });

    it('diaphragm covers the orphan node in 3D', () => {
      const m = baseModel3D(3);
      const c: Constraint3D = { type: 'diaphragm', masterNode: 2, slaveNodes: [3], plane: 'XY' };
      m.constraints = [c];
      const result = validateAndSolve3D(m);
      assertNotOrphanError(result, '3D diaphragm');
    });

    it('linearMPC covers the orphan node in 3D', () => {
      const m = baseModel3D(3);
      const c: Constraint3D = {
        type: 'linearMPC',
        terms: [
          { nodeId: 2, dof: 2, coefficient: 1 },
          { nodeId: 3, dof: 2, coefficient: -1 },
        ],
      };
      m.constraints = [c];
      const result = validateAndSolve3D(m);
      assertNotOrphanError(result, '3D linearMPC');
    });
  });

  describe('Negative control: a node with NO connectivity still flags', () => {
    it('a free-floating node with no element / connector / constraint still produces the orphan error', () => {
      const m = baseModel2D(99);
      // No constraint; node 99 is genuinely orphan.
      const result = validateAndSolve2D(m);
      expect(typeof result).toBe('string');
      expect(result as string).toMatch(ORPHAN_RX);
    });
  });
});
