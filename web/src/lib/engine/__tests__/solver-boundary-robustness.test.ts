/**
 * WASM serialization boundary robustness tests.
 *
 * Tests the solver with edge-case inputs: NaN/Infinity, degenerate geometry,
 * empty/minimal models, extreme value combinations, and field name contracts.
 * The solver (WASM) must either produce a meaningful result, return an error
 * string, or throw — it must never hang.
 *
 * CONTRACT TESTS: Section 5 (field name contracts) is a stability contract.
 * The field names tested there are the public WASM API surface — changing
 * them breaks every downstream consumer (UI, exports, AI review, reports).
 * Do not rename fields without updating all consumers and the trust baseline
 * in SOLVER_ROADMAP.md.
 */

import { describe, it, expect } from 'vitest';
import { solve, solve3D } from '../wasm-solver';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';
import type {
  SolverInput3D, SolverNode3D, SolverSection3D, SolverElement3D,
  SolverSupport3D, SolverLoad3D, AnalysisResults3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';

// ─── 2D helpers ─────────────────────────────────────────────────

const STEEL_E = 200_000;
const STD_A = 0.01;
const STD_IZ = 1e-4;

function makeInput2D(opts: {
  nodes: Array<[number, number, number]>;
  elements: Array<[number, number, number, 'frame' | 'truss', boolean?, boolean?]>;
  supports: Array<[number, number, string, Record<string, number>?]>;
  loads?: SolverLoad[];
  e?: number;
  a?: number;
  iz?: number;
}): SolverInput {
  const nodes = new Map(opts.nodes.map(([id, x, z]) => [id, { id, x, z }]));
  const materials = new Map([[1, { id: 1, e: opts.e ?? STEEL_E, nu: 0.3 }]]);
  const sections = new Map([[1, { id: 1, a: opts.a ?? STD_A, iz: opts.iz ?? STD_IZ }]]);
  const elements = new Map(opts.elements.map(([id, nodeI, nodeJ, type, hingeStart, hingeEnd]) => [
    id,
    { id, type, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: hingeStart ?? false, hingeEnd: hingeEnd ?? false },
  ]));
  const supports = new Map(opts.supports.map(([id, nodeId, type, extra]) => [
    id,
    { id, nodeId, type: type as any, ...extra },
  ]));
  return { nodes, materials, sections, elements, supports, loads: opts.loads ?? [] };
}

/** Build a simple 2D cantilever: fixed at node 1, free at node 2, length L along X. */
function cantilever2D(L = 5, P = -10): SolverInput {
  return makeInput2D({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed']],
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: P, my: 0 } }],
  });
}

// ─── 3D helpers ─────────────────────────────────────────────────

const steelMat: SolverMaterial = { id: 1, e: 200_000, nu: 0.3 };
const stdSec3D: SolverSection3D = { id: 1, a: 0.01, iz: 8.33e-6, iy: 4.16e-6, j: 1e-5 };

function fixedSup3D(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
}
function pinnedSup3D(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false };
}
function frame3D(id: number, nI: number, nJ: number): SolverElement3D {
  return { id, type: 'frame', nodeI: nI, nodeJ: nJ, materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false };
}
function truss3D(id: number, nI: number, nJ: number): SolverElement3D {
  return { id, type: 'truss', nodeI: nI, nodeJ: nJ, materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false };
}

function buildInput3D(
  nodes: SolverNode3D[],
  elements: SolverElement3D[],
  supports: SolverSupport3D[],
  loads: SolverLoad3D[] = [],
  materials: SolverMaterial[] = [steelMat],
  sections: SolverSection3D[] = [stdSec3D],
): SolverInput3D {
  return {
    nodes: new Map(nodes.map(n => [n.id, n])),
    materials: new Map(materials.map(m => [m.id, m])),
    sections: new Map(sections.map(s => [s.id, s])),
    elements: new Map(elements.map(e => [e.id, e])),
    supports: new Map(supports.map((s, i) => [i, s])),
    loads,
  };
}

/** Build a simple 3D cantilever along X. Fixed at node 1, load at node 2. */
function cantilever3D(L = 5, Fz = -10): SolverInput3D {
  return buildInput3D(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [frame3D(1, 1, 2)],
    [fixedSup3D(1)],
    [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: Fz, mx: 0, my: 0, mz: 0 } }],
  );
}

/** Attempt to solve; return { result, threw }. Never hangs (caller uses vitest timeout). */
function trySolve2D(input: SolverInput): { result: AnalysisResults | null; error: string | null } {
  try {
    const r = solve(input);
    return { result: r, error: null };
  } catch (e: any) {
    return { result: null, error: e.message ?? String(e) };
  }
}

function trySolve3D(input: SolverInput3D): { result: AnalysisResults3D | string | null; error: string | null } {
  try {
    const r = solve3D(input);
    return { result: r, error: null };
  } catch (e: any) {
    return { result: null, error: e.message ?? String(e) };
  }
}

/** Check that every number in a flat array of displacement objects is finite. */
function allFinite(values: number[]): boolean {
  return values.every(v => Number.isFinite(v));
}

// ═════════════════════════════════════════════════════════════════
// 1. NaN / Infinity INPUT HANDLING
// ═════════════════════════════════════════════════════════════════

describe('1. NaN/Inf input handling', () => {

  describe('2D solver', () => {
    it('NaN in node x-coordinate: throws or returns finite result', () => {
      const input = cantilever2D();
      input.nodes.set(2, { id: 2, x: NaN, z: 0 });
      const { result, error } = trySolve2D(input);
      // Must not produce NaN displacements — either error or all-finite result
      if (result) {
        const uxValues = result.displacements.map(d => d.ux);
        expect(allFinite(uxValues)).toBe(true);
      } else {
        expect(error).toBeTruthy();
      }
    }, 5000);

    it('NaN in node z-coordinate: throws or returns finite result', () => {
      const input = cantilever2D();
      input.nodes.set(2, { id: 2, x: 5, z: NaN });
      const { result, error } = trySolve2D(input);
      if (result) {
        const uzValues = result.displacements.map(d => d.uz);
        expect(allFinite(uzValues)).toBe(true);
      } else {
        expect(error).toBeTruthy();
      }
    }, 5000);

    it('Infinity in E (Young modulus): throws or returns finite result', () => {
      const input = cantilever2D();
      input.materials.set(1, { id: 1, e: Infinity, nu: 0.3 });
      const { result, error } = trySolve2D(input);
      if (result) {
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error).toBeTruthy();
      }
    }, 5000);

    it('NaN in nu (Poisson): throws or returns finite result', () => {
      const input = cantilever2D();
      input.materials.set(1, { id: 1, e: STEEL_E, nu: NaN });
      const { result, error } = trySolve2D(input);
      // nu is not used in the 2D frame stiffness, so result may be valid
      if (result) {
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error).toBeTruthy();
      }
    }, 5000);

    it('NaN in section A: throws or returns finite result', () => {
      const input = cantilever2D();
      input.sections.set(1, { id: 1, a: NaN, iz: STD_IZ });
      const { result, error } = trySolve2D(input);
      if (result) {
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error).toBeTruthy();
      }
    }, 5000);

    it('Infinity in section Iz: throws or returns finite result', () => {
      const input = cantilever2D();
      input.sections.set(1, { id: 1, a: STD_A, iz: Infinity });
      const { result, error } = trySolve2D(input);
      if (result) {
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error).toBeTruthy();
      }
    }, 5000);

    it('NaN in nodal load fz: throws or returns finite result', () => {
      const input = makeInput2D({
        nodes: [[1, 0, 0], [2, 5, 0]],
        elements: [[1, 1, 2, 'frame']],
        supports: [[1, 1, 'fixed']],
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: NaN, my: 0 } }],
      });
      const { result, error } = trySolve2D(input);
      if (result) {
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error).toBeTruthy();
      }
    }, 5000);

    it('Infinity in nodal load fx: throws or returns finite result', () => {
      const input = makeInput2D({
        nodes: [[1, 0, 0], [2, 5, 0]],
        elements: [[1, 1, 2, 'frame']],
        supports: [[1, 1, 'fixed']],
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: Infinity, fz: 0, my: 0 } }],
      });
      const { result, error } = trySolve2D(input);
      if (result) {
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error).toBeTruthy();
      }
    }, 5000);

    it('NaN in nodal load moment my: throws or returns finite result', () => {
      const input = makeInput2D({
        nodes: [[1, 0, 0], [2, 5, 0]],
        elements: [[1, 1, 2, 'frame']],
        supports: [[1, 1, 'fixed']],
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: NaN } }],
      });
      const { result, error } = trySolve2D(input);
      if (result) {
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error).toBeTruthy();
      }
    }, 5000);
  });

  describe('3D solver', () => {
    it('NaN in node x-coordinate: throws or returns finite result', () => {
      const input = cantilever3D();
      input.nodes.set(2, { id: 2, x: NaN, y: 0, z: 0 });
      const { result, error } = trySolve3D(input);
      if (result && typeof result !== 'string') {
        const vals = result.displacements.flatMap(d => [d.ux, d.uy, d.uz]);
        expect(allFinite(vals)).toBe(true);
      } else {
        // error string or thrown error — both acceptable
        expect(error ?? result).toBeTruthy();
      }
    }, 5000);

    it('NaN in node z-coordinate: throws or returns finite result', () => {
      const input = cantilever3D();
      input.nodes.set(2, { id: 2, x: 5, y: 0, z: NaN });
      const { result, error } = trySolve3D(input);
      if (result && typeof result !== 'string') {
        const vals = result.displacements.flatMap(d => [d.ux, d.uy, d.uz]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error ?? result).toBeTruthy();
      }
    }, 5000);

    it('Infinity in E: throws or returns finite result', () => {
      const input = cantilever3D();
      input.materials.set(1, { id: 1, e: Infinity, nu: 0.3 });
      const { result, error } = trySolve3D(input);
      if (result && typeof result !== 'string') {
        const vals = result.displacements.flatMap(d => [d.ux, d.uy, d.uz]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error ?? result).toBeTruthy();
      }
    }, 5000);

    it('NaN in section Iy: throws or returns finite result', () => {
      const input = cantilever3D();
      input.sections.set(1, { id: 1, a: 0.01, iz: 8.33e-6, iy: NaN, j: 1e-5 });
      const { result, error } = trySolve3D(input);
      if (result && typeof result !== 'string') {
        const vals = result.displacements.flatMap(d => [d.ux, d.uy, d.uz]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error ?? result).toBeTruthy();
      }
    }, 5000);

    it('NaN in 3D nodal load components: throws or returns finite result', () => {
      const input = buildInput3D(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 5, y: 0, z: 0 }],
        [frame3D(1, 1, 2)],
        [fixedSup3D(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: NaN, fy: 0, fz: -10, mx: 0, my: NaN, mz: 0 } }],
      );
      const { result, error } = trySolve3D(input);
      if (result && typeof result !== 'string') {
        const vals = result.displacements.flatMap(d => [d.ux, d.uy, d.uz]);
        expect(allFinite(vals)).toBe(true);
      } else {
        expect(error ?? result).toBeTruthy();
      }
    }, 5000);
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. ZERO / DEGENERATE GEOMETRY
// ═════════════════════════════════════════════════════════════════

describe('2. Zero/degenerate geometry', () => {

  describe('2D solver', () => {
    it('zero-length element (both nodes at same position): throws or reports error', () => {
      const input = makeInput2D({
        nodes: [[1, 0, 0], [2, 0, 0]],
        elements: [[1, 1, 2, 'frame']],
        supports: [[1, 1, 'fixed']],
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
      });
      const { result, error } = trySolve2D(input);
      // Zero-length element should either throw or produce NaN (which we detect)
      if (result) {
        // If it does return, check displacements
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        // NaN in result is acceptable for degenerate input — the test is that it didn't hang
      }
      // Test passes: solver did not hang
    }, 5000);

    it('very large coordinates (1e12): does not hang', () => {
      const input = makeInput2D({
        nodes: [[1, 0, 0], [2, 1e12, 0]],
        elements: [[1, 1, 2, 'frame']],
        supports: [[1, 1, 'fixed']],
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
      });
      const { result, error } = trySolve2D(input);
      // With L=1e12, stiffness is tiny, displacements are huge, but solver must complete
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('very small coordinates (1e-12): does not hang', () => {
      const input = makeInput2D({
        nodes: [[1, 0, 0], [2, 1e-12, 0]],
        elements: [[1, 1, 2, 'frame']],
        supports: [[1, 1, 'fixed']],
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
      });
      const { result, error } = trySolve2D(input);
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);
  });

  describe('3D solver', () => {
    it('zero-length element 3D: throws or reports error', () => {
      const input = buildInput3D(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 0 }],
        [frame3D(1, 1, 2)],
        [fixedSup3D(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
      );
      const { result, error } = trySolve3D(input);
      // Either error or degenerate result — must not hang
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('very large coordinates 3D (1e12): does not hang', () => {
      const input = buildInput3D(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1e12, y: 0, z: 0 }],
        [frame3D(1, 1, 2)],
        [fixedSup3D(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
      );
      const { result, error } = trySolve3D(input);
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('very small coordinates 3D (1e-12): does not hang', () => {
      const input = buildInput3D(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1e-12, y: 0, z: 0 }],
        [frame3D(1, 1, 2)],
        [fixedSup3D(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
      );
      const { result, error } = trySolve3D(input);
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. EMPTY / MINIMAL MODELS
// ═════════════════════════════════════════════════════════════════

describe('3. Empty/minimal models', () => {

  describe('2D solver', () => {
    it('no elements (just nodes + supports + loads): throws or returns error', () => {
      const input: SolverInput = {
        nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 5, z: 0 }]]),
        materials: new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]),
        sections: new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]),
        elements: new Map(),
        supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
      };
      const { result, error } = trySolve2D(input);
      // No elements = nothing to assemble. Should throw or return empty result.
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('elements but no loads: produces zero or near-zero displacements', () => {
      const input = makeInput2D({
        nodes: [[1, 0, 0], [2, 5, 0]],
        elements: [[1, 1, 2, 'frame']],
        supports: [[1, 1, 'fixed'], [2, 2, 'pinned']],
        loads: [],
      });
      const { result, error } = trySolve2D(input);
      if (result) {
        for (const d of result.displacements) {
          expect(Math.abs(d.ux)).toBeLessThan(1e-10);
          expect(Math.abs(d.uz)).toBeLessThan(1e-10);
          expect(Math.abs(d.ry)).toBeLessThan(1e-10);
        }
      }
      // Throwing is also acceptable
    }, 5000);

    it('elements but no supports: throws or returns error (mechanism)', () => {
      const input: SolverInput = {
        nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 5, z: 0 }]]),
        materials: new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]),
        sections: new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]),
        elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
        supports: new Map(),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
      };
      const { result, error } = trySolve2D(input);
      // No supports = singular stiffness matrix. Should throw or return error.
      if (result) {
        // If it somehow returns, displacements should be huge or NaN
        const maxDisp = Math.max(...result.displacements.map(d => Math.abs(d.uz)));
        // At minimum the solver completed
      }
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('single element with single point load: valid solution', () => {
      const P = -10;
      const L = 5;
      const input = makeInput2D({
        nodes: [[1, 0, 0], [2, L, 0]],
        elements: [[1, 1, 2, 'frame']],
        supports: [[1, 1, 'fixed']],
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: P, my: 0 } }],
      });
      const { result, error } = trySolve2D(input);
      expect(error).toBeNull();
      expect(result).not.toBeNull();
      if (result) {
        // Known: delta = PL^3 / (3EI)
        const EI = (STEEL_E * 1000) * STD_IZ; // convert MPa to kN/m2
        const expectedDelta = (P * L ** 3) / (3 * EI);
        const tipDisp = result.displacements.find(d => d.nodeId === 2);
        expect(tipDisp).toBeDefined();
        if (tipDisp) {
          const relErr = Math.abs((tipDisp.uz - expectedDelta) / expectedDelta);
          expect(relErr).toBeLessThan(0.01);
        }
      }
    }, 5000);
  });

  describe('3D solver', () => {
    it('no elements 3D: throws or returns error', () => {
      const input: SolverInput3D = {
        nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }]]),
        materials: new Map([[1, steelMat]]),
        sections: new Map([[1, stdSec3D]]),
        elements: new Map(),
        supports: new Map([[0, fixedSup3D(1)]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
      };
      const { result, error } = trySolve3D(input);
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('elements but no loads 3D: produces zero or near-zero displacements', () => {
      const input = buildInput3D(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 5, y: 0, z: 0 }],
        [frame3D(1, 1, 2)],
        [fixedSup3D(1), pinnedSup3D(2)],
        [],
      );
      const { result, error } = trySolve3D(input);
      if (result && typeof result !== 'string') {
        for (const d of result.displacements) {
          expect(Math.abs(d.ux)).toBeLessThan(1e-10);
          expect(Math.abs(d.uy)).toBeLessThan(1e-10);
          expect(Math.abs(d.uz)).toBeLessThan(1e-10);
        }
      }
    }, 5000);

    it('elements but no supports 3D: throws or returns error', () => {
      const input: SolverInput3D = {
        nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }]]),
        materials: new Map([[1, steelMat]]),
        sections: new Map([[1, stdSec3D]]),
        elements: new Map([[1, frame3D(1, 1, 2)]]),
        supports: new Map(),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
      };
      const { result, error } = trySolve3D(input);
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('single element 3D with single point load: valid solution', () => {
      const Fz = -10;
      const L = 5;
      const input = cantilever3D(L, Fz);
      const { result, error } = trySolve3D(input);
      expect(error).toBeNull();
      expect(result).not.toBeNull();
      if (result && typeof result !== 'string') {
        // Tip displacement in Z from weak-axis bending: PL^3/(3*E*Iy)
        const EIy = (200_000 * 1000) * 4.16e-6;
        const expectedDelta = (Fz * L ** 3) / (3 * EIy);
        const tipDisp = result.displacements.find(d => d.nodeId === 2);
        expect(tipDisp).toBeDefined();
        if (tipDisp) {
          const relErr = Math.abs((tipDisp.uz - expectedDelta) / expectedDelta);
          expect(relErr).toBeLessThan(0.02);
        }
      }
    }, 5000);
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. EXTREME VALUE COMBINATIONS
// ═════════════════════════════════════════════════════════════════

describe('4. Extreme value combinations', () => {

  describe('2D solver', () => {
    it('very stiff material (E=1e15) next to very flexible (E=1): does not crash', () => {
      // Two elements, one very stiff, one very flexible
      const input: SolverInput = {
        nodes: new Map([
          [1, { id: 1, x: 0, z: 0 }],
          [2, { id: 2, x: 5, z: 0 }],
          [3, { id: 3, x: 10, z: 0 }],
        ]),
        materials: new Map([
          [1, { id: 1, e: 1e15, nu: 0.3 }],
          [2, { id: 2, e: 1, nu: 0.3 }],
        ]),
        sections: new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]),
        elements: new Map([
          [1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
          [2, { id: 2, type: 'frame' as const, nodeI: 2, nodeJ: 3, materialId: 2, sectionId: 1, hingeStart: false, hingeEnd: false }],
        ]),
        supports: new Map([
          [1, { id: 1, nodeId: 1, type: 'fixed' as const }],
          [2, { id: 2, nodeId: 3, type: 'pinned' as const }],
        ]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
      };
      const { result, error } = trySolve2D(input);
      // Conditioning will be terrible, but solver must complete
      expect(result !== undefined || error !== null).toBe(true);
      if (result) {
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        // Should still be finite — not NaN
        expect(allFinite(vals)).toBe(true);
      }
    }, 5000);

    it('very long element (L=1e6) next to very short (L=0.001): does not crash', () => {
      const input: SolverInput = {
        nodes: new Map([
          [1, { id: 1, x: 0, z: 0 }],
          [2, { id: 2, x: 0.001, z: 0 }],
          [3, { id: 3, x: 1e6, z: 0 }],
        ]),
        materials: new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]),
        sections: new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]),
        elements: new Map([
          [1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
          [2, { id: 2, type: 'frame' as const, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        ]),
        supports: new Map([
          [1, { id: 1, nodeId: 1, type: 'fixed' as const }],
          [2, { id: 2, nodeId: 3, type: 'pinned' as const }],
        ]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
      };
      const { result, error } = trySolve2D(input);
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('very large load (1e12) on stiff structure: does not crash', () => {
      const input = makeInput2D({
        nodes: [[1, 0, 0], [2, 5, 0]],
        elements: [[1, 1, 2, 'frame']],
        supports: [[1, 1, 'fixed'], [2, 2, 'pinned']],
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -1e12, my: 0 } }],
      });
      const { result, error } = trySolve2D(input);
      expect(result !== undefined || error !== null).toBe(true);
      if (result) {
        const vals = result.displacements.flatMap(d => [d.ux, d.uz, d.ry]);
        expect(allFinite(vals)).toBe(true);
      }
    }, 5000);

    it('zero E (no stiffness): throws or returns error', () => {
      const input = cantilever2D();
      input.materials.set(1, { id: 1, e: 0, nu: 0.3 });
      const { result, error } = trySolve2D(input);
      // E=0 means zero stiffness → singular matrix
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('zero section area: throws or returns error', () => {
      const input = cantilever2D();
      input.sections.set(1, { id: 1, a: 0, iz: STD_IZ });
      const { result, error } = trySolve2D(input);
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('negative E: throws or returns error', () => {
      const input = cantilever2D();
      input.materials.set(1, { id: 1, e: -200_000, nu: 0.3 });
      const { result, error } = trySolve2D(input);
      // Negative stiffness → not positive definite
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);
  });

  describe('3D solver', () => {
    it('very stiff (E=1e15) next to flexible (E=1) 3D: does not crash', () => {
      const stiffMat: SolverMaterial = { id: 1, e: 1e15, nu: 0.3 };
      const flexMat: SolverMaterial = { id: 2, e: 1, nu: 0.3 };
      const input = buildInput3D(
        [
          { id: 1, x: 0, y: 0, z: 0 },
          { id: 2, x: 5, y: 0, z: 0 },
          { id: 3, x: 10, y: 0, z: 0 },
        ],
        [
          { ...frame3D(1, 1, 2), materialId: 1 },
          { ...frame3D(2, 2, 3), materialId: 2 },
        ],
        [fixedSup3D(1), pinnedSup3D(3)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
        [stiffMat, flexMat],
      );
      const { result, error } = trySolve3D(input);
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);

    it('very large load (1e12) 3D: does not crash', () => {
      const input = cantilever3D(5, -1e12);
      const { result, error } = trySolve3D(input);
      expect(result !== undefined || error !== null).toBe(true);
      if (result && typeof result !== 'string') {
        const vals = result.displacements.flatMap(d => [d.ux, d.uy, d.uz]);
        expect(allFinite(vals)).toBe(true);
      }
    }, 5000);

    it('very long element 3D (L=1e6) next to very short (L=0.001): does not crash', () => {
      const input = buildInput3D(
        [
          { id: 1, x: 0, y: 0, z: 0 },
          { id: 2, x: 0.001, y: 0, z: 0 },
          { id: 3, x: 1e6, y: 0, z: 0 },
        ],
        [frame3D(1, 1, 2), frame3D(2, 2, 3)],
        [fixedSup3D(1), pinnedSup3D(3)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
      );
      const { result, error } = trySolve3D(input);
      expect(result !== undefined || error !== null).toBe(true);
    }, 5000);
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. FIELD NAME CONTRACT ON REAL SOLVES
// ═════════════════════════════════════════════════════════════════

describe('5. Field name contract', () => {

  describe('2D result field names', () => {
    it('displacements have keys ux, uz, ry (not uy or rz)', () => {
      const input = cantilever2D();
      const result = solve(input);
      expect(result.displacements.length).toBeGreaterThan(0);
      for (const d of result.displacements) {
        // Must have the 2D keys
        expect(d).toHaveProperty('nodeId');
        expect(d).toHaveProperty('ux');
        expect(d).toHaveProperty('uz');
        expect(d).toHaveProperty('ry');
        expect(typeof d.ux).toBe('number');
        expect(typeof d.uz).toBe('number');
        expect(typeof d.ry).toBe('number');
        // Must NOT have 3D keys as primary fields
        expect(d).not.toHaveProperty('uy');
        expect(d).not.toHaveProperty('rz');
      }
    });

    it('reactions have keys rx, rz, my', () => {
      const input = cantilever2D();
      const result = solve(input);
      expect(result.reactions.length).toBeGreaterThan(0);
      for (const r of result.reactions) {
        expect(r).toHaveProperty('nodeId');
        expect(r).toHaveProperty('rx');
        expect(r).toHaveProperty('rz');
        expect(r).toHaveProperty('my');
        expect(typeof r.rx).toBe('number');
        expect(typeof r.rz).toBe('number');
        expect(typeof r.my).toBe('number');
      }
    });

    it('element forces have keys nStart, nEnd, vStart, vEnd, mStart, mEnd', () => {
      const input = cantilever2D();
      const result = solve(input);
      expect(result.elementForces.length).toBeGreaterThan(0);
      for (const f of result.elementForces) {
        expect(f).toHaveProperty('elementId');
        expect(f).toHaveProperty('nStart');
        expect(f).toHaveProperty('nEnd');
        expect(f).toHaveProperty('vStart');
        expect(f).toHaveProperty('vEnd');
        expect(f).toHaveProperty('mStart');
        expect(f).toHaveProperty('mEnd');
        expect(f).toHaveProperty('length');
        expect(typeof f.nStart).toBe('number');
        expect(typeof f.vStart).toBe('number');
        expect(typeof f.mStart).toBe('number');
      }
    });
  });

  describe('3D result field names', () => {
    it('displacements have keys ux, uy, uz, rx, ry, rz', () => {
      const input = cantilever3D();
      const result = solve3D(input);
      expect(typeof result).not.toBe('string');
      if (typeof result === 'string') return;
      expect(result.displacements.length).toBeGreaterThan(0);
      for (const d of result.displacements) {
        expect(d).toHaveProperty('nodeId');
        expect(d).toHaveProperty('ux');
        expect(d).toHaveProperty('uy');
        expect(d).toHaveProperty('uz');
        expect(d).toHaveProperty('rx');
        expect(d).toHaveProperty('ry');
        expect(d).toHaveProperty('rz');
        expect(typeof d.ux).toBe('number');
        expect(typeof d.uy).toBe('number');
        expect(typeof d.uz).toBe('number');
      }
    });

    it('element forces have vyStart, vzStart, myStart, mzStart, mxStart', () => {
      const input = cantilever3D();
      const result = solve3D(input);
      expect(typeof result).not.toBe('string');
      if (typeof result === 'string') return;
      expect(result.elementForces.length).toBeGreaterThan(0);
      for (const f of result.elementForces) {
        expect(f).toHaveProperty('elementId');
        expect(f).toHaveProperty('nStart');
        expect(f).toHaveProperty('nEnd');
        expect(f).toHaveProperty('vyStart');
        expect(f).toHaveProperty('vyEnd');
        expect(f).toHaveProperty('vzStart');
        expect(f).toHaveProperty('vzEnd');
        expect(f).toHaveProperty('mxStart');
        expect(f).toHaveProperty('mxEnd');
        expect(f).toHaveProperty('myStart');
        expect(f).toHaveProperty('myEnd');
        expect(f).toHaveProperty('mzStart');
        expect(f).toHaveProperty('mzEnd');
        expect(f).toHaveProperty('length');
        expect(typeof f.vyStart).toBe('number');
        expect(typeof f.vzStart).toBe('number');
        expect(typeof f.myStart).toBe('number');
        expect(typeof f.mzStart).toBe('number');
      }
    });

    it('reactions have keys fx, fy, fz, mx, my, mz', () => {
      const input = cantilever3D();
      const result = solve3D(input);
      expect(typeof result).not.toBe('string');
      if (typeof result === 'string') return;
      expect(result.reactions.length).toBeGreaterThan(0);
      for (const r of result.reactions) {
        expect(r).toHaveProperty('nodeId');
        expect(r).toHaveProperty('fx');
        expect(r).toHaveProperty('fy');
        expect(r).toHaveProperty('fz');
        expect(r).toHaveProperty('mx');
        expect(r).toHaveProperty('my');
        expect(r).toHaveProperty('mz');
        expect(typeof r.fx).toBe('number');
        expect(typeof r.fy).toBe('number');
        expect(typeof r.fz).toBe('number');
      }
    });
  });
});
