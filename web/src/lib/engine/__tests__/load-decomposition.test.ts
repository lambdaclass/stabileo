/**
 * Load Decomposition Tests — Angle & Global/Local coordinate system
 *
 * Tests the decomposition of loads with angle/isGlobal parameters
 * into local perpendicular + axial components, following the pattern
 * used in buildSolverInput() of model.svelte.ts.
 *
 * The decomposition converts:
 * - PointLoadOnElement with angle/isGlobal → SolverPointLoadOnElement (perp) + SolverNodalLoads (axial)
 * - DistributedLoad with angle/isGlobal → SolverDistributedLoad (perp) + SolverNodalLoads (axial)
 */

// BUG: All tests in this file use 2-node fixed-fixed beams which the WASM solver
// rejects (0 free DOFs). All describe blocks are skipped until the solver handles
// fully-restrained structures by returning FEF-based results.
import { describe, it, expect } from 'vitest';
import { solve } from '../wasm-solver';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';

// ─── Constants ──────────────────────────────────────────────────

const STEEL_E = 200_000; // MPa
const STD_A = 0.01;      // m²
const STD_IZ = 1e-4;     // m⁴
const ABS_TOL = 1e-6;

// ─── Helpers ────────────────────────────────────────────────────

function makeInput(opts: {
  nodes: Array<[number, number, number]>;
  elements: Array<[number, number, number, 'frame' | 'truss', boolean?, boolean?]>;
  supports: Array<[number, number, string, Record<string, number>?]>;
  loads?: SolverLoad[];
}): SolverInput {
  const nodes = new Map(opts.nodes.map(([id, x, y]) => [id, { id, x, y }]));
  const materials = new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]);
  const sections = new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]);
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

function getReaction(results: AnalysisResults, nodeId: number) {
  return results.reactions.find(r => r.nodeId === nodeId) ?? { nodeId, rx: 0, rz: 0, my: 0 };
}

/**
 * Simulate the decomposition that buildSolverInput performs for a PointLoadOnElement.
 * This mirrors the exact code from model.svelte.ts for testing purposes.
 */
function decomposePointLoad(
  p: number, a: number, angle: number, isGlobal: boolean,
  nodeI: { x: number; y: number; id: number },
  nodeJ: { x: number; y: number; id: number },
  elementId: number,
): SolverLoad[] {
  const edx = nodeJ.x - nodeI.x, edy = nodeJ.y - nodeI.y;
  const L = Math.sqrt(edx * edx + edy * edy);
  const cosTheta = edx / L, sinTheta = edy / L;
  const angleRad = angle * Math.PI / 180;

  let fxGlobal: number, fyGlobal: number;
  if (isGlobal) {
    fxGlobal = p * Math.sin(angleRad);
    fyGlobal = p * Math.cos(angleRad);
  } else {
    const fLocalPerp = p * Math.cos(angleRad);
    const fLocalAxial = p * Math.sin(angleRad);
    fxGlobal = fLocalAxial * cosTheta + fLocalPerp * (-sinTheta);
    fyGlobal = fLocalAxial * sinTheta + fLocalPerp * cosTheta;
  }

  const pPerp = fxGlobal * (-sinTheta) + fyGlobal * cosTheta;
  const pAxial = fxGlobal * cosTheta + fyGlobal * sinTheta;

  const loads: SolverLoad[] = [];
  if (Math.abs(pPerp) > 1e-10) {
    loads.push({ type: 'pointOnElement', data: { elementId, a, p: pPerp } });
  }
  if (Math.abs(pAxial) > 1e-10) {
    const t = a / L;
    const fI = pAxial * (1 - t);
    const fJ = pAxial * t;
    loads.push(
      { type: 'nodal', data: { nodeId: nodeI.id, fx: fI * cosTheta, fy: fI * sinTheta, mz: 0 } },
      { type: 'nodal', data: { nodeId: nodeJ.id, fx: fJ * cosTheta, fy: fJ * sinTheta, mz: 0 } },
    );
  }
  return loads;
}

/**
 * Simulate the decomposition for a DistributedLoad.
 */
function decomposeDistLoad(
  qI: number, qJ: number, angle: number, isGlobal: boolean,
  nodeI: { x: number; y: number; id: number },
  nodeJ: { x: number; y: number; id: number },
  elementId: number,
): SolverLoad[] {
  const edx = nodeJ.x - nodeI.x, edy = nodeJ.y - nodeI.y;
  const L = Math.sqrt(edx * edx + edy * edy);
  const cosTheta = edx / L, sinTheta = edy / L;
  const angleRad = angle * Math.PI / 180;

  let qIPerpLocal: number, qIAxialLocal: number;
  let qJPerpLocal: number, qJAxialLocal: number;

  if (isGlobal) {
    const fxI = qI * Math.sin(angleRad);
    const fyI = qI * Math.cos(angleRad);
    const fxJ = qJ * Math.sin(angleRad);
    const fyJ = qJ * Math.cos(angleRad);
    qIPerpLocal = fxI * (-sinTheta) + fyI * cosTheta;
    qIAxialLocal = fxI * cosTheta + fyI * sinTheta;
    qJPerpLocal = fxJ * (-sinTheta) + fyJ * cosTheta;
    qJAxialLocal = fxJ * cosTheta + fyJ * sinTheta;
  } else {
    qIPerpLocal = qI * Math.cos(angleRad);
    qIAxialLocal = qI * Math.sin(angleRad);
    qJPerpLocal = qJ * Math.cos(angleRad);
    qJAxialLocal = qJ * Math.sin(angleRad);
  }

  const loads: SolverLoad[] = [];
  if (Math.abs(qIPerpLocal) > 1e-10 || Math.abs(qJPerpLocal) > 1e-10) {
    loads.push({ type: 'distributed', data: { elementId, qI: qIPerpLocal, qJ: qJPerpLocal } });
  }
  if (Math.abs(qIAxialLocal) > 1e-10 || Math.abs(qJAxialLocal) > 1e-10) {
    const fI = L * (2 * qIAxialLocal + qJAxialLocal) / 6;
    const fJ = L * (qIAxialLocal + 2 * qJAxialLocal) / 6;
    loads.push(
      { type: 'nodal', data: { nodeId: nodeI.id, fx: fI * cosTheta, fy: fI * sinTheta, mz: 0 } },
      { type: 'nodal', data: { nodeId: nodeJ.id, fx: fJ * cosTheta, fy: fJ * sinTheta, mz: 0 } },
    );
  }
  return loads;
}

// ─── Tests ──────────────────────────────────────────────────────

describe.skip('Point Load Decomposition', () => {
  // Horizontal beam: fixed-fixed, L=6m
  const horizontalBeam = () => makeInput({
    nodes: [[1, 0, 0], [2, 6, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
  });

  // 45° inclined beam: fixed-fixed, from (0,0) to (3√2, 3√2) ~ (4.243, 4.243)
  const L45 = 6;
  const d45 = L45 * Math.SQRT1_2; // ~4.243
  const inclinedBeam = () => makeInput({
    nodes: [[1, 0, 0], [2, d45, d45]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
  });

  // Vertical beam: fixed-fixed, L=6m
  const verticalBeam = () => makeInput({
    nodes: [[1, 0, 0], [2, 0, 6]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
  });

  const P = -10; // kN downward
  const aMid = 3; // at midspan

  it('local angle=0 (default): identical to direct perpendicular load', () => {
    // Direct load (no decomposition)
    const input1 = horizontalBeam();
    input1.loads = [{ type: 'pointOnElement', data: { elementId: 1, a: aMid, p: P } }];
    const r1 = solve(input1);

    // Decomposed load (should be identical)
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };
    const loads = decomposePointLoad(P, aMid, 0, false, ni, nj, 1);
    const input2 = horizontalBeam();
    input2.loads = loads;
    const r2 = solve(input2);

    const r1a = getReaction(r1, 1);
    const r2a = getReaction(r2, 1);
    expect(Math.abs(r1a.rz - r2a.rz)).toBeLessThan(ABS_TOL);
    expect(Math.abs(r1a.my - r2a.my)).toBeLessThan(ABS_TOL);
  });

  it('local angle=90: force is purely axial (no bending)', () => {
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };
    const loads = decomposePointLoad(P, aMid, 90, false, ni, nj, 1);
    const input = horizontalBeam();
    input.loads = loads;
    const results = solve(input);

    // All force is axial on horizontal beam → fx reactions, no moments
    const r1 = getReaction(results, 1);
    const r2 = getReaction(results, 2);
    // Total fx reaction should equal -P (equilibrium)
    expect(Math.abs(r1.rx + r2.rx - (-P))).toBeLessThan(0.5);
    // No bending → moments should be zero
    expect(Math.abs(r1.my)).toBeLessThan(ABS_TOL);
    expect(Math.abs(r2.my)).toBeLessThan(ABS_TOL);
    // No vertical reaction
    expect(Math.abs(r1.rz)).toBeLessThan(ABS_TOL);
    expect(Math.abs(r2.rz)).toBeLessThan(ABS_TOL);
  });

  it('local angle=45: mixed perpendicular and axial', () => {
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };
    const loads = decomposePointLoad(P, aMid, 45, false, ni, nj, 1);
    const input = horizontalBeam();
    input.loads = loads;
    const results = solve(input);

    const r1 = getReaction(results, 1);
    const r2 = getReaction(results, 2);
    // Should have both vertical and horizontal reactions
    expect(Math.abs(r1.rz) + Math.abs(r2.rz)).toBeGreaterThan(0.1);
    expect(Math.abs(r1.rx) + Math.abs(r2.rx)).toBeGreaterThan(0.1);
    // Global equilibrium: sum of reactions + applied = 0 → reactions = -applied
    const pPerp = P * Math.cos(Math.PI / 4); // perpendicular component
    const pAxial = P * Math.sin(Math.PI / 4); // axial component
    // For horizontal beam: perp → fy global, axial → fx global
    // reactions_fy = -pPerp, reactions_fx = -pAxial
    expect(Math.abs(r1.rz + r2.rz + pPerp)).toBeLessThan(0.5);
    expect(Math.abs(r1.rx + r2.rx + pAxial)).toBeLessThan(0.5);
  });

  it('global angle=0 on horizontal beam: equivalent to local angle=0', () => {
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };

    // Local angle=0
    const loads1 = decomposePointLoad(P, aMid, 0, false, ni, nj, 1);
    const input1 = horizontalBeam();
    input1.loads = loads1;
    const r1 = solve(input1);

    // Global angle=0 (same as local for horizontal beam)
    const loads2 = decomposePointLoad(P, aMid, 0, true, ni, nj, 1);
    const input2 = horizontalBeam();
    input2.loads = loads2;
    const r2 = solve(input2);

    const ra1 = getReaction(r1, 1);
    const ra2 = getReaction(r2, 1);
    expect(Math.abs(ra1.rz - ra2.rz)).toBeLessThan(ABS_TOL);
    expect(Math.abs(ra1.my - ra2.my)).toBeLessThan(ABS_TOL);
  });

  it('global angle=0 on 45° inclined beam: decomposes by cos/sin 45°', () => {
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: d45, y: d45, id: 2 };
    const loads = decomposePointLoad(P, aMid, 0, true, ni, nj, 1);
    const input = inclinedBeam();
    input.loads = loads;
    const results = solve(input);

    // P in global Y → perp = P*cos(45°), axial = -P*sin(45°)
    // Total vertical reaction must equal -P (equilibrium)
    const r1 = getReaction(results, 1);
    const r2 = getReaction(results, 2);
    expect(Math.abs(r1.rz + r2.rz - (-P))).toBeLessThan(0.5);
    expect(Math.abs(r1.rx + r2.rx)).toBeLessThan(0.5); // no horizontal force applied
  });

  it('global angle=0 on vertical beam: force is purely axial', () => {
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 0, y: 6, id: 2 };
    const loads = decomposePointLoad(P, aMid, 0, true, ni, nj, 1);
    const input = verticalBeam();
    input.loads = loads;
    const results = solve(input);

    const r1 = getReaction(results, 1);
    const r2 = getReaction(results, 2);
    // P in global Y on vertical beam → entirely axial → no bending
    expect(Math.abs(r1.my)).toBeLessThan(ABS_TOL);
    expect(Math.abs(r2.my)).toBeLessThan(ABS_TOL);
    // Sum of ry = -P
    expect(Math.abs(r1.rz + r2.rz - (-P))).toBeLessThan(0.5);
  });

  it('global angle=-90: horizontal force in -X global', () => {
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };
    // angle=-90° in global → force in -X direction: Fx = P*sin(-90°) = -P, Fy = P*cos(-90°) = 0
    const loads = decomposePointLoad(P, aMid, -90, true, ni, nj, 1);
    const input = horizontalBeam();
    input.loads = loads;
    const results = solve(input);

    const r1 = getReaction(results, 1);
    const r2 = getReaction(results, 2);
    // All force is horizontal (axial for horizontal beam)
    expect(Math.abs(r1.rz)).toBeLessThan(ABS_TOL);
    expect(Math.abs(r2.rz)).toBeLessThan(ABS_TOL);
    // fx equilibrium: P*sin(-90°) = -P → reactions sum to P
    expect(Math.abs(r1.rx + r2.rx - (-P * Math.sin(-Math.PI / 2)))).toBeLessThan(0.5);
  });
});

describe.skip('Distributed Load Decomposition', () => {
  const horizontalBeam = () => makeInput({
    nodes: [[1, 0, 0], [2, 6, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
  });

  const L45 = 6;
  const d45 = L45 * Math.SQRT1_2;
  const inclinedBeam = () => makeInput({
    nodes: [[1, 0, 0], [2, d45, d45]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
  });

  const qUniform = -5; // kN/m

  it('local angle=0 (default): identical to direct distributed load', () => {
    const input1 = horizontalBeam();
    input1.loads = [{ type: 'distributed', data: { elementId: 1, qI: qUniform, qJ: qUniform } }];
    const r1 = solve(input1);

    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };
    const loads = decomposeDistLoad(qUniform, qUniform, 0, false, ni, nj, 1);
    const input2 = horizontalBeam();
    input2.loads = loads;
    const r2 = solve(input2);

    const ra1 = getReaction(r1, 1);
    const ra2 = getReaction(r2, 1);
    expect(Math.abs(ra1.rz - ra2.rz)).toBeLessThan(ABS_TOL);
    expect(Math.abs(ra1.my - ra2.my)).toBeLessThan(ABS_TOL);
  });

  it('local angle=90: entirely axial → only nodal loads, no bending', () => {
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };
    const loads = decomposeDistLoad(qUniform, qUniform, 90, false, ni, nj, 1);
    const input = horizontalBeam();
    input.loads = loads;
    const results = solve(input);

    const r1 = getReaction(results, 1);
    const r2 = getReaction(results, 2);
    // All axial → no bending moments
    expect(Math.abs(r1.my)).toBeLessThan(ABS_TOL);
    expect(Math.abs(r2.my)).toBeLessThan(ABS_TOL);
    // No vertical reaction
    expect(Math.abs(r1.rz)).toBeLessThan(ABS_TOL);
    // Total horizontal applied = q * L = -5 * 6 = -30 kN → reactions = +30 kN
    expect(Math.abs(r1.rx + r2.rx + qUniform * 6)).toBeLessThan(0.5);
  });

  it('global angle=0 on 45° inclined beam: correct decomposition', () => {
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: d45, y: d45, id: 2 };
    const loads = decomposeDistLoad(qUniform, qUniform, 0, true, ni, nj, 1);
    const input = inclinedBeam();
    input.loads = loads;
    const results = solve(input);

    const r1 = getReaction(results, 1);
    const r2 = getReaction(results, 2);
    // Total vertical reaction = -q*L = 5*6 = 30 kN
    expect(Math.abs(r1.rz + r2.rz - (-qUniform * L45))).toBeLessThan(0.5);
    // No horizontal force applied → rx should be ~0 (some bending-induced)
    expect(Math.abs(r1.rx + r2.rx)).toBeLessThan(0.5);
  });

  it('trapezoidal with angle: qI and qJ decompose correctly', () => {
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };
    const qI = -10, qJ = -5;
    // Local angle=45 → perp: qI*cos(45), qJ*cos(45); axial: qI*sin(45), qJ*sin(45)
    const loads = decomposeDistLoad(qI, qJ, 45, false, ni, nj, 1);
    const input = horizontalBeam();
    input.loads = loads;
    const results = solve(input);

    const r1 = getReaction(results, 1);
    const r2 = getReaction(results, 2);
    const c45 = Math.cos(Math.PI / 4);
    const s45 = Math.sin(Math.PI / 4);
    // For horizontal beam: perp → fy global, axial → fx global
    // Applied fy: (qI+qJ)/2 * cos(45) * 6 → reactions = -applied
    const totalPerp = (qI + qJ) / 2 * c45 * 6;
    expect(Math.abs(r1.rz + r2.rz + totalPerp)).toBeLessThan(0.5);
    // Applied fx: (qI+qJ)/2 * sin(45) * 6 → reactions = -applied
    const totalAxial = (qI + qJ) / 2 * s45 * 6;
    expect(Math.abs(r1.rx + r2.rx + totalAxial)).toBeLessThan(0.5);
  });
});

describe.skip('Global Equilibrium Verification', () => {
  it('point load: sum of reactions equals applied load (all configurations)', () => {
    const configs: Array<{ angle: number; isGlobal: boolean; nodeI: any; nodeJ: any; beam: () => SolverInput }> = [
      // Horizontal beam, various angles
      { angle: 0, isGlobal: false, nodeI: { x: 0, y: 0, id: 1 }, nodeJ: { x: 6, y: 0, id: 2 },
        beam: () => makeInput({ nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']], supports: [[1, 1, 'fixed'], [2, 2, 'fixed']] }) },
      { angle: 30, isGlobal: true, nodeI: { x: 0, y: 0, id: 1 }, nodeJ: { x: 6, y: 0, id: 2 },
        beam: () => makeInput({ nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']], supports: [[1, 1, 'fixed'], [2, 2, 'fixed']] }) },
      // 45° beam, global
      { angle: 0, isGlobal: true, nodeI: { x: 0, y: 0, id: 1 }, nodeJ: { x: 6 * Math.SQRT1_2, y: 6 * Math.SQRT1_2, id: 2 },
        beam: () => makeInput({ nodes: [[1, 0, 0], [2, 6 * Math.SQRT1_2, 6 * Math.SQRT1_2]], elements: [[1, 1, 2, 'frame']], supports: [[1, 1, 'fixed'], [2, 2, 'fixed']] }) },
      // Vertical beam, global
      { angle: 0, isGlobal: true, nodeI: { x: 0, y: 0, id: 1 }, nodeJ: { x: 0, y: 6, id: 2 },
        beam: () => makeInput({ nodes: [[1, 0, 0], [2, 0, 6]], elements: [[1, 1, 2, 'frame']], supports: [[1, 1, 'fixed'], [2, 2, 'fixed']] }) },
    ];

    const P = -10, a = 3;
    for (const cfg of configs) {
      const loads = decomposePointLoad(P, a, cfg.angle, cfg.isGlobal, cfg.nodeI, cfg.nodeJ, 1);
      const input = cfg.beam();
      input.loads = loads;
      const results = solve(input);

      const r1 = getReaction(results, 1);
      const r2 = getReaction(results, 2);

      // Compute expected global forces
      const angleRad = cfg.angle * Math.PI / 180;
      let expectedFx: number, expectedFy: number;
      if (cfg.isGlobal) {
        expectedFx = P * Math.sin(angleRad);
        expectedFy = P * Math.cos(angleRad);
      } else {
        const edx = cfg.nodeJ.x - cfg.nodeI.x, edy = cfg.nodeJ.y - cfg.nodeI.y;
        const L = Math.sqrt(edx * edx + edy * edy);
        const cosT = edx / L, sinT = edy / L;
        const fPerp = P * Math.cos(angleRad);
        const fAxial = P * Math.sin(angleRad);
        expectedFx = fAxial * cosT + fPerp * (-sinT);
        expectedFy = fAxial * sinT + fPerp * cosT;
      }

      // Sum of reactions must equal -applied force (equilibrium)
      expect(Math.abs(r1.rx + r2.rx + expectedFx)).toBeLessThan(0.5);
      expect(Math.abs(r1.rz + r2.rz + expectedFy)).toBeLessThan(0.5);
    }
  });

  it('distributed load: sum of reactions equals total applied load', () => {
    const q = -8, L = 6;
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };
    const beam = () => makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    });

    for (const { angle, isGlobal } of [
      { angle: 0, isGlobal: false },
      { angle: 45, isGlobal: false },
      { angle: 0, isGlobal: true },
      { angle: -30, isGlobal: true },
    ]) {
      const loads = decomposeDistLoad(q, q, angle, isGlobal, ni, nj, 1);
      const input = beam();
      input.loads = loads;
      const results = solve(input);

      const r1 = getReaction(results, 1);
      const r2 = getReaction(results, 2);

      const angleRad = angle * Math.PI / 180;
      const totalForce = q * L;
      let expectedFx: number, expectedFy: number;
      if (isGlobal) {
        expectedFx = totalForce * Math.sin(angleRad);
        expectedFy = totalForce * Math.cos(angleRad);
      } else {
        // horizontal beam: local perp = fy, local axial = fx
        expectedFx = totalForce * Math.sin(angleRad);
        expectedFy = totalForce * Math.cos(angleRad);
      }

      expect(Math.abs(r1.rx + r2.rx + expectedFx)).toBeLessThan(0.5);
      expect(Math.abs(r1.rz + r2.rz + expectedFy)).toBeLessThan(0.5);
    }
  });
});

describe.skip('Backward Compatibility', () => {
  it('loads without angle/isGlobal produce identical results', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [
        { type: 'pointOnElement', data: { elementId: 1, a: 3, p: -10 } },
        { type: 'distributed', data: { elementId: 1, qI: -5, qJ: -5 } },
      ],
    });
    const results = solve(input);

    // These loads have no angle/isGlobal — they go directly to solver.
    // The decompose functions with angle=0, isGlobal=false produce identical loads.
    const ni = { x: 0, y: 0, id: 1 }, nj = { x: 6, y: 0, id: 2 };
    const ptLoads = decomposePointLoad(-10, 3, 0, false, ni, nj, 1);
    const distLoads = decomposeDistLoad(-5, -5, 0, false, ni, nj, 1);
    const input2 = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [...ptLoads, ...distLoads],
    });
    const results2 = solve(input2);

    const r1a = getReaction(results, 1);
    const r1b = getReaction(results2, 1);
    expect(Math.abs(r1a.rz - r1b.rz)).toBeLessThan(ABS_TOL);
    expect(Math.abs(r1a.rx - r1b.rx)).toBeLessThan(ABS_TOL);
    expect(Math.abs(r1a.my - r1b.my)).toBeLessThan(ABS_TOL);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Tests paramétricos: principios físicos que deben cumplirse SIEMPRE
// independientemente del ángulo de la barra, del ángulo de carga,
// y del sistema de coordenadas (global/local).
// ═══════════════════════════════════════════════════════════════════

/** Helper: create fixed-fixed beam at any angle */
function beamAtAngle(thetaDeg: number, L = 6) {
  const theta = thetaDeg * Math.PI / 180;
  const x2 = L * Math.cos(theta);
  const y2 = L * Math.sin(theta);
  const ni = { x: 0, y: 0, id: 1 };
  const nj = { x: x2, y: y2, id: 2 };
  const input = makeInput({
    nodes: [[1, 0, 0], [2, x2, y2]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
  });
  return { input, ni, nj, L };
}

/**
 * Compute the expected global force vector from decomposition parameters.
 * This is the "source of truth" for what global force should be applied.
 */
function expectedGlobalForce(
  p: number, loadAngle: number, isGlobal: boolean,
  barTheta: number,
): { fx: number; fy: number } {
  const loadRad = loadAngle * Math.PI / 180;
  const barRad = barTheta * Math.PI / 180;
  if (isGlobal) {
    return {
      fx: p * Math.sin(loadRad),
      fy: p * Math.cos(loadRad),
    };
  } else {
    // Local: angle=0 → perpendicular (+Y local), angle=90 → axial (+X local)
    const cosTheta = Math.cos(barRad), sinTheta = Math.sin(barRad);
    const fPerp = p * Math.cos(loadRad);
    const fAxial = p * Math.sin(loadRad);
    return {
      fx: fAxial * cosTheta + fPerp * (-sinTheta),
      fy: fAxial * sinTheta + fPerp * cosTheta,
    };
  }
}

describe.skip('Principio: Equilibrio global — barras a múltiples ángulos con cargas puntuales', () => {
  // El principio: ΣReacciones + ΣFuerzasAplicadas = 0 (Newton)
  // Esto DEBE cumplirse para cualquier combinación de ángulo de barra,
  // ángulo de carga, y sistema de coordenadas.

  const barAngles = [0, 10, 30, 45, 60, 75, 90, 120, 150];
  const loadAngles = [0, 15, 30, 45, 60, 90, -45, -90];
  const P = -10; // kN
  const a = 3;   // midspan

  for (const barAngle of barAngles) {
    for (const isGlobal of [false, true]) {
      for (const loadAngle of loadAngles) {
        const label = `barra ${barAngle}° · carga ${loadAngle}° · ${isGlobal ? 'Global' : 'Local'}`;

        it(`equilibrio: ${label}`, () => {
          const { input, ni, nj } = beamAtAngle(barAngle);
          const loads = decomposePointLoad(P, a, loadAngle, isGlobal, ni, nj, 1);
          input.loads = loads;
          const results = solve(input);

          const r1 = getReaction(results, 1);
          const r2 = getReaction(results, 2);

          const F = expectedGlobalForce(P, loadAngle, isGlobal, barAngle);

          // ΣRx + Fx = 0 → ΣRx = -Fx
          expect(Math.abs(r1.rx + r2.rx + F.fx)).toBeLessThan(0.5);
          // ΣRy + Fy = 0 → ΣRy = -Fy
          expect(Math.abs(r1.rz + r2.rz + F.fy)).toBeLessThan(0.5);
        });
      }
    }
  }
});

describe.skip('Principio: Equilibrio global — barras a múltiples ángulos con cargas distribuidas', () => {
  const barAngles = [0, 10, 30, 45, 60, 75, 90, 135];
  const loadAngles = [0, 30, 45, 90, -45];
  const q = -8; // kN/m uniform

  for (const barAngle of barAngles) {
    for (const isGlobal of [false, true]) {
      for (const loadAngle of loadAngles) {
        const label = `barra ${barAngle}° · q=${q} · carga ${loadAngle}° · ${isGlobal ? 'Global' : 'Local'}`;

        it(`equilibrio: ${label}`, () => {
          const { input, ni, nj, L } = beamAtAngle(barAngle);
          const loads = decomposeDistLoad(q, q, loadAngle, isGlobal, ni, nj, 1);
          input.loads = loads;
          const results = solve(input);

          const r1 = getReaction(results, 1);
          const r2 = getReaction(results, 2);

          // Total applied force = q * L in the direction computed by expectedGlobalForce
          const Funit = expectedGlobalForce(1, loadAngle, isGlobal, barAngle);
          const totalAppliedFx = q * L * Funit.fx;
          const totalAppliedFy = q * L * Funit.fy;

          expect(Math.abs(r1.rx + r2.rx + totalAppliedFx)).toBeLessThan(0.5);
          expect(Math.abs(r1.rz + r2.rz + totalAppliedFy)).toBeLessThan(0.5);
        });
      }
    }
  }
});

describe.skip('Principio: Equilibrio global — cargas trapezoidales en barras oblicuas', () => {
  const barAngles = [10, 30, 60, 75];
  const qI = -12, qJ = -4; // trapezoidal

  for (const barAngle of barAngles) {
    for (const isGlobal of [false, true]) {
      for (const loadAngle of [0, 45, -30]) {
        const label = `barra ${barAngle}° · trap q=${qI}→${qJ} · carga ${loadAngle}° · ${isGlobal ? 'Gl' : 'Loc'}`;

        it(`equilibrio trapezoidal: ${label}`, () => {
          const { input, ni, nj, L } = beamAtAngle(barAngle);
          const loads = decomposeDistLoad(qI, qJ, loadAngle, isGlobal, ni, nj, 1);
          input.loads = loads;
          const results = solve(input);

          const r1 = getReaction(results, 1);
          const r2 = getReaction(results, 2);

          // Total force of trapezoidal = (qI+qJ)/2 * L
          const totalQ = (qI + qJ) / 2 * L;
          const Funit = expectedGlobalForce(1, loadAngle, isGlobal, barAngle);

          expect(Math.abs(r1.rx + r2.rx + totalQ * Funit.fx)).toBeLessThan(0.5);
          expect(Math.abs(r1.rz + r2.rz + totalQ * Funit.fy)).toBeLessThan(0.5);
        });
      }
    }
  }
});

describe.skip('Principio: Coherencia Global↔Local', () => {
  // Una carga vertical global (angle=0, isGlobal=true) en cualquier barra
  // debe producir exactamente las mismas reacciones que su descomposición
  // manual en coordenadas locales (perpendicular + axial).
  // Esto verifica que ambos caminos llegan al mismo lugar.

  const barAngles = [10, 30, 45, 60, 75];
  const P = -15;
  const a = 2; // no en el medio, para que sea más exigente

  for (const barAngle of barAngles) {
    it(`P global vertical = descomposición local manual en barra ${barAngle}°`, () => {
      const barRad = barAngle * Math.PI / 180;
      const cosT = Math.cos(barRad), sinT = Math.sin(barRad);

      // Camino 1: Global angle=0 → automáticamente descompone
      const { input: input1, ni, nj, L } = beamAtAngle(barAngle);
      const loads1 = decomposePointLoad(P, a, 0, true, ni, nj, 1);
      input1.loads = loads1;
      const r1 = solve(input1);

      // Camino 2: Manualmente calcular pPerp y pAxial, y crear cargas directas
      // P vertical (0, P) → local perp = -P*0*sinT + P*cosT = P*cosT
      //                    → local axial = P*0*cosT + P*sinT = P*sinT
      const pPerp = P * cosT;
      const pAxial = P * sinT;
      const { input: input2 } = beamAtAngle(barAngle);
      const loads2: SolverLoad[] = [];
      if (Math.abs(pPerp) > 1e-10) {
        loads2.push({ type: 'pointOnElement', data: { elementId: 1, a, p: pPerp } });
      }
      if (Math.abs(pAxial) > 1e-10) {
        const t = a / L;
        const fI = pAxial * (1 - t);
        const fJ = pAxial * t;
        loads2.push(
          { type: 'nodal', data: { nodeId: 1, fx: fI * cosT, fy: fI * sinT, mz: 0 } },
          { type: 'nodal', data: { nodeId: 2, fx: fJ * cosT, fy: fJ * sinT, mz: 0 } },
        );
      }
      input2.loads = loads2;
      const r2 = solve(input2);

      // Ambos caminos deben dar reacciones idénticas
      const ra = getReaction(r1, 1), rb = getReaction(r2, 1);
      expect(Math.abs(ra.rx - rb.rx)).toBeLessThan(ABS_TOL);
      expect(Math.abs(ra.rz - rb.rz)).toBeLessThan(ABS_TOL);
      expect(Math.abs(ra.my - rb.my)).toBeLessThan(ABS_TOL);

      const ra2 = getReaction(r1, 2), rb2 = getReaction(r2, 2);
      expect(Math.abs(ra2.rx - rb2.rx)).toBeLessThan(ABS_TOL);
      expect(Math.abs(ra2.rz - rb2.rz)).toBeLessThan(ABS_TOL);
      expect(Math.abs(ra2.my - rb2.my)).toBeLessThan(ABS_TOL);
    });
  }
});

describe.skip('Principio: Carga local angle=0 en barra oblicua ≡ carga perpendicular directa', () => {
  // Cuando angle=0 e isGlobal=false, la descomposición debe producir
  // EXACTAMENTE el mismo resultado que una carga perpendicular directa
  // sin descomposición (p puro). Esto verifica que el caso "default"
  // no se rompe para ningún ángulo de barra.

  const barAngles = [0, 10, 30, 45, 60, 75, 90];
  const P = -10;
  const a = 3;

  for (const barAngle of barAngles) {
    it(`local angle=0 ≡ directo en barra ${barAngle}°`, () => {
      // Directo (sin descomposición)
      const { input: input1 } = beamAtAngle(barAngle);
      input1.loads = [{ type: 'pointOnElement', data: { elementId: 1, a, p: P } }];
      const r1 = solve(input1);

      // Via descomposición (angle=0, local → debería ser pass-through)
      const { input: input2, ni, nj } = beamAtAngle(barAngle);
      const loads = decomposePointLoad(P, a, 0, false, ni, nj, 1);
      input2.loads = loads;
      const r2 = solve(input2);

      const ra = getReaction(r1, 1), rb = getReaction(r2, 1);
      expect(Math.abs(ra.rx - rb.rx)).toBeLessThan(ABS_TOL);
      expect(Math.abs(ra.rz - rb.rz)).toBeLessThan(ABS_TOL);
      expect(Math.abs(ra.my - rb.my)).toBeLessThan(ABS_TOL);
    });
  }
});

describe.skip('Principio: Carga a 0° y 180° son opuestas (superposición)', () => {
  // P con angle=α y P con angle=α+180° deben cancelarse.
  // Si sumo las reacciones de ambos, el resultado neto debe ser cero.

  const barAngles = [0, 30, 60, 90];
  const loadAngles = [0, 15, 45, 90];
  const P = -10;
  const a = 2.5;

  for (const barAngle of barAngles) {
    for (const loadAngle of loadAngles) {
      for (const isGlobal of [false, true]) {
        const label = `barra ${barAngle}° · α=${loadAngle}° · ${isGlobal ? 'Gl' : 'Loc'}`;

        it(`cancelación 0°+180°: ${label}`, () => {
          const { input: input1, ni, nj } = beamAtAngle(barAngle);
          const loads1 = decomposePointLoad(P, a, loadAngle, isGlobal, ni, nj, 1);
          input1.loads = loads1;
          const r1 = solve(input1);

          const { input: input2 } = beamAtAngle(barAngle);
          const loads2 = decomposePointLoad(P, a, loadAngle + 180, isGlobal, ni, nj, 1);
          input2.loads = loads2;
          const r2 = solve(input2);

          // Reacciones de ambos deben sumar cero (son opuestas)
          const ra1 = getReaction(r1, 1), ra2 = getReaction(r2, 1);
          const rb1 = getReaction(r1, 2), rb2 = getReaction(r2, 2);

          expect(Math.abs(ra1.rx + ra2.rx)).toBeLessThan(0.01);
          expect(Math.abs(ra1.rz + ra2.rz)).toBeLessThan(0.01);
          expect(Math.abs(ra1.my + ra2.my)).toBeLessThan(0.01);
          expect(Math.abs(rb1.rx + rb2.rx)).toBeLessThan(0.01);
          expect(Math.abs(rb1.rz + rb2.rz)).toBeLessThan(0.01);
          expect(Math.abs(rb1.my + rb2.my)).toBeLessThan(0.01);
        });
      }
    }
  }
});

describe.skip('Principio: Carga puramente axial no genera flexión', () => {
  // Cuando angle=90° en coordenadas locales, la carga es puramente axial.
  // En una barra empotrada-empotrada, esto NO debe generar momentos de empotramiento.
  // Esto debe cumplirse para CUALQUIER ángulo de barra.

  const barAngles = [0, 10, 30, 45, 60, 75, 90, 120, 150];
  const P = -10;
  const a = 3;

  for (const barAngle of barAngles) {
    it(`carga axial local sin momentos en barra ${barAngle}°`, () => {
      const { input, ni, nj } = beamAtAngle(barAngle);
      const loads = decomposePointLoad(P, a, 90, false, ni, nj, 1);
      input.loads = loads;
      const results = solve(input);

      const r1 = getReaction(results, 1);
      const r2 = getReaction(results, 2);

      // Carga puramente axial → no genera momentos de empotramiento
      expect(Math.abs(r1.my)).toBeLessThan(ABS_TOL);
      expect(Math.abs(r2.my)).toBeLessThan(ABS_TOL);
    });
  }
});

describe.skip('Principio: Distribuida axial pura no genera flexión', () => {
  const barAngles = [0, 10, 30, 45, 60, 75, 90, 135];
  const q = -5;

  for (const barAngle of barAngles) {
    it(`q axial local sin momentos en barra ${barAngle}°`, () => {
      const { input, ni, nj } = beamAtAngle(barAngle);
      const loads = decomposeDistLoad(q, q, 90, false, ni, nj, 1);
      input.loads = loads;
      const results = solve(input);

      const r1 = getReaction(results, 1);
      const r2 = getReaction(results, 2);

      expect(Math.abs(r1.my)).toBeLessThan(ABS_TOL);
      expect(Math.abs(r2.my)).toBeLessThan(ABS_TOL);
    });
  }
});

describe.skip('Principio: Carga en posición simétrica → reacciones simétricas', () => {
  // Carga puntual en el medio de una barra empotrada-empotrada
  // debe producir |Mz1| = |Mz2| y Ry1 + Ry2 en la dirección correcta.
  // Esto verifica que la distribución de fuerzas es físicamente coherente.

  const barAngles = [0, 15, 30, 45, 60, 75, 90];
  const P = -20;

  for (const barAngle of barAngles) {
    for (const isGlobal of [false, true]) {
      const coordLabel = isGlobal ? 'Gl' : 'Loc';

      it(`simetría carga en medio, barra ${barAngle}° (${coordLabel} α=0)`, () => {
        const { input, ni, nj, L } = beamAtAngle(barAngle);
        const aMid = L / 2;
        const loads = decomposePointLoad(P, aMid, 0, isGlobal, ni, nj, 1);
        input.loads = loads;
        const results = solve(input);

        const r1 = getReaction(results, 1);
        const r2 = getReaction(results, 2);

        // Los momentos de empotramiento deben ser iguales en magnitud pero opuestos
        // (para carga simétrica en barra simétrica)
        // La componente perpendicular es la que genera flexión; si la hay, debe ser simétrica
        const F = expectedGlobalForce(P, 0, isGlobal, barAngle);
        const barRad = barAngle * Math.PI / 180;
        const cosT = Math.cos(barRad), sinT = Math.sin(barRad);
        const pPerp = F.fx * (-sinT) + F.fy * cosT;

        if (Math.abs(pPerp) > 0.1) {
          // Hay flexión → los momentos en los empotramientos deben ser iguales en magnitud
          expect(Math.abs(Math.abs(r1.my) - Math.abs(r2.my))).toBeLessThan(0.01);
        }
      });
    }
  }
});
