// 3D Structural Solver — Direct Stiffness Method
// Phase 1: Engine Core — 12×12 frame, 6×6 truss, 6 DOF/node
//
// DOF order per node (global): [ux, uy, uz, rx, ry, rz]
// DOF order per element (local): [u1,v1,w1,θx1,θy1,θz1, u2,v2,w2,θx2,θy2,θz2]
//
// Sign conventions:
//   u  → axial (local X, from I to J)
//   v  → perpendicular (local Y)
//   w  → perpendicular (local Z)
//   θx → torsion (right-hand about local X)
//   θy → rotation about local Y: θy = -dw/dx (right-hand rule)
//   θz → rotation about local Z: θz = +dv/dx

import type {
  SolverInput3D, SolverNode3D, SolverSupport3D,
  AnalysisResults3D, Displacement3D, Reaction3D, ElementForces3D,
  SolverDistributedLoad3D, SolverPointLoad3D, SolverThermalLoad3D,
} from './types-3d';
import { choleskySolve } from './matrix-utils';
import { computeStaticDegree3D, analyzeKinematics3D } from './kinematic-3d';
import { t } from '../i18n';

// ─── DOF Numbering ───────────────────────────────────────────────

export interface DofNumbering3D {
  /** Maps "nodeId:localDof" → globalDofIndex */
  map: Map<string, number>;
  nFree: number;
  nTotal: number;
  dofsPerNode: number;  // 6 for frames, 3 for pure trusses
  nodeOrder: number[];
}

export function dofKey(nodeId: number, localDof: number): string {
  return `${nodeId}:${localDof}`;
}

/**
 * Check if a DOF is restrained by a support.
 * DOF mapping: 0=ux, 1=uy, 2=uz, 3=rx, 4=ry, 5=rz
 * Spring DOFs are NOT restrained (spring stiffness is added to K).
 */
export function isDofRestrained3D(sup: SolverSupport3D, dof: number): boolean {
  // If there's a spring on this DOF, it's free (spring stiffness added to K)
  const springVal = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz][dof];
  if (springVal !== undefined && springVal > 0) return false;

  switch (dof) {
    case 0: return sup.rx;
    case 1: return sup.ry;
    case 2: return sup.rz;
    case 3: return sup.rrx;
    case 4: return sup.rry;
    case 5: return sup.rrz;
    default: return false;
  }
}

export function buildDofNumbering3D(input: SolverInput3D): DofNumbering3D {
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');
  const dofsPerNode = hasFrames ? 6 : 3;

  const nodeOrder = Array.from(input.nodes.keys()).sort((a, b) => a - b);

  const map = new Map<string, number>();
  let freeDofIdx = 0;
  const restrainedDofs: [number, number][] = [];

  const supportByNode = new Map<number, SolverSupport3D>();
  for (const sup of input.supports.values()) {
    supportByNode.set(sup.nodeId, sup);
  }

  // First pass: assign free DOFs
  for (const nodeId of nodeOrder) {
    const sup = supportByNode.get(nodeId);
    for (let localDof = 0; localDof < dofsPerNode; localDof++) {
      const isRestrained = sup ? isDofRestrained3D(sup, localDof) : false;
      if (isRestrained) {
        restrainedDofs.push([nodeId, localDof]);
      } else {
        map.set(dofKey(nodeId, localDof), freeDofIdx++);
      }
    }
  }

  const nFree = freeDofIdx;

  // Second pass: assign restrained DOFs
  for (const [nodeId, localDof] of restrainedDofs) {
    map.set(dofKey(nodeId, localDof), freeDofIdx++);
  }

  return { map, nFree, nTotal: freeDofIdx, dofsPerNode, nodeOrder };
}

export function globalDof3D(dofNum: DofNumbering3D, nodeId: number, localDof: number): number | undefined {
  return dofNum.map.get(dofKey(nodeId, localDof));
}

function elementDofs3D(dofNum: DofNumbering3D, nodeI: number, nodeJ: number): number[] {
  const dofs: number[] = [];
  for (let d = 0; d < dofNum.dofsPerNode; d++) {
    const idx = globalDof3D(dofNum, nodeI, d);
    if (idx !== undefined) dofs.push(idx);
  }
  for (let d = 0; d < dofNum.dofsPerNode; d++) {
    const idx = globalDof3D(dofNum, nodeJ, d);
    if (idx !== undefined) dofs.push(idx);
  }
  return dofs;
}

function getDisplacement3D(dofNum: DofNumbering3D, u: Float64Array, nodeId: number, localDof: number): number {
  if (localDof >= dofNum.dofsPerNode) return 0;
  const idx = globalDof3D(dofNum, nodeId, localDof);
  return idx !== undefined ? (u[idx] ?? 0) : 0;
}

function getReaction3D(dofNum: DofNumbering3D, r: Float64Array, nodeId: number, localDof: number): number {
  if (localDof >= dofNum.dofsPerNode) return 0;
  const idx = globalDof3D(dofNum, nodeId, localDof);
  if (idx === undefined || idx < dofNum.nFree) return 0;
  return r[idx - dofNum.nFree] ?? 0;
}

// ─── Local Axes ──────────────────────────────────────────────────

export interface LocalAxes3D {
  ex: [number, number, number];  // local X (element axis, I→J)
  ey: [number, number, number];  // local Y
  ez: [number, number, number];  // local Z
  L: number;                     // element length
}

/**
 * Compute local coordinate system for a 3D element (UBA right-hand convention).
 *
 * Convention:
 * - ex = normalize(J - I) — element axis
 * - ez always points "downward" (toward −Y global) for non-vertical bars;
 *   for vertical bars, ez = (+X global) = (1,0,0)
 * - ey completes the right-hand terna: ey = ez × ex
 *
 * Cardinal examples:
 *   +X bar: ex=(1,0,0),  ey=(0,0,1),   ez=(0,−1,0)
 *   −X bar: ex=(−1,0,0), ey=(0,0,−1),  ez=(0,−1,0)
 *   +Z bar: ex=(0,0,1),  ey=(−1,0,0),  ez=(0,−1,0)
 *   −Z bar: ex=(0,0,−1), ey=(1,0,0),   ez=(0,−1,0)
 *   +Y bar: ex=(0,1,0),  ey=(0,0,1),   ez=(1,0,0)
 *   −Y bar: ex=(0,−1,0), ey=(0,0,−1),  ez=(1,0,0)
 *
 * Optional overrides:
 * - localY: explicit ey reference vector (overrides auto-orient)
 * - rollAngle: rotation of ey/ez around ex in degrees
 */
export function computeLocalAxes3D(
  nodeI: SolverNode3D, nodeJ: SolverNode3D,
  localY?: { x: number; y: number; z: number },
  rollAngle?: number,
  leftHand?: boolean,
): LocalAxes3D {
  const dx = nodeJ.x - nodeI.x;
  const dy = nodeJ.y - nodeI.y;
  const dz = nodeJ.z - nodeI.z;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (L < 1e-10) {
    throw new Error(t('solver.elemZeroLength3D').replace('{coordI}', `(${nodeI.x},${nodeI.y},${nodeI.z})`).replace('{coordJ}', `(${nodeJ.x},${nodeJ.y},${nodeJ.z})`));
  }

  const ex: [number, number, number] = [dx / L, dy / L, dz / L];

  let ey: [number, number, number];
  let ez: [number, number, number];

  if (localY) {
    // Explicit orientation: use localY as ey reference
    const ref: [number, number, number] = [localY.x, localY.y, localY.z];
    // ez = normalize(ex × ref)
    let ezx = ex[1] * ref[2] - ex[2] * ref[1];
    let ezy = ex[2] * ref[0] - ex[0] * ref[2];
    let ezz = ex[0] * ref[1] - ex[1] * ref[0];
    const ezLen = Math.sqrt(ezx * ezx + ezy * ezy + ezz * ezz);
    if (ezLen < 1e-10) {
      throw new Error(t('solver.localYParallel'));
    }
    ezx /= ezLen; ezy /= ezLen; ezz /= ezLen;
    ez = [ezx, ezy, ezz];
    // ey = ez × ex
    ey = [
      ezy * ex[2] - ezz * ex[1],
      ezz * ex[0] - ezx * ex[2],
      ezx * ex[1] - ezy * ex[0],
    ];
  } else {
    // UBA auto-orient convention
    const dotY = Math.abs(ex[1]); // |component along global Y|

    let refEz: [number, number, number];
    if (dotY > 0.999) {
      // Near-vertical element: ez reference = global X (1,0,0)
      refEz = [1, 0, 0];
    } else {
      // Non-vertical: ez points "down" = (0,−1,0)
      refEz = [0, -1, 0];
    }

    // ey = normalize(refEz × ex)
    let eyx = refEz[1] * ex[2] - refEz[2] * ex[1];
    let eyy = refEz[2] * ex[0] - refEz[0] * ex[2];
    let eyz = refEz[0] * ex[1] - refEz[1] * ex[0];
    const eyLen = Math.sqrt(eyx * eyx + eyy * eyy + eyz * eyz);
    if (eyLen < 1e-10) {
      throw new Error(t('solver.localAxesError'));
    }
    eyx /= eyLen; eyy /= eyLen; eyz /= eyLen;
    ey = [eyx, eyy, eyz];

    // ez = ex × ey (guaranteed orthogonal)
    ez = [
      ex[1] * ey[2] - ex[2] * ey[1],
      ex[2] * ey[0] - ex[0] * ey[2],
      ex[0] * ey[1] - ex[1] * ey[0],
    ];
  }

  // Apply roll angle (rotation of ey/ez around ex)
  if (rollAngle !== undefined && rollAngle !== 0 && Math.abs(rollAngle) > 1e-10) {
    const rad = rollAngle * Math.PI / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const newEy: [number, number, number] = [
      c * ey[0] + s * ez[0],
      c * ey[1] + s * ez[1],
      c * ey[2] + s * ez[2],
    ];
    const newEz: [number, number, number] = [
      -s * ey[0] + c * ez[0],
      -s * ey[1] + c * ez[1],
      -s * ey[2] + c * ez[2],
    ];
    ey = newEy;
    ez = newEz;
  }

  // Terna izquierda (left-hand convention): negate ey to produce det([ex,ey,ez]) = -1
  if (leftHand) {
    ey = [-ey[0], -ey[1], -ey[2]];
  }

  return { ex, ey, ez, L };
}

// ─── Element Stiffness ───────────────────────────────────────────

/**
 * 12×12 local stiffness matrix for 3D frame element.
 * DOF order: [u1, v1, w1, θx1, θy1, θz1, u2, v2, w2, θx2, θy2, θz2]
 *
 * Components:
 * - Axial (DOFs 0,6): EA/L
 * - Strong-axis bending (DOFs 1,5,7,11 — v,θz): EIz terms (same signs as 2D)
 * - Weak-axis bending (DOFs 2,4,8,10 — w,θy): EIy terms (θy = -dw/dx → sign changes)
 * - Torsion (DOFs 3,9): GJ/L
 */
export function frameLocalStiffness3D(
  E: number, G: number, A: number, Iy: number, Iz: number, J: number, L: number,
  hingeStart: boolean, hingeEnd: boolean,
): Float64Array {
  const n = 12;
  const k = new Float64Array(n * n);

  const EA_L = E * A / L;
  const GJ_L = G * J / L;

  // ── Axial (DOFs 0, 6) ──
  k[0 * n + 0] = EA_L;   k[0 * n + 6] = -EA_L;
  k[6 * n + 0] = -EA_L;  k[6 * n + 6] = EA_L;

  // ── Torsion (DOFs 3, 9) ──
  k[3 * n + 3] = GJ_L;   k[3 * n + 9] = -GJ_L;
  k[9 * n + 3] = -GJ_L;  k[9 * n + 9] = GJ_L;

  // ── Strong-axis bending: v, θz (DOFs 1,5,7,11) ──
  // Identical to 2D beam: EIz terms, θz = +dv/dx
  {
    const EI = E * Iz;
    const EI_L = EI / L;
    const EI_L2 = EI_L / L;
    const EI_L3 = EI_L2 / L;

    if (!hingeStart && !hingeEnd) {
      k[1*n+1] = 12*EI_L3;   k[1*n+5] = 6*EI_L2;    k[1*n+7] = -12*EI_L3;  k[1*n+11] = 6*EI_L2;
      k[5*n+1] = 6*EI_L2;    k[5*n+5] = 4*EI_L;      k[5*n+7] = -6*EI_L2;   k[5*n+11] = 2*EI_L;
      k[7*n+1] = -12*EI_L3;  k[7*n+5] = -6*EI_L2;    k[7*n+7] = 12*EI_L3;   k[7*n+11] = -6*EI_L2;
      k[11*n+1] = 6*EI_L2;   k[11*n+5] = 2*EI_L;     k[11*n+7] = -6*EI_L2;  k[11*n+11] = 4*EI_L;
    } else if (hingeStart && !hingeEnd) {
      k[1*n+1] = 3*EI_L3;    k[1*n+7] = -3*EI_L3;    k[1*n+11] = 3*EI_L2;
      k[7*n+1] = -3*EI_L3;   k[7*n+7] = 3*EI_L3;     k[7*n+11] = -3*EI_L2;
      k[11*n+1] = 3*EI_L2;   k[11*n+7] = -3*EI_L2;   k[11*n+11] = 3*EI_L;
    } else if (!hingeStart && hingeEnd) {
      k[1*n+1] = 3*EI_L3;    k[1*n+5] = 3*EI_L2;     k[1*n+7] = -3*EI_L3;
      k[5*n+1] = 3*EI_L2;    k[5*n+5] = 3*EI_L;      k[5*n+7] = -3*EI_L2;
      k[7*n+1] = -3*EI_L3;   k[7*n+5] = -3*EI_L2;    k[7*n+7] = 3*EI_L3;
    }
    // Both hinges: no bending stiffness in this plane (only axial)
  }

  // ── Weak-axis bending: w, θy (DOFs 2,4,8,10) ──
  // θy = -dw/dx → sign inversions in coupling terms
  // The submatrix for (w, θy) has opposite signs on the coupling (w-θy) terms
  // compared to (v, θz).
  {
    const EI = E * Iy;
    const EI_L = EI / L;
    const EI_L2 = EI_L / L;
    const EI_L3 = EI_L2 / L;

    if (!hingeStart && !hingeEnd) {
      k[2*n+2] = 12*EI_L3;    k[2*n+4] = -6*EI_L2;   k[2*n+8] = -12*EI_L3;  k[2*n+10] = -6*EI_L2;
      k[4*n+2] = -6*EI_L2;    k[4*n+4] = 4*EI_L;      k[4*n+8] = 6*EI_L2;    k[4*n+10] = 2*EI_L;
      k[8*n+2] = -12*EI_L3;   k[8*n+4] = 6*EI_L2;     k[8*n+8] = 12*EI_L3;   k[8*n+10] = 6*EI_L2;
      k[10*n+2] = -6*EI_L2;   k[10*n+4] = 2*EI_L;     k[10*n+8] = 6*EI_L2;   k[10*n+10] = 4*EI_L;
    } else if (hingeStart && !hingeEnd) {
      // Release θy at start (DOF 4)
      k[2*n+2] = 3*EI_L3;     k[2*n+8] = -3*EI_L3;    k[2*n+10] = -3*EI_L2;
      k[8*n+2] = -3*EI_L3;    k[8*n+8] = 3*EI_L3;     k[8*n+10] = 3*EI_L2;
      k[10*n+2] = -3*EI_L2;   k[10*n+8] = 3*EI_L2;    k[10*n+10] = 3*EI_L;
    } else if (!hingeStart && hingeEnd) {
      // Release θy at end (DOF 10)
      k[2*n+2] = 3*EI_L3;     k[2*n+4] = -3*EI_L2;    k[2*n+8] = -3*EI_L3;
      k[4*n+2] = -3*EI_L2;    k[4*n+4] = 3*EI_L;      k[4*n+8] = 3*EI_L2;
      k[8*n+2] = -3*EI_L3;    k[8*n+4] = 3*EI_L2;     k[8*n+8] = 3*EI_L3;
    }
    // Both hinges: no bending stiffness in this plane
  }

  return k;
}

/**
 * 6×6 local stiffness for 3D truss element.
 * Only axial stiffness EA/L in DOFs 0 and 3 (local axial at each node).
 */
export function trussLocalStiffness3D(E: number, A: number, L: number): Float64Array {
  const n = 6;
  const k = new Float64Array(n * n);
  const ea_l = E * A / L;
  k[0 * n + 0] = ea_l;   k[0 * n + 3] = -ea_l;
  k[3 * n + 0] = -ea_l;  k[3 * n + 3] = ea_l;
  return k;
}

// ─── Transformation Matrix ───────────────────────────────────────

/**
 * 12×12 transformation matrix for 3D frame element.
 * T = diag(R, R, R, R) where R is the 3×3 direction cosine matrix.
 * R rows are the local axes: R = [ex; ey; ez]
 * Transforms global → local: u_local = T · u_global
 */
export function frameTransformationMatrix3D(
  ex: [number, number, number],
  ey: [number, number, number],
  ez: [number, number, number],
): Float64Array {
  const n = 12;
  const T = new Float64Array(n * n);

  // Place 4 copies of R on the diagonal (3×3 blocks)
  for (let block = 0; block < 4; block++) {
    const off = block * 3;
    // Row 0 of block: ex
    T[(off + 0) * n + (off + 0)] = ex[0];
    T[(off + 0) * n + (off + 1)] = ex[1];
    T[(off + 0) * n + (off + 2)] = ex[2];
    // Row 1 of block: ey
    T[(off + 1) * n + (off + 0)] = ey[0];
    T[(off + 1) * n + (off + 1)] = ey[1];
    T[(off + 1) * n + (off + 2)] = ey[2];
    // Row 2 of block: ez
    T[(off + 2) * n + (off + 0)] = ez[0];
    T[(off + 2) * n + (off + 1)] = ez[1];
    T[(off + 2) * n + (off + 2)] = ez[2];
  }

  return T;
}

/**
 * 6×6 transformation matrix for 3D truss element.
 * T = diag(R, R) where R is the 3×3 direction cosine matrix.
 */
export function trussTransformationMatrix3D(
  ex: [number, number, number],
  ey: [number, number, number],
  ez: [number, number, number],
): Float64Array {
  const n = 6;
  const T = new Float64Array(n * n);

  for (let block = 0; block < 2; block++) {
    const off = block * 3;
    T[(off + 0) * n + (off + 0)] = ex[0];
    T[(off + 0) * n + (off + 1)] = ex[1];
    T[(off + 0) * n + (off + 2)] = ex[2];
    T[(off + 1) * n + (off + 0)] = ey[0];
    T[(off + 1) * n + (off + 1)] = ey[1];
    T[(off + 1) * n + (off + 2)] = ey[2];
    T[(off + 2) * n + (off + 0)] = ez[0];
    T[(off + 2) * n + (off + 1)] = ez[1];
    T[(off + 2) * n + (off + 2)] = ez[2];
  }

  return T;
}

/** K_global = T^T * K_local * T */
function transformMatrix3D(kLocal: Float64Array, T: Float64Array, n: number): Float64Array {
  // temp = K_local * T
  const temp = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += kLocal[i * n + k] * T[k * n + j];
      }
      temp[i * n + j] = sum;
    }
  }
  // K_g = T^T * temp
  const kGlobal = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += T[k * n + i] * temp[k * n + j];
      }
      kGlobal[i * n + j] = sum;
    }
  }
  return kGlobal;
}

// ─── Fixed-End Forces ────────────────────────────────────────────

/**
 * Fixed-end forces for trapezoidal distributed load on a beam.
 * Returns [Vi, Mi, Vj, Mj] in local coordinates.
 * Same formulas as 2D solver — called separately for Y and Z planes.
 */
function trapezoidalFEF(qI: number, qJ: number, L: number): [number, number, number, number] {
  const vu = qI * L / 2;
  const mu = qI * L * L / 12;
  const dq = qJ - qI;
  const vti = 3 * dq * L / 20;
  const mti = dq * L * L / 30;
  const vtj = 7 * dq * L / 20;
  const mtj = -dq * L * L / 20;
  return [vu + vti, mu + mti, vu + vtj, -mu + mtj];
}

/**
 * Fixed-end forces for point load P at distance a from node I.
 * Returns [Vi, Mi, Vj, Mj].
 */
function pointFEF(P: number, a: number, L: number): [number, number, number, number] {
  const b = L - a;
  const vi = P * b * b * (3 * a + b) / (L * L * L);
  const mi = P * a * b * b / (L * L);
  const vj = P * a * a * (a + 3 * b) / (L * L * L);
  const mj = -P * a * a * b / (L * L);
  return [vi, mi, vj, mj];
}

/**
 * Partial distributed FEF using Simpson's rule (for loads not spanning full length).
 */
function partialDistributedFEF(qI: number, qJ: number, a: number, b: number, L: number): [number, number, number, number] {
  const span = b - a;
  if (span < 1e-12) return [0, 0, 0, 0];
  const N = 20;
  const h = span / N;
  let Vi = 0, Mi = 0, Vj = 0, Mj = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = a + t * span;
    const q = qI + (qJ - qI) * t;
    let w: number;
    if (i === 0 || i === N) w = h / 3;
    else if (i % 2 === 1) w = 4 * h / 3;
    else w = 2 * h / 3;
    const dP = q * w;
    if (Math.abs(dP) < 1e-15) continue;
    const [vi, mi, vj, mj] = pointFEF(dP, x, L);
    Vi += vi; Mi += mi; Vj += vj; Mj += mj;
  }
  return [Vi, Mi, Vj, Mj];
}

/**
 * Adjust FEF for hinges using static condensation.
 * Same as 2D — works on one bending plane at a time.
 */
function adjustFEFForHinges(
  vi: number, mi: number, vj: number, mj: number,
  L: number, hingeStart: boolean, hingeEnd: boolean,
): [number, number, number, number] {
  if (!hingeStart && !hingeEnd) return [vi, mi, vj, mj];
  if (hingeStart && hingeEnd) {
    return [vi - (mi + mj) / L, 0, vj + (mi + mj) / L, 0];
  }
  if (hingeStart) {
    return [
      vi - (3 / (2 * L)) * mi,
      0,
      vj + (3 / (2 * L)) * mi,
      mj - 0.5 * mi,
    ];
  }
  // hingeEnd
  return [
    vi - (3 / (2 * L)) * mj,
    mi - 0.5 * mj,
    vj + (3 / (2 * L)) * mj,
    0,
  ];
}

// ─── Assembly ────────────────────────────────────────────────────

export function assemble3D(
  input: SolverInput3D, dofNum: DofNumbering3D, skipArtificialStiffness = false,
): { K: Float64Array; F: Float64Array; artificialDofs: Set<number>; maxDiagK: number; inclinedPenalty: Map<number, { kP: number; nVec: number[] }> } {
  const n = dofNum.nTotal;
  const K = new Float64Array(n * n);
  const F = new Float64Array(n);

  // Assemble element stiffness matrices
  for (const elem of input.elements.values()) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const mat = input.materials.get(elem.materialId)!;
    const sec = input.sections.get(elem.sectionId)!;
    const E_kNm2 = mat.e * 1000; // MPa → kN/m²
    const G_kNm2 = E_kNm2 / (2 * (1 + mat.nu));

    const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
      : undefined;
    const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle, input.leftHand);
    const L = axes.L;

    if (elem.type === 'frame') {
      const kLocal = frameLocalStiffness3D(E_kNm2, G_kNm2, sec.a, sec.iy, sec.iz, sec.j, L, elem.hingeStart, elem.hingeEnd);
      const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const kGlobal = transformMatrix3D(kLocal, T, 12);

      const dofs = elementDofs3D(dofNum, elem.nodeI, elem.nodeJ);
      for (let i = 0; i < dofs.length; i++) {
        for (let j = 0; j < dofs.length; j++) {
          K[dofs[i] * n + dofs[j]] += kGlobal[i * 12 + j];
        }
      }
    } else {
      // Truss: 6×6
      const kLocal = trussLocalStiffness3D(E_kNm2, sec.a, L);
      const T = trussTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const kGlobal = transformMatrix3D(kLocal, T, 6);

      // Map truss 6 DOFs to global DOFs (only translations: ux,uy,uz per node)
      const diI0 = globalDof3D(dofNum, elem.nodeI, 0)!;
      const diI1 = globalDof3D(dofNum, elem.nodeI, 1)!;
      const diI2 = globalDof3D(dofNum, elem.nodeI, 2)!;
      const diJ0 = globalDof3D(dofNum, elem.nodeJ, 0)!;
      const diJ1 = globalDof3D(dofNum, elem.nodeJ, 1)!;
      const diJ2 = globalDof3D(dofNum, elem.nodeJ, 2)!;
      const dofs = [diI0, diI1, diI2, diJ0, diJ1, diJ2];

      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          K[dofs[i] * n + dofs[j]] += kGlobal[i * 6 + j];
        }
      }
    }
  }

  // Assemble spring support stiffnesses
  for (const sup of input.supports.values()) {
    const springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
    for (let d = 0; d < 6; d++) {
      const kVal = springs[d];
      if (kVal !== undefined && kVal > 0 && d < dofNum.dofsPerNode) {
        const idx = globalDof3D(dofNum, sup.nodeId, d);
        if (idx !== undefined) K[idx * n + idx] += kVal;
      }
    }
  }

  // Max diagonal stiffness for scaling (before penalty, used for penalty multiplier)
  let maxDiagK = 0;
  for (let i = 0; i < n; i++) maxDiagK = Math.max(maxDiagK, Math.abs(K[i * n + i]));

  // Inclined supports via penalty method
  // For each inclined support, add kP * (nn^T) at the translational DOFs of the node,
  // where nn is the unit normal vector. This constrains displacement in the normal direction
  // while leaving the tangential plane free.
  const inclinedPenalty = new Map<number, { kP: number; nVec: number[] }>();
  for (const sup of input.supports.values()) {
    if (!sup.isInclined || sup.normalX === undefined || sup.normalY === undefined || sup.normalZ === undefined) continue;

    // Normalize the normal vector
    const nnx = sup.normalX, nny = sup.normalY, nnz = sup.normalZ;
    const nLen = Math.sqrt(nnx * nnx + nny * nny + nnz * nnz);
    if (nLen < 1e-12) continue;
    const nVec = [nnx / nLen, nny / nLen, nnz / nLen];

    // Penalty stiffness: large multiplier of maximum diagonal
    const kP = maxDiagK > 0 ? maxDiagK * 1e6 : 1e6;
    inclinedPenalty.set(sup.nodeId, { kP, nVec });

    // Apply penalty: K += kP * (nVec ⊗ nVec) at translational DOFs [0,1,2] = [ux,uy,uz]
    for (let i = 0; i < 3; i++) {
      const gi = globalDof3D(dofNum, sup.nodeId, i);
      if (gi === undefined) continue;
      for (let j = 0; j < 3; j++) {
        const gj = globalDof3D(dofNum, sup.nodeId, j);
        if (gj === undefined) continue;
        K[gi * n + gj] += kP * nVec[i] * nVec[j];
      }
    }
  }

  // Update maxDiagK after penalty (so artificial stiffness scales correctly)
  maxDiagK = 0;
  for (let i = 0; i < n; i++) maxDiagK = Math.max(maxDiagK, Math.abs(K[i * n + i]));

  // Artificial stiffness for all-hinged rotation DOFs
  const artificialDofs = new Set<number>();
  if (dofNum.dofsPerNode >= 6 && !skipArtificialStiffness) {
    const artificialK = maxDiagK > 0 ? maxDiagK * 1e-10 : 1e-6;

    // For each rotation DOF (3,4,5), check if all connected frame elements are hinged
    const nodeHingeCount = new Map<number, number>();
    const nodeFrameCount = new Map<number, number>();
    for (const elem of input.elements.values()) {
      if (elem.type !== 'frame') continue;
      nodeFrameCount.set(elem.nodeI, (nodeFrameCount.get(elem.nodeI) ?? 0) + 1);
      nodeFrameCount.set(elem.nodeJ, (nodeFrameCount.get(elem.nodeJ) ?? 0) + 1);
      if (elem.hingeStart) nodeHingeCount.set(elem.nodeI, (nodeHingeCount.get(elem.nodeI) ?? 0) + 1);
      if (elem.hingeEnd) nodeHingeCount.set(elem.nodeJ, (nodeHingeCount.get(elem.nodeJ) ?? 0) + 1);
    }

    // Nodes with rotational restraint
    const rotRestrainedNodes = new Set<number>();
    for (const sup of input.supports.values()) {
      if (sup.rrx) rotRestrainedNodes.add(sup.nodeId);
      if (sup.rry) rotRestrainedNodes.add(sup.nodeId);
      if (sup.rrz) rotRestrainedNodes.add(sup.nodeId);
      if (sup.krx && sup.krx > 0) rotRestrainedNodes.add(sup.nodeId);
      if (sup.kry && sup.kry > 0) rotRestrainedNodes.add(sup.nodeId);
      if (sup.krz && sup.krz > 0) rotRestrainedNodes.add(sup.nodeId);
    }

    for (const [nodeId, hinges] of nodeHingeCount) {
      const frames = nodeFrameCount.get(nodeId) ?? 0;
      if (hinges >= frames && frames >= 1 && !rotRestrainedNodes.has(nodeId)) {
        // Add artificial stiffness to all 3 rotation DOFs at this node
        for (let rd = 3; rd <= 5; rd++) {
          const idx = globalDof3D(dofNum, nodeId, rd);
          if (idx !== undefined && idx < dofNum.nFree) {
            K[idx * n + idx] += artificialK;
            artificialDofs.add(idx);
          }
        }
      }
    }
  }

  // Assemble loads
  for (const load of input.loads) {
    if (load.type === 'nodal') {
      const { nodeId, fx, fy, fz, mx, my, mz } = load.data;
      const vals = [fx, fy, fz, mx, my, mz];
      for (let d = 0; d < dofNum.dofsPerNode; d++) {
        const idx = globalDof3D(dofNum, nodeId, d);
        if (idx !== undefined && d < vals.length) F[idx] += vals[d];
      }
    } else if (load.type === 'distributed') {
      assembleDistributedLoad3D(input, dofNum, load.data, F);
    } else if (load.type === 'pointOnElement') {
      assemblePointLoad3D(input, dofNum, load.data, F);
    } else if (load.type === 'thermal') {
      assembleThermalLoad3D(input, dofNum, load.data, F);
    }
  }

  return { K, F, artificialDofs, maxDiagK, inclinedPenalty };
}

function assembleDistributedLoad3D(
  input: SolverInput3D, dofNum: DofNumbering3D,
  load: SolverDistributedLoad3D, F: Float64Array,
) {
  const elem = input.elements.get(load.elementId);
  if (!elem) return;
  const nodeI = input.nodes.get(elem.nodeI)!;
  const nodeJ = input.nodes.get(elem.nodeJ)!;

  const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
    ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
    : undefined;
  const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle, input.leftHand);
  const L = axes.L;

  const a = load.a ?? 0;
  const b = load.b ?? L;

  // ── FEF in local Y plane → (Vy, Mz) ──
  let fefLocalY: number[];
  if (Math.abs(load.qYI) > 1e-15 || Math.abs(load.qYJ) > 1e-15) {
    let vi0: number, mi0: number, vj0: number, mj0: number;
    if (a < 1e-10 && Math.abs(b - L) < 1e-10) {
      [vi0, mi0, vj0, mj0] = trapezoidalFEF(load.qYI, load.qYJ, L);
    } else {
      [vi0, mi0, vj0, mj0] = partialDistributedFEF(load.qYI, load.qYJ, a, b, L);
    }
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
    fefLocalY = [vi, mi, vj, mj];
  } else {
    fefLocalY = [0, 0, 0, 0];
  }

  // ── FEF in local Z plane → (Vz, My) ──
  let fefLocalZ: number[];
  if (Math.abs(load.qZI) > 1e-15 || Math.abs(load.qZJ) > 1e-15) {
    let vi0: number, mi0: number, vj0: number, mj0: number;
    if (a < 1e-10 && Math.abs(b - L) < 1e-10) {
      [vi0, mi0, vj0, mj0] = trapezoidalFEF(load.qZI, load.qZJ, L);
    } else {
      [vi0, mi0, vj0, mj0] = partialDistributedFEF(load.qZI, load.qZJ, a, b, L);
    }
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
    // For Z-plane: Vz gets shear, My gets moments WITH SIGN INVERSION
    // because θy = -dw/dx (moments reverse sign)
    fefLocalZ = [vi, -mi, vj, -mj];
  } else {
    fefLocalZ = [0, 0, 0, 0];
  }

  // Build 12-vector of equivalent nodal forces in local coords
  // [0,0,0, 0,0,0, 0,0,0, 0,0,0] = [u1,v1,w1,θx1,θy1,θz1, u2,v2,w2,θx2,θy2,θz2]
  const fLocal = new Float64Array(12);
  // Local Y: v1,θz1,v2,θz2 → DOFs 1,5,7,11
  fLocal[1] = fefLocalY[0];   // Vi_y
  fLocal[5] = fefLocalY[1];   // Mi_z
  fLocal[7] = fefLocalY[2];   // Vj_y
  fLocal[11] = fefLocalY[3];  // Mj_z
  // Local Z: w1,θy1,w2,θy2 → DOFs 2,4,8,10
  fLocal[2] = fefLocalZ[0];   // Vi_z
  fLocal[4] = fefLocalZ[1];   // Mi_y (already sign-inverted)
  fLocal[8] = fefLocalZ[2];   // Vj_z
  fLocal[10] = fefLocalZ[3];  // Mj_y (already sign-inverted)

  // Transform to global: F_global = T^T * F_local
  const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
  const fGlobal = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    let sum = 0;
    for (let k = 0; k < 12; k++) {
      sum += T[k * 12 + i] * fLocal[k]; // T^T[i][k] = T[k][i]
    }
    fGlobal[i] = sum;
  }

  // Scatter to global F
  const dofs = elementDofs3D(dofNum, elem.nodeI, elem.nodeJ);
  for (let i = 0; i < dofs.length; i++) {
    F[dofs[i]] += fGlobal[i];
  }
}

function assemblePointLoad3D(
  input: SolverInput3D, dofNum: DofNumbering3D,
  load: SolverPointLoad3D, F: Float64Array,
) {
  const elem = input.elements.get(load.elementId);
  if (!elem) return;
  const nodeI = input.nodes.get(elem.nodeI)!;
  const nodeJ = input.nodes.get(elem.nodeJ)!;

  const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
    ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
    : undefined;
  const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle, input.leftHand);
  const L = axes.L;

  const fLocal = new Float64Array(12);

  // Y component
  if (Math.abs(load.py) > 1e-15) {
    const [vi0, mi0, vj0, mj0] = pointFEF(load.py, load.a, L);
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
    fLocal[1] += vi;   fLocal[5] += mi;
    fLocal[7] += vj;   fLocal[11] += mj;
  }

  // Z component
  if (Math.abs(load.pz) > 1e-15) {
    const [vi0, mi0, vj0, mj0] = pointFEF(load.pz, load.a, L);
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
    // Sign inversion for My (θy = -dw/dx)
    fLocal[2] += vi;   fLocal[4] += -mi;
    fLocal[8] += vj;   fLocal[10] += -mj;
  }

  // Transform to global
  const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
  const fGlobal = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    let sum = 0;
    for (let k = 0; k < 12; k++) {
      sum += T[k * 12 + i] * fLocal[k];
    }
    fGlobal[i] = sum;
  }

  const dofs = elementDofs3D(dofNum, elem.nodeI, elem.nodeJ);
  for (let i = 0; i < dofs.length; i++) {
    F[dofs[i]] += fGlobal[i];
  }
}

// ─── Thermal Load Assembly ────────────────────────────────────────

/**
 * Assemble thermal load equivalent nodal forces (3D).
 * Thermal expansion coefficient α = 1.2e-5 /°C (steel).
 * - Uniform ΔT → axial forces: P = E·A·α·ΔT
 * - Gradient in Z → bending about Z: Mz = E·Iz·α·ΔTz/hz
 * - Gradient in Y → bending about Y: My = E·Iy·α·ΔTy/hy
 */
function assembleThermalLoad3D(
  input: SolverInput3D,
  dofNum: DofNumbering3D,
  load: SolverThermalLoad3D,
  F: Float64Array,
) {
  const elem = input.elements.get(load.elementId);
  if (!elem) return;
  const nodeI = input.nodes.get(elem.nodeI)!;
  const nodeJ = input.nodes.get(elem.nodeJ)!;
  const mat = input.materials.get(elem.materialId)!;
  const sec = input.sections.get(elem.sectionId)!;
  const E_kNm2 = mat.e * 1000; // MPa → kN/m²
  const alpha = 1.2e-5; // /°C (steel thermal expansion)

  const localY =
    elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
      : undefined;
  const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle, input.leftHand);

  if (elem.type === 'frame') {
    const nDof = 12;
    const fLocal = new Float64Array(nDof);

    // Uniform temperature → axial force
    if (Math.abs(load.dtUniform) > 1e-15) {
      const P = E_kNm2 * sec.a * alpha * load.dtUniform;
      fLocal[0] = -P; // node I, axial (compressive reaction)
      fLocal[6] = P; // node J, axial
    }

    // Gradient in Z → bending about Z (Mz)
    // hz = sqrt(12*Iz/A) — effective height for Z-gradient
    if (Math.abs(load.dtGradientZ) > 1e-15) {
      const hz = Math.sqrt(12 * sec.iz / sec.a);
      const M = E_kNm2 * sec.iz * alpha * load.dtGradientZ / hz;
      fLocal[5] = M; // Mz at node I
      fLocal[11] = -M; // Mz at node J
    }

    // Gradient in Y → bending about Y (My)
    if (Math.abs(load.dtGradientY) > 1e-15) {
      const hy = Math.sqrt(12 * sec.iy / sec.a);
      const M = E_kNm2 * sec.iy * alpha * load.dtGradientY / hy;
      fLocal[4] = -M; // My at node I
      fLocal[10] = M; // My at node J
    }

    // Transform to global: fGlobal = T^T · fLocal
    const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
    const fGlobal = new Float64Array(nDof);
    for (let i = 0; i < nDof; i++) {
      let sum = 0;
      for (let j = 0; j < nDof; j++) sum += T[j * nDof + i] * fLocal[j]; // T^T
      fGlobal[i] = sum;
    }

    // Add to global F
    const dofs = elementDofs3D(dofNum, elem.nodeI, elem.nodeJ);
    for (let i = 0; i < dofs.length; i++) {
      F[dofs[i]] += fGlobal[i];
    }
  } else {
    // Truss: only axial thermal force
    if (Math.abs(load.dtUniform) > 1e-15) {
      const P = E_kNm2 * sec.a * alpha * load.dtUniform;
      const fLocal = new Float64Array(6);
      fLocal[0] = -P;
      fLocal[3] = P;

      const T = trussTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const fGlobal = new Float64Array(6);
      for (let i = 0; i < 6; i++) {
        let sum = 0;
        for (let j = 0; j < 6; j++) sum += T[j * 6 + i] * fLocal[j];
        fGlobal[i] = sum;
      }

      const diI0 = globalDof3D(dofNum, elem.nodeI, 0)!;
      const diI1 = globalDof3D(dofNum, elem.nodeI, 1)!;
      const diI2 = globalDof3D(dofNum, elem.nodeI, 2)!;
      const diJ0 = globalDof3D(dofNum, elem.nodeJ, 0)!;
      const diJ1 = globalDof3D(dofNum, elem.nodeJ, 1)!;
      const diJ2 = globalDof3D(dofNum, elem.nodeJ, 2)!;
      const dofs = [diI0, diI1, diI2, diJ0, diJ1, diJ2];
      for (let i = 0; i < 6; i++) F[dofs[i]] += fGlobal[i];
    }
  }
}

// ─── LU Solver ───────────────────────────────────────────────────

/** Solve A*x = b using LU decomposition with partial pivoting */
function solveLU3D(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const a = new Float64Array(A);
  const bw = new Float64Array(b);

  let maxDiag = 0;
  for (let i = 0; i < n; i++) {
    maxDiag = Math.max(maxDiag, Math.abs(A[i * n + i]));
  }
  const singularityTol = Math.max(1e-10, maxDiag * 1e-12);

  for (let k = 0; k < n - 1; k++) {
    let maxVal = Math.abs(a[k * n + k]);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(a[i * n + k]);
      if (val > maxVal) { maxVal = val; maxRow = i; }
    }

    if (maxVal < singularityTol) {
      throw new Error(t('solver.singularMatrix3D'));
    }

    if (maxRow !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = a[k * n + j]; a[k * n + j] = a[maxRow * n + j]; a[maxRow * n + j] = tmp;
      }
      const tmp = bw[k]; bw[k] = bw[maxRow]; bw[maxRow] = tmp;
    }

    for (let i = k + 1; i < n; i++) {
      const factor = a[i * n + k] / a[k * n + k];
      for (let j = k + 1; j < n; j++) {
        a[i * n + j] -= factor * a[k * n + j];
      }
      bw[i] -= factor * bw[k];
    }
  }

  if (Math.abs(a[(n - 1) * n + (n - 1)]) < singularityTol) {
    throw new Error(t('solver.singularHypostatic3D'));
  }

  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = bw[i];
    for (let j = i + 1; j < n; j++) {
      sum -= a[i * n + j] * x[j];
    }
    x[i] = sum / a[i * n + i];
  }

  for (let i = 0; i < n; i++) {
    if (!isFinite(x[i])) {
      throw new Error(t('solver.invalidResult3D'));
    }
  }

  return x;
}

// ─── Internal Forces ─────────────────────────────────────────────

export function computeInternalForces3D(
  input: SolverInput3D, dofNum: DofNumbering3D, uAll: Float64Array,
): ElementForces3D[] {
  const results: ElementForces3D[] = [];

  for (const elem of input.elements.values()) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const mat = input.materials.get(elem.materialId)!;
    const sec = input.sections.get(elem.sectionId)!;
    const E_kNm2 = mat.e * 1000;
    const G_kNm2 = E_kNm2 / (2 * (1 + mat.nu));

    const localYVec = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
      : undefined;
    const axes = computeLocalAxes3D(nodeI, nodeJ, localYVec, elem.rollAngle, input.leftHand);
    const L = axes.L;

    // Collect loads on this element
    const distLoads: SolverDistributedLoad3D[] = [];
    const pointLoads: SolverPointLoad3D[] = [];
    const thermalLoads: SolverThermalLoad3D[] = [];
    for (const load of input.loads) {
      if (load.type === 'distributed' && load.data.elementId === elem.id) {
        distLoads.push(load.data);
      } else if (load.type === 'pointOnElement' && load.data.elementId === elem.id) {
        pointLoads.push(load.data);
      } else if (load.type === 'thermal' && load.data.elementId === elem.id) {
        thermalLoads.push(load.data);
      }
    }

    if (elem.type === 'frame') {
      // Get global displacements (12 DOFs)
      const uGlobal = new Float64Array(12);
      for (let d = 0; d < 6; d++) {
        uGlobal[d] = getDisplacement3D(dofNum, uAll, elem.nodeI, d);
        uGlobal[6 + d] = getDisplacement3D(dofNum, uAll, elem.nodeJ, d);
      }

      // Transform to local: u_local = T * u_global
      const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const uLocal = new Float64Array(12);
      for (let i = 0; i < 12; i++) {
        let sum = 0;
        for (let j = 0; j < 12; j++) {
          sum += T[i * 12 + j] * uGlobal[j];
        }
        uLocal[i] = sum;
      }

      // F_local = K_local * u_local
      const kLocal = frameLocalStiffness3D(E_kNm2, G_kNm2, sec.a, sec.iy, sec.iz, sec.j, L, elem.hingeStart, elem.hingeEnd);
      const fLocal = new Float64Array(12);
      for (let i = 0; i < 12; i++) {
        let sum = 0;
        for (let j = 0; j < 12; j++) {
          sum += kLocal[i * 12 + j] * uLocal[j];
        }
        fLocal[i] = sum;
      }

      // Subtract fixed-end forces from distributed loads
      for (const dl of distLoads) {
        const a = dl.a ?? 0;
        const b = dl.b ?? L;

        // Y-plane FEF
        if (Math.abs(dl.qYI) > 1e-15 || Math.abs(dl.qYJ) > 1e-15) {
          let vi0: number, mi0: number, vj0: number, mj0: number;
          if (a < 1e-10 && Math.abs(b - L) < 1e-10) {
            [vi0, mi0, vj0, mj0] = trapezoidalFEF(dl.qYI, dl.qYJ, L);
          } else {
            [vi0, mi0, vj0, mj0] = partialDistributedFEF(dl.qYI, dl.qYJ, a, b, L);
          }
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
          fLocal[1] -= vi;
          fLocal[5] -= mi;
          fLocal[7] -= vj;
          fLocal[11] -= mj;
        }

        // Z-plane FEF
        if (Math.abs(dl.qZI) > 1e-15 || Math.abs(dl.qZJ) > 1e-15) {
          let vi0: number, mi0: number, vj0: number, mj0: number;
          if (a < 1e-10 && Math.abs(b - L) < 1e-10) {
            [vi0, mi0, vj0, mj0] = trapezoidalFEF(dl.qZI, dl.qZJ, L);
          } else {
            [vi0, mi0, vj0, mj0] = partialDistributedFEF(dl.qZI, dl.qZJ, a, b, L);
          }
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
          // Sign inversion for My
          fLocal[2] -= vi;
          fLocal[4] -= -mi;
          fLocal[8] -= vj;
          fLocal[10] -= -mj;
        }
      }

      // Subtract point load FEF
      for (const pl of pointLoads) {
        if (Math.abs(pl.py) > 1e-15) {
          const [vi0, mi0, vj0, mj0] = pointFEF(pl.py, pl.a, L);
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
          fLocal[1] -= vi;
          fLocal[5] -= mi;
          fLocal[7] -= vj;
          fLocal[11] -= mj;
        }
        if (Math.abs(pl.pz) > 1e-15) {
          const [vi0, mi0, vj0, mj0] = pointFEF(pl.pz, pl.a, L);
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
          fLocal[2] -= vi;
          fLocal[4] -= -mi;
          fLocal[8] -= vj;
          fLocal[10] -= -mj;
        }
      }

      // Subtract thermal FEF
      const alpha = 1.2e-5;
      for (const tl of thermalLoads) {
        if (Math.abs(tl.dtUniform) > 1e-15) {
          const P = E_kNm2 * sec.a * alpha * tl.dtUniform;
          fLocal[0] -= (-P); // subtract FEF at I
          fLocal[6] -= P; // subtract FEF at J
        }
        if (Math.abs(tl.dtGradientZ) > 1e-15) {
          const hz = Math.sqrt(12 * sec.iz / sec.a);
          const M = E_kNm2 * sec.iz * alpha * tl.dtGradientZ / hz;
          fLocal[5] -= M; // Mz at I
          fLocal[11] -= (-M); // Mz at J
        }
        if (Math.abs(tl.dtGradientY) > 1e-15) {
          const hy = Math.sqrt(12 * sec.iy / sec.a);
          const M = E_kNm2 * sec.iy * alpha * tl.dtGradientY / hy;
          fLocal[4] -= (-M); // My at I
          fLocal[10] -= M; // My at J
        }
      }

      // Build load arrays for diagram/deformed computation
      const distributedLoadsY: Array<{ qI: number; qJ: number; a: number; b: number }> = [];
      const distributedLoadsZ: Array<{ qI: number; qJ: number; a: number; b: number }> = [];
      const pointLoadsY: Array<{ a: number; p: number }> = [];
      const pointLoadsZ: Array<{ a: number; p: number }> = [];
      let sumQYI = 0, sumQYJ = 0, sumQZI = 0, sumQZJ = 0;

      for (const dl of distLoads) {
        const a = dl.a ?? 0;
        const b = dl.b ?? L;
        if (Math.abs(dl.qYI) > 1e-15 || Math.abs(dl.qYJ) > 1e-15) {
          distributedLoadsY.push({ qI: dl.qYI, qJ: dl.qYJ, a, b });
          if (a < 1e-10 && Math.abs(b - L) < 1e-10) { sumQYI += dl.qYI; sumQYJ += dl.qYJ; }
        }
        if (Math.abs(dl.qZI) > 1e-15 || Math.abs(dl.qZJ) > 1e-15) {
          distributedLoadsZ.push({ qI: dl.qZI, qJ: dl.qZJ, a, b });
          if (a < 1e-10 && Math.abs(b - L) < 1e-10) { sumQZI += dl.qZI; sumQZJ += dl.qZJ; }
        }
      }
      for (const pl of pointLoads) {
        if (Math.abs(pl.py) > 1e-15) pointLoadsY.push({ a: pl.a, p: pl.py });
        if (Math.abs(pl.pz) > 1e-15) pointLoadsZ.push({ a: pl.a, p: pl.pz });
      }

      // Extract internal forces
      // Convention (matching 2D):
      //   N: -fLocal[0] at start, fLocal[6] at end (tension positive)
      //   Vy: fLocal[1] at start, -fLocal[7] at end
      //   Vz: fLocal[2] at start, -fLocal[8] at end
      //   Mx: fLocal[3] at start, -fLocal[9] at end (torsion)
      //   My: fLocal[4] at start, -fLocal[10] at end (weak-axis bending)
      //   Mz: fLocal[5] at start, -fLocal[11] at end (strong-axis bending)
      results.push({
        elementId: elem.id,
        length: L,
        nStart: -fLocal[0],
        nEnd: fLocal[6],
        vyStart: fLocal[1],
        vyEnd: -fLocal[7],
        vzStart: fLocal[2],
        vzEnd: -fLocal[8],
        mxStart: fLocal[3],
        mxEnd: -fLocal[9],
        myStart: fLocal[4],
        myEnd: -fLocal[10],
        mzStart: fLocal[5],
        mzEnd: -fLocal[11],
        hingeStart: elem.hingeStart,
        hingeEnd: elem.hingeEnd,
        qYI: sumQYI, qYJ: sumQYJ,
        distributedLoadsY, pointLoadsY,
        qZI: sumQZI, qZJ: sumQZJ,
        distributedLoadsZ, pointLoadsZ,
      });
    } else {
      // Truss: axial force only
      const uiGlobal = [
        getDisplacement3D(dofNum, uAll, elem.nodeI, 0),
        getDisplacement3D(dofNum, uAll, elem.nodeI, 1),
        getDisplacement3D(dofNum, uAll, elem.nodeI, 2),
      ];
      const ujGlobal = [
        getDisplacement3D(dofNum, uAll, elem.nodeJ, 0),
        getDisplacement3D(dofNum, uAll, elem.nodeJ, 1),
        getDisplacement3D(dofNum, uAll, elem.nodeJ, 2),
      ];

      // Axial deformation = projection of relative displacement onto element axis
      const delta = (ujGlobal[0] - uiGlobal[0]) * axes.ex[0]
                   + (ujGlobal[1] - uiGlobal[1]) * axes.ex[1]
                   + (ujGlobal[2] - uiGlobal[2]) * axes.ex[2];
      let N = E_kNm2 * sec.a * delta / L;

      // Subtract thermal axial force for truss
      const alpha = 1.2e-5;
      for (const tl of thermalLoads) {
        if (Math.abs(tl.dtUniform) > 1e-15) {
          N -= E_kNm2 * sec.a * alpha * tl.dtUniform;
        }
      }

      results.push({
        elementId: elem.id,
        length: L,
        nStart: N, nEnd: N,
        vyStart: 0, vyEnd: 0,
        vzStart: 0, vzEnd: 0,
        mxStart: 0, mxEnd: 0,
        myStart: 0, myEnd: 0,
        mzStart: 0, mzEnd: 0,
        hingeStart: false, hingeEnd: false,
        qYI: 0, qYJ: 0,
        distributedLoadsY: [], pointLoadsY: [],
        qZI: 0, qZJ: 0,
        distributedLoadsZ: [], pointLoadsZ: [],
      });
    }
  }

  return results;
}

// ─── Main Solver ─────────────────────────────────────────────────

export function solve3D(input: SolverInput3D): AnalysisResults3D | string {
  try {
    return solve3DInternal(input);
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
}

function solve3DInternal(input: SolverInput3D): AnalysisResults3D {
  // Validate
  if (input.nodes.size < 2) throw new Error(t('solver.minNodes'));
  if (input.elements.size < 1) throw new Error(t('solver.minElements'));
  if (input.supports.size < 1) throw new Error(t('solver.minSupports'));

  // Validate element references
  for (const elem of input.elements.values()) {
    if (!input.nodes.has(elem.nodeI) || !input.nodes.has(elem.nodeJ)) {
      throw new Error(t('solver.elemNodesNotFound').replace('{id}', String(elem.id)));
    }
    if (!input.materials.has(elem.materialId)) {
      throw new Error(t('solver.elemMaterialNotFound').replace('{id}', String(elem.id)).replace('{matId}', String(elem.materialId)));
    }
    if (!input.sections.has(elem.sectionId)) {
      throw new Error(t('solver.elemSectionNotFound').replace('{id}', String(elem.id)).replace('{secId}', String(elem.sectionId)));
    }
    const ni = input.nodes.get(elem.nodeI)!;
    const nj = input.nodes.get(elem.nodeJ)!;
    const dx = nj.x - ni.x, dy = nj.y - ni.y, dz = nj.z - ni.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 1e-10) {
      throw new Error(t('solver.elemZeroLengthById').replace('{id}', String(elem.id)));
    }
  }

  // Validate material properties
  for (const mat of input.materials.values()) {
    if (mat.e <= 0) throw new Error(t('solver.matInvalidE').replace('{id}', String(mat.id)));
  }

  // Validate sections
  for (const sec of input.sections.values()) {
    if (sec.a <= 0) throw new Error(t('solver.secInvalidA3D').replace('{id}', String(sec.id)));
    if (sec.iz <= 0) throw new Error(t('solver.secInvalidIz3D').replace('{id}', String(sec.id)));
    if (sec.iy <= 0) throw new Error(t('solver.secInvalidIy3D').replace('{id}', String(sec.id)));
    if (sec.j <= 0) throw new Error(t('solver.secInvalidJ3D').replace('{id}', String(sec.id)));
  }

  // Kinematic analysis — check for mechanisms before solving
  {
    const { degree } = computeStaticDegree3D(input);
    if (degree < 0) {
      const kinematic = analyzeKinematics3D(input);
      throw new Error(kinematic.diagnosis);
    }
    // For reasonably sized structures, run full rank analysis
    if (input.elements.size <= 500) {
      const kinematic = analyzeKinematics3D(input);
      if (!kinematic.isSolvable) {
        throw new Error(kinematic.diagnosis);
      }
    }
  }

  // DOF numbering
  const dofNum = buildDofNumbering3D(input);

  // Check for prescribed displacements
  let hasPrescribed = false;
  for (const sup of input.supports.values()) {
    const prescribed = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
    if (prescribed.some(v => v !== undefined && v !== 0)) {
      hasPrescribed = true;
      break;
    }
  }

  if (dofNum.nFree === 0 && !hasPrescribed && input.loads.length === 0) {
    throw new Error(t('solver.noFreeDofs'));
  }

  // Assemble
  const { K, F, artificialDofs, inclinedPenalty } = assemble3D(input, dofNum);

  // Build prescribed displacement vector
  const nf = dofNum.nFree;
  const nRestr = dofNum.nTotal - nf;
  const uR = new Float64Array(nRestr);

  for (const sup of input.supports.values()) {
    const prescribedVals = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
    for (let d = 0; d < dofNum.dofsPerNode; d++) {
      if (!isDofRestrained3D(sup, d)) continue;
      const val = prescribedVals[d];
      if (val !== undefined && val !== 0) {
        const gIdx = globalDof3D(dofNum, sup.nodeId, d);
        if (gIdx !== undefined && gIdx >= nf) {
          uR[gIdx - nf] = val;
        }
      }
    }
  }

  let uf: Float64Array;
  const uAll = new Float64Array(dofNum.nTotal);

  if (nf > 0) {
    // Extract Kff
    const Kff = new Float64Array(nf * nf);
    for (let i = 0; i < nf; i++) {
      for (let j = 0; j < nf; j++) {
        Kff[i * nf + j] = K[i * dofNum.nTotal + j];
      }
    }

    // Modified load: Ff = F_f - K_fr * u_r
    const Ff = new Float64Array(F.subarray(0, nf));
    for (let i = 0; i < nf; i++) {
      for (let j = 0; j < nRestr; j++) {
        Ff[i] -= K[i * dofNum.nTotal + (nf + j)] * uR[j];
      }
    }

    // Solve
    uf = choleskySolve(Kff, Ff, nf) ?? solveLU3D(Kff, Ff, nf);

    for (let i = 0; i < nf; i++) {
      uAll[i] = uf[i];
    }
  } else {
    uf = new Float64Array(0);
  }

  // Set prescribed displacements
  for (let i = 0; i < nRestr; i++) {
    uAll[nf + i] = uR[i];
  }

  // Calculate reactions: R = K_rf * u_f + K_rr * u_r - F_r
  const reactionsVec = new Float64Array(nRestr);
  for (let i = 0; i < nRestr; i++) {
    let sum = 0;
    for (let j = 0; j < nf; j++) {
      sum += K[(nf + i) * dofNum.nTotal + j] * uf[j];
    }
    for (let j = 0; j < nRestr; j++) {
      sum += K[(nf + i) * dofNum.nTotal + (nf + j)] * uR[j];
    }
    reactionsVec[i] = sum - F[nf + i];
  }

  // Check artificial DOFs
  if (artificialDofs.size > 0) {
    for (const idx of artificialDofs) {
      if (idx < nf && Math.abs(uf[idx]) > 100) {
        throw new Error(t('solver.localMechanismRotation3D'));
      }
    }
  }

  // Build results
  const displacements: Displacement3D[] = [];
  for (const nodeId of dofNum.nodeOrder) {
    displacements.push({
      nodeId,
      ux: getDisplacement3D(dofNum, uAll, nodeId, 0),
      uy: getDisplacement3D(dofNum, uAll, nodeId, 1),
      uz: getDisplacement3D(dofNum, uAll, nodeId, 2),
      rx: getDisplacement3D(dofNum, uAll, nodeId, 3),
      ry: getDisplacement3D(dofNum, uAll, nodeId, 4),
      rz: getDisplacement3D(dofNum, uAll, nodeId, 5),
    });
  }

  const reactions: Reaction3D[] = [];
  for (const sup of input.supports.values()) {
    // Check if any DOF has a spring
    const springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
    const hasAnySpring = springs.some(s => s !== undefined && s > 0);

    let fx = 0, fy = 0, fz = 0, mx = 0, my = 0, mz = 0;

    for (let d = 0; d < 6; d++) {
      const springK = springs[d];
      if (springK !== undefined && springK > 0 && d < dofNum.dofsPerNode) {
        // Spring reaction
        const u = getDisplacement3D(dofNum, uAll, sup.nodeId, d);
        const r = -springK * u;
        switch (d) {
          case 0: fx += r; break;
          case 1: fy += r; break;
          case 2: fz += r; break;
          case 3: mx += r; break;
          case 4: my += r; break;
          case 5: mz += r; break;
        }
      } else if (isDofRestrained3D(sup, d)) {
        // Rigid support reaction
        const r = getReaction3D(dofNum, reactionsVec, sup.nodeId, d);
        switch (d) {
          case 0: fx += r; break;
          case 1: fy += r; break;
          case 2: fz += r; break;
          case 3: mx += r; break;
          case 4: my += r; break;
          case 5: mz += r; break;
        }
      }
    }

    // Inclined support reaction via penalty: R = -kP * (nVec · u) * nVec
    const penaltyInfo = inclinedPenalty.get(sup.nodeId);
    if (penaltyInfo) {
      const { kP: penaltyKP, nVec: penaltyN } = penaltyInfo;
      const ux = getDisplacement3D(dofNum, uAll, sup.nodeId, 0);
      const uy = getDisplacement3D(dofNum, uAll, sup.nodeId, 1);
      const uz = getDisplacement3D(dofNum, uAll, sup.nodeId, 2);
      const dot = penaltyN[0] * ux + penaltyN[1] * uy + penaltyN[2] * uz;
      fx += -penaltyKP * dot * penaltyN[0];
      fy += -penaltyKP * dot * penaltyN[1];
      fz += -penaltyKP * dot * penaltyN[2];
    }

    const TOL = 1e-10;
    if (Math.abs(fx) > TOL || Math.abs(fy) > TOL || Math.abs(fz) > TOL ||
        Math.abs(mx) > TOL || Math.abs(my) > TOL || Math.abs(mz) > TOL) {
      reactions.push({ nodeId: sup.nodeId, fx, fy, fz, mx, my, mz });
    }
  }

  const elementForces = computeInternalForces3D(input, dofNum, uAll);

  return { displacements, reactions, elementForces };
}
