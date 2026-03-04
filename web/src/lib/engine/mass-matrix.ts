// Consistent mass matrix assembly for modal analysis

import type { SolverInput } from './types';
import {
  type DofNumbering,
  nodeDistance, nodeAngle, elementDofs,
  frameTransformationMatrix,
} from './solver-js';

/**
 * Frame consistent mass matrix in local coords (6×6).
 * DOFs: [u1, v1, θ1, u2, v2, θ2]
 * rhoA = mass per unit length (density × area) [kg/m or similar]
 * L = element length
 *
 * When hinges are present, uses the modified consistent mass matrix
 * derived from the Hermite shape functions for the corresponding
 * boundary conditions (same approach as stiffness static condensation).
 *
 * Reference: Przemieniecki, "Theory of Matrix Structural Analysis" §5.7
 */
export function frameConsistentMass(
  rhoA: number, L: number,
  hingeStart = false, hingeEnd = false,
): Float64Array {
  const n = 6;
  const m = new Float64Array(n * n);

  // Axial terms (unaffected by bending hinges)
  const cAxial = rhoA * L / 6;
  m[0*n+0] = 2*cAxial;  m[0*n+3] = 1*cAxial;
  m[3*n+0] = 1*cAxial;  m[3*n+3] = 2*cAxial;

  if (!hingeStart && !hingeEnd) {
    // Standard consistent beam mass matrix
    const c = rhoA * L / 420;
    const L2 = L * L;
    m[1*n+1] = 156*c;    m[1*n+2] = 22*L*c;   m[1*n+4] = 54*c;     m[1*n+5] = -13*L*c;
    m[2*n+1] = 22*L*c;   m[2*n+2] = 4*L2*c;   m[2*n+4] = 13*L*c;   m[2*n+5] = -3*L2*c;
    m[4*n+1] = 54*c;     m[4*n+2] = 13*L*c;   m[4*n+4] = 156*c;    m[4*n+5] = -22*L*c;
    m[5*n+1] = -13*L*c;  m[5*n+2] = -3*L2*c;  m[5*n+4] = -22*L*c;  m[5*n+5] = 4*L2*c;
  } else if (hingeStart && hingeEnd) {
    // Both hinges: simply supported beam, no rotational inertia coupling
    // Shape functions: N1 = 1-x/L, N2 = x/L (linear, same as truss transverse)
    const c = rhoA * L / 6;
    m[1*n+1] = 2*c;  m[1*n+4] = 1*c;
    m[4*n+1] = 1*c;  m[4*n+4] = 2*c;
    // θ rows/cols remain zero (no rotational inertia for released DOFs)
  } else if (hingeStart) {
    // Hinge at start: shape functions with θ₁ released
    // Cubic hermite with M_i=0: v(x) = (1-3ξ²+2ξ³)·v_i... condensed
    // Use static condensation of the full mass matrix
    // M_condensed = M_aa - M_ab · M_bb⁻¹ · M_ba where b = θ₁ DOF (index 2)
    const c = rhoA * L / 420;
    const L2 = L * L;
    // After condensing out θ₁ (row/col 2):
    // M_bb = 4L²c, M_ab = column 2 of bending block, etc.
    const Mbb_inv = 1 / (4 * L2 * c);
    // Bending DOFs: v1(1), θ1(2), v2(4), θ2(5) - condense out θ1(2)
    const bendDofs = [1, 4, 5]; // remaining after removing θ1
    const fullBend = [
      [156*c, 22*L*c, 54*c, -13*L*c],
      [22*L*c, 4*L2*c, 13*L*c, -3*L2*c],
      [54*c, 13*L*c, 156*c, -22*L*c],
      [-13*L*c, -3*L2*c, -22*L*c, 4*L2*c],
    ];
    // Condense out index 1 (θ1) from fullBend
    const condensedIdx = [0, 2, 3]; // v1, v2, θ2
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const ci = condensedIdx[i], cj = condensedIdx[j];
        const val = fullBend[ci][cj] - fullBend[ci][1] * Mbb_inv * fullBend[1][cj];
        m[bendDofs[i]*n + bendDofs[j]] = val;
      }
    }
  } else {
    // Hinge at end: condense out θ₂ (DOF index 5)
    const c = rhoA * L / 420;
    const L2 = L * L;
    const Mbb_inv = 1 / (4 * L2 * c);
    const bendDofs = [1, 2, 4]; // remaining after removing θ2
    const fullBend = [
      [156*c, 22*L*c, 54*c, -13*L*c],
      [22*L*c, 4*L2*c, 13*L*c, -3*L2*c],
      [54*c, 13*L*c, 156*c, -22*L*c],
      [-13*L*c, -3*L2*c, -22*L*c, 4*L2*c],
    ];
    // Condense out index 3 (θ2) from fullBend
    const condensedIdx = [0, 1, 2]; // v1, θ1, v2
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const ci = condensedIdx[i], cj = condensedIdx[j];
        const val = fullBend[ci][cj] - fullBend[ci][3] * Mbb_inv * fullBend[3][cj];
        m[bendDofs[i]*n + bendDofs[j]] = val;
      }
    }
  }

  return m;
}

/**
 * Truss consistent mass matrix in local coords (4×4).
 * DOFs: [u1, v1, u2, v2]
 */
export function trussConsistentMass(rhoA: number, L: number): Float64Array {
  const n = 4;
  const m = new Float64Array(n * n);
  const c = rhoA * L / 6;

  // Both axial and transverse get the same treatment for truss
  m[0*n+0] = 2*c;  m[0*n+2] = 1*c;
  m[1*n+1] = 2*c;  m[1*n+3] = 1*c;
  m[2*n+0] = 1*c;  m[2*n+2] = 2*c;
  m[3*n+1] = 1*c;  m[3*n+3] = 2*c;

  return m;
}

/** Transform local element matrix to global: M_global = Tᵀ · M_local · T */
function transformToGlobal(mLocal: Float64Array, cos: number, sin: number, ndof: number): Float64Array {
  let T: Float64Array;
  if (ndof === 6) {
    T = frameTransformationMatrix(cos, sin);
  } else {
    T = new Float64Array(16);
    T[0*4+0] = cos;  T[0*4+1] = sin;
    T[1*4+0] = -sin; T[1*4+1] = cos;
    T[2*4+2] = cos;  T[2*4+3] = sin;
    T[3*4+2] = -sin; T[3*4+3] = cos;
  }

  const temp = new Float64Array(ndof * ndof);
  for (let i = 0; i < ndof; i++) {
    for (let j = 0; j < ndof; j++) {
      let sum = 0;
      for (let k = 0; k < ndof; k++) sum += mLocal[i * ndof + k] * T[k * ndof + j];
      temp[i * ndof + j] = sum;
    }
  }

  const mGlobal = new Float64Array(ndof * ndof);
  for (let i = 0; i < ndof; i++) {
    for (let j = 0; j < ndof; j++) {
      let sum = 0;
      for (let k = 0; k < ndof; k++) sum += T[k * ndof + i] * temp[k * ndof + j];
      mGlobal[i * ndof + j] = sum;
    }
  }

  return mGlobal;
}

/**
 * Assemble the global consistent mass matrix M (nFree × nFree).
 * Materials must have `density` property (kg/m³) — falls back to 0 if missing.
 */
export function assembleMassMatrix(
  input: SolverInput,
  dofNum: DofNumbering,
): Float64Array {
  const nf = dofNum.nFree;
  const M = new Float64Array(nf * nf);

  for (const [, elem] of input.elements) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const L = nodeDistance(nodeI, nodeJ);
    if (L < 1e-12) continue;

    const angle = nodeAngle(nodeI, nodeJ);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const mat = input.materials.get(elem.materialId);
    const sec = input.sections.get(elem.sectionId);
    if (!mat || !sec) continue;

    // density in consistent units (e.g. kg/m³ → needs e in kPa=kN/m² context)
    // The solver uses kN and m, so density should be in t/m³ = kN·s²/m⁴
    // We store density as kg/m³ in the material, convert: 1 kg/m³ = 0.001 t/m³
    const density = (mat as any).density ?? 0;
    if (density <= 0) continue;
    const rhoA = density * 0.001 * sec.a; // t/m³ × m² = t/m = kN·s²/m²

    const isFrame = elem.type === 'frame';
    const ndof = isFrame ? 6 : 4;

    const mLocal = isFrame
      ? frameConsistentMass(rhoA, L, elem.hingeStart, elem.hingeEnd)
      : trussConsistentMass(rhoA, L);

    const mGlobal = transformToGlobal(mLocal, cos, sin, ndof);

    // Scatter into global M (free DOFs only)
    const dofs = elementDofs(dofNum, elem.nodeI, elem.nodeJ);
    for (let i = 0; i < ndof; i++) {
      const gi = dofs[i];
      if (gi >= nf) continue;
      for (let j = 0; j < ndof; j++) {
        const gj = dofs[j];
        if (gj >= nf) continue;
        M[gi * nf + gj] += mGlobal[i * ndof + j];
      }
    }
  }

  return M;
}
