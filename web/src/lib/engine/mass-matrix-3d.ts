// Consistent mass matrix assembly for 3D frame/truss modal analysis
//
// DOF order per element (local): [u1,v1,w1,θx1,θy1,θz1, u2,v2,w2,θx2,θy2,θz2]
// Units: density in kg/m³ (converted internally to t/m³), areas in m², lengths in m
// Output mass in consistent units: t = kN·s²/m

import {
  computeLocalAxes3D,
  frameTransformationMatrix3D,
  trussTransformationMatrix3D,
  globalDof3D,
} from './solver-3d';
import type { DofNumbering3D } from './solver-3d';
import type { SolverInput3D } from './types-3d';

// ─── Local element mass matrices ─────────────────────────────────

/**
 * 12×12 consistent mass matrix for a 3D frame element in local coords.
 *
 * rhoA  = ρ * 0.001 * A  (mass per unit length, t/m)
 * rhoIp = ρ * 0.001 * Ip (mass moment of inertia per unit length, t·m)
 * L     = element length (m)
 *
 * Reference: Przemieniecki, "Theory of Matrix Structural Analysis" §5.7
 */
function frameConsistentMass3D(
  rhoA: number, rhoIp: number, L: number,
  hingeStart: boolean, hingeEnd: boolean,
): Float64Array {
  const n = 12;
  const m = new Float64Array(n * n);
  const L2 = L * L;

  // ── Axial (u1=0, u2=6) — always the same ──
  m[0 * n + 0] = rhoA * L / 3;
  m[0 * n + 6] = rhoA * L / 6;
  m[6 * n + 0] = rhoA * L / 6;
  m[6 * n + 6] = rhoA * L / 3;

  // ── Torsion (θx1=3, θx2=9) — always the same ──
  m[3 * n + 3] = rhoIp * L / 3;
  m[3 * n + 9] = rhoIp * L / 6;
  m[9 * n + 3] = rhoIp * L / 6;
  m[9 * n + 9] = rhoIp * L / 3;

  if (!hingeStart && !hingeEnd) {
    // ── Bending about Z-axis (v1=1, θz1=5, v2=7, θz2=11) ──
    const c = rhoA * L / 420;
    m[1 * n + 1]   = 156 * c;
    m[1 * n + 5]   =  22 * L * c;
    m[1 * n + 7]   =  54 * c;
    m[1 * n + 11]  = -13 * L * c;

    m[5 * n + 1]   =  22 * L * c;
    m[5 * n + 5]   =   4 * L2 * c;
    m[5 * n + 7]   =  13 * L * c;
    m[5 * n + 11]  =  -3 * L2 * c;

    m[7 * n + 1]   =  54 * c;
    m[7 * n + 5]   =  13 * L * c;
    m[7 * n + 7]   = 156 * c;
    m[7 * n + 11]  = -22 * L * c;

    m[11 * n + 1]  = -13 * L * c;
    m[11 * n + 5]  =  -3 * L2 * c;
    m[11 * n + 7]  = -22 * L * c;
    m[11 * n + 11] =   4 * L2 * c;

    // ── Bending about Y-axis (w1=2, θy1=4, w2=8, θy2=10) ──
    // Note sign differences: θy = -dw/dx convention
    m[2 * n + 2]   = 156 * c;
    m[2 * n + 4]   = -22 * L * c;
    m[2 * n + 8]   =  54 * c;
    m[2 * n + 10]  =  13 * L * c;

    m[4 * n + 2]   = -22 * L * c;
    m[4 * n + 4]   =   4 * L2 * c;
    m[4 * n + 8]   = -13 * L * c;
    m[4 * n + 10]  =  -3 * L2 * c;

    m[8 * n + 2]   =  54 * c;
    m[8 * n + 4]   = -13 * L * c;
    m[8 * n + 8]   = 156 * c;
    m[8 * n + 10]  =  22 * L * c;

    m[10 * n + 2]  =  13 * L * c;
    m[10 * n + 4]  =  -3 * L2 * c;
    m[10 * n + 8]  =  22 * L * c;
    m[10 * n + 10] =   4 * L2 * c;
  } else if (hingeStart && hingeEnd) {
    // Both hinges: linear shape functions (no rotational coupling)
    // v and w get the same treatment as truss transverse DOFs
    const c = rhoA * L / 6;

    // Bending Z-plane: v1=1, v2=7 (θz1, θz2 = 0)
    m[1 * n + 1] = 2 * c;
    m[1 * n + 7] = 1 * c;
    m[7 * n + 1] = 1 * c;
    m[7 * n + 7] = 2 * c;

    // Bending Y-plane: w1=2, w2=8 (θy1, θy2 = 0)
    m[2 * n + 2] = 2 * c;
    m[2 * n + 8] = 1 * c;
    m[8 * n + 2] = 1 * c;
    m[8 * n + 8] = 2 * c;
  } else {
    // One hinge: static condensation of the full consistent mass matrix
    // Same approach as 2D mass-matrix.ts
    condenseBendingZ(m, n, rhoA, L, L2, hingeStart, hingeEnd);
    condenseBendingY(m, n, rhoA, L, L2, hingeStart, hingeEnd);
  }

  return m;
}

/**
 * Static condensation of bending-Z block (v1=1, θz1=5, v2=7, θz2=11).
 * Condense out the rotation DOF at the hinge end.
 */
function condenseBendingZ(
  m: Float64Array, n: number,
  rhoA: number, L: number, L2: number,
  hingeStart: boolean, _hingeEnd: boolean,
): void {
  const c = rhoA * L / 420;
  // Full 4×4 bending-Z sub-matrix (local indices: v1, θz1, v2, θz2)
  const full = [
    [156 * c,  22 * L * c,  54 * c, -13 * L * c],
    [ 22 * L * c,  4 * L2 * c,  13 * L * c,  -3 * L2 * c],
    [ 54 * c,  13 * L * c, 156 * c, -22 * L * c],
    [-13 * L * c,  -3 * L2 * c, -22 * L * c,   4 * L2 * c],
  ];

  // Global DOF indices for this block
  const globalIdx = [1, 5, 7, 11];

  if (hingeStart) {
    // Condense out θz1 (local index 1 in full block)
    const condenseOut = 1;
    const keep = [0, 2, 3]; // v1, v2, θz2
    const Mbb_inv = 1 / full[condenseOut][condenseOut];
    for (let i = 0; i < keep.length; i++) {
      for (let j = 0; j < keep.length; j++) {
        const ci = keep[i], cj = keep[j];
        const val = full[ci][cj] - full[ci][condenseOut] * Mbb_inv * full[condenseOut][cj];
        m[globalIdx[ci] * n + globalIdx[cj]] = val;
      }
    }
  } else {
    // Condense out θz2 (local index 3 in full block)
    const condenseOut = 3;
    const keep = [0, 1, 2]; // v1, θz1, v2
    const Mbb_inv = 1 / full[condenseOut][condenseOut];
    for (let i = 0; i < keep.length; i++) {
      for (let j = 0; j < keep.length; j++) {
        const ci = keep[i], cj = keep[j];
        const val = full[ci][cj] - full[ci][condenseOut] * Mbb_inv * full[condenseOut][cj];
        m[globalIdx[ci] * n + globalIdx[cj]] = val;
      }
    }
  }
}

/**
 * Static condensation of bending-Y block (w1=2, θy1=4, w2=8, θy2=10).
 * Sign differences due to θy = -dw/dx convention.
 */
function condenseBendingY(
  m: Float64Array, n: number,
  rhoA: number, L: number, L2: number,
  hingeStart: boolean, _hingeEnd: boolean,
): void {
  const c = rhoA * L / 420;
  // Full 4×4 bending-Y sub-matrix (local indices: w1, θy1, w2, θy2)
  const full = [
    [ 156 * c, -22 * L * c,  54 * c,  13 * L * c],
    [-22 * L * c,   4 * L2 * c, -13 * L * c,  -3 * L2 * c],
    [  54 * c, -13 * L * c, 156 * c,  22 * L * c],
    [  13 * L * c,  -3 * L2 * c,  22 * L * c,   4 * L2 * c],
  ];

  // Global DOF indices for this block
  const globalIdx = [2, 4, 8, 10];

  if (hingeStart) {
    // Condense out θy1 (local index 1 in full block)
    const condenseOut = 1;
    const keep = [0, 2, 3]; // w1, w2, θy2
    const Mbb_inv = 1 / full[condenseOut][condenseOut];
    for (let i = 0; i < keep.length; i++) {
      for (let j = 0; j < keep.length; j++) {
        const ci = keep[i], cj = keep[j];
        const val = full[ci][cj] - full[ci][condenseOut] * Mbb_inv * full[condenseOut][cj];
        m[globalIdx[ci] * n + globalIdx[cj]] = val;
      }
    }
  } else {
    // Condense out θy2 (local index 3 in full block)
    const condenseOut = 3;
    const keep = [0, 1, 2]; // w1, θy1, w2
    const Mbb_inv = 1 / full[condenseOut][condenseOut];
    for (let i = 0; i < keep.length; i++) {
      for (let j = 0; j < keep.length; j++) {
        const ci = keep[i], cj = keep[j];
        const val = full[ci][cj] - full[ci][condenseOut] * Mbb_inv * full[condenseOut][cj];
        m[globalIdx[ci] * n + globalIdx[cj]] = val;
      }
    }
  }
}

/**
 * 6×6 consistent mass matrix for a 3D truss element in local coords.
 * DOFs: [u1, v1, w1, u2, v2, w2]
 */
function trussConsistentMass3D(rhoA: number, L: number): Float64Array {
  const n = 6;
  const m = new Float64Array(n * n);
  const c = rhoA * L / 6;

  // Diagonal: 2c
  for (let i = 0; i < 6; i++) m[i * n + i] = 2 * c;

  // Coupling between nodes: c for matching translational DOFs
  m[0 * n + 3] = c;  m[3 * n + 0] = c;  // axial u1-u2
  m[1 * n + 4] = c;  m[4 * n + 1] = c;  // transverse v1-v2
  m[2 * n + 5] = c;  m[5 * n + 2] = c;  // transverse w1-w2

  return m;
}

// ─── Transform and assemble ──────────────────────────────────────

/** M_global = Tᵀ · M_local · T */
function transformMassToGlobal(mLocal: Float64Array, T: Float64Array, ndof: number): Float64Array {
  // temp = M_local · T
  const temp = new Float64Array(ndof * ndof);
  for (let i = 0; i < ndof; i++) {
    for (let k = 0; k < ndof; k++) {
      const mik = mLocal[i * ndof + k];
      if (mik === 0) continue;
      for (let j = 0; j < ndof; j++) {
        temp[i * ndof + j] += mik * T[k * ndof + j];
      }
    }
  }

  // M_global = Tᵀ · temp
  const mGlobal = new Float64Array(ndof * ndof);
  for (let i = 0; i < ndof; i++) {
    for (let k = 0; k < ndof; k++) {
      const tki = T[k * ndof + i]; // Tᵀ[i][k] = T[k][i]
      if (tki === 0) continue;
      for (let j = 0; j < ndof; j++) {
        mGlobal[i * ndof + j] += tki * temp[k * ndof + j];
      }
    }
  }

  return mGlobal;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Assemble the global consistent mass matrix M (nFree × nFree) for 3D structures.
 *
 * @param input     Structure definition (nodes, elements, materials, sections, supports)
 * @param dofNum    DOF numbering (from buildDofNumbering3D)
 * @param densities Map of materialId → density in kg/m³
 * @returns         Flat Float64Array of size nFree × nFree (row-major)
 */
export function buildMassMatrix3D(
  input: SolverInput3D,
  dofNum: DofNumbering3D,
  densities: Map<number, number>,
): Float64Array {
  const nf = dofNum.nFree;
  const M = new Float64Array(nf * nf);

  for (const elem of input.elements.values()) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const sec = input.sections.get(elem.sectionId)!;

    const density = densities.get(elem.materialId) ?? 0;
    if (density <= 0) continue;

    const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
      : undefined;
    const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle);
    const L = axes.L;
    if (L < 1e-10) continue;

    // Convert density: kg/m³ → t/m³ (= kN·s²/m⁴)
    const rhoA = density * 0.001 * sec.a; // t/m = kN·s²/m²

    if (elem.type === 'frame') {
      // Polar moment of inertia approximation: Ip = Iy + Iz
      const Ip = sec.iy + sec.iz;
      const rhoIp = density * 0.001 * Ip;

      const mLocal = frameConsistentMass3D(rhoA, rhoIp, L, elem.hingeStart, elem.hingeEnd);
      const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const mGlobal = transformMassToGlobal(mLocal, T, 12);

      // Scatter into global M (free DOFs only)
      const dofs: number[] = [];
      for (let d = 0; d < dofNum.dofsPerNode; d++) {
        const idx = globalDof3D(dofNum, elem.nodeI, d);
        if (idx !== undefined) dofs.push(idx);
      }
      for (let d = 0; d < dofNum.dofsPerNode; d++) {
        const idx = globalDof3D(dofNum, elem.nodeJ, d);
        if (idx !== undefined) dofs.push(idx);
      }

      const ndof = dofs.length;
      for (let i = 0; i < ndof; i++) {
        const gi = dofs[i];
        if (gi >= nf) continue;
        for (let j = 0; j < ndof; j++) {
          const gj = dofs[j];
          if (gj >= nf) continue;
          M[gi * nf + gj] += mGlobal[i * 12 + j];
        }
      }
    } else {
      // Truss: 6×6 (translations only)
      const mLocal = trussConsistentMass3D(rhoA, L);
      const T = trussTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const mGlobal = transformMassToGlobal(mLocal, T, 6);

      const diI0 = globalDof3D(dofNum, elem.nodeI, 0)!;
      const diI1 = globalDof3D(dofNum, elem.nodeI, 1)!;
      const diI2 = globalDof3D(dofNum, elem.nodeI, 2)!;
      const diJ0 = globalDof3D(dofNum, elem.nodeJ, 0)!;
      const diJ1 = globalDof3D(dofNum, elem.nodeJ, 1)!;
      const diJ2 = globalDof3D(dofNum, elem.nodeJ, 2)!;
      const dofs = [diI0, diI1, diI2, diJ0, diJ1, diJ2];

      for (let i = 0; i < 6; i++) {
        const gi = dofs[i];
        if (gi >= nf) continue;
        for (let j = 0; j < 6; j++) {
          const gj = dofs[j];
          if (gj >= nf) continue;
          M[gi * nf + gj] += mGlobal[i * 6 + j];
        }
      }
    }
  }

  return M;
}
