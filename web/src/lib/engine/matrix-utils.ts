// Dense matrix utilities for advanced structural analysis
// All matrices stored as flat Float64Array in row-major order

/** Multiply two n×n dense matrices: C = A·B */
export function matMul(A: Float64Array, B: Float64Array, n: number): Float64Array {
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const aik = A[i * n + k];
      if (aik === 0) continue;
      for (let j = 0; j < n; j++) {
        C[i * n + j] += aik * B[k * n + j];
      }
    }
  }
  return C;
}

/** Matrix-vector product: y = A·x */
export function matVec(A: Float64Array, x: Float64Array, n: number): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += A[i * n + j] * x[j];
    }
    y[i] = sum;
  }
  return y;
}

/** Transpose n×n matrix in-place */
export function transpose(A: Float64Array, n: number): void {
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ij = i * n + j;
      const ji = j * n + i;
      const tmp = A[ij];
      A[ij] = A[ji];
      A[ji] = tmp;
    }
  }
}

/**
 * Cholesky decomposition: A = L·Lᵀ (in-place, lower triangle)
 * Returns false if A is not positive definite.
 */
export function cholesky(A: Float64Array, n: number): boolean {
  for (let j = 0; j < n; j++) {
    let sum = A[j * n + j];
    for (let k = 0; k < j; k++) {
      sum -= A[j * n + k] * A[j * n + k];
    }
    if (sum <= 0) return false;
    A[j * n + j] = Math.sqrt(sum);
    const ljj = A[j * n + j];

    for (let i = j + 1; i < n; i++) {
      sum = A[i * n + j];
      for (let k = 0; k < j; k++) {
        sum -= A[i * n + k] * A[j * n + k];
      }
      A[i * n + j] = sum / ljj;
    }
  }
  return true;
}

/** Forward solve: L·y = b (L is lower triangular, stored in full matrix) */
export function forwardSolve(L: Float64Array, b: Float64Array, n: number): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let j = 0; j < i; j++) {
      sum -= L[i * n + j] * y[j];
    }
    y[i] = sum / L[i * n + i];
  }
  return y;
}

/** Back solve: Lᵀ·x = y (L is lower triangular) */
export function backSolve(L: Float64Array, y: Float64Array, n: number): Float64Array {
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < n; j++) {
      sum -= L[j * n + i] * x[j]; // Lᵀ[i][j] = L[j][i]
    }
    x[i] = sum / L[i * n + i];
  }
  return x;
}

/** Solve A·x = b using Cholesky (A must be SPD). Returns null if not SPD. */
export function choleskySolve(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const L = new Float64Array(A);
  if (!cholesky(L, n)) return null;
  const y = forwardSolve(L, b, n);
  return backSolve(L, y, n);
}

export interface EigenResult {
  values: Float64Array;   // eigenvalues (ascending)
  vectors: Float64Array;  // eigenvectors as columns (n×n row-major)
}

/**
 * Jacobi cyclic eigenvalue solver for real symmetric matrices.
 * Returns eigenvalues sorted ascending and corresponding eigenvectors.
 *
 * Uses threshold Jacobi: in early sweeps, only rotates pairs where
 * |a_pq| > threshold, then reduces threshold. This improves convergence
 * for larger matrices (Golub & Van Loan, "Matrix Computations", §8.5).
 */
export function jacobiEigen(A: Float64Array, n: number, maxIter = 300): EigenResult {
  // Work on a copy
  const S = new Float64Array(A);
  // V = identity (eigenvectors)
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;

  for (let iter = 0; iter < maxIter; iter++) {
    // Find off-diagonal norm
    let offNorm = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        offNorm += S[i * n + j] * S[i * n + j];
      }
    }
    if (offNorm < 1e-24) break;

    // Threshold: reduce threshold as iterations progress
    // First 4 sweeps use a threshold, then rotate everything
    const threshold = iter < 4 ? 0.2 * Math.sqrt(offNorm) / (n * n) : 0;

    // Sweep all upper-triangle pairs
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = S[p * n + q];
        if (Math.abs(apq) < threshold || Math.abs(apq) < 1e-15) continue;

        const app = S[p * n + p];
        const aqq = S[q * n + q];
        const tau = (aqq - app) / (2 * apq);
        const t = tau === 0
          ? 1
          : Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        // Update S
        S[p * n + p] = app - t * apq;
        S[q * n + q] = aqq + t * apq;
        S[p * n + q] = 0;
        S[q * n + p] = 0;

        for (let r = 0; r < n; r++) {
          if (r === p || r === q) continue;
          const srp = S[r * n + p];
          const srq = S[r * n + q];
          S[r * n + p] = c * srp - s * srq;
          S[p * n + r] = S[r * n + p];
          S[r * n + q] = s * srp + c * srq;
          S[q * n + r] = S[r * n + q];
        }

        // Update V
        for (let r = 0; r < n; r++) {
          const vrp = V[r * n + p];
          const vrq = V[r * n + q];
          V[r * n + p] = c * vrp - s * vrq;
          V[r * n + q] = s * vrp + c * vrq;
        }
      }
    }
  }

  // Extract eigenvalues
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = S[i * n + i];

  // Sort ascending by eigenvalue
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => values[a] - values[b]);

  const sortedValues = new Float64Array(n);
  const sortedVectors = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    sortedValues[j] = values[idx[j]];
    for (let i = 0; i < n; i++) {
      sortedVectors[i * n + j] = V[i * n + idx[j]];
    }
  }

  return { values: sortedValues, vectors: sortedVectors };
}

/**
 * Solve generalized eigenvalue problem: A·x = λ·B·x
 * where A is symmetric and B is symmetric positive definite.
 * Uses Cholesky: B = L·Lᵀ → solve L⁻¹·A·L⁻ᵀ·y = λ·y
 * Returns null if B is not SPD.
 */
export function solveGeneralizedEigen(
  A: Float64Array,
  B: Float64Array,
  n: number,
  maxIter = 200,
): EigenResult | null {
  // Cholesky of B
  const L = new Float64Array(B);
  if (!cholesky(L, n)) return null;

  // Compute L⁻¹ (lower triangular inverse)
  const Linv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    Linv[i * n + i] = 1 / L[i * n + i];
    for (let j = i + 1; j < n; j++) {
      let sum = 0;
      for (let k = i; k < j; k++) {
        sum -= L[j * n + k] * Linv[k * n + i];
      }
      Linv[j * n + i] = sum / L[j * n + j];
    }
  }

  // C = L⁻¹ · A · L⁻ᵀ
  // First: T = L⁻¹ · A
  const T = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += Linv[i * n + k] * A[k * n + j];
      }
      T[i * n + j] = sum;
    }
  }

  // C = T · L⁻ᵀ = T · (Linv)ᵀ
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += T[i * n + k] * Linv[j * n + k]; // Linv^T[k][j] = Linv[j][k]
      }
      C[i * n + j] = sum;
    }
  }

  // Standard eigen: C·y = λ·y
  const result = jacobiEigen(C, n, maxIter);

  // Transform back: x = L⁻ᵀ · y
  const vectors = new Float64Array(n * n);
  for (let col = 0; col < n; col++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += Linv[k * n + i] * result.vectors[k * n + col]; // L⁻ᵀ[i][k] = Linv[k][i]
      }
      vectors[i * n + col] = sum;
    }
  }

  return { values: result.values, vectors };
}
