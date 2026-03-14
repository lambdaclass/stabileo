// JavaScript structural solver — TypeScript port of the Rust engine
// Direct Stiffness Method for 2D frames and trusses

import type {
  SolverInput, SolverNode, SolverSupport,
  AnalysisResults, Displacement, Reaction, ElementForces,
  SolverDistributedLoad, SolverPointLoadOnElement, SolverThermalLoad,
} from './types';
import { choleskySolve } from './matrix-utils';
import { computeStaticDegree as _computeStaticDegree, analyzeKinematics as _analyzeKinematics } from './kinematic-2d';
import { t } from '../i18n';

// ─── DOF Numbering ───────────────────────────────────────────────

export interface DofNumbering {
  /** Maps "nodeId:localDof" → globalDofIndex */
  map: Map<string, number>;
  nFree: number;
  nTotal: number;
  dofsPerNode: number;
  nodeOrder: number[];
}

function dofKey(nodeId: number, localDof: number): string {
  return `${nodeId}:${localDof}`;
}

export function buildDofNumbering(input: SolverInput): DofNumbering {
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');
  const dofsPerNode = hasFrames ? 3 : 2;

  // Sort node IDs for consistent ordering
  const nodeOrder = Array.from(input.nodes.keys()).sort((a, b) => a - b);

  const map = new Map<string, number>();
  let freeDofIdx = 0;
  const restrainedDofs: [number, number][] = [];

  // Build support lookup: nodeId → Support
  const supportByNode = new Map<number, SolverSupport>();
  for (const sup of input.supports.values()) {
    supportByNode.set(sup.nodeId, sup);
  }

  // First pass: assign free DOFs
  for (const nodeId of nodeOrder) {
    const sup = supportByNode.get(nodeId);
    for (let localDof = 0; localDof < dofsPerNode; localDof++) {
      const isRestrained = sup ? isDofRestrained(sup, localDof) : false;
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

function isDofRestrained(sup: SolverSupport, localDof: number): boolean {
  switch (sup.type) {
    case 'fixed':
      return true; // all 3 DOFs restrained
    case 'pinned':
      return localDof === 0 || localDof === 1; // ux, uy restrained
    case 'rollerX':
      return localDof === 1; // uy restrained
    case 'rollerY':
      return localDof === 0; // ux restrained
    case 'spring':
      return false; // all DOFs free (spring stiffness added to K)
    case 'inclinedRoller':
      return false; // all DOFs free (penalty stiffness couples ux,uy)
    default:
      return false;
  }
}

export function globalDof(dofNum: DofNumbering, nodeId: number, localDof: number): number | undefined {
  return dofNum.map.get(dofKey(nodeId, localDof));
}

export function elementDofs(dofNum: DofNumbering, nodeI: number, nodeJ: number): number[] {
  const dofs: number[] = [];
  for (let d = 0; d < dofNum.dofsPerNode; d++) {
    const idx = globalDof(dofNum, nodeI, d);
    if (idx !== undefined) dofs.push(idx);
  }
  for (let d = 0; d < dofNum.dofsPerNode; d++) {
    const idx = globalDof(dofNum, nodeJ, d);
    if (idx !== undefined) dofs.push(idx);
  }
  return dofs;
}

function getDisplacement(dofNum: DofNumbering, u: Float64Array, nodeId: number, localDof: number): number {
  if (localDof >= dofNum.dofsPerNode) return 0;
  const idx = globalDof(dofNum, nodeId, localDof);
  return idx !== undefined ? (u[idx] ?? 0) : 0;
}

function getReaction(dofNum: DofNumbering, r: Float64Array, nodeId: number, localDof: number): number {
  if (localDof >= dofNum.dofsPerNode) return 0;
  const idx = globalDof(dofNum, nodeId, localDof);
  if (idx === undefined || idx < dofNum.nFree) return 0;
  return r[idx - dofNum.nFree] ?? 0;
}

// ─── Element Stiffness ───────────────────────────────────────────

export function nodeDistance(a: SolverNode, b: SolverNode): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function nodeAngle(a: SolverNode, b: SolverNode): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Frame 6×6 local stiffness matrix. DOFs: [u1, v1, θ1, u2, v2, θ2] */
export function frameLocalStiffness(
  e: number, a: number, iz: number, l: number,
  hingeStart: boolean, hingeEnd: boolean
): Float64Array {
  const n = 6;
  const k = new Float64Array(n * n); // row-major

  const ea_l = e * a / l;
  const ei_l = e * iz / l;
  const ei_l2 = ei_l / l;
  const ei_l3 = ei_l2 / l;

  // Axial terms
  k[0 * n + 0] = ea_l;   k[0 * n + 3] = -ea_l;
  k[3 * n + 0] = -ea_l;  k[3 * n + 3] = ea_l;

  if (!hingeStart && !hingeEnd) {
    // Standard beam
    k[1*n+1] = 12*ei_l3;   k[1*n+2] = 6*ei_l2;   k[1*n+4] = -12*ei_l3;  k[1*n+5] = 6*ei_l2;
    k[2*n+1] = 6*ei_l2;    k[2*n+2] = 4*ei_l;     k[2*n+4] = -6*ei_l2;   k[2*n+5] = 2*ei_l;
    k[4*n+1] = -12*ei_l3;  k[4*n+2] = -6*ei_l2;   k[4*n+4] = 12*ei_l3;   k[4*n+5] = -6*ei_l2;
    k[5*n+1] = 6*ei_l2;    k[5*n+2] = 2*ei_l;     k[5*n+4] = -6*ei_l2;   k[5*n+5] = 4*ei_l;
  } else if (hingeStart && !hingeEnd) {
    k[1*n+1] = 3*ei_l3;   k[1*n+4] = -3*ei_l3;  k[1*n+5] = 3*ei_l2;
    k[4*n+1] = -3*ei_l3;  k[4*n+4] = 3*ei_l3;   k[4*n+5] = -3*ei_l2;
    k[5*n+1] = 3*ei_l2;   k[5*n+4] = -3*ei_l2;  k[5*n+5] = 3*ei_l;
  } else if (!hingeStart && hingeEnd) {
    k[1*n+1] = 3*ei_l3;   k[1*n+2] = 3*ei_l2;   k[1*n+4] = -3*ei_l3;
    k[2*n+1] = 3*ei_l2;   k[2*n+2] = 3*ei_l;    k[2*n+4] = -3*ei_l2;
    k[4*n+1] = -3*ei_l3;  k[4*n+2] = -3*ei_l2;  k[4*n+4] = 3*ei_l3;
  }
  // Both hinges: only axial stiffness (already set)

  return k;
}

/**
 * Adjust fixed-end forces for element hinges using static condensation.
 * Input: FEF for fixed-fixed beam [v_i, m_i, v_j, m_j]
 * Output: modified FEF with zero moments at hinged ends.
 *
 * Uses the condensation relationships derived from the beam stiffness matrix:
 * - hingeStart: release θ_i → M_i = 0, redistributes to V and M_j
 * - hingeEnd: release θ_j → M_j = 0, redistributes to V and M_i
 * - both: simply supported → M_i = M_j = 0
 */
function adjustFEFForHinges(
  vi: number, mi: number, vj: number, mj: number,
  L: number, hingeStart: boolean, hingeEnd: boolean,
): [number, number, number, number] {
  if (!hingeStart && !hingeEnd) return [vi, mi, vj, mj];

  if (hingeStart && hingeEnd) {
    // Both hinged (simply supported): moments zero, shears redistribute
    return [vi - (mi + mj) / L, 0, vj + (mi + mj) / L, 0];
  }

  if (hingeStart) {
    // Release moment at start using condensation ratios from K matrix
    return [
      vi - (3 / (2 * L)) * mi,
      0,
      vj + (3 / (2 * L)) * mi,
      mj - 0.5 * mi,
    ];
  }

  // hingeEnd only
  return [
    vi - (3 / (2 * L)) * mj,
    mi - 0.5 * mj,
    vj + (3 / (2 * L)) * mj,
    0,
  ];
}

/** Frame 6×6 transformation matrix */
export function frameTransformationMatrix(cos: number, sin: number): Float64Array {
  const t = new Float64Array(36);
  t[0*6+0] = cos;  t[0*6+1] = sin;
  t[1*6+0] = -sin; t[1*6+1] = cos;
  t[2*6+2] = 1;
  t[3*6+3] = cos;  t[3*6+4] = sin;
  t[4*6+3] = -sin; t[4*6+4] = cos;
  t[5*6+5] = 1;
  return t;
}

/** K_global = T^T * K_local * T (dense, row-major) */
function transformMatrix(kLocal: Float64Array, t: Float64Array, n: number): Float64Array {
  // temp = K_local * T
  const temp = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += kLocal[i * n + k] * t[k * n + j];
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
        sum += t[k * n + i] * temp[k * n + j];
      }
      kGlobal[i * n + j] = sum;
    }
  }

  return kGlobal;
}

// ─── Fixed-End Forces ────────────────────────────────────────────

/**
 * Returns [Vi, Mi, Vj, Mj] for trapezoidal distributed load.
 * q(x) = qI + (qJ - qI) * x/L   (linearly varying from qI at i to qJ at j)
 * Decomposes as uniform qI + triangular (qJ-qI) increasing from 0 to (qJ-qI).
 * Triangular load 0→q₀ fixed-end forces: Vi=3q₀L/20, Mi=q₀L²/30, Vj=7q₀L/20, Mj=-q₀L²/20
 */
function trapezoidalFixedEndForces(qI: number, qJ: number, l: number): [number, number, number, number] {
  // Uniform part (qI)
  const vu = qI * l / 2;
  const mu = qI * l * l / 12;
  // Triangular part (qJ - qI), increasing from 0 at i to (qJ-qI) at j
  const dq = qJ - qI;
  const vti = 3 * dq * l / 20;
  const mti = dq * l * l / 30;
  const vtj = 7 * dq * l / 20;
  const mtj = -dq * l * l / 20;
  return [vu + vti, mu + mti, vu + vtj, -mu + mtj];
}

/**
 * Returns [Vi, Mi, Vj, Mj] for a partial distributed load q(x) from position `a` to `b`
 * on an element of length L. q varies linearly from qI at x=a to qJ at x=b.
 * Uses composite Simpson's rule with N=20 subintervals, discretizing into point loads.
 */
function partialDistributedFEF(qI: number, qJ: number, a: number, b: number, L: number): [number, number, number, number] {
  const span = b - a;
  if (span < 1e-12) return [0, 0, 0, 0];
  // Use composite Simpson's 1/3 rule with N=20 (must be even)
  const N = 20;
  const h = span / N;
  let Vi = 0, Mi = 0, Vj = 0, Mj = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = a + t * span;
    const q = qI + (qJ - qI) * t;
    // Simpson weight: 1/3 h * (1, 4, 2, 4, 2, ..., 4, 1)
    let w: number;
    if (i === 0 || i === N) w = h / 3;
    else if (i % 2 === 1) w = 4 * h / 3;
    else w = 2 * h / 3;
    const dP = q * w;
    if (Math.abs(dP) < 1e-15) continue;
    const [vi, mi, vj, mj] = pointFixedEndForces(dP, x, L);
    Vi += vi; Mi += mi; Vj += vj; Mj += mj;
  }
  return [Vi, Mi, Vj, Mj];
}

/** Returns [Vi, Mi, Vj, Mj] for point load P at distance a from node I */
function pointFixedEndForces(p: number, a: number, l: number): [number, number, number, number] {
  const b = l - a;
  const vi = p * b * b * (3 * a + b) / (l * l * l);
  const mi = p * a * b * b / (l * l);
  const vj = p * a * a * (a + 3 * b) / (l * l * l);
  const mj = -p * a * a * b / (l * l);
  return [vi, mi, vj, mj];
}

// ─── Assembly ────────────────────────────────────────────────────

export function assemble(input: SolverInput, dofNum: DofNumbering, skipArtificialStiffness = false): { K: Float64Array; F: Float64Array; artificialDofs: Set<number>; maxDiagK: number } {
  const n = dofNum.nTotal;
  const K = new Float64Array(n * n);
  const F = new Float64Array(n);

  // Assemble element stiffness matrices
  for (const elem of input.elements.values()) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const mat = input.materials.get(elem.materialId)!;
    const sec = input.sections.get(elem.sectionId)!;

    const l = nodeDistance(nodeI, nodeJ);
    const angle = nodeAngle(nodeI, nodeJ);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const eKnM2 = mat.e * 1000; // MPa → kN/m²

    if (elem.type === 'frame') {
      const kLocal = frameLocalStiffness(eKnM2, sec.a, sec.iz, l, elem.hingeStart, elem.hingeEnd);
      const t = frameTransformationMatrix(cos, sin);
      const kGlobal = transformMatrix(kLocal, t, 6);

      const dofs = elementDofs(dofNum, elem.nodeI, elem.nodeJ);
      for (let i = 0; i < dofs.length; i++) {
        for (let j = 0; j < dofs.length; j++) {
          K[dofs[i] * n + dofs[j]] += kGlobal[i * 6 + j];
        }
      }
    } else {
      // Truss: direct 4×4 global stiffness
      const k = eKnM2 * sec.a / l;
      const c2 = cos * cos, s2 = sin * sin, cs = cos * sin;
      const kGlobal = [
        k*c2,  k*cs,  -k*c2, -k*cs,
        k*cs,  k*s2,  -k*cs, -k*s2,
        -k*c2, -k*cs, k*c2,  k*cs,
        -k*cs, -k*s2, k*cs,  k*s2,
      ];

      const diI = globalDof(dofNum, elem.nodeI, 0)!;
      const djI = globalDof(dofNum, elem.nodeI, 1)!;
      const diJ = globalDof(dofNum, elem.nodeJ, 0)!;
      const djJ = globalDof(dofNum, elem.nodeJ, 1)!;
      const dofs = [diI, djI, diJ, djJ];

      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          K[dofs[i] * n + dofs[j]] += kGlobal[i * 4 + j];
        }
      }
    }
  }

  // Assemble spring support stiffnesses (add to diagonal of K, or rotated if angle is set)
  for (const sup of input.supports.values()) {
    if (sup.type === 'spring') {
      const kx = sup.kx ?? 0;
      const ky = sup.ky ?? 0;
      const kz = sup.kz ?? 0;

      if (sup.angle !== undefined && sup.angle !== 0 && (kx > 0 || ky > 0)) {
        // Rotated spring: transform kx,ky from local to global coordinates
        // Local x-axis is at angle α from global x-axis
        // K_global = R^T * K_local * R where R is rotation matrix
        // Result: K_xx = kx·cos²α + ky·sin²α
        //         K_yy = kx·sin²α + ky·cos²α
        //         K_xy = (kx - ky)·sinα·cosα
        const alpha = sup.angle;
        const s = Math.sin(alpha), c = Math.cos(alpha);
        const Kxx = kx * c * c + ky * s * s;
        const Kyy = kx * s * s + ky * c * c;
        const Kxy = (kx - ky) * s * c;

        const ixDof = globalDof(dofNum, sup.nodeId, 0);
        const iyDof = globalDof(dofNum, sup.nodeId, 1);
        if (ixDof !== undefined) K[ixDof * n + ixDof] += Kxx;
        if (iyDof !== undefined) K[iyDof * n + iyDof] += Kyy;
        if (ixDof !== undefined && iyDof !== undefined) {
          K[ixDof * n + iyDof] += Kxy;
          K[iyDof * n + ixDof] += Kxy;
        }
      } else {
        // Axis-aligned spring: add to diagonal
        if (kx > 0) {
          const idx = globalDof(dofNum, sup.nodeId, 0);
          if (idx !== undefined) K[idx * n + idx] += kx;
        }
        if (ky > 0) {
          const idx = globalDof(dofNum, sup.nodeId, 1);
          if (idx !== undefined) K[idx * n + idx] += ky;
        }
      }
      // Rotational spring is always in global (no coupling)
      if (kz > 0 && dofNum.dofsPerNode >= 3) {
        const idx = globalDof(dofNum, sup.nodeId, 2);
        if (idx !== undefined) K[idx * n + idx] += kz;
      }
    }
  }

  // Find max diagonal stiffness for scaling (used by inclined roller penalty and artificial stiffness)
  let maxDiagK = 0;
  for (let i = 0; i < n; i++) maxDiagK = Math.max(maxDiagK, Math.abs(K[i * n + i]));

  // Assemble inclined roller support stiffnesses via penalty method.
  // An inclined roller at angle α restrains displacement perpendicular to the rolling surface.
  // Penalty stiffness P is added as a coupled spring in global DOFs:
  //   K[ux,ux] += P·sin²α,  K[uy,uy] += P·cos²α,  K[ux,uy] += P·sinα·cosα
  // If prescribed displacement di is set (decomposed into dx,dy by buildSolverInput):
  //   F[ux] += P·sinα·di_perp,  F[uy] += P·cosα·di_perp
  for (const sup of input.supports.values()) {
    if (sup.type === 'inclinedRoller' && sup.angle !== undefined) {
      const P = (maxDiagK > 0 ? maxDiagK : 1e6) * 1e6;
      const alpha = sup.angle;
      const s = Math.sin(alpha), c = Math.cos(alpha);
      const ixDof = globalDof(dofNum, sup.nodeId, 0);
      const iyDof = globalDof(dofNum, sup.nodeId, 1);
      if (ixDof !== undefined && iyDof !== undefined) {
        K[ixDof * n + ixDof] += P * s * s;
        K[iyDof * n + iyDof] += P * c * c;
        K[ixDof * n + iyDof] += P * s * c;
        K[iyDof * n + ixDof] += P * s * c;
        // Prescribed displacement: dx,dy are already decomposed from di
        // di_perp = dx*sinα + dy*cosα (reconstruct from global components)
        const diPerp = (sup.dx ?? 0) * s + (sup.dy ?? 0) * c;
        if (Math.abs(diPerp) > 1e-15) {
          F[ixDof] += P * s * diPerp;
          F[iyDof] += P * c * diPerp;
        }
      }
    }
  }

  // Add tiny rotational stiffness at nodes where ALL connected frame elements
  // are hinged at that node. This prevents a singular stiffness matrix when the
  // rotation DOF has zero stiffness (e.g., three-hinge arch crown, Gerber beam joints).
  // Only fixed supports and rotational springs provide rotational restraint.
  // The artificial stiffness is scaled relative to the maximum diagonal term
  // so it doesn't affect results but prevents numerical singularity.
  const artificialDofs = new Set<number>();
  if (dofNum.dofsPerNode >= 3 && !skipArtificialStiffness) {
    const artificialK = maxDiagK > 0 ? maxDiagK * 1e-10 : 1e-6;

    const nodeHingeCount = new Map<number, number>();
    const nodeFrameCount = new Map<number, number>();
    for (const elem of input.elements.values()) {
      if (elem.type !== 'frame') continue; // truss elements don't contribute rotation stiffness
      nodeFrameCount.set(elem.nodeI, (nodeFrameCount.get(elem.nodeI) ?? 0) + 1);
      nodeFrameCount.set(elem.nodeJ, (nodeFrameCount.get(elem.nodeJ) ?? 0) + 1);
      if (elem.hingeStart) nodeHingeCount.set(elem.nodeI, (nodeHingeCount.get(elem.nodeI) ?? 0) + 1);
      if (elem.hingeEnd) nodeHingeCount.set(elem.nodeJ, (nodeHingeCount.get(elem.nodeJ) ?? 0) + 1);
    }
    // Nodes with rotational restraint from supports (fixed or rotational spring)
    const rotRestrainedNodes = new Set<number>();
    for (const sup of input.supports.values()) {
      if (sup.type === 'fixed') rotRestrainedNodes.add(sup.nodeId);
      if (sup.type === 'spring' && sup.kz && sup.kz > 0) rotRestrainedNodes.add(sup.nodeId);
    }
    for (const [nodeId, hinges] of nodeHingeCount) {
      const frames = nodeFrameCount.get(nodeId) ?? 0;
      // All frame elements at this node are hinged AND no rotational restraint
      if (hinges >= frames && frames >= 1 && !rotRestrainedNodes.has(nodeId)) {
        const idx = globalDof(dofNum, nodeId, 2);
        if (idx !== undefined && idx < dofNum.nFree) {
          K[idx * n + idx] += artificialK;
          artificialDofs.add(idx);
        }
      }
    }
  }

  // Assemble loads
  for (const load of input.loads) {
    if (load.type === 'nodal') {
      const { nodeId, fx, fy, mz } = load.data;
      const i0 = globalDof(dofNum, nodeId, 0);
      const i1 = globalDof(dofNum, nodeId, 1);
      const i2 = globalDof(dofNum, nodeId, 2);
      if (i0 !== undefined) F[i0] += fx;
      if (i1 !== undefined) F[i1] += fy;
      if (i2 !== undefined && dofNum.dofsPerNode >= 3) F[i2] += mz;
    } else if (load.type === 'distributed') {
      assembleDistributedLoad(input, dofNum, load.data, F);
    } else if (load.type === 'pointOnElement') {
      assemblePointLoad(input, dofNum, load.data as SolverPointLoadOnElement, F);
    } else if (load.type === 'thermal') {
      assembleThermalLoad(input, dofNum, load.data as SolverThermalLoad, F);
    }
  }

  return { K, F, artificialDofs, maxDiagK };
}

function assembleDistributedLoad(
  input: SolverInput, dofNum: DofNumbering,
  load: SolverDistributedLoad, F: Float64Array,
) {
  const elem = input.elements.get(load.elementId);
  if (!elem) return;
  const nodeI = input.nodes.get(elem.nodeI)!;
  const nodeJ = input.nodes.get(elem.nodeJ)!;

  const l = nodeDistance(nodeI, nodeJ);
  const angle = nodeAngle(nodeI, nodeJ);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const a = load.a ?? 0;
  const b = load.b ?? l;
  let vi0: number, mi0: number, vj0: number, mj0: number;
  if (a < 1e-10 && Math.abs(b - l) < 1e-10) {
    [vi0, mi0, vj0, mj0] = trapezoidalFixedEndForces(load.qI, load.qJ, l);
  } else {
    [vi0, mi0, vj0, mj0] = partialDistributedFEF(load.qI, load.qJ, a, b, l);
  }
  const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);

  // Transform equivalent nodal loads to global coords
  // Perpendicular force in local → Fx, Fy in global
  const add = (nodeId: number, localDof: number, val: number) => {
    const idx = globalDof(dofNum, nodeId, localDof);
    if (idx !== undefined) F[idx] += val;
  };

  add(elem.nodeI, 0, -vi * sin);  // Fx_i
  add(elem.nodeI, 1, vi * cos);   // Fy_i
  add(elem.nodeI, 2, mi);         // Mz_i
  add(elem.nodeJ, 0, -vj * sin);  // Fx_j
  add(elem.nodeJ, 1, vj * cos);   // Fy_j
  add(elem.nodeJ, 2, mj);         // Mz_j
}

function assemblePointLoad(
  input: SolverInput, dofNum: DofNumbering,
  load: SolverPointLoadOnElement, F: Float64Array,
) {
  const elem = input.elements.get(load.elementId);
  if (!elem) return;
  const nodeI = input.nodes.get(elem.nodeI)!;
  const nodeJ = input.nodes.get(elem.nodeJ)!;

  const l = nodeDistance(nodeI, nodeJ);
  const angle = nodeAngle(nodeI, nodeJ);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const add = (nodeId: number, localDof: number, val: number) => {
    const idx = globalDof(dofNum, nodeId, localDof);
    if (idx !== undefined) F[idx] += val;
  };

  // 1) Perpendicular force component (existing behavior)
  if (Math.abs(load.p) > 1e-15) {
    const [vi0, mi0, vj0, mj0] = pointFixedEndForces(load.p, load.a, l);
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);

    // Perpendicular force → global coords
    add(elem.nodeI, 0, -vi * sin);
    add(elem.nodeI, 1, vi * cos);
    add(elem.nodeI, 2, mi);
    add(elem.nodeJ, 0, -vj * sin);
    add(elem.nodeJ, 1, vj * cos);
    add(elem.nodeJ, 2, mj);
  }

  // 2) Axial force component: distribute to nodes by lever arm (no bending)
  // For axial point load Px at distance a from I:
  //   Node J gets Px * a/L (axial), Node I gets Px * (L-a)/L (axial)
  const px = load.px ?? 0;
  if (Math.abs(px) > 1e-15) {
    const fi = px * (l - load.a) / l; // axial force at I (local)
    const fj = px * load.a / l;       // axial force at J (local)
    // Transform local axial → global: axial = (+cos, +sin) direction
    add(elem.nodeI, 0, fi * cos);
    add(elem.nodeI, 1, fi * sin);
    add(elem.nodeJ, 0, fj * cos);
    add(elem.nodeJ, 1, fj * sin);
  }

  // 3) Concentrated moment: distribute to nodes using beam FEF
  // For concentrated moment M at distance a from I:
  //   Vi = -6M*a*b / L^3, Mi = M*b*(2a-b)/L^2
  //   Vj =  6M*a*b / L^3, Mj = M*a*(2b-a)/L^2
  // where b = L - a
  const mz = load.mz ?? 0;
  if (Math.abs(mz) > 1e-15) {
    const a = load.a;
    const b = l - a;
    const vi0 = -6 * mz * a * b / (l * l * l);
    const mi0 = mz * b * (2 * a - b) / (l * l);
    const vj0 = 6 * mz * a * b / (l * l * l);
    const mj0 = mz * a * (2 * b - a) / (l * l);
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);

    // Transform shear to global coords, moments stay as-is
    add(elem.nodeI, 0, -vi * sin);
    add(elem.nodeI, 1, vi * cos);
    add(elem.nodeI, 2, mi);
    add(elem.nodeJ, 0, -vj * sin);
    add(elem.nodeJ, 1, vj * cos);
    add(elem.nodeJ, 2, mj);
  }
}

/**
 * Assemble thermal load equivalent nodal forces.
 * Thermal expansion coefficient α is assumed 1.2e-5 /°C (steel).
 * Uniform ΔT → axial forces: N = E*A*α*ΔT (compression at both ends)
 * Gradient ΔT/h → bending moments: M = E*I*α*ΔT_gradient/h (requires section height)
 */
function assembleThermalLoad(
  input: SolverInput, dofNum: DofNumbering,
  load: SolverThermalLoad, F: Float64Array,
) {
  const elem = input.elements.get(load.elementId);
  if (!elem) return;
  const nodeI = input.nodes.get(elem.nodeI)!;
  const nodeJ = input.nodes.get(elem.nodeJ)!;
  const mat = input.materials.get(elem.materialId)!;
  const sec = input.sections.get(elem.sectionId)!;

  const l = nodeDistance(nodeI, nodeJ);
  const angle = nodeAngle(nodeI, nodeJ);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const eKnM2 = mat.e * 1000; // MPa → kN/m²
  const alpha = 1.2e-5; // /°C (steel thermal expansion coefficient)

  const add = (nodeId: number, localDof: number, val: number) => {
    const idx = globalDof(dofNum, nodeId, localDof);
    if (idx !== undefined) F[idx] += val;
  };

  // Uniform temperature change → axial force
  // Fixed-end force: N_thermal = E*A*α*ΔT (equivalent axial forces at nodes)
  if (Math.abs(load.dtUniform) > 1e-10) {
    const nTherm = eKnM2 * sec.a * alpha * load.dtUniform;
    // Equivalent nodal forces in local axial direction (push outward for expansion)
    // Local: [+N at i, -N at j] → transform to global
    add(elem.nodeI, 0, nTherm * cos);
    add(elem.nodeI, 1, nTherm * sin);
    add(elem.nodeJ, 0, -nTherm * cos);
    add(elem.nodeJ, 1, -nTherm * sin);
  }

  // Temperature gradient → bending moments
  // M_thermal = E*I*α*ΔT_gradient/h
  // For frame elements, estimate h from section (use sqrt(12*Iz/A) if h not available)
  if (Math.abs(load.dtGradient) > 1e-10 && elem.type === 'frame') {
    const h = sec.a > 1e-15 ? Math.sqrt(12 * sec.iz / sec.a) : 0.1; // approximate section height
    const mTherm = eKnM2 * sec.iz * alpha * load.dtGradient / h;
    // Equal and opposite moments at both ends (bending the beam)
    // Adjust for hinges: thermal gradient FEF = [0, mTherm, 0, -mTherm]
    const [, mi, , mj] = adjustFEFForHinges(0, mTherm, 0, -mTherm, l, elem.hingeStart, elem.hingeEnd);
    add(elem.nodeI, 2, mi);
    add(elem.nodeJ, 2, mj);
  }
}

// ─── LU Solver ───────────────────────────────────────────────────

/** Solve A*x = b using LU decomposition with partial pivoting */
export function solveLU(A: Float64Array, b: Float64Array, n: number): Float64Array {
  // Copy A and b (we modify in-place)
  const a = new Float64Array(A);
  const bw = new Float64Array(b);

  // Track maximum diagonal magnitude for relative singularity check.
  // Structural stiffness matrices can have values spanning many orders of magnitude
  // (e.g., axial stiffness ~1e8 vs rotation stiffness ~1e4), so an absolute
  // threshold like 1e-10 is unreliable. A relative threshold catches true
  // zero-stiffness DOFs regardless of the overall stiffness magnitude.
  let maxDiag = 0;
  for (let i = 0; i < n; i++) {
    maxDiag = Math.max(maxDiag, Math.abs(A[i * n + i]));
  }
  const singularityTol = Math.max(1e-10, maxDiag * 1e-12);

  // Forward elimination with partial pivoting
  for (let k = 0; k < n - 1; k++) {
    // Find pivot
    let maxVal = Math.abs(a[k * n + k]);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(a[i * n + k]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = i;
      }
    }

    if (maxVal < singularityTol) {
      throw new Error(t('solver.singularMatrix'));
    }

    // Swap rows
    if (maxRow !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = a[k * n + j];
        a[k * n + j] = a[maxRow * n + j];
        a[maxRow * n + j] = tmp;
      }
      const tmp = bw[k];
      bw[k] = bw[maxRow];
      bw[maxRow] = tmp;
    }

    // Elimination
    for (let i = k + 1; i < n; i++) {
      const factor = a[i * n + k] / a[k * n + k];
      for (let j = k + 1; j < n; j++) {
        a[i * n + j] -= factor * a[k * n + j];
      }
      bw[i] -= factor * bw[k];
    }
  }

  // Check last diagonal
  if (Math.abs(a[(n - 1) * n + (n - 1)]) < singularityTol) {
    throw new Error(t('solver.singularHypostatic'));
  }

  // Back substitution
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = bw[i];
    for (let j = i + 1; j < n; j++) {
      sum -= a[i * n + j] * x[j];
    }
    x[i] = sum / a[i * n + i];
  }

  // Check for NaN/Inf
  for (let i = 0; i < n; i++) {
    if (!isFinite(x[i])) {
      throw new Error(t('solver.invalidResult'));
    }
  }

  return x;
}

// ─── Post-Processing ─────────────────────────────────────────────

export function computeInternalForces(
  input: SolverInput, dofNum: DofNumbering, uAll: Float64Array,
): ElementForces[] {
  const results: ElementForces[] = [];

  for (const elem of input.elements.values()) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const mat = input.materials.get(elem.materialId)!;
    const sec = input.sections.get(elem.sectionId)!;

    const l = nodeDistance(nodeI, nodeJ);
    const angle = nodeAngle(nodeI, nodeJ);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const eKnM2 = mat.e * 1000;

    // Find loads on this element
    const distLoadsOnElem: Array<{ qI: number; qJ: number; a: number; b: number }> = [];
    const pointLoadsOnElem: Array<{ a: number; p: number; px?: number; mz?: number }> = [];
    let thermalUniform = 0, thermalGradient = 0;
    for (const load of input.loads) {
      if (load.type === 'distributed' && load.data.elementId === elem.id) {
        const dl = load.data as SolverDistributedLoad;
        distLoadsOnElem.push({ qI: dl.qI, qJ: dl.qJ, a: dl.a ?? 0, b: dl.b ?? l });
      } else if (load.type === 'pointOnElement' && (load.data as SolverPointLoadOnElement).elementId === elem.id) {
        const pl = load.data as SolverPointLoadOnElement;
        pointLoadsOnElem.push({ a: pl.a, p: pl.p, px: pl.px, mz: pl.mz });
      } else if (load.type === 'thermal' && (load.data as SolverThermalLoad).elementId === elem.id) {
        const tl = load.data as SolverThermalLoad;
        thermalUniform += tl.dtUniform;
        thermalGradient += tl.dtGradient;
      }
    }

    if (elem.type === 'frame') {
      // Get global displacements
      const uGlobal = new Float64Array(6);
      for (let d = 0; d < 3; d++) {
        uGlobal[d] = getDisplacement(dofNum, uAll, elem.nodeI, d);
        uGlobal[3 + d] = getDisplacement(dofNum, uAll, elem.nodeJ, d);
      }

      // Transform to local: u_local = T * u_global
      const t = frameTransformationMatrix(cos, sin);
      const uLocal = new Float64Array(6);
      for (let i = 0; i < 6; i++) {
        let sum = 0;
        for (let j = 0; j < 6; j++) {
          sum += t[i * 6 + j] * uGlobal[j];
        }
        uLocal[i] = sum;
      }

      // F_local = K_local * u_local
      const kLocal = frameLocalStiffness(eKnM2, sec.a, sec.iz, l, elem.hingeStart, elem.hingeEnd);
      const fLocal = new Float64Array(6);
      for (let i = 0; i < 6; i++) {
        let sum = 0;
        for (let j = 0; j < 6; j++) {
          sum += kLocal[i * 6 + j] * uLocal[j];
        }
        fLocal[i] = sum;
      }

      // Add fixed-end member forces from distributed loads.
      // Each distributed load is handled individually (supports partial loads with a/b).
      // trapezoidalFixedEndForces returns CONSISTENT NODAL LOADS (same direction as load).
      // The fixed-end member forces are their NEGATIVES (Newton's 3rd law):
      //   F_member = K_local * u_local - F_consistent
      // Adjusted for hinges using static condensation (same as assembly).
      for (const dl of distLoadsOnElem) {
        if (Math.abs(dl.qI) < 1e-10 && Math.abs(dl.qJ) < 1e-10) continue;
        let vi0: number, mi0: number, vj0: number, mj0: number;
        if (dl.a < 1e-10 && Math.abs(dl.b - l) < 1e-10) {
          [vi0, mi0, vj0, mj0] = trapezoidalFixedEndForces(dl.qI, dl.qJ, l);
        } else {
          [vi0, mi0, vj0, mj0] = partialDistributedFEF(dl.qI, dl.qJ, dl.a, dl.b, l);
        }
        const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);
        fLocal[1] -= vi;
        fLocal[2] -= mi;
        fLocal[4] -= vj;
        fLocal[5] -= mj;
      }

      // Subtract point load fixed-end forces (adjusted for hinges)
      for (const pl of pointLoadsOnElem) {
        // Perpendicular component
        if (Math.abs(pl.p) > 1e-15) {
          const [vi0, mi0, vj0, mj0] = pointFixedEndForces(pl.p, pl.a, l);
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);
          fLocal[1] -= vi;
          fLocal[2] -= mi;
          fLocal[4] -= vj;
          fLocal[5] -= mj;
        }
        // Axial component: simple lever arm distribution (no bending)
        const plPx = pl.px ?? 0;
        if (Math.abs(plPx) > 1e-15) {
          fLocal[0] -= plPx * (l - pl.a) / l;
          fLocal[3] -= plPx * pl.a / l;
        }
        // Moment component
        const plMz = pl.mz ?? 0;
        if (Math.abs(plMz) > 1e-15) {
          const a = pl.a, b = l - pl.a;
          const vi0 = -6 * plMz * a * b / (l * l * l);
          const mi0 = plMz * b * (2 * a - b) / (l * l);
          const vj0 = 6 * plMz * a * b / (l * l * l);
          const mj0 = plMz * a * (2 * b - a) / (l * l);
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);
          fLocal[1] -= vi;
          fLocal[2] -= mi;
          fLocal[4] -= vj;
          fLocal[5] -= mj;
        }
      }

      // Subtract thermal equivalent nodal forces (adjusted for hinges)
      const alpha = 1.2e-5;
      if (Math.abs(thermalUniform) > 1e-10) {
        const nTherm = eKnM2 * sec.a * alpha * thermalUniform;
        fLocal[0] -= nTherm;   // axial force at node I (local)
        fLocal[3] -= -nTherm;  // axial force at node J (local, opposite)
      }
      if (Math.abs(thermalGradient) > 1e-10) {
        const h = Math.sqrt(12 * sec.iz / sec.a);
        const mTherm = eKnM2 * sec.iz * alpha * thermalGradient / h;
        const [, miAdj, , mjAdj] = adjustFEFForHinges(0, mTherm, 0, -mTherm, l, elem.hingeStart, elem.hingeEnd);
        fLocal[2] -= miAdj;
        fLocal[5] -= mjAdj;
      }

      // Compute legacy qI/qJ (sum of full-length loads only, for backward compat)
      let qILegacy = 0, qJLegacy = 0;
      for (const dl of distLoadsOnElem) {
        if (dl.a < 1e-10 && Math.abs(dl.b - l) < 1e-10) {
          qILegacy += dl.qI;
          qJLegacy += dl.qJ;
        }
      }

      // Extract internal forces (same convention as Rust)
      results.push({
        elementId: elem.id,
        nStart: -fLocal[0],
        nEnd: fLocal[3],
        vStart: fLocal[1],
        vEnd: -fLocal[4],
        mStart: fLocal[2],
        mEnd: -fLocal[5],
        length: l,
        qI: qILegacy,
        qJ: qJLegacy,
        pointLoads: pointLoadsOnElem,
        distributedLoads: distLoadsOnElem,
        hingeStart: elem.hingeStart,
        hingeEnd: elem.hingeEnd,
      });
    } else {
      // Truss: axial force only
      const uiX = getDisplacement(dofNum, uAll, elem.nodeI, 0);
      const uiY = getDisplacement(dofNum, uAll, elem.nodeI, 1);
      const ujX = getDisplacement(dofNum, uAll, elem.nodeJ, 0);
      const ujY = getDisplacement(dofNum, uAll, elem.nodeJ, 1);

      const delta = (ujX - uiX) * cos + (ujY - uiY) * sin;
      let N = eKnM2 * sec.a * delta / l;
      // Subtract thermal axial force for truss
      if (Math.abs(thermalUniform) > 1e-10) {
        const alpha = 1.2e-5;
        N -= eKnM2 * sec.a * alpha * thermalUniform;
      }

      results.push({
        elementId: elem.id,
        nStart: N,
        nEnd: N,
        vStart: 0,
        vEnd: 0,
        mStart: 0,
        mEnd: 0,
        length: l,
        qI: 0,
        qJ: 0,
        pointLoads: [],
        distributedLoads: [],
        hingeStart: false,
        hingeEnd: false,
      });
    }
  }

  return results;
}

// ─── Main Solver ─────────────────────────────────────────────────

export function solve(input: SolverInput): AnalysisResults {
  // Validate
  if (input.nodes.size < 2) throw new Error(t('solver.minNodes'));
  if (input.elements.size < 1) throw new Error(t('solver.minElements'));
  if (input.supports.size < 1) throw new Error(t('solver.minSupports'));

  // Validate all element nodes exist and geometry is valid
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
    // Check for zero-length elements
    const ni = input.nodes.get(elem.nodeI)!;
    const nj = input.nodes.get(elem.nodeJ)!;
    const L = nodeDistance(ni, nj);
    if (L < 1e-10) {
      throw new Error(t('solver.elemZeroLength').replace('{id}', String(elem.id)).replace('{nodeI}', String(elem.nodeI)).replace('{nodeJ}', String(elem.nodeJ)));
    }
  }

  // Validate material properties
  for (const mat of input.materials.values()) {
    if (mat.e <= 0) {
      throw new Error(t('solver.matInvalidE').replace('{id}', String(mat.id)));
    }
  }

  // Validate section properties
  for (const sec of input.sections.values()) {
    if (sec.a <= 0) {
      throw new Error(t('solver.secInvalidA').replace('{id}', String(sec.id)).replace('{name}', sec.name));
    }
    if (sec.iz <= 0) {
      throw new Error(t('solver.secInvalidIz').replace('{id}', String(sec.id)).replace('{name}', sec.name));
    }
  }

  // Validate point loads on elements
  for (const load of input.loads) {
    if (load.type === 'pointOnElement') {
      const pl = load.data as SolverPointLoadOnElement;
      const elem = input.elements.get(pl.elementId);
      if (elem) {
        const ni = input.nodes.get(elem.nodeI)!;
        const nj = input.nodes.get(elem.nodeJ)!;
        const L = nodeDistance(ni, nj);
        if (pl.a < 0 || pl.a > L) {
          throw new Error(t('solver.pointLoadOutOfRange').replace('{elemId}', String(pl.elementId)).replace('{a}', pl.a.toFixed(3)).replace('{L}', L.toFixed(3)));
        }
      }
    }
  }

  // ── Kinematic check: detect nodes that are true mechanisms ──
  // Instead of a global DOF count (which produces false positives for discretized
  // arches/beams), check each node individually for mechanism conditions:
  // A node is a mechanism if ALL connected frame elements have hinges at that node
  // AND the node has no rotational support AND the resulting DOF configuration
  // cannot resist load (e.g., all double-hinged elements = zero bending stiffness).
  // The collinear check is already done in model store validation.
  // Here we check for the case where ALL elements at a node are double-hinged
  // (both ends), meaning the node has NO stiffness at all in any DOF except
  // through artificial stiffness. This catches parallelogram-type mechanisms.
  {
    const nodeFrameCount = new Map<number, number>();
    const nodeDoubleHingeCount = new Map<number, number>();
    const nodeHingeCount = new Map<number, number>();
    for (const elem of input.elements.values()) {
      if (elem.type !== 'frame') continue;
      nodeFrameCount.set(elem.nodeI, (nodeFrameCount.get(elem.nodeI) ?? 0) + 1);
      nodeFrameCount.set(elem.nodeJ, (nodeFrameCount.get(elem.nodeJ) ?? 0) + 1);
      if (elem.hingeStart && elem.hingeEnd) {
        // Double-hinged element: only axial, no shear or moment
        nodeDoubleHingeCount.set(elem.nodeI, (nodeDoubleHingeCount.get(elem.nodeI) ?? 0) + 1);
        nodeDoubleHingeCount.set(elem.nodeJ, (nodeDoubleHingeCount.get(elem.nodeJ) ?? 0) + 1);
      }
      if (elem.hingeStart) nodeHingeCount.set(elem.nodeI, (nodeHingeCount.get(elem.nodeI) ?? 0) + 1);
      if (elem.hingeEnd) nodeHingeCount.set(elem.nodeJ, (nodeHingeCount.get(elem.nodeJ) ?? 0) + 1);
    }
    const supportedNodes = new Map<number, string>();
    for (const sup of input.supports.values()) {
      supportedNodes.set(sup.nodeId, sup.type);
    }
    for (const [nodeId, frames] of nodeFrameCount) {
      const doubleHinged = nodeDoubleHingeCount.get(nodeId) ?? 0;
      const hinges = nodeHingeCount.get(nodeId) ?? 0;
      const supType = supportedNodes.get(nodeId);
      // Case 1: ALL elements at unsupported node are double-hinged (only axial)
      // → node has zero transverse stiffness → mechanism
      if (doubleHinged >= frames && frames >= 2 && !supType) {
        throw new Error(
          t('solver.mechanismAllDoubleHinged').replace('{nodeId}', String(nodeId)).replace('{frames}', String(frames))
        );
      }
      // Case 2: ALL elements hinged at this node AND at least one is double-hinged.
      // A double-hinged element only transmits axial force (zero shear/moment).
      // If all other elements are also hinged at this node, the node has no moment
      // resistance AND reduced transverse stiffness → mechanism.
      // (Does NOT trigger for pure pin joints like three-hinge arches where
      //  doubleHinged=0 — those are valid and handled by artificial stiffness.)
      const hasRotSupport = supType === 'fixed' || supType === 'spring';
      if (hinges >= frames && frames >= 2 && doubleHinged > 0 && !hasRotSupport) {
        throw new Error(
          t('solver.mechanismHingedNode').replace('{nodeId}', String(nodeId)).replace('{frames}', String(frames)).replace('{doubleHinged}', String(doubleHinged))
        );
      }
    }
  }

  // ── Kinematic analysis: degree formula + rank check ──
  // The degree formula catches topological hypostaticity.
  // The rank analysis catches geometric instability that the formula misses.
  {
    const { degree } = _computeStaticDegree(input);
    if (degree < 0) {
      const kinematic = _analyzeKinematics(input);
      throw new Error(kinematic.diagnosis);
    }
    // For degree >= 0, still check for geometric instability via rank analysis.
    // This catches cases where the formula says OK but geometry is degenerate.
    // Only run for structures up to ~500 elements to keep solve fast.
    if (input.elements.size <= 500) {
      const kinematic = _analyzeKinematics(input);
      if (!kinematic.isSolvable) {
        throw new Error(kinematic.diagnosis);
      }
    }
  }

  // Number DOFs
  const dofNum = buildDofNumbering(input);

  // Check if there are any prescribed non-zero displacements
  let hasPrescribed = false;
  for (const sup of input.supports.values()) {
    if (sup.type !== 'spring' && sup.type !== 'inclinedRoller') {
      if ((sup.dx && sup.dx !== 0) || (sup.dy && sup.dy !== 0) || (sup.drz && sup.drz !== 0)) {
        hasPrescribed = true;
        break;
      }
    }
    // Inclined rollers: prescribed displacement is decomposed into dx/dy by buildSolverInput
    if (sup.type === 'inclinedRoller') {
      if ((sup.dx && sup.dx !== 0) || (sup.dy && sup.dy !== 0)) {
        hasPrescribed = true;
        break;
      }
    }
  }

  if (dofNum.nFree === 0 && !hasPrescribed && input.loads.length === 0) {
    throw new Error(t('solver.noFreeDofs'));
  }

  // Assemble
  const { K, F, artificialDofs, maxDiagK } = assemble(input, dofNum);

  // Build prescribed displacement vector for restrained DOFs (u_r)
  const nf = dofNum.nFree;
  const nRestr = dofNum.nTotal - nf;
  const uR = new Float64Array(nRestr); // prescribed displacements (0 by default)

  // Build support lookup for prescribed displacements
  const supportByNode = new Map<number, typeof input.supports extends Map<any, infer V> ? V : never>();
  for (const sup of input.supports.values()) {
    supportByNode.set(sup.nodeId, sup);
  }

  // Fill in prescribed displacements
  for (const sup of input.supports.values()) {
    if (sup.type === 'spring') continue; // spring DOFs are free
    const prescribedDofs: [number, number | undefined][] = [];
    if (isDofRestrained(sup, 0)) prescribedDofs.push([0, sup.dx]);
    if (isDofRestrained(sup, 1)) prescribedDofs.push([1, sup.dy]);
    if (dofNum.dofsPerNode >= 3 && isDofRestrained(sup, 2)) prescribedDofs.push([2, sup.drz]);

    for (const [localDof, value] of prescribedDofs) {
      if (value !== undefined && value !== 0) {
        const gIdx = globalDof(dofNum, sup.nodeId, localDof);
        if (gIdx !== undefined && gIdx >= nf) {
          uR[gIdx - nf] = value;
        }
      }
    }
  }

  let uf: Float64Array;
  const uAll = new Float64Array(dofNum.nTotal);

  if (nf > 0) {
    // Extract free-free partition
    const Kff = new Float64Array(nf * nf);
    for (let i = 0; i < nf; i++) {
      for (let j = 0; j < nf; j++) {
        Kff[i * nf + j] = K[i * dofNum.nTotal + j];
      }
    }

    // Modified load: F_f_mod = F_f - K_fr * u_r
    const Ff = new Float64Array(F.subarray(0, nf));
    for (let i = 0; i < nf; i++) {
      for (let j = 0; j < nRestr; j++) {
        Ff[i] -= K[i * dofNum.nTotal + (nf + j)] * uR[j];
      }
    }

    // Solve — Cholesky (faster for SPD) with LU fallback
    uf = choleskySolve(Kff, Ff, nf) ?? solveLU(Kff, Ff, nf);

    for (let i = 0; i < nf; i++) {
      uAll[i] = uf[i];
    }
  } else {
    uf = new Float64Array(0);
  }

  // Set prescribed displacements for restrained DOFs
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

  // Check artificial DOFs for absurd rotations (mechanism masked by artificial stiffness)
  if (artificialDofs.size > 0) {
    for (const idx of artificialDofs) {
      if (idx < nf && Math.abs(uf[idx]) > 100) {
        throw new Error(t('solver.localMechanismRotation'));
      }
    }
  }

  // Post-solve instability check: detect near-mechanisms via unreasonable displacements.
  // If artificial rotational stiffness allowed the solve to succeed but the structure
  // has a local mechanism (e.g., all-hinged rectangular panel), displacements will be
  // orders of magnitude larger than the structure size.
  {
    let maxSpan = 0;
    const nodesArr = Array.from(input.nodes.values());
    for (let i = 0; i < nodesArr.length; i++) {
      for (let j = i + 1; j < nodesArr.length; j++) {
        const d = Math.hypot(nodesArr[j].x - nodesArr[i].x, nodesArr[j].y - nodesArr[i].y);
        if (d > maxSpan) maxSpan = d;
      }
    }
    if (maxSpan < 1e-6) maxSpan = 1; // fallback for degenerate geometry

    let maxDisp = 0;
    for (let i = 0; i < nf; i++) {
      const val = Math.abs(uAll[i]);
      if (val > maxDisp) maxDisp = val;
    }

    // If max displacement exceeds 10× the structure span, it's a near-mechanism
    if (maxDisp > 10 * maxSpan) {
      throw new Error(t('solver.localMechanismDisplacement'));
    }
  }

  // Build results
  const displacements: Displacement[] = [];
  for (const nodeId of dofNum.nodeOrder) {
    displacements.push({
      nodeId,
      ux: getDisplacement(dofNum, uAll, nodeId, 0),
      uy: getDisplacement(dofNum, uAll, nodeId, 1),
      rz: getDisplacement(dofNum, uAll, nodeId, 2),
    });
  }

  const reactions: Reaction[] = [];
  for (const sup of input.supports.values()) {
    if (sup.type === 'spring') {
      // Spring reaction = force the spring exerts on the structure (restoring force)
      // R = -k * u: when node moves down (u<0), spring pushes up (R>0)
      // Same sign convention as rigid support reactions (positive = upward/rightward)
      const ux = getDisplacement(dofNum, uAll, sup.nodeId, 0);
      const uy = getDisplacement(dofNum, uAll, sup.nodeId, 1);
      const rz = getDisplacement(dofNum, uAll, sup.nodeId, 2);
      const kx = sup.kx ?? 0;
      const ky = sup.ky ?? 0;
      const kzStiff = sup.kz ?? 0;
      let rx: number, ry: number;
      if (sup.angle !== undefined && sup.angle !== 0 && (kx > 0 || ky > 0)) {
        // Rotated spring: compute reaction using rotated stiffness matrix
        const alpha = sup.angle;
        const s = Math.sin(alpha), c = Math.cos(alpha);
        const Kxx = kx * c * c + ky * s * s;
        const Kyy = kx * s * s + ky * c * c;
        const Kxy = (kx - ky) * s * c;
        rx = -(Kxx * ux + Kxy * uy);
        ry = -(Kxy * ux + Kyy * uy);
      } else {
        rx = -kx * ux;
        ry = -ky * uy;
      }
      const mz = -kzStiff * rz;
      if (Math.abs(rx) > 1e-10 || Math.abs(ry) > 1e-10 || Math.abs(mz) > 1e-10) {
        reactions.push({ nodeId: sup.nodeId, rx, ry, mz });
      }
    } else if (sup.type === 'inclinedRoller') {
      // Inclined roller reaction via penalty method:
      // Reaction = -P * (u_perp - di_perp) in the restrained direction.
      const ux = getDisplacement(dofNum, uAll, sup.nodeId, 0);
      const uy = getDisplacement(dofNum, uAll, sup.nodeId, 1);
      const alpha = sup.angle ?? 0;
      const s = Math.sin(alpha), c = Math.cos(alpha);
      const P = (maxDiagK > 0 ? maxDiagK : 1e6) * 1e6;
      // Displacement in restrained direction (perpendicular to rolling surface)
      const uPerp = ux * s + uy * c;
      // Prescribed displacement in restrained direction (dx,dy decomposed from di)
      const diPerp = (sup.dx ?? 0) * s + (sup.dy ?? 0) * c;
      // Reaction decomposed to global axes
      const rx = -P * s * (uPerp - diPerp);
      const ry = -P * c * (uPerp - diPerp);
      if (Math.abs(rx) > 1e-10 || Math.abs(ry) > 1e-10) {
        reactions.push({ nodeId: sup.nodeId, rx, ry, mz: 0 });
      }
    } else {
      const rx = getReaction(dofNum, reactionsVec, sup.nodeId, 0);
      const ry = getReaction(dofNum, reactionsVec, sup.nodeId, 1);
      const mz = getReaction(dofNum, reactionsVec, sup.nodeId, 2);
      if (Math.abs(rx) > 1e-10 || Math.abs(ry) > 1e-10 || Math.abs(mz) > 1e-10) {
        reactions.push({ nodeId: sup.nodeId, rx, ry, mz });
      }
    }
  }

  const elementForces = computeInternalForces(input, dofNum, uAll);

  return { displacements, reactions, elementForces };
}

// ─── Kinematic Analysis (re-exported from kinematic-2d.ts) ──────
// Extracted to kinematic-2d.ts for modularity. Re-exported here for backward compatibility.
export { computeStaticDegree, analyzeKinematics, type KinematicResult } from './kinematic-2d';
