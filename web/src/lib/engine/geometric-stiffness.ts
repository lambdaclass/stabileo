// Geometric stiffness matrix for P-Delta and buckling analysis
// Przemieniecki formulation

import type { SolverInput, ElementForces } from './types';
import {
  type DofNumbering,
  nodeDistance, nodeAngle, elementDofs,
  frameTransformationMatrix,
} from './solver-js';

/**
 * Frame geometric stiffness in local coords (6×6).
 * DOFs: [u1, v1, θ1, u2, v2, θ2]
 * N = axial force (positive = tension)
 * L = element length
 */
export function frameGeometricStiffness(N: number, L: number): Float64Array {
  const n = 6;
  const kg = new Float64Array(n * n);
  const c = N / (30 * L);

  // Przemieniecki consistent geometric stiffness
  //       v1        θ1        v2        θ2
  // v1:   36        3L       -36        3L
  // θ1:   3L        4L²      -3L       -L²
  // v2:  -36       -3L        36       -3L
  // θ2:   3L       -L²       -3L        4L²

  const L2 = L * L;

  // Transverse terms
  kg[1*n+1] =  36*c;      kg[1*n+2] =  3*L*c;    kg[1*n+4] = -36*c;     kg[1*n+5] =  3*L*c;
  kg[2*n+1] =  3*L*c;     kg[2*n+2] =  4*L2*c;   kg[2*n+4] = -3*L*c;    kg[2*n+5] = -L2*c;
  kg[4*n+1] = -36*c;      kg[4*n+2] = -3*L*c;    kg[4*n+4] =  36*c;     kg[4*n+5] = -3*L*c;
  kg[5*n+1] =  3*L*c;     kg[5*n+2] = -L2*c;     kg[5*n+4] = -3*L*c;    kg[5*n+5] =  4*L2*c;

  return kg;
}

/**
 * Truss geometric stiffness in local coords (4×4).
 * DOFs: [u1, v1, u2, v2]
 * N = axial force (positive = tension)
 * L = element length
 */
export function trussGeometricStiffness(N: number, L: number): Float64Array {
  const n = 4;
  const kg = new Float64Array(n * n);
  const c = N / L;

  // Only transverse terms
  //       v1    v2
  // v1:    1    -1
  // v2:   -1     1
  kg[1*n+1] =  c;
  kg[1*n+3] = -c;
  kg[3*n+1] = -c;
  kg[3*n+3] =  c;

  return kg;
}

/** Transform local element matrix to global: Kg_global = Tᵀ · Kg_local · T */
function transformToGlobal(kgLocal: Float64Array, cos: number, sin: number, ndof: number): Float64Array {
  let T: Float64Array;
  if (ndof === 6) {
    T = frameTransformationMatrix(cos, sin);
  } else {
    // 4×4 truss transformation
    T = new Float64Array(16);
    T[0*4+0] = cos;  T[0*4+1] = sin;
    T[1*4+0] = -sin; T[1*4+1] = cos;
    T[2*4+2] = cos;  T[2*4+3] = sin;
    T[3*4+2] = -sin; T[3*4+3] = cos;
  }

  // temp = Kg_local · T
  const temp = new Float64Array(ndof * ndof);
  for (let i = 0; i < ndof; i++) {
    for (let j = 0; j < ndof; j++) {
      let sum = 0;
      for (let k = 0; k < ndof; k++) sum += kgLocal[i * ndof + k] * T[k * ndof + j];
      temp[i * ndof + j] = sum;
    }
  }

  // Kg_global = Tᵀ · temp
  const kgGlobal = new Float64Array(ndof * ndof);
  for (let i = 0; i < ndof; i++) {
    for (let j = 0; j < ndof; j++) {
      let sum = 0;
      for (let k = 0; k < ndof; k++) sum += T[k * ndof + i] * temp[k * ndof + j];
      kgGlobal[i * ndof + j] = sum;
    }
  }

  return kgGlobal;
}

/**
 * Assemble the global geometric stiffness matrix Kg (nFree × nFree).
 * elementForces: from a prior linear solve, to get axial forces N.
 */
export function assembleKg(
  input: SolverInput,
  dofNum: DofNumbering,
  elementForces: ElementForces[],
): Float64Array {
  const nf = dofNum.nFree;
  const Kg = new Float64Array(nf * nf);

  // Build lookup: elementId → ElementForces
  const forcesById = new Map<number, ElementForces>();
  for (const ef of elementForces) {
    forcesById.set(ef.elementId, ef);
  }

  for (const [elemId, elem] of input.elements) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const L = nodeDistance(nodeI, nodeJ);
    if (L < 1e-12) continue;

    const angle = nodeAngle(nodeI, nodeJ);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Get axial force (average of start and end)
    const ef = forcesById.get(elemId);
    const N = ef ? (ef.nStart + ef.nEnd) / 2 : 0;
    if (Math.abs(N) < 1e-12) continue;

    const isFrame = elem.type === 'frame';
    const ndof = isFrame ? 6 : 4;

    const kgLocal = isFrame
      ? frameGeometricStiffness(N, L)
      : trussGeometricStiffness(N, L);

    const kgGlobal = transformToGlobal(kgLocal, cos, sin, ndof);

    // Scatter into global Kg (free DOFs only)
    const dofs = elementDofs(dofNum, elem.nodeI, elem.nodeJ);
    for (let i = 0; i < ndof; i++) {
      const gi = dofs[i];
      if (gi >= nf) continue;
      for (let j = 0; j < ndof; j++) {
        const gj = dofs[j];
        if (gj >= nf) continue;
        Kg[gi * nf + gj] += kgGlobal[i * ndof + j];
      }
    }
  }

  return Kg;
}
