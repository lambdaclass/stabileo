// Test: 2D solver results must match 3D solver results for embedded 2D models.
// This catches regressions where the 2D→3D embedding path (coordinate mapping,
// section properties, support conversion, load projection) produces different
// structural behavior than the native 2D solver.

import { describe, it, expect } from 'vitest';
import { solve as solve2D, solve3D } from '../wasm-solver';
import type { SolverInput, SolverSection, SolverElement, SolverNode, SolverSupport, SolverMaterial, AnalysisResults } from '../types';
import type { SolverInput3D, SolverNode3D, SolverSection3D, SolverElement3D, SolverSupport3D, AnalysisResults3D } from '../types-3d';

// ─── Helpers ─────────────────────────────────────────────────────

const steel: SolverMaterial = { id: 1, e: 200000, nu: 0.3 };

// IPE 300-like section
const ipe300: SolverSection = { id: 1, a: 53.81e-4, iz: 8356e-8 };
const ipe300_3d: SolverSection3D = {
  id: 1, a: 53.81e-4,
  iy: 8356e-8,  // in-plane bending (about Y for XZ plane model)
  iz: 8356e-8,  // out-of-plane (same value to simplify)
  j: 20.1e-8,
};

/** Embed a 2D model node (x, y) into 3D XZ plane: (x, 0, y) */
function embed2DNode(n: SolverNode): SolverNode3D {
  return { id: n.id, x: n.x, y: 0, z: n.z };
}

/** Embed a 2D element into 3D */
function embed2DElement(e: SolverElement): SolverElement3D {
  return {
    id: e.id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ,
    materialId: e.materialId, sectionId: e.sectionId,
    hingeStart: e.hingeStart, hingeEnd: e.hingeEnd,
  };
}

/** Embed a 2D support into 3D XZ plane support */
function embed2DSupport(s: SolverSupport): SolverSupport3D {
  const base = { nodeId: s.nodeId };
  switch (s.type) {
    case 'fixed':
      return { ...base, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
    case 'pinned':
      return { ...base, rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: true };
    case 'rollerX':
      return { ...base, rx: false, ry: true, rz: true, rrx: true, rry: false, rrz: true };
    case 'rollerZ':
      return { ...base, rx: true, ry: true, rz: false, rrx: true, rry: false, rrz: true };
    default:
      return { ...base, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
  }
}

/** Out-of-plane-only restraint for non-supported nodes in 2D→3D embedding */
function outOfPlaneRestraint(nodeId: number): SolverSupport3D {
  return {
    nodeId,
    rx: false, ry: true, rz: false,   // restrain only Y translation
    rrx: true, rry: false, rrz: true,  // restrain X and Z rotations
  };
}

/** Add out-of-plane restraints to all non-supported nodes (mimics buildSolverInput3D) */
function addOutOfPlaneRestraints(
  supports: Map<number, SolverSupport3D>,
  nodeIds: number[],
): Map<number, SolverSupport3D> {
  const result = new Map(supports);
  for (const nodeId of nodeIds) {
    if (!result.has(nodeId)) {
      result.set(nodeId, outOfPlaneRestraint(nodeId));
    }
  }
  return result;
}

/**
 * Compare 2D and 3D solver results for the same model.
 * 2D: {ux, uz, ry} per node
 * 3D embedded in XZ: {ux, uz, ry} should match, {uy, rx, rz} should be ~0
 */
function compare2Dvs3D(
  res2D: AnalysisResults,
  res3D: AnalysisResults3D,
  tol = 1e-6,
  label = '',
) {
  const prefix = label ? `[${label}] ` : '';

  // Compare displacements
  const disp2D = new Map(res2D.displacements.map(d => [d.nodeId, d]));
  const disp3D = new Map(res3D.displacements.map(d => [d.nodeId, d]));

  for (const [nodeId, d2] of disp2D) {
    const d3 = disp3D.get(nodeId);
    expect(d3, `${prefix}node ${nodeId} missing in 3D displacements`).toBeDefined();
    if (!d3) continue;

    // In-plane DOFs must match
    // Note: 3D solver θy = -dw/dx convention means ry is negated vs 2D.
    // The 3D deformed shape compensates with -θy in Hermite interpolation.
    expect(d3.ux).toBeCloseTo(d2.ux, 5, `${prefix}node ${nodeId} ux mismatch: 2D=${d2.ux}, 3D=${d3.ux}`);
    expect(d3.uz).toBeCloseTo(d2.uz, 5, `${prefix}node ${nodeId} uz mismatch: 2D=${d2.uz}, 3D=${d3.uz}`);
    expect(d3.ry).toBeCloseTo(-d2.ry, 5, `${prefix}node ${nodeId} ry mismatch: 2D=${d2.ry}, 3D=${d3.ry} (sign-flip expected)`);

    // Out-of-plane DOFs must be zero
    expect(Math.abs(d3.uy)).toBeLessThan(tol, `${prefix}node ${nodeId} uy should be 0, got ${d3.uy}`);
    expect(Math.abs(d3.rx)).toBeLessThan(tol, `${prefix}node ${nodeId} rx should be 0, got ${d3.rx}`);
    expect(Math.abs(d3.rz)).toBeLessThan(tol, `${prefix}node ${nodeId} rz should be 0, got ${d3.rz}`);
  }

  // Compare reactions
  const react2D = new Map(res2D.reactions.map(r => [r.nodeId, r]));
  const react3D = new Map(res3D.reactions.map(r => [r.nodeId, r]));

  for (const [nodeId, r2] of react2D) {
    const r3 = react3D.get(nodeId);
    expect(r3, `${prefix}node ${nodeId} missing in 3D reactions`).toBeDefined();
    if (!r3) continue;

    expect(r3.fx).toBeCloseTo(r2.rx, 4, `${prefix}node ${nodeId} Rx mismatch: 2D=${r2.rx}, 3D=${r3.fx}`);
    expect(r3.fz).toBeCloseTo(r2.rz, 4, `${prefix}node ${nodeId} Rz mismatch: 2D=${r2.rz}, 3D=${r3.fz}`);
    // Moment reaction also sign-flipped due to θy convention
    expect(r3.my).toBeCloseTo(-r2.my, 4, `${prefix}node ${nodeId} My mismatch: 2D=${r2.my}, 3D=${r3.my} (sign-flip expected)`);
  }
}

// ─── Tests ─────────────────────────────────────────────────────

describe('2D vs 3D embedded: solver parity', () => {

  it('cantilever beam with point load', () => {
    const L = 5;
    const P = -10; // kN downward

    // 2D
    const input2D: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: L, z: 0 }]]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[0, { id: 1, nodeId: 1, type: 'fixed' }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: P, my: 0 } }],
    };

    // 3D (embedded in XZ plane)
    const input3D: SolverInput3D = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }]]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300_3d]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: addOutOfPlaneRestraints(
        new Map([[1, embed2DSupport({ id: 1, nodeId: 1, type: 'fixed' })]]),
        [1, 2],
      ),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: P, mx: 0, my: 0, mz: 0 } }],
    };

    const res2D = solve2D(input2D);
    const res3D = solve3D(input3D);
    compare2Dvs3D(res2D, res3D, 1e-6, 'cantilever point load');
  });

  it('simply supported beam with distributed load', () => {
    const L = 6;
    const q = -15; // kN/m downward

    const input2D: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: L, z: 0 }]]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([
        [0, { id: 1, nodeId: 1, type: 'pinned' }],
        [1, { id: 2, nodeId: 2, type: 'rollerX' }],
      ]),
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    };

    // 3D: distributed load must be in local Z (perpendicular in XZ plane)
    const input3D: SolverInput3D = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }]]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300_3d]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: addOutOfPlaneRestraints(
        new Map([
          [1, embed2DSupport({ id: 1, nodeId: 1, type: 'pinned' })],
          [2, embed2DSupport({ id: 2, nodeId: 2, type: 'rollerX' })],
        ]),
        [1, 2],
      ),
      loads: [{ type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: q, qZJ: q } }],
    };

    const res2D = solve2D(input2D);
    const res3D = solve3D(input3D);
    compare2Dvs3D(res2D, res3D, 1e-6, 'SS beam distributed');
  });

  it('portal frame with gravity loads (like Bauti screenshot)', () => {
    // 2-story portal frame with distributed gravity on beams
    //   7──────8
    //   │      │
    //   5──────6
    //   │      │
    //   3──────4
    //   │      │
    //   1      2 (fixed)

    const H = 3; // story height
    const B = 5; // bay width
    const q = -20; // kN/m gravity on beams

    const nodes2D: [number, SolverNode][] = [
      [1, { id: 1, x: 0, z: 0 }],
      [2, { id: 2, x: B, z: 0 }],
      [3, { id: 3, x: 0, z: H }],
      [4, { id: 4, x: B, z: H }],
      [5, { id: 5, x: 0, z: 2*H }],
      [6, { id: 6, x: B, z: 2*H }],
      [7, { id: 7, x: 0, z: 3*H }],
      [8, { id: 8, x: B, z: 3*H }],
    ];

    const elems: [number, SolverElement][] = [
      // Columns
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, type: 'frame', nodeI: 3, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [4, { id: 4, type: 'frame', nodeI: 4, nodeJ: 6, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [5, { id: 5, type: 'frame', nodeI: 5, nodeJ: 7, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [6, { id: 6, type: 'frame', nodeI: 6, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      // Beams
      [7, { id: 7, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [8, { id: 8, type: 'frame', nodeI: 5, nodeJ: 6, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [9, { id: 9, type: 'frame', nodeI: 7, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ];

    const input2D: SolverInput = {
      nodes: new Map(nodes2D),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300]]),
      elements: new Map(elems),
      supports: new Map([
        [0, { id: 1, nodeId: 1, type: 'fixed' }],
        [1, { id: 2, nodeId: 2, type: 'fixed' }],
      ]),
      loads: [
        { type: 'distributed', data: { elementId: 7, qI: q, qJ: q } },
        { type: 'distributed', data: { elementId: 8, qI: q, qJ: q } },
        { type: 'distributed', data: { elementId: 9, qI: q, qJ: q } },
      ],
    };

    const nodes3D: [number, SolverNode3D][] = nodes2D.map(([id, n]) => [id, embed2DNode(n)]);

    const input3D: SolverInput3D = {
      nodes: new Map(nodes3D),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300_3d]]),
      elements: new Map(elems.map(([id, e]) => [id, embed2DElement(e)])),
      supports: addOutOfPlaneRestraints(
        new Map([
          [1, embed2DSupport({ id: 1, nodeId: 1, type: 'fixed' })],
          [2, embed2DSupport({ id: 2, nodeId: 2, type: 'fixed' })],
        ]),
        [1, 2, 3, 4, 5, 6, 7, 8],
      ),
      loads: [
        // Gravity on beams: perpendicular to horizontal beam = local Z in XZ plane
        { type: 'distributed', data: { elementId: 7, qYI: 0, qYJ: 0, qZI: q, qZJ: q } },
        { type: 'distributed', data: { elementId: 8, qYI: 0, qYJ: 0, qZI: q, qZJ: q } },
        { type: 'distributed', data: { elementId: 9, qYI: 0, qYJ: 0, qZI: q, qZJ: q } },
      ],
    };

    const res2D = solve2D(input2D);
    const res3D = solve3D(input3D);
    compare2Dvs3D(res2D, res3D, 1e-4, 'portal frame gravity');
  });

  it('portal frame with lateral + gravity loads', () => {
    const H = 4, B = 6;
    const qGrav = -25; // kN/m gravity on beam
    const fLateral = 15; // kN lateral on top

    const input2D: SolverInput = {
      nodes: new Map([
        [1, { id: 1, x: 0, z: 0 }],
        [2, { id: 2, x: B, z: 0 }],
        [3, { id: 3, x: 0, z: H }],
        [4, { id: 4, x: B, z: H }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [3, { id: 3, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: new Map([
        [0, { id: 1, nodeId: 1, type: 'fixed' }],
        [1, { id: 2, nodeId: 2, type: 'fixed' }],
      ]),
      loads: [
        { type: 'distributed', data: { elementId: 3, qI: qGrav, qJ: qGrav } },
        { type: 'nodal', data: { nodeId: 3, fx: fLateral, fz: 0, my: 0 } },
      ],
    };

    const input3D: SolverInput3D = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: B, y: 0, z: 0 }],
        [3, { id: 3, x: 0, y: 0, z: H }],
        [4, { id: 4, x: B, y: 0, z: H }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300_3d]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [3, { id: 3, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: addOutOfPlaneRestraints(
        new Map([
          [1, embed2DSupport({ id: 1, nodeId: 1, type: 'fixed' })],
          [2, embed2DSupport({ id: 2, nodeId: 2, type: 'fixed' })],
        ]),
        [1, 2, 3, 4],
      ),
      loads: [
        { type: 'distributed', data: { elementId: 3, qYI: 0, qYJ: 0, qZI: qGrav, qZJ: qGrav } },
        { type: 'nodal', data: { nodeId: 3, fx: fLateral, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } },
      ],
    };

    const res2D = solve2D(input2D);
    const res3D = solve3D(input3D);
    compare2Dvs3D(res2D, res3D, 1e-4, 'portal lateral+gravity');
  });

  it('inclined beam with perpendicular distributed load', () => {
    // Beam going from (0,0) to (4,3) — 45° inclined
    const input2D: SolverInput = {
      nodes: new Map([
        [1, { id: 1, x: 0, z: 0 }],
        [2, { id: 2, x: 4, z: 3 }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: new Map([
        [0, { id: 1, nodeId: 1, type: 'fixed' }],
        [1, { id: 2, nodeId: 2, type: 'pinned' }],
      ]),
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -12, qJ: -12 } },
      ],
    };

    const input3D: SolverInput3D = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 4, y: 0, z: 3 }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300_3d]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: addOutOfPlaneRestraints(
        new Map([
          [1, embed2DSupport({ id: 1, nodeId: 1, type: 'fixed' })],
          [2, embed2DSupport({ id: 2, nodeId: 2, type: 'pinned' })],
        ]),
        [1, 2],
      ),
      loads: [
        // Perpendicular load on inclined beam in XZ plane → local Z only
        { type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -12, qZJ: -12 } },
      ],
    };

    const res2D = solve2D(input2D);
    const res3D = solve3D(input3D);
    compare2Dvs3D(res2D, res3D, 1e-4, 'inclined beam');
  });

  it('frame with hinges', () => {
    const H = 4, B = 5;

    const input2D: SolverInput = {
      nodes: new Map([
        [1, { id: 1, x: 0, z: 0 }],
        [2, { id: 2, x: B, z: 0 }],
        [3, { id: 3, x: 0, z: H }],
        [4, { id: 4, x: B, z: H }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: true }],
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: true }],
        [3, { id: 3, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: new Map([
        [0, { id: 1, nodeId: 1, type: 'fixed' }],
        [1, { id: 2, nodeId: 2, type: 'fixed' }],
      ]),
      loads: [
        { type: 'distributed', data: { elementId: 3, qI: -15, qJ: -15 } },
      ],
    };

    const input3D: SolverInput3D = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: B, y: 0, z: 0 }],
        [3, { id: 3, x: 0, y: 0, z: H }],
        [4, { id: 4, x: B, y: 0, z: H }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300_3d]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: true }],
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: true }],
        [3, { id: 3, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: addOutOfPlaneRestraints(
        new Map([
          [1, embed2DSupport({ id: 1, nodeId: 1, type: 'fixed' })],
          [2, embed2DSupport({ id: 2, nodeId: 2, type: 'fixed' })],
        ]),
        [1, 2, 3, 4],
      ),
      loads: [
        { type: 'distributed', data: { elementId: 3, qYI: 0, qYJ: 0, qZI: -15, qZJ: -15 } },
      ],
    };

    const res2D = solve2D(input2D);
    const res3D = solve3D(input3D);
    compare2Dvs3D(res2D, res3D, 1e-4, 'frame with hinges');
  });

  it('asymmetric multi-story frame (matches Bauti screenshot topology)', () => {
    // Asymmetric loading to reveal sway differences
    const H = 3, B = 5;
    const qBeam = -30; // kN/m

    const input2D: SolverInput = {
      nodes: new Map([
        [1, { id: 1, x: 0, z: 0 }],
        [2, { id: 2, x: B, z: 0 }],
        [3, { id: 3, x: 0, z: H }],
        [4, { id: 4, x: B, z: H }],
        [5, { id: 5, x: 0, z: 2*H }],
        [6, { id: 6, x: B, z: 2*H }],
        [7, { id: 7, x: 0, z: 3*H }],
        [8, { id: 8, x: B, z: 3*H }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [3, { id: 3, type: 'frame', nodeI: 3, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [4, { id: 4, type: 'frame', nodeI: 4, nodeJ: 6, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [5, { id: 5, type: 'frame', nodeI: 5, nodeJ: 7, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [6, { id: 6, type: 'frame', nodeI: 6, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [7, { id: 7, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [8, { id: 8, type: 'frame', nodeI: 5, nodeJ: 6, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [9, { id: 9, type: 'frame', nodeI: 7, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: new Map([
        [0, { id: 1, nodeId: 1, type: 'fixed' }],
        [1, { id: 2, nodeId: 2, type: 'fixed' }],
      ]),
      loads: [
        { type: 'distributed', data: { elementId: 7, qI: qBeam, qJ: qBeam } },
        { type: 'distributed', data: { elementId: 8, qI: qBeam, qJ: qBeam } },
        { type: 'distributed', data: { elementId: 9, qI: qBeam, qJ: qBeam } },
        // Asymmetric lateral loads
        { type: 'nodal', data: { nodeId: 7, fx: 10, fz: 0, my: 0 } },
        { type: 'nodal', data: { nodeId: 5, fx: 5, fz: 0, my: 0 } },
      ],
    };

    const input3D: SolverInput3D = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: B, y: 0, z: 0 }],
        [3, { id: 3, x: 0, y: 0, z: H }],
        [4, { id: 4, x: B, y: 0, z: H }],
        [5, { id: 5, x: 0, y: 0, z: 2*H }],
        [6, { id: 6, x: B, y: 0, z: 2*H }],
        [7, { id: 7, x: 0, y: 0, z: 3*H }],
        [8, { id: 8, x: B, y: 0, z: 3*H }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300_3d]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [3, { id: 3, type: 'frame', nodeI: 3, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [4, { id: 4, type: 'frame', nodeI: 4, nodeJ: 6, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [5, { id: 5, type: 'frame', nodeI: 5, nodeJ: 7, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [6, { id: 6, type: 'frame', nodeI: 6, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [7, { id: 7, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [8, { id: 8, type: 'frame', nodeI: 5, nodeJ: 6, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [9, { id: 9, type: 'frame', nodeI: 7, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: addOutOfPlaneRestraints(
        new Map([
          [1, embed2DSupport({ id: 1, nodeId: 1, type: 'fixed' })],
          [2, embed2DSupport({ id: 2, nodeId: 2, type: 'fixed' })],
        ]),
        [1, 2, 3, 4, 5, 6, 7, 8],
      ),
      loads: [
        { type: 'distributed', data: { elementId: 7, qYI: 0, qYJ: 0, qZI: qBeam, qZJ: qBeam } },
        { type: 'distributed', data: { elementId: 8, qYI: 0, qYJ: 0, qZI: qBeam, qZJ: qBeam } },
        { type: 'distributed', data: { elementId: 9, qYI: 0, qYJ: 0, qZI: qBeam, qZJ: qBeam } },
        { type: 'nodal', data: { nodeId: 7, fx: 10, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 5, fx: 5, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } },
      ],
    };

    const res2D = solve2D(input2D);
    const res3D = solve3D(input3D);
    compare2Dvs3D(res2D, res3D, 1e-4, 'multi-story asymmetric');
  });

  it('truss with axial loads only', () => {
    // Simple truss triangle
    const input2D: SolverInput = {
      nodes: new Map([
        [1, { id: 1, x: 0, z: 0 }],
        [2, { id: 2, x: 4, z: 0 }],
        [3, { id: 3, x: 2, z: 3 }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300]]),
      elements: new Map([
        [1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'truss', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [3, { id: 3, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: new Map([
        [0, { id: 1, nodeId: 1, type: 'pinned' }],
        [1, { id: 2, nodeId: 2, type: 'rollerX' }],
      ]),
      loads: [
        { type: 'nodal', data: { nodeId: 3, fx: 5, fz: -20, my: 0 } },
      ],
    };

    const input3D: SolverInput3D = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 4, y: 0, z: 0 }],
        [3, { id: 3, x: 2, y: 0, z: 3 }],
      ]),
      materials: new Map([[1, steel]]),
      sections: new Map([[1, ipe300_3d]]),
      elements: new Map([
        [1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'truss', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [3, { id: 3, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: addOutOfPlaneRestraints(
        new Map([
          [1, embed2DSupport({ id: 1, nodeId: 1, type: 'pinned' })],
          [2, embed2DSupport({ id: 2, nodeId: 2, type: 'rollerX' })],
        ]),
        [1, 2, 3],
      ),
      loads: [
        { type: 'nodal', data: { nodeId: 3, fx: 5, fy: 0, fz: -20, mx: 0, my: 0, mz: 0 } },
      ],
    };

    const res2D = solve2D(input2D);
    const res3D = solve3D(input3D);
    compare2Dvs3D(res2D, res3D, 1e-4, 'truss');
  });
});
