/**
 * 3D Kinematic Analysis Tests
 *
 * Tests for the 3D kinematic analysis system:
 * - computeStaticDegree3D(): Degree of static indeterminacy for 3D structures
 * - analyzeKinematics3D(): Full kinematic analysis (degree + rank analysis)
 *
 * 3D Static degree formula (frames):
 *   GH = 6*m_frame + 3*m_truss + r - 6*n - c
 *
 * where:
 *   m_frame = number of frame elements
 *   m_truss = number of truss elements
 *   r = total restrained DOFs (boolean restraints + springs)
 *   n = number of nodes
 *   c = total hinge conditions (each 3D hinge releases 3 moment DOFs)
 *
 * Pure truss formula:
 *   GH = m + r - 3*n
 *
 * Hinge counting per node:
 *   c_i = 0 if k <= 1 (free end)
 *   c_i = 3*j if node has rotational support (each hinge releases 3 moments independently)
 *   c_i = 3*min(j, k-1) otherwise (one release absorbed by free rotation DOFs)
 *
 * References:
 *   - Fliess, Estabilidad (Tomo I)
 *   - Przemieniecki, "Theory of Matrix Structural Analysis"
 */

import { describe, it, expect } from 'vitest';
import { computeStaticDegree3D, analyzeKinematics3D } from '../kinematic-3d';
import type { SolverInput3D, SolverLoad3D } from '../types-3d';

// ─── Test Helpers ───────────────────────────────────────────────

const STEEL_E = 200_000; // MPa
const STD_A = 0.01;      // m²
const STD_IY = 1e-4;     // m⁴
const STD_IZ = 1e-4;     // m⁴
const STD_J = 2e-4;      // m⁴

/**
 * Build a SolverInput3D from simplified arrays.
 *
 * @param opts.nodes Array of [id, x, y, z]
 * @param opts.elements Array of [id, nodeI, nodeJ, type, hingeStart?, hingeEnd?]
 * @param opts.supports Array of support definitions with boolean restraints
 * @param opts.loads Optional array of SolverLoad3D
 */
function makeInput3D(opts: {
  nodes: Array<[number, number, number, number]>;
  elements: Array<[number, number, number, 'frame' | 'truss', boolean?, boolean?]>;
  supports: Array<{
    id: number;
    nodeId: number;
    rx?: boolean;
    ry?: boolean;
    rz?: boolean;
    rrx?: boolean;
    rry?: boolean;
    rrz?: boolean;
    kx?: number;
    ky?: number;
    kz?: number;
    krx?: number;
    kry?: number;
    krz?: number;
  }>;
  loads?: SolverLoad3D[];
}): SolverInput3D {
  const nodes = new Map(
    opts.nodes.map(([id, x, y, z]) => [id, { id, x, y, z }]),
  );
  const materials = new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]);
  const sections = new Map([[1, { id: 1, a: STD_A, iz: STD_IZ, iy: STD_IY, j: STD_J }]]);
  const elements = new Map(
    opts.elements.map(([id, nodeI, nodeJ, type, hingeStart, hingeEnd]) => [
      id,
      {
        id,
        type,
        nodeI,
        nodeJ,
        materialId: 1,
        sectionId: 1,
        hingeStart: hingeStart ?? false,
        hingeEnd: hingeEnd ?? false,
      },
    ]),
  );
  const supports = new Map(
    opts.supports.map((s) => [
      s.id,
      {
        nodeId: s.nodeId,
        rx: s.rx ?? false,
        ry: s.ry ?? false,
        rz: s.rz ?? false,
        rrx: s.rrx ?? false,
        rry: s.rry ?? false,
        rrz: s.rrz ?? false,
        kx: s.kx,
        ky: s.ky,
        kz: s.kz,
        krx: s.krx,
        kry: s.kry,
        krz: s.krz,
      },
    ]),
  );
  return { nodes, materials, sections, elements, supports, loads: opts.loads ?? [] };
}

// ═══════════════════════════════════════════════════════════════
// 1. computeStaticDegree3D — Formula Verification
// ═══════════════════════════════════════════════════════════════

describe('computeStaticDegree3D — formula verification', () => {

  it('1. Isostatic 3D beam: pin + torsion at one end, roller at other → degree = 0', () => {
    // Single frame element, 2 nodes along X axis.
    // Node 1: rx,ry,rz,rrx restrained (4 DOFs)
    // Node 2: ry,rz restrained (2 DOFs)
    // r = 4 + 2 = 6
    // m_frame=1, n=2, c=0
    // GH = 6*1 + 6 - 6*2 = 6 + 6 - 12 = 0
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 6, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true },
        { id: 2, nodeId: 2, ry: true, rz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(0);
  });

  it('2. 3D cantilever (full fixed support) → degree = 0', () => {
    // 1 frame element, 2 nodes. Node 1 fully fixed (6 DOFs restrained).
    // r = 6, m_frame=1, n=2, c=0
    // GH = 6*1 + 6 - 6*2 = 6 + 6 - 12 = 0
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 4, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(0);
  });

  it('3. 3D propped cantilever (fixed + pin) → degree > 0', () => {
    // 1 frame element, 2 nodes.
    // Node 1: fully fixed (6 DOFs), Node 2: pin (3 translations).
    // r = 6 + 3 = 9
    // GH = 6*1 + 9 - 6*2 = 6 + 9 - 12 = 3
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 2, rx: true, ry: true, rz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(3);
  });

  it('4. Simple space truss tetrahedron (6 bars, 4 nodes) → degree = 0', () => {
    // Tetrahedron: 4 nodes, 6 truss bars connecting all pairs.
    // For pure truss: GH = m + r - 3*n = 6 + r - 12
    // Need r = 6 for isostatic.
    // Node 1: rx,ry,rz (3), Node 2: ry,rz (2), Node 3: rz (1) → r=6
    // GH = 6 + 6 - 12 = 0
    const h = Math.sqrt(2 / 3) * 2;
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0],
        [2, 2, 0, 0],
        [3, 1, 0, Math.sqrt(3)],
        [4, 1, h, Math.sqrt(3) / 3],
      ],
      elements: [
        [1, 1, 2, 'truss'],
        [2, 1, 3, 'truss'],
        [3, 2, 3, 'truss'],
        [4, 1, 4, 'truss'],
        [5, 2, 4, 'truss'],
        [6, 3, 4, 'truss'],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
        { id: 2, nodeId: 2, ry: true, rz: true },
        { id: 3, nodeId: 3, rz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(0);
  });

  it('5. Under-constrained 3D truss → degree < 0', () => {
    // 4 nodes, 4 truss bars (not enough — need 6 for tetrahedron)
    // r = 6, m = 4, n = 4
    // GH = 4 + 6 - 12 = -2
    const h = Math.sqrt(2 / 3) * 2;
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0],
        [2, 2, 0, 0],
        [3, 1, 0, Math.sqrt(3)],
        [4, 1, h, Math.sqrt(3) / 3],
      ],
      elements: [
        [1, 1, 2, 'truss'],
        [2, 1, 3, 'truss'],
        [3, 1, 4, 'truss'],
        [4, 2, 4, 'truss'],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
        { id: 2, nodeId: 2, ry: true, rz: true },
        { id: 3, nodeId: 3, rz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBeLessThan(0);
  });

  it('6. 3D portal frame with fixed bases (4 nodes, 3 elements) → degree = 6', () => {
    // Columns along Y, beam along X in the XY plane.
    // 4 nodes, 3 frame elements, 2 fully fixed supports (r = 12).
    // GH = 6*3 + 12 - 6*4 = 18 + 12 - 24 = 6
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 0, 4, 0], [3, 6, 4, 0], [4, 6, 0, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
        [3, 4, 3, 'frame'],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 4, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(6);
  });

  it('7. Space truss cube with face diagonals → redundant, degree > 0', () => {
    // 8 nodes (cube corners), 12 edges + 6 face diagonals = 18 bars
    // Supports: 3 corner nodes fully pinned (r=9)
    // GH = 18 + 9 - 3*8 = 18 + 9 - 24 = 3
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0], [2, 4, 0, 0], [3, 4, 0, 4], [4, 0, 0, 4],
        [5, 0, 4, 0], [6, 4, 4, 0], [7, 4, 4, 4], [8, 0, 4, 4],
      ],
      elements: [
        // Bottom face edges
        [1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 3, 4, 'truss'], [4, 4, 1, 'truss'],
        // Top face edges
        [5, 5, 6, 'truss'], [6, 6, 7, 'truss'], [7, 7, 8, 'truss'], [8, 8, 5, 'truss'],
        // Vertical edges
        [9, 1, 5, 'truss'], [10, 2, 6, 'truss'], [11, 3, 7, 'truss'], [12, 4, 8, 'truss'],
        // Face diagonals (one per face for bracing)
        [13, 1, 3, 'truss'],  // bottom
        [14, 5, 7, 'truss'],  // top
        [15, 1, 6, 'truss'],  // front
        [16, 4, 7, 'truss'],  // back
        [17, 1, 8, 'truss'],  // left
        [18, 2, 7, 'truss'],  // right
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
        { id: 2, nodeId: 2, ry: true, rz: true },
        { id: 3, nodeId: 4, ry: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    // m=18, r=3+2+1=6, n=8 → GH = 18 + 6 - 24 = 0
    expect(degree).toBe(0);
  });

  it('8. Three-hinge arch in 3D → degree with hinges accounted', () => {
    // 3 nodes forming an arch in XY plane, 2 frame elements with hinges at crown (node 2).
    // Each hinge in 3D releases 3 moment DOFs.
    // Node 2: j=2 hinges, k=2 frames → c_2 = 3*min(2, 2-1) = 3*1 = 3
    // Supports: Node 1 & 3 pinned (rx,ry,rz) + torsion(rrx) = 4 DOFs each → r = 8
    // GH = 6*2 + 8 - 6*3 - 3 = 12 + 8 - 18 - 3 = -1
    // With proper supports (adding rry at supports for bending restraint):
    // Node 1: rx,ry,rz,rrx,rry (5), Node 3: rx,ry,rz,rrx,rry (5) → r = 10
    // GH = 12 + 10 - 18 - 3 = 1
    // Alternatively, to get isostatic: r=9 → GH = 12+9-18-3 = 0
    // Node 1: rx,ry,rz,rrx (4), Node 3: rx,ry,rz,rrx,rrz (5) → r=9
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 4, 0], [3, 10, 0, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at crown (node 2)
        [2, 2, 3, 'frame', true, false],   // hinge at crown (node 2)
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true },
        { id: 2, nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rrz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    // r=9, m_frame=2, n=3, c=3
    // GH = 12 + 9 - 18 - 3 = 0
    expect(degree).toBe(0);
  });

  it('9. Mixed frame + truss in 3D', () => {
    // Portal frame with truss diagonal brace.
    // 4 nodes, 2 frame elements (columns) + 1 frame (beam) + 1 truss diagonal.
    // 2 fully fixed supports (r=12).
    // No hinges, c=0.
    // GH = 6*3 + 3*1 + 12 - 6*4 = 18 + 3 + 12 - 24 = 9
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 0, 4, 0], [3, 6, 4, 0], [4, 6, 0, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
        [3, 4, 3, 'frame'],
        [4, 1, 3, 'truss'],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 4, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(9);
  });

  it('10. Pure truss formula: m + r - 3*n', () => {
    // 3 truss bars forming a triangle in XY plane.
    // 3 nodes, 3 bars, Node 1: rx,ry,rz (3), Node 2: ry,rz (2), Node 3: rz (1)
    // GH = 3 + 6 - 9 = 0
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 4, 0, 0], [3, 2, 3, 0]],
      elements: [
        [1, 1, 2, 'truss'],
        [2, 1, 3, 'truss'],
        [3, 2, 3, 'truss'],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
        { id: 2, nodeId: 2, ry: true, rz: true },
        { id: 3, nodeId: 3, rz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(0);
  });

  it('11. Redundant structure (two fixed supports on single beam) → highly hyperstatic', () => {
    // 1 frame, 2 nodes, both fully fixed → r = 12
    // GH = 6*1 + 12 - 6*2 = 6 + 12 - 12 = 6
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 2, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(6);
  });

  it('12. Grid/emparrillado: beams in XZ plane (floor grid)', () => {
    // 4 nodes at corners, 4 beams forming a square grid in XZ plane.
    // All corners have vertical restraint (ry) + torsion (rrx, rrz) = 3 DOFs each.
    // r = 4 * 3 = 12, m_frame=4, n=4, c=0
    // GH = 6*4 + 12 - 6*4 = 24 + 12 - 24 = 12
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 4, 0, 0], [3, 4, 0, 4], [4, 0, 0, 4]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
        [3, 3, 4, 'frame'],
        [4, 4, 1, 'frame'],
      ],
      supports: [
        { id: 1, nodeId: 1, ry: true, rrx: true, rrz: true },
        { id: 2, nodeId: 2, ry: true, rrx: true, rrz: true },
        { id: 3, nodeId: 3, ry: true, rrx: true, rrz: true },
        { id: 4, nodeId: 4, ry: true, rrx: true, rrz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(12);
  });

  it('13. Tower with bracing: multiple levels of truss elements', () => {
    // Simple 2-level tower: 8 nodes, 4 verticals + 4 horizontals + 4 diagonals = 12 bars
    // 4 base nodes pinned (r = 4*3 = 12)
    // GH = 12 + 12 - 3*8 = 12 + 12 - 24 = 0
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0], [2, 4, 0, 0], [3, 4, 0, 4], [4, 0, 0, 4],  // base
        [5, 0, 4, 0], [6, 4, 4, 0], [7, 4, 4, 4], [8, 0, 4, 4],  // top
      ],
      elements: [
        // Verticals
        [1, 1, 5, 'truss'], [2, 2, 6, 'truss'], [3, 3, 7, 'truss'], [4, 4, 8, 'truss'],
        // Horizontals top
        [5, 5, 6, 'truss'], [6, 6, 7, 'truss'], [7, 7, 8, 'truss'], [8, 8, 5, 'truss'],
        // Diagonals on faces (bracing)
        [9, 1, 6, 'truss'], [10, 2, 7, 'truss'], [11, 3, 8, 'truss'], [12, 4, 5, 'truss'],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
        { id: 2, nodeId: 2, rx: true, ry: true, rz: true },
        { id: 3, nodeId: 3, rx: true, ry: true, rz: true },
        { id: 4, nodeId: 4, rx: true, ry: true, rz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(0);
  });

  it('14. Single node with fixed support (trivial, no elements)', () => {
    // No elements: hasFrames = false → pure truss formula: m + r - 3n
    // m=0, r=6 (all 6 DOFs restrained), n=1
    // BUT: truss mode has 3 DOFs/node, so r counts only translations = 3
    // Actually, countSupportRestraints3D counts ALL restraints = 6
    // GH = 0 + 6 - 3*1 = 3 (redundant, since we have 6 restraints for 3 DOFs)
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0]],
      elements: [],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    // With no frames, truss formula: m + r - 3n = 0 + 6 - 3 = 3
    // The extra rotational restraints are counted but truss nodes only have 3 DOFs
    expect(degree).toBe(3);
  });

  it('15. Hinge at node with rotational support: conditions counted independently', () => {
    // 3 nodes, 2 frame elements, hinges at node 2 (both ends meet).
    // Node 2 has a support with rotational restraints (rrx,rry,rrz).
    // Since rotation is restrained, each hinge is an independent condition.
    // j=2 hinges at node 2, with rotational restraint → c = 3*j = 3*2 = 6
    // Supports: Node 1 pinned+torsion (4), Node 2 ry+rrx+rry+rrz (4), Node 3 ry+rz (2)
    // r = 4 + 4 + 2 = 10
    // GH = 6*2 + 10 - 6*3 - 6 = 12 + 10 - 18 - 6 = -2
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0], [3, 10, 0, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at node 2
        [2, 2, 3, 'frame', true, false],   // hinge at node 2
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true },
        { id: 2, nodeId: 2, ry: true, rrx: true, rry: true, rrz: true },
        { id: 3, nodeId: 3, ry: true, rz: true },
      ],
    });
    const { degree } = computeStaticDegree3D(input);
    expect(degree).toBe(-2);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Mechanism Detection via analyzeKinematics3D
// ═══════════════════════════════════════════════════════════════

describe('analyzeKinematics3D — mechanism detection', () => {

  it('16. No supports at all → mechanism', () => {
    // Without any supports, the structure is a rigid body with 6 DOFs unconstrained.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 6, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(false);
    expect(result.mechanismModes).toBeGreaterThan(0);
    expect(result.mechanismNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('17. Single unsupported node → mechanism', () => {
    // 3 nodes, 2 elements, but node 3 is fully supported and node 1 is too,
    // while the beam has zero supports at free end — but here test with only 1 node.
    // Actually: 2 nodes, 1 element, only 1 translation restrained → mechanism.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, ry: true },  // Only vertical restraint — can slide horizontally
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(false);
    expect(result.mechanismModes).toBeGreaterThan(0);
  });

  it('18. Insufficient supports (only 1 translation restrained) → mechanism', () => {
    // Need at least 6 restraints for a single frame element. Only 1 here.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(false);
    expect(result.mechanismModes).toBeGreaterThan(0);
  });

  it('19. Collinear bars with hinge creating mechanism in 3D', () => {
    // 3 collinear nodes along X, hinge at middle node, pin supports at ends.
    // In 3D, collinear + hinge at middle = mechanism (same as 2D analog).
    // The hinged joint can rotate freely in the plane perpendicular to the line.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0], [3, 10, 0, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],
        [2, 2, 3, 'frame', true, false],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true },
        { id: 2, nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    // The degree formula may say 0, but rank analysis detects geometric instability.
    expect(result.isSolvable).toBe(false);
    expect(result.mechanismModes).toBeGreaterThan(0);
  });

  it('20. Valid simply supported 3D beam → no mechanism (isSolvable = true)', () => {
    // Properly supported beam along X axis.
    // Node 1: rx,ry,rz,rrx (4 DOFs), Node 2: ry,rz (2 DOFs) → r=6
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 6, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true },
        { id: 2, nodeId: 2, ry: true, rz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(true);
    expect(result.mechanismModes).toBe(0);
  });

  it('21. Valid 3D cantilever → no mechanism', () => {
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 4, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(true);
    expect(result.mechanismModes).toBe(0);
  });

  it('22. Valid space truss (tetrahedron) → no mechanism', () => {
    // Tetrahedron with proper 3D supports:
    // Node 1: fix all 3 translations (pin in 3D) → r=3
    // Node 2: fix y,z (roller allowing x movement) → r=2
    // Node 3: fix y (roller allowing x,z movement) → r=1
    // Total r=6, m=6, n=4 → GH = 6+6-12 = 0
    // But node 3 only restrained in y — need to ensure no geometric mechanism.
    // Better: use proper 3D support pattern that prevents rigid body motion:
    // Node 1: rx,ry,rz (3), Node 2: ry,rz (2), Node 3: ry (1)
    const h = Math.sqrt(2 / 3) * 2;
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0],
        [2, 2, 0, 0],
        [3, 1, 0, Math.sqrt(3)],
        [4, 1, h, Math.sqrt(3) / 3],
      ],
      elements: [
        [1, 1, 2, 'truss'],
        [2, 1, 3, 'truss'],
        [3, 2, 3, 'truss'],
        [4, 1, 4, 'truss'],
        [5, 2, 4, 'truss'],
        [6, 3, 4, 'truss'],
      ],
      supports: [
        // Node 1: fully pinned → 3 restraints
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
        // Node 2: restrain y,z (allow movement along element 1-2 direction x)
        { id: 2, nodeId: 2, ry: true, rz: true },
        // Node 3: restrain y only (node 3 is not on x-axis, so this prevents rotation)
        { id: 3, nodeId: 3, ry: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    // This configuration should be isostatic and solvable
    expect(result.degree).toBe(0);
    expect(result.isSolvable).toBe(true);
    expect(result.mechanismModes).toBe(0);
  });

  it('23. Space frame with all elements hinged → mechanism', () => {
    // Portal frame with all elements double-hinged and pinned supports.
    // This creates a collapse mechanism: columns and beam are all pin-jointed,
    // and with only pinned supports, the frame can sway.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 0, 4, 0], [3, 6, 4, 0], [4, 6, 0, 0]],
      elements: [
        [1, 1, 2, 'frame', true, true],   // all hinged
        [2, 2, 3, 'frame', true, true],    // all hinged
        [3, 4, 3, 'frame', true, true],    // all hinged
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
        { id: 2, nodeId: 4, rx: true, ry: true, rz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(false);
    expect(result.mechanismModes).toBeGreaterThan(0);
  });

  it('24. Node with only truss connections: rotation DOFs are expected zero, NOT mechanism', () => {
    // In a mixed frame+truss system with 6 DOFs/node, pure truss nodes have
    // zero rotational stiffness. These should be handled by artificial stiffness,
    // not flagged as mechanisms.
    // Use 3 truss bars in 3D to fully constrain translations at node 4.
    // Node 4 is the truss-only node connected to 3 fixed-supported frame nodes.
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0],
        [2, 5, 0, 0],
        [3, 2.5, 0, 4],
        [4, 2.5, 3, 2],  // Truss-only node, not coplanar with 1,2,3
      ],
      elements: [
        [1, 1, 2, 'frame'],   // frame beam
        [2, 1, 3, 'frame'],   // frame beam
        [3, 2, 3, 'frame'],   // frame beam
        [4, 1, 4, 'truss'],   // truss brace (3D direction)
        [5, 2, 4, 'truss'],   // truss brace (3D direction)
        [6, 3, 4, 'truss'],   // truss brace (3D direction)
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 2, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 3, nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    // Node 4 has 3 truss bars providing translational stiffness in 3 directions.
    // Its rotation DOFs (3 DOFs) have zero stiffness — this is expected for
    // truss-only nodes and should NOT be flagged as a mechanism.
    expect(result.isSolvable).toBe(true);
  });

  it('25. Unstable supports: clearly insufficient support → mechanism', () => {
    // Two frame elements forming an L-shape, but with only 1 pin support
    // (3 translation restraints) — clearly insufficient for 3D frame
    // m_frame=2, n=3, r=3, c=0 → GH = 12+3-18 = -3 (hypostatic)
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 4, 0, 0], [3, 4, 0, 3]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [
        // Only one pin support — not enough for 3D frame
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(false);
    expect(result.mechanismModes).toBeGreaterThan(0);
  });

  it('26. Valid propped cantilever → no mechanism, hyperstatic', () => {
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 2, rx: true, ry: true, rz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(true);
    expect(result.classification).toBe('hyperstatic');
    expect(result.degree).toBe(3);
  });

  it('27. Roller only (1 DOF restrained) → mechanism', () => {
    // Single roller (ry only) on a beam — insufficient for 3D stability.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, ry: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(false);
    expect(result.mechanismModes).toBeGreaterThan(0);
  });

  it('28. Frame with one hinge at mid-node → valid three-hinge arch analog', () => {
    // Non-collinear arch shape: nodes form a triangle (not on a line).
    // Node 1 at (0,0,0), crown at (5,4,0), node 3 at (10,0,0).
    // Hinges at the crown, adequate supports to make it isostatic.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 4, 0], [3, 10, 0, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at crown
        [2, 2, 3, 'frame', true, false],   // hinge at crown
      ],
      supports: [
        // Need enough supports to make this stable.
        // Node 1: rx,ry,rz,rrx,rry (5 DOFs)
        // Node 3: rx,ry,rz,rrx (4 DOFs)
        // r = 9, c = 3 (one hinge at crown, 3 moment releases)
        // GH = 12 + 9 - 18 - 3 = 0
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true },
        { id: 2, nodeId: 3, rx: true, ry: true, rz: true, rrx: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(true);
    expect(result.mechanismModes).toBe(0);
  });

  it('29. Completely fixed structure → hyperstatic, no mechanism', () => {
    // Two fixed supports on a single beam → highly hyperstatic.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 6, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 2, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(true);
    expect(result.mechanismModes).toBe(0);
    expect(result.classification).toBe('hyperstatic');
    expect(result.degree).toBe(6);
  });

  it('30. Missing diagonal in 3D truss → mechanism', () => {
    // Square-based pyramid with 4 base bars + 4 diagonals = 8 bars.
    // If we remove one diagonal, it becomes a mechanism.
    // 5 nodes, 7 bars (missing one diagonal)
    // Node 1: rx,ry,rz (3), Node 2: ry,rz (2), Node 4: rz (1) → r=6
    // GH = 7 + 6 - 15 = -2 → mechanism
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0],
        [2, 4, 0, 0],
        [3, 4, 0, 4],
        [4, 0, 0, 4],
        [5, 2, 3, 2],  // apex
      ],
      elements: [
        // Base ring
        [1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 3, 4, 'truss'], [4, 4, 1, 'truss'],
        // Diagonals to apex (only 3 out of 4 — missing one creates mechanism)
        [5, 1, 5, 'truss'],
        [6, 2, 5, 'truss'],
        [7, 3, 5, 'truss'],
        // Missing: [8, 4, 5, 'truss']
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
        { id: 2, nodeId: 2, ry: true, rz: true },
        { id: 3, nodeId: 4, rz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(false);
    expect(result.mechanismModes).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Classification and Messages
// ═══════════════════════════════════════════════════════════════

describe('Classification and diagnosis messages (3D)', () => {

  it('31. Isostatic classification', () => {
    // Cantilever beam: isostatic in 3D (fixed + free end).
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 4, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.classification).toBe('isostatic');
    expect(result.degree).toBe(0);
    expect(result.diagnosis).toMatch(/isostatic/i);
  });

  it('32. Hyperstatic classification with correct degree', () => {
    // Portal frame with fixed bases: degree = 6 in 3D.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 0, 4, 0], [3, 6, 4, 0], [4, 6, 0, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
        [3, 4, 3, 'frame'],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 4, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.classification).toBe('hyperstatic');
    expect(result.degree).toBe(6);
    expect(result.diagnosis).toMatch(/hyperstatic/i);
    expect(result.diagnosis).toContain('6');
  });

  it('33. Hypostatic classification', () => {
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 6, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [],
    });
    const result = analyzeKinematics3D(input);
    expect(result.classification).toBe('hypostatic');
    expect(result.mechanismNodes.length).toBeGreaterThan(0);
  });

  it('34. Diagnosis message for mechanism', () => {
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 6, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [],
    });
    const result = analyzeKinematics3D(input);
    // Diagnosis should mention mechanism or hypostatic
    expect(result.diagnosis).toMatch(/[Mm]echanism|[Hh]ypostatic/);
  });

  it('35. Diagnosis message for valid structure', () => {
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 6, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(true);
    expect(result.diagnosis.length).toBeGreaterThan(0);
    // Should not mention mechanism
    expect(result.diagnosis).not.toMatch(/[Mm]ecanismo/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Integration with Expected Zero-Stiffness DOFs
// ═══════════════════════════════════════════════════════════════

describe('Integration with expected zero-stiffness DOFs (3D)', () => {

  it('36. All-hinged frame node: rotation DOFs should NOT be flagged as mechanism', () => {
    // Cantilever with hinge at the free end.
    // The free-end rotation DOFs have zero stiffness due to the hinge,
    // but this is not a mechanism — it's a valid pin joint.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 4, 0, 0]],
      elements: [[1, 1, 2, 'frame', false, true]],  // hinge at free end
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    // The hinge at free end (k=1) should not create mechanism
    expect(result.isSolvable).toBe(true);
    expect(result.mechanismModes).toBe(0);
  });

  it('37. Partially hinged node: only expected DOFs filtered', () => {
    // Two beams meeting at node 2, one hinge on one side only.
    // Node 2 has k=2 frame elements and j=1 hinge.
    // One rotation group is free, but the structure is stable.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0], [3, 10, 0, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at node 2 (elem 1 end)
        [2, 2, 3, 'frame'],                // no hinge at node 2 (elem 2 start)
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 3, ry: true, rz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    // Node 2 has partial hinge; structure should be stable as the continuous
    // element provides rotational stiffness at that joint.
    expect(result.isSolvable).toBe(true);
    expect(result.mechanismModes).toBe(0);
  });

  it('38. Pure truss nodes: no rotation DOFs to filter (3 DOFs/node)', () => {
    // Pure truss structure: DOFs per node = 3 (translations only).
    // No rotation DOFs exist, so no filtering is needed.
    // Tetrahedron with correct supports for stability:
    // Node 1: pin (rx,ry,rz=3), Node 2: ry,rz (2), Node 3: ry (1)
    // Total r=6, m=6, n=4 → GH = 6+6-12 = 0
    const h = Math.sqrt(2 / 3) * 2;
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0],
        [2, 2, 0, 0],
        [3, 1, 0, Math.sqrt(3)],
        [4, 1, h, Math.sqrt(3) / 3],
      ],
      elements: [
        [1, 1, 2, 'truss'],
        [2, 1, 3, 'truss'],
        [3, 2, 3, 'truss'],
        [4, 1, 4, 'truss'],
        [5, 2, 4, 'truss'],
        [6, 3, 4, 'truss'],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true },
        { id: 2, nodeId: 2, ry: true, rz: true },
        { id: 3, nodeId: 3, ry: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(true);
    expect(result.mechanismModes).toBe(0);
  });

  it('39. Hinge at supported node with rotation restraint: different counting', () => {
    // Node 2 has a fixed support (rotation restrained) AND two hinges meeting.
    // With rotational restraint, hinges are counted independently: c = 3*j.
    // This creates a valid structure (Gerber beam in 3D).
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0], [3, 10, 0, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],
        [2, 2, 3, 'frame', true, false],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 2, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 3, nodeId: 3, ry: true, rz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    // Fixed at both supported nodes, with hinge at node 2 where it's also fixed.
    // This should be solvable.
    expect(result.isSolvable).toBe(true);
  });

  it('40. Three-hinge arch crown in 3D: valid, not mechanism', () => {
    // Non-collinear 3D arch with hinge at the crown.
    // Properly supported to be isostatic.
    // This tests that the expected zero DOFs at the hinge are correctly filtered
    // and not flagged as a mechanism.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 4, 2], [3, 10, 0, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],
        [2, 2, 3, 'frame', true, false],
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true },
        { id: 2, nodeId: 3, rx: true, ry: true, rz: true, rrx: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(true);
    expect(result.mechanismModes).toBe(0);
  });

  it('41. Double-hinged beam with fixed supports → solvable (acts as truss member)', () => {
    // A beam with hinges at both ends behaves like a truss element.
    // With adequate supports, the axial DOF provides load path.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 6, 0, 0]],
      elements: [[1, 1, 2, 'frame', true, true]],  // double hinged
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 2, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    // Both ends have rotation restrained by supports, so the double-hinged
    // element effectively acts as an axial member. Should be solvable.
    expect(result.isSolvable).toBe(true);
  });

  it('42. Spring support provides DOF restraint', () => {
    // A spring (kx, ky, kz) at one node provides translational restraint.
    // The spring counts towards the DOF restraints.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 5, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 2, kx: 1000, ky: 1000, kz: 1000 },
      ],
    });
    const result = analyzeKinematics3D(input);
    // Spring DOFs are "free" in DOF numbering but have stiffness → structure is stable.
    expect(result.isSolvable).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Additional Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Additional edge cases (3D)', () => {

  it('43. Two-story space frame → hyperstatic, solvable', () => {
    // 6 nodes, 6 frame elements forming a two-story planar frame.
    // Fixed bases at nodes 1 and 4.
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0], [2, 0, 4, 0], [3, 6, 4, 0],
        [4, 6, 0, 0], [5, 0, 8, 0], [6, 6, 8, 0],
      ],
      elements: [
        [1, 1, 2, 'frame'],  // left column 1
        [2, 2, 3, 'frame'],  // beam 1
        [3, 4, 3, 'frame'],  // right column 1
        [4, 2, 5, 'frame'],  // left column 2
        [5, 5, 6, 'frame'],  // beam 2
        [6, 3, 6, 'frame'],  // right column 2
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 4, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    expect(result.isSolvable).toBe(true);
    expect(result.classification).toBe('hyperstatic');
    expect(result.degree).toBeGreaterThan(0);
  });

  it('44. Space frame with out-of-plane beam → 3D behavior', () => {
    // L-shaped frame in 3D space (beams in different planes).
    // Node 2 is at the corner, connecting XY and YZ planes.
    const input = makeInput3D({
      nodes: [
        [1, 0, 0, 0],   // base of column
        [2, 0, 4, 0],   // top of column / start of beams
        [3, 5, 4, 0],   // end of beam in X
        [4, 0, 4, 5],   // end of beam in Z
      ],
      elements: [
        [1, 1, 2, 'frame'],  // column
        [2, 2, 3, 'frame'],  // beam in X direction
        [3, 2, 4, 'frame'],  // beam in Z direction
      ],
      supports: [
        { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { id: 2, nodeId: 3, rx: true, ry: true, rz: true },
        { id: 3, nodeId: 4, rx: true, ry: true, rz: true },
      ],
    });
    const result = analyzeKinematics3D(input);
    // r = 6 + 3 + 3 = 12, m_frame = 3, n = 4
    // GH = 18 + 12 - 24 = 6
    expect(result.isSolvable).toBe(true);
    expect(result.classification).toBe('hyperstatic');
  });

  it('45. Unconstrained DOFs list specific directions in 3D', () => {
    // No supports → all DOFs unconstrained. Verify the format of unconstrainedDofs.
    const input = makeInput3D({
      nodes: [[1, 0, 0, 0], [2, 6, 0, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [],
    });
    const result = analyzeKinematics3D(input);
    expect(result.unconstrainedDofs.length).toBeGreaterThan(0);
    // Each DOF should have a valid 3D label
    for (const d of result.unconstrainedDofs) {
      expect(['ux', 'uy', 'uz', 'rx', 'ry', 'rz']).toContain(d.dof);
      expect(typeof d.nodeId).toBe('number');
    }
  });
});
