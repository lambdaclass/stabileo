// Linear buckling analysis (Euler buckling)
// Solves: K·φ = λ·(-Kg)·φ  where λ_cr = critical load factor

import type { SolverInput } from './types';
import { buildDofNumbering, assemble, solveLU, computeInternalForces, nodeDistance } from './solver-js';
import { assembleKg } from './geometric-stiffness';
import { solveGeneralizedEigen, choleskySolve } from './matrix-utils';
import { t } from '../i18n';

export interface BucklingMode {
  /** Critical load factor (multiply applied loads by this to get buckling) */
  loadFactor: number;
  /** Mode shape displacements per node */
  displacements: Array<{ nodeId: number; ux: number; uy: number; rz: number }>;
}

/** Per-element buckling data */
export interface ElementBucklingData {
  elementId: number;
  /** Axial force from linear analysis (kN). Negative = compression. */
  axialForce: number;
  /** Critical axial force for this element: Pcr = λ_cr × |N| (kN) */
  criticalForce: number;
  /** Effective length factor K = Le/L. Derived from Pcr = π²EI/(KL)². */
  kEffective: number;
  /** Effective length Le = K × L (m) */
  effectiveLength: number;
  /** Element length (m) */
  length: number;
  /** Slenderness ratio λ = KL/r where r = √(I/A) */
  slenderness: number;
}

export interface BucklingResult {
  modes: BucklingMode[];
  nDof: number;
  /** Per-element buckling data (only for compressed elements) */
  elementData: ElementBucklingData[];
}

/**
 * Linear buckling analysis.
 * 1. Solve linear → get axial forces N
 * 2. Build Kg from N
 * 3. Solve eigenvalue: K·φ = λ·(-Kg)·φ
 * 4. λ_cr = smallest positive eigenvalue
 */
export function solveBuckling(
  input: SolverInput,
  numModes?: number,
): BucklingResult | string {
  const dofNum = buildDofNumbering(input);
  const nf = dofNum.nFree;
  const nt = dofNum.nTotal;

  if (nf === 0) return t('buckling.noFreeDofs');
  if (nf > 500) return t('buckling.modelTooLarge');

  // Step 1: Linear solve
  const { K, F } = assemble(input, dofNum);

  const Kff = new Float64Array(nf * nf);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) {
      Kff[i * nf + j] = K[i * nt + j];
    }
  }

  const Ff = new Float64Array(nf);
  for (let i = 0; i < nf; i++) Ff[i] = F[i];

  let uFree: Float64Array;
  try {
    uFree = choleskySolve(new Float64Array(Kff), new Float64Array(Ff), nf)
          ?? solveLU(new Float64Array(Kff), new Float64Array(Ff), nf);
  } catch {
    return t('buckling.linearSolveError');
  }

  // Build full displacement vector
  const uAll = new Float64Array(nt);
  for (let i = 0; i < nf; i++) uAll[i] = uFree[i];

  // Step 2: Get axial forces and build Kg
  const elementForces = computeInternalForces(input, dofNum, uAll);
  const Kg = assembleKg(input, dofNum, elementForces);

  // Check Kg is not zero
  let kgNorm = 0;
  for (let i = 0; i < nf * nf; i++) kgNorm += Kg[i] * Kg[i];
  if (kgNorm < 1e-20) return t('buckling.noCompression');

  // Step 3: Generalized eigenvalue problem
  // K·φ = λ·(-Kg)·φ  →  (-Kg)·φ = μ·K·φ  where μ = 1/λ
  // Use Cholesky-based solver with K as the SPD matrix (B).
  // This correctly preserves symmetry via the L⁻¹·(-Kg)·L⁻ᵀ transformation.
  const negKg = new Float64Array(nf * nf);
  for (let i = 0; i < nf * nf; i++) negKg[i] = -Kg[i];

  const eigen = solveGeneralizedEigen(negKg, Kff, nf);
  if (!eigen) return t('buckling.choleskyError');

  // eigenvalues μ satisfy (-Kg)·φ = μ·K·φ → K·φ = (1/μ)·(-Kg)·φ → λ = 1/μ
  // We want positive λ (from positive μ): smallest λ = largest positive μ
  const nModes = Math.min(numModes ?? 4, nf);
  const modes: BucklingMode[] = [];

  // Collect positive eigenvalues → λ_cr = 1/μ, sort by λ_cr ascending
  const candidates: Array<{ lambdaCr: number; modeIdx: number }> = [];
  for (let i = 0; i < nf; i++) {
    const mu = eigen.values[i];
    if (mu > 1e-10) {
      candidates.push({ lambdaCr: 1 / mu, modeIdx: i });
    }
  }
  candidates.sort((a, b) => a.lambdaCr - b.lambdaCr);

  for (let m = 0; m < Math.min(nModes, candidates.length); m++) {
    const { lambdaCr, modeIdx } = candidates[m];

    // Extract mode shape
    const phi = new Float64Array(nf);
    for (let i = 0; i < nf; i++) {
      phi[i] = eigen.vectors[i * nf + modeIdx];
    }

    // Normalize
    let maxAbs = 0;
    for (let i = 0; i < nf; i++) {
      if (Math.abs(phi[i]) > maxAbs) maxAbs = Math.abs(phi[i]);
    }
    if (maxAbs > 0) {
      for (let i = 0; i < nf; i++) phi[i] /= maxAbs;
    }

    // Map to node displacements
    const displacements: BucklingMode['displacements'] = [];
    for (const [nodeId] of input.nodes) {
      const ux = getPhiVal(dofNum, phi, nodeId, 0, nf);
      const uy = getPhiVal(dofNum, phi, nodeId, 1, nf);
      const rz = dofNum.dofsPerNode > 2 ? getPhiVal(dofNum, phi, nodeId, 2, nf) : 0;
      displacements.push({ nodeId, ux, uy, rz });
    }

    modes.push({ loadFactor: lambdaCr, displacements });
  }

  if (modes.length === 0) return t('buckling.noModesFound');

  // Compute per-element buckling data using the first (critical) mode
  const lambdaCr1 = modes[0].loadFactor;
  const elementData: ElementBucklingData[] = [];

  for (const ef of elementForces) {
    const elem = input.elements.get(ef.elementId);
    if (!elem) continue;
    const nodeI = input.nodes.get(elem.nodeI);
    const nodeJ = input.nodes.get(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;

    const N = (ef.nStart + ef.nEnd) / 2; // average axial force
    if (N >= -1e-10) continue; // only compressed elements (N < 0 = compression)

    const L = nodeDistance(nodeI, nodeJ);
    if (L < 1e-12) continue;

    const sec = input.sections.get(elem.sectionId);
    const mat = input.materials.get(elem.materialId);
    if (!sec || !mat) continue;

    const EI = mat.e * 1000 * sec.iz; // kN·m² (e in MPa → ×1000 for kPa)
    const absN = Math.abs(N);
    const Pcr = lambdaCr1 * absN; // critical force for this element

    // Keff from Pcr = π²EI/(Keff·L)²
    // Keff = π·√(EI/Pcr) / L
    const kEff = Pcr > 1e-15 ? Math.PI * Math.sqrt(EI / Pcr) / L : Infinity;

    // Effective length
    const Le = kEff * L;

    // Radius of gyration r = √(Iz/A)
    const r = Math.sqrt(sec.iz / sec.a);
    const slenderness = Le / r;

    elementData.push({
      elementId: ef.elementId,
      axialForce: N,
      criticalForce: Pcr,
      kEffective: kEff,
      effectiveLength: Le,
      length: L,
      slenderness,
    });
  }

  return { modes, nDof: nf, elementData };
}

function getPhiVal(
  dofNum: { map: Map<string, number>; dofsPerNode: number },
  phi: Float64Array,
  nodeId: number,
  localDof: number,
  nFree: number,
): number {
  if (localDof >= dofNum.dofsPerNode) return 0;
  const key = `${nodeId}:${localDof}`;
  const idx = dofNum.map.get(key);
  if (idx === undefined || idx >= nFree) return 0;
  return phi[idx];
}
