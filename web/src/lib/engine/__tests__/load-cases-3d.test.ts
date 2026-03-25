/**
 * Tests for 3D load case combinations using linear superposition.
 *
 * Verifies that:
 * 1. Solving 3D structures per load case independently works
 * 2. Manual superposition produces correct factored results
 * 3. Diagram values match analytical solutions for combined loads
 */

import { describe, it, expect } from 'vitest';
import { solve3D } from '../wasm-solver';
import { computeDiagram3D } from '../diagrams-3d';
import type {
  SolverInput3D, SolverNode3D, SolverSection3D, SolverElement3D,
  SolverSupport3D, AnalysisResults3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';

// ─── Helpers ───────────────────────────────────────────────────

const steelMat: SolverMaterial = { id: 1, e: 200_000, nu: 0.3 };
const stdSection: SolverSection3D = { id: 1, a: 0.01, iz: 1e-4, iy: 5e-5, j: 1e-5 };

function pinnedSupport(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: false };
}

function rollerSupport(nodeId: number): SolverSupport3D {
  // Free axial (rx=false), restrain ry/rz, restrain torsion
  return { nodeId, rx: false, ry: true, rz: true, rrx: true, rry: false, rrz: false };
}

function fixedSupport(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
}

function buildInput(
  nodes: SolverNode3D[],
  elements: SolverElement3D[],
  supports: SolverSupport3D[],
  loads: SolverInput3D['loads'] = [],
): SolverInput3D {
  return {
    nodes: new Map(nodes.map(n => [n.id, n])),
    materials: new Map([[1, steelMat]]),
    sections: new Map([[1, stdSection]]),
    elements: new Map(elements.map(e => [e.id, e])),
    supports: new Map(supports.map((s, i) => [i, s])),
    loads,
  };
}

function frame(id: number, nodeI: number, nodeJ: number): SolverElement3D {
  return { id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false };
}

function assertSuccess(result: AnalysisResults3D | string): asserts result is AnalysisResults3D {
  if (typeof result === 'string') throw new Error(`Solver error: ${result}`);
}

function getReaction(results: AnalysisResults3D, nodeId: number) {
  return results.reactions.find(r => r.nodeId === nodeId);
}

function getForces(results: AnalysisResults3D, elemId: number) {
  return results.elementForces.find(f => f.elementId === elemId);
}

function combineReaction(
  nodeId: number,
  component: 'fx' | 'fy' | 'fz' | 'mx' | 'my' | 'mz',
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults3D>,
): number {
  let sum = 0;
  for (const { caseId, factor } of factors) {
    const r = perCase.get(caseId);
    if (!r) continue;
    const rxn = getReaction(r, nodeId);
    if (rxn) sum += factor * rxn[component];
  }
  return sum;
}

const L = 6; // beam span in meters

// ─── Simply supported beam: D + L ────────────────────────────────

describe('3D Superposition: simply supported beam D + L', () => {
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: L, y: 0, z: 0 },
  ];
  const elements = [frame(1, 1, 2)];
  const supports = [pinnedSupport(1), rollerSupport(2)];

  let resultD: AnalysisResults3D;
  let resultL: AnalysisResults3D;

  it('solves D case: qY = -10 kN/m in local Y', () => {
    // SAP2000 convention: beam along +X → ey=(0,1,0), so qY=-10 projects to -globalY
    const input = buildInput(nodes, elements, supports, [
      { type: 'distributed', data: { elementId: 1, qYI: -10, qYJ: -10, qZI: 0, qZJ: 0 } },
    ]);
    const res = solve3D(input);
    assertSuccess(res);
    resultD = res;

    // Total load = 10*6 = 60 kN along -globalY → sum of fy reactions = +60
    const totalFy = res.reactions.reduce((s, r) => s + r.fy, 0);
    expect(totalFy).toBeCloseTo(60, 1);
  });

  it('solves L case: qY = -5 kN/m in local Y', () => {
    const input = buildInput(nodes, elements, supports, [
      { type: 'distributed', data: { elementId: 1, qYI: -5, qYJ: -5, qZI: 0, qZJ: 0 } },
    ]);
    const res = solve3D(input);
    assertSuccess(res);
    resultL = res;

    const totalFy = res.reactions.reduce((s, r) => s + r.fy, 0);
    expect(totalFy).toBeCloseTo(30, 1);
  });

  it('1.2D + 1.6L: superposition of reactions matches direct solve', () => {
    // Direct solve with combined load: q = 1.2*10 + 1.6*5 = 20 kN/m in local Y
    const inputCombined = buildInput(nodes, elements, supports, [
      { type: 'distributed', data: { elementId: 1, qYI: -20, qYJ: -20, qZI: 0, qZJ: 0 } },
    ]);
    const resCombined = solve3D(inputCombined);
    assertSuccess(resCombined);

    const perCase = new Map<number, AnalysisResults3D>();
    perCase.set(1, resultD);
    perCase.set(2, resultL);

    const factors = [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }];

    // Superposition: sum of reactions
    const totalFySup = combineReaction(1, 'fy', factors, perCase)
                     + combineReaction(2, 'fy', factors, perCase);
    const totalFyDirect = resCombined.reactions.reduce((s, r) => s + r.fy, 0);

    // 1.2*60 + 1.6*30 = 72 + 48 = 120
    expect(totalFySup).toBeCloseTo(120, 1);
    expect(totalFySup).toBeCloseTo(totalFyDirect, 1);
  });

  it('element forces combine linearly (Mz, Vy)', () => {
    // SAP2000: qY loading acts in the local Y plane → Mz/Vy forces
    const fD = getForces(resultD, 1)!;
    const fL = getForces(resultL, 1)!;

    // 1.2D + 1.6L
    const mzCombined = 1.2 * fD.mzStart + 1.6 * fL.mzStart;
    const vyCombined = 1.2 * fD.vyStart + 1.6 * fL.vyStart;

    // Direct solve
    const inputCombined = buildInput(nodes, elements, supports, [
      { type: 'distributed', data: { elementId: 1, qYI: -20, qYJ: -20, qZI: 0, qZJ: 0 } },
    ]);
    const resCombined = solve3D(inputCombined);
    assertSuccess(resCombined);
    const fComb = getForces(resCombined, 1)!;

    expect(mzCombined).toBeCloseTo(fComb.mzStart, 2);
    expect(vyCombined).toBeCloseTo(fComb.vyStart, 2);
  });

  it('displacement superposition matches direct solve', () => {
    const dD = resultD.displacements.find(d => d.nodeId === 2)!;
    const dL = resultL.displacements.find(d => d.nodeId === 2)!;

    // 1.2D + 1.6L displacements
    const combinedUy = 1.2 * dD.uy + 1.6 * dL.uy;

    const inputCombined = buildInput(nodes, elements, supports, [
      { type: 'distributed', data: { elementId: 1, qYI: -20, qYJ: -20, qZI: 0, qZJ: 0 } },
    ]);
    const resCombined = solve3D(inputCombined);
    assertSuccess(resCombined);
    const dComb = resCombined.displacements.find(d => d.nodeId === 2)!;

    expect(combinedUy).toBeCloseTo(dComb.uy, 6);
  });
});

// ─── Space frame with wind (nodal lateral load) ──────────────────

describe('3D Superposition: portal frame D + W', () => {
  //   2 ---- 3
  //   |      |
  //   1      4
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: 0, y: 4, z: 0 },
    { id: 3, x: 6, y: 4, z: 0 },
    { id: 4, x: 6, y: 0, z: 0 },
  ];
  const elements = [frame(1, 1, 2), frame(2, 2, 3), frame(3, 3, 4)];
  const supports = [fixedSupport(1), fixedSupport(4)];

  let resultD: AnalysisResults3D;
  let resultW: AnalysisResults3D;

  it('solves D: distributed on beam element 2', () => {
    // Portal: side members are aligned with global Y (1→2, 3→4), beam is along +X at y=4
    // SAP2000: beam along +X → ey=(0,1,0), qY=-10 projects to -globalY
    const input = buildInput(nodes, elements, supports, [
      { type: 'distributed', data: { elementId: 2, qYI: -10, qYJ: -10, qZI: 0, qZJ: 0 } },
    ]);
    const res = solve3D(input);
    assertSuccess(res);
    resultD = res;

    const totalFy = res.reactions.reduce((s, r) => s + r.fy, 0);
    expect(totalFy).toBeCloseTo(60, 0);
  });

  it('solves W: nodal horizontal load at node 2', () => {
    const input = buildInput(nodes, elements, supports, [
      { type: 'nodal', data: { nodeId: 2, fx: 10, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } },
    ]);
    const res = solve3D(input);
    assertSuccess(res);
    resultW = res;

    const totalFx = res.reactions.reduce((s, r) => s + r.fx, 0);
    expect(totalFx).toBeCloseTo(-10, 1);
  });

  it('1.2D + 1.6W: combined equilibrium', () => {
    const perCase = new Map<number, AnalysisResults3D>();
    perCase.set(1, resultD);
    perCase.set(2, resultW);

    const factors = [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }];

    // Total global-Y reaction: 1.2*60 = 72
    const totalFy = combineReaction(1, 'fy', factors, perCase) +
                    combineReaction(4, 'fy', factors, perCase);
    expect(totalFy).toBeCloseTo(72, 0);

    // Total horizontal: 1.6*(-10) = -16
    const totalFx = combineReaction(1, 'fx', factors, perCase) +
                    combineReaction(4, 'fx', factors, perCase);
    expect(totalFx).toBeCloseTo(-16, 0);
  });
});

// ─── Bidirectional loading (qY + qZ on same beam) ────────────────

describe('3D Superposition: bidirectional distributed loads', () => {
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: L, y: 0, z: 0 },
  ];
  const elements = [frame(1, 1, 2)];
  const supports = [fixedSupport(1), pinnedSupport(2)];

  let resultY: AnalysisResults3D;
  let resultZ: AnalysisResults3D;

  it('solves case 1: qY=-10 projected through local Y', () => {
    // SAP2000: beam +X → ey=(0,1,0), qY=-10 projects to -globalY
    const input = buildInput(nodes, elements, supports, [
      { type: 'distributed', data: { elementId: 1, qYI: -10, qYJ: -10, qZI: 0, qZJ: 0 } },
    ]);
    const res = solve3D(input);
    assertSuccess(res);
    resultY = res;

    // Reactions in global Y balance 60 kN applied along -globalY
    const totalFy = res.reactions.reduce((s, r) => s + r.fy, 0);
    expect(totalFy).toBeCloseTo(60, 0);
  });

  it('solves case 2: lateral qZ=-8 (in −globalZ)', () => {
    // SAP2000: beam +X → ez=(0,0,1), qZ=-8 → force in −globalZ
    const input = buildInput(nodes, elements, supports, [
      { type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -8, qZJ: -8 } },
    ]);
    const res = solve3D(input);
    assertSuccess(res);
    resultZ = res;

    // Reactions in global Z balance 48 kN in −Z
    const totalFz = res.reactions.reduce((s, r) => s + r.fz, 0);
    expect(totalFz).toBeCloseTo(48, 0);
  });

  it('1.4*case1 + 1.0*case2: axes combine independently', () => {
    const perCase = new Map<number, AnalysisResults3D>();
    perCase.set(1, resultY);
    perCase.set(2, resultZ);

    const factors = [{ caseId: 1, factor: 1.4 }, { caseId: 2, factor: 1.0 }];

    // Global Y direction: 1.4*60 = 84
    const totalFy = combineReaction(1, 'fy', factors, perCase) +
                    combineReaction(2, 'fy', factors, perCase);
    expect(totalFy).toBeCloseTo(84, 0);

    // Global Z direction (lateral): 1.0*48 = 48
    const totalFz = combineReaction(1, 'fz', factors, perCase) +
                    combineReaction(2, 'fz', factors, perCase);
    expect(totalFz).toBeCloseTo(48, 0);
  });

  it('displacement superposition in both planes', () => {
    const dY = resultY.displacements.find(d => d.nodeId === 2)!;
    const dZ = resultZ.displacements.find(d => d.nodeId === 2)!;

    // Direct solve: 1.2*case1 + 1.6*case2
    // case1: qYI=-10 → factor 1.2 → qYI=-12
    // case2: qZI=-8 → factor 1.6 → qZI=-12.8
    const inputDirect = buildInput(nodes, elements, supports, [
      { type: 'distributed', data: { elementId: 1, qYI: -12, qYJ: -12, qZI: -12.8, qZJ: -12.8 } },
    ]);
    const resDirect = solve3D(inputDirect);
    assertSuccess(resDirect);
    const dDirect = resDirect.displacements.find(d => d.nodeId === 2)!;

    expect(1.2 * dY.uy + 1.6 * dZ.uy).toBeCloseTo(dDirect.uy, 6);
    expect(1.2 * dY.uz + 1.6 * dZ.uz).toBeCloseTo(dDirect.uz, 6);
  });
});

// ─── Diagram value verification ──────────────────────────────────

describe('3D Diagrams with combined loads', () => {
  it('midspan Mz matches analytical for simply-supported beam with UDL', () => {
    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ];
    const input = buildInput(nodes, [frame(1, 1, 2)],
      [pinnedSupport(1), rollerSupport(2)],
      [{ type: 'distributed', data: { elementId: 1, qYI: -20, qYJ: -20, qZI: 0, qZJ: 0 } }],
    );
    const res = solve3D(input);
    assertSuccess(res);

    const ef = getForces(res, 1)!;
    const diagram = computeDiagram3D(ef, 'momentZ');

    // Analytical: Mz at midspan = qL²/8 = 20*36/8 = 90 kN·m
    const midPt = diagram.points.find(p => Math.abs(p.t - 0.5) < 0.02);
    expect(midPt).toBeDefined();
    expect(Math.abs(midPt!.value)).toBeCloseTo(90, 0);
  });

  it('midspan My matches analytical for UDL in Z direction', () => {
    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ];
    const input = buildInput(nodes, [frame(1, 1, 2)],
      [pinnedSupport(1), rollerSupport(2)],
      [{ type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -10, qZJ: -10 } }],
    );
    const res = solve3D(input);
    assertSuccess(res);

    const ef = getForces(res, 1)!;
    const diagram = computeDiagram3D(ef, 'momentY');

    // Analytical: My at midspan = qL²/8 = 10*36/8 = 45 kN·m
    const midPt = diagram.points.find(p => Math.abs(p.t - 0.5) < 0.02);
    expect(midPt).toBeDefined();
    expect(Math.abs(midPt!.value)).toBeCloseTo(45, 0);
  });
});
