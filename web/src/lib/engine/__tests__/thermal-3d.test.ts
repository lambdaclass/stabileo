// 3D Thermal Loads Tests — Analytical solutions
// Tests for uniform temperature change and temperature gradients in 3D frame/truss elements.

import { describe, it, expect } from 'vitest';
import { solve3D } from '../wasm-solver';
import { computeLocalAxes3D } from '../local-axes-3d';
import type {
  SolverInput3D,
  SolverNode3D,
  SolverSection3D,
  SolverElement3D,
  SolverSupport3D,
  AnalysisResults3D,
  SolverThermalLoad3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';

// ─── Constants ───────────────────────────────────────────────────

const ALPHA = 1.2e-5; // /°C (steel thermal expansion coefficient)
const E_MPa = 200000;
const E_kNm2 = E_MPa * 1000; // kN/m²
const A = 0.01; // m²
const Iz = 8.33e-6; // m⁴
const Iy = 4.16e-6; // m⁴
const J = 1e-5; // m⁴
const L = 5; // m

// ─── Helpers ─────────────────────────────────────────────────────

const steelMat: SolverMaterial = { id: 1, e: E_MPa, nu: 0.3 };

const stdSection: SolverSection3D = {
  id: 1,
  a: A,
  iz: Iz,
  iy: Iy,
  j: J,
};

function fixedSupport(nodeId: number): SolverSupport3D {
  return {
    nodeId,
    rx: true,
    ry: true,
    rz: true,
    rrx: true,
    rry: true,
    rrz: true,
  };
}

/** Pinned support with torsion restrained (for beam along X) */
function pinnedSupportBeamX(nodeId: number): SolverSupport3D {
  return {
    nodeId,
    rx: true,
    ry: true,
    rz: true,
    rrx: true,
    rry: false,
    rrz: false,
  };
}

/** Roller support: only ux free, rest restrained for translations; rotations free except torsion */
function rollerXBeam(nodeId: number): SolverSupport3D {
  return {
    nodeId,
    rx: false,
    ry: true,
    rz: true,
    rrx: true,
    rry: false,
    rrz: false,
  };
}

function buildInput(
  nodes: SolverNode3D[],
  elements: SolverElement3D[],
  supports: SolverSupport3D[],
  loads: SolverInput3D['loads'] = [],
): SolverInput3D {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    materials: new Map([[1, steelMat]]),
    sections: new Map([[1, stdSection]]),
    elements: new Map(elements.map((e) => [e.id, e])),
    supports: new Map(supports.map((s, i) => [i, s])),
    loads,
  };
}

function frameElem(
  id: number,
  nodeI: number,
  nodeJ: number,
): SolverElement3D {
  return {
    id,
    type: 'frame',
    nodeI,
    nodeJ,
    materialId: 1,
    sectionId: 1,
    hingeStart: false,
    hingeEnd: false,
  };
}

function trussElem(
  id: number,
  nodeI: number,
  nodeJ: number,
): SolverElement3D {
  return {
    id,
    type: 'truss',
    nodeI,
    nodeJ,
    materialId: 1,
    sectionId: 1,
    hingeStart: false,
    hingeEnd: false,
  };
}

function thermalLoad(
  elementId: number,
  dtUniform: number,
  dtGradientY = 0,
  dtGradientZ = 0,
): { type: 'thermal'; data: SolverThermalLoad3D } {
  return {
    type: 'thermal',
    data: { elementId, dtUniform, dtGradientY, dtGradientZ },
  };
}

function assertSuccess(
  result: AnalysisResults3D | string,
): asserts result is AnalysisResults3D {
  if (typeof result === 'string') {
    throw new Error(`Solver devolvió error: ${result}`);
  }
}

function getForces(result: AnalysisResults3D, elemId: number) {
  const f = result.elementForces.find((ef) => ef.elementId === elemId);
  if (!f) throw new Error(`Elemento ${elemId} no encontrado en resultados`);
  return f;
}

function getDisp(result: AnalysisResults3D, nodeId: number) {
  const d = result.displacements.find((dd) => dd.nodeId === nodeId);
  if (!d) throw new Error(`Nodo ${nodeId} no encontrado en desplazamientos`);
  return d;
}

/**
 * Check global force equilibrium: sum of reactions = 0.
 * Thermal loads produce only self-equilibrating internal forces,
 * so reactions should sum to zero (no external forces applied).
 */
function checkEquilibriumThermal(
  result: AnalysisResults3D,
  input: SolverInput3D,
  tol = 1e-4,
) {
  let sumFx = 0,
    sumFy = 0,
    sumFz = 0;

  // Add reactions
  for (const r of result.reactions) {
    sumFx += r.fx;
    sumFy += r.fy;
    sumFz += r.fz;
  }

  // Thermal loads produce no net external force
  // (they are self-equilibrating on each element)

  // Add any other applied loads (nodal, distributed, etc.)
  for (const load of input.loads) {
    if (load.type === 'nodal') {
      sumFx += load.data.fx;
      sumFy += load.data.fy;
      sumFz += load.data.fz;
    } else if (load.type === 'distributed') {
      const dl = load.data;
      const elem = input.elements.get(dl.elementId);
      if (!elem) continue;
      const nodeI = input.nodes.get(elem.nodeI)!;
      const nodeJ = input.nodes.get(elem.nodeJ)!;
      const axes = computeLocalAxes3D(nodeI, nodeJ);
      const aStart = dl.a ?? 0;
      const b = dl.b ?? axes.L;
      const span = b - aStart;
      const totalQY = ((dl.qYI + dl.qYJ) / 2) * span;
      const totalQZ = ((dl.qZI + dl.qZJ) / 2) * span;
      sumFx += totalQY * axes.ey[0] + totalQZ * axes.ez[0];
      sumFy += totalQY * axes.ey[1] + totalQZ * axes.ez[1];
      sumFz += totalQY * axes.ey[2] + totalQZ * axes.ez[2];
    } else if (load.type === 'pointOnElement') {
      const pl = load.data;
      const elem = input.elements.get(pl.elementId);
      if (!elem) continue;
      const nodeI = input.nodes.get(elem.nodeI)!;
      const nodeJ = input.nodes.get(elem.nodeJ)!;
      const axes = computeLocalAxes3D(nodeI, nodeJ);
      sumFx += pl.py * axes.ey[0] + pl.pz * axes.ez[0];
      sumFy += pl.py * axes.ey[1] + pl.pz * axes.ez[1];
      sumFz += pl.py * axes.ey[2] + pl.pz * axes.ez[2];
    }
    // thermal loads: no net external force contribution
  }

  const digits = Math.max(1, Math.round(-Math.log10(tol)));
  expect(sumFx).toBeCloseTo(0, digits);
  expect(sumFy).toBeCloseTo(0, digits);
  expect(sumFz).toBeCloseTo(0, digits);
}

// ─── Tests ───────────────────────────────────────────────────────

describe('3D Thermal Loads — Uniform Temperature', () => {
  const DT = 30; // °C

  it('1. fixed-fixed beam: |N| = E·A·α·ΔT, zero displacements', () => {
    // Both ends fully fixed → bar cannot expand → full axial force
    // Use 3 nodes so the WASM solver has free DOFs at the middle node
    const halfL = L / 2;
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 3, x: halfL, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 3), frameElem(2, 3, 2)],
      [fixedSupport(1), fixedSupport(2)],
      [thermalLoad(1, DT), thermalLoad(2, DT)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);
    const expectedN = E_kNm2 * A * ALPHA * DT; // 720 kN

    // Bar is in compression (thermal expansion restrained)
    expect(Math.abs(f.nStart)).toBeCloseTo(expectedN, 1);
    expect(Math.abs(f.nEnd)).toBeCloseTo(expectedN, 1);

    // Zero displacements at supports (fully restrained)
    const d1 = getDisp(result, 1);
    const d2 = getDisp(result, 2);
    expect(Math.abs(d1.ux)).toBeLessThan(1e-10);
    expect(Math.abs(d2.ux)).toBeLessThan(1e-10);

    checkEquilibriumThermal(result, input);
  });

  it('2. simply supported beam: free expansion, zero internal forces', () => {
    // Roller at J allows axial expansion → no axial force
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 2)],
      [pinnedSupportBeamX(1), rollerXBeam(2)],
      [thermalLoad(1, DT)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);

    // No axial force (free to expand)
    expect(Math.abs(f.nStart)).toBeLessThan(1);
    expect(Math.abs(f.nEnd)).toBeLessThan(1);

    // Displacement at free end: δ = α·ΔT·L
    const d2 = getDisp(result, 2);
    const expectedDelta = ALPHA * DT * L;
    expect(Math.abs(d2.ux)).toBeCloseTo(expectedDelta, 6);

    checkEquilibriumThermal(result, input);
  });

  it('3. zero temperature → zero effect', () => {
    // Use 3 nodes so the WASM solver has free DOFs at the middle node
    const halfL = L / 2;
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 3, x: halfL, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 3), frameElem(2, 3, 2)],
      [fixedSupport(1), fixedSupport(2)],
      [thermalLoad(1, 0, 0, 0), thermalLoad(2, 0, 0, 0)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);
    expect(Math.abs(f.nStart)).toBeLessThan(1e-10);
    expect(Math.abs(f.nEnd)).toBeLessThan(1e-10);
    expect(Math.abs(f.mzStart)).toBeLessThan(1e-10);
    expect(Math.abs(f.myStart)).toBeLessThan(1e-10);
  });

  it('4. negative temperature (cooling) → tension in fixed-fixed beam', () => {
    const DTcool = -20; // cooling
    // Use 3 nodes so the WASM solver has free DOFs at the middle node
    const halfL = L / 2;
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 3, x: halfL, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 3), frameElem(2, 3, 2)],
      [fixedSupport(1), fixedSupport(2)],
      [thermalLoad(1, DTcool), thermalLoad(2, DTcool)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);
    const expectedN = E_kNm2 * A * ALPHA * Math.abs(DTcool);

    // Cooling → bar wants to shrink → tension in fixed-fixed
    // nStart and nEnd should be positive (tension)
    expect(Math.abs(f.nStart)).toBeCloseTo(expectedN, 1);

    checkEquilibriumThermal(result, input);
  });
});

describe('3D Thermal Loads — Temperature Gradient', () => {
  const DTg = 20; // °C gradient

  it('5. fixed-fixed beam with gradient Z → My at both ends', () => {
    // Temperature gradient in Z-direction → bending about Y (uses Iy)
    // Use 3 nodes so the WASM solver has free DOFs at the middle node
    const halfL = L / 2;
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 3, x: halfL, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 3), frameElem(2, 3, 2)],
      [fixedSupport(1), fixedSupport(2)],
      [thermalLoad(1, 0, 0, DTg), thermalLoad(2, 0, 0, DTg)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);

    // My = E·Iy·α·ΔTz/hz where hz = sqrt(12·Iy/A)
    const hz = Math.sqrt(12 * Iy / A);
    const expectedMy = E_kNm2 * Iy * ALPHA * DTg / hz;

    expect(Math.abs(f.myStart)).toBeCloseTo(expectedMy, 2);
    expect(Math.abs(f.myEnd)).toBeCloseTo(expectedMy, 2);

    // No axial force from gradient only
    expect(Math.abs(f.nStart)).toBeLessThan(1e-6);

    checkEquilibriumThermal(result, input);
  });

  it('6. fixed-fixed beam with gradient Y → Mz at both ends', () => {
    // Temperature gradient in Y-direction → bending about Z (uses Iz)
    // Use 3 nodes so the WASM solver has free DOFs at the middle node
    const halfL = L / 2;
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 3, x: halfL, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 3), frameElem(2, 3, 2)],
      [fixedSupport(1), fixedSupport(2)],
      [thermalLoad(1, 0, DTg, 0), thermalLoad(2, 0, DTg, 0)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);

    // Mz = E·Iz·α·ΔTy/hy where hy = sqrt(12·Iz/A)
    const hy = Math.sqrt(12 * Iz / A);
    const expectedMz = E_kNm2 * Iz * ALPHA * DTg / hy;

    expect(Math.abs(f.mzStart)).toBeCloseTo(expectedMz, 2);
    expect(Math.abs(f.mzEnd)).toBeCloseTo(expectedMz, 2);

    // No axial force or My from Y-gradient only
    expect(Math.abs(f.nStart)).toBeLessThan(1e-6);
    expect(Math.abs(f.myStart)).toBeLessThan(1e-6);

    checkEquilibriumThermal(result, input);
  });

  it('7. simply supported beam with gradient Z → zero My, non-zero rotation', () => {
    // Gradient Z on simply supported beam → My moments are zero (free to rotate)
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 2)],
      [pinnedSupportBeamX(1), rollerXBeam(2)],
      [thermalLoad(1, 0, 0, DTg)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);

    // My moments should be (near) zero — beam is free to rotate about Y
    expect(Math.abs(f.myStart)).toBeLessThan(1);
    expect(Math.abs(f.myEnd)).toBeLessThan(1);

    // But there should be rotation at the ends about Y (gradient Z → bending about Y)
    const d1 = getDisp(result, 1);
    expect(Math.abs(d1.ry)).toBeGreaterThan(1e-8);

    checkEquilibriumThermal(result, input);
  });
});

describe('3D Thermal Loads — Combined and Multi-Element', () => {
  it('8. combined uniform + gradient on fixed-fixed beam', () => {
    const DT = 30;
    const DTgZ = 15;
    // Use 3 nodes so the WASM solver has free DOFs at the middle node
    const halfL = L / 2;
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 3, x: halfL, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 3), frameElem(2, 3, 2)],
      [fixedSupport(1), fixedSupport(2)],
      [thermalLoad(1, DT, 0, DTgZ), thermalLoad(2, DT, 0, DTgZ)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);

    // Axial: N = E·A·α·ΔT
    const expectedN = E_kNm2 * A * ALPHA * DT;
    expect(Math.abs(f.nStart)).toBeCloseTo(expectedN, 1);

    // Gradient Z → My (bending about Y, uses Iy)
    const hz = Math.sqrt(12 * Iy / A);
    const expectedMy = E_kNm2 * Iy * ALPHA * DTgZ / hz;
    expect(Math.abs(f.myStart)).toBeCloseTo(expectedMy, 2);

    checkEquilibriumThermal(result, input);
  });

  it('9. thermal on single element of multi-element structure', () => {
    // Two-span continuous beam: thermal on element 2 only
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
        { id: 3, x: 2 * L, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 2), frameElem(2, 2, 3)],
      [fixedSupport(1), fixedSupport(3)],
      [thermalLoad(2, 30)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    // Should have some non-zero forces from thermal on elem 2
    const f2 = getForces(result, 2);
    expect(Math.abs(f2.nStart)).toBeGreaterThan(1);

    // Element 1 also gets forces through compatibility
    const f1 = getForces(result, 1);
    expect(Math.abs(f1.nStart)).toBeGreaterThan(0.1);

    checkEquilibriumThermal(result, input);
  });
});

describe('3D Thermal Loads — Truss', () => {
  it('10. uniform temperature on fixed-fixed truss → axial force', () => {
    const DT = 30;
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [trussElem(1, 1, 2)],
      [
        {
          nodeId: 1,
          rx: true,
          ry: true,
          rz: true,
          rrx: false,
          rry: false,
          rrz: false,
        },
        {
          nodeId: 2,
          rx: true,
          ry: true,
          rz: true,
          rrx: false,
          rry: false,
          rrz: false,
        },
      ],
      [thermalLoad(1, DT)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);
    const expectedN = E_kNm2 * A * ALPHA * DT;

    expect(Math.abs(f.nStart)).toBeCloseTo(expectedN, 1);
    expect(Math.abs(f.nEnd)).toBeCloseTo(expectedN, 1);

    // Zero displacements
    const d1 = getDisp(result, 1);
    const d2 = getDisp(result, 2);
    expect(Math.abs(d1.ux)).toBeLessThan(1e-10);
    expect(Math.abs(d2.ux)).toBeLessThan(1e-10);
  });

  it('11. uniform temperature on free truss → displacement, no force', () => {
    const DT = 30;
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      [trussElem(1, 1, 2)],
      [
        {
          nodeId: 1,
          rx: true,
          ry: true,
          rz: true,
          rrx: false,
          rry: false,
          rrz: false,
        },
        {
          nodeId: 2,
          rx: false,
          ry: true,
          rz: true,
          rrx: false,
          rry: false,
          rrz: false,
        },
      ],
      [thermalLoad(1, DT)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    const f = getForces(result, 1);
    // No axial force (free to expand)
    expect(Math.abs(f.nStart)).toBeLessThan(1);

    // Displacement at free end
    const d2 = getDisp(result, 2);
    const expectedDelta = ALPHA * DT * L;
    expect(Math.abs(d2.ux)).toBeCloseTo(expectedDelta, 6);
  });
});

describe('3D Thermal Loads — Equilibrium Verification', () => {
  it('12. reactions sum to zero for thermal-only loads (multi-span)', () => {
    // Three-span continuous beam with thermal on all elements
    const input = buildInput(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 3, y: 0, z: 0 },
        { id: 3, x: 7, y: 0, z: 0 },
        { id: 4, x: 10, y: 0, z: 0 },
      ],
      [frameElem(1, 1, 2), frameElem(2, 2, 3), frameElem(3, 3, 4)],
      [fixedSupport(1), fixedSupport(4)],
      [thermalLoad(1, 25, 10, 5), thermalLoad(2, -15, 0, 8), thermalLoad(3, 20, 5, 0)],
    );

    const result = solve3D(input);
    assertSuccess(result);

    // Thermal loads are self-equilibrating: sum of all reactions = 0
    checkEquilibriumThermal(result, input);
  });
});
