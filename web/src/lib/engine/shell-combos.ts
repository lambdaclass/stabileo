// Combine per-case shell stresses into per-combination + envelope results.
//
// The WASM combination solver linearly combines displacements / reactions /
// element forces, but drops plate/quad stresses (combine_results_3d sets them
// to empty). Shell membrane stresses (σxx, σyy, τxy) and bending moments
// (mx, my, mxy) are LINEAR in the displacement field, so for a linear-elastic
// combo they equal Σ factorᵢ · (case-i stress). We recombine them here from the
// per-case results — no solver change. (Von Mises is nonlinear, so it is
// RECOMPUTED from the combined membrane components, not linearly combined.
// Nodal Von Mises needs nodal components we don't carry, so combos fall back to
// the centroidal value — the contour still colours, just without nodal smoothing.)

import type { AnalysisResults3D, PlateStress, QuadStress } from './types-3d';
import { principalStresses } from './shell-stress';

export interface ComboFactor { caseId: number; factor: number; }

function vonMisesPlane(sxx: number, syy: number, txy: number): number {
  return Math.sqrt(Math.max(0, sxx * sxx - sxx * syy + syy * syy + 3 * txy * txy));
}

type Membrane = { sigmaXx: number; sigmaYy: number; tauXy: number; mx: number; my: number; mxy: number };

function combineMembrane(
  factors: ComboFactor[],
  perCase: Map<number, Map<number, Membrane>>,
): Map<number, Membrane> {
  const ids = new Set<number>();
  for (const f of factors) { const m = perCase.get(f.caseId); if (m) for (const id of m.keys()) ids.add(id); }
  const out = new Map<number, Membrane>();
  for (const id of ids) {
    const acc: Membrane = { sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0 };
    for (const f of factors) {
      const s = perCase.get(f.caseId)?.get(id);
      if (!s) continue;
      acc.sigmaXx += f.factor * s.sigmaXx; acc.sigmaYy += f.factor * s.sigmaYy; acc.tauXy += f.factor * s.tauXy;
      acc.mx += f.factor * s.mx; acc.my += f.factor * s.my; acc.mxy += f.factor * s.mxy;
    }
    out.set(id, acc);
  }
  return out;
}

const toMembraneMap = (list: Array<{ elementId: number } & Membrane> | undefined): Map<number, Membrane> =>
  new Map((list ?? []).map(s => [s.elementId, { sigmaXx: s.sigmaXx, sigmaYy: s.sigmaYy, tauXy: s.tauXy, mx: s.mx, my: s.my, mxy: s.mxy }]));

/** Recombine plate + quad stresses for one combo from per-case results. */
export function combineShellStresses(
  factors: ComboFactor[],
  perCasePlates: Map<number, Map<number, Membrane>>,
  perCaseQuads: Map<number, Map<number, Membrane>>,
): { plateStresses: PlateStress[]; quadStresses: QuadStress[] } {
  const plates: PlateStress[] = [];
  for (const [id, m] of combineMembrane(factors, perCasePlates)) {
    const pr = principalStresses(m.sigmaXx, m.sigmaYy, m.tauXy);
    plates.push({ elementId: id, sigmaXx: m.sigmaXx, sigmaYy: m.sigmaYy, tauXy: m.tauXy, mx: m.mx, my: m.my, mxy: m.mxy, sigma1: pr.sigma1, sigma2: pr.sigma2, vonMises: vonMisesPlane(m.sigmaXx, m.sigmaYy, m.tauXy) });
  }
  const quads: QuadStress[] = [];
  for (const [id, m] of combineMembrane(factors, perCaseQuads)) {
    quads.push({ elementId: id, sigmaXx: m.sigmaXx, sigmaYy: m.sigmaYy, tauXy: m.tauXy, mx: m.mx, my: m.my, mxy: m.mxy, vonMises: vonMisesPlane(m.sigmaXx, m.sigmaYy, m.tauXy) });
  }
  return { plateStresses: plates, quadStresses: quads };
}

/** Per-element governing (max Von Mises across combos) shell stresses for the
 *  envelope result, so the envelope view also contours shells. */
export function envelopeShellStresses(
  combos: AnalysisResults3D[],
): { plateStresses: PlateStress[]; quadStresses: QuadStress[] } {
  const govP = new Map<number, PlateStress>();
  const govQ = new Map<number, QuadStress>();
  for (const r of combos) {
    for (const s of r.plateStresses ?? []) { const g = govP.get(s.elementId); if (!g || s.vonMises > g.vonMises) govP.set(s.elementId, s); }
    for (const s of r.quadStresses ?? []) { const g = govQ.get(s.elementId); if (!g || s.vonMises > g.vonMises) govQ.set(s.elementId, s); }
  }
  return { plateStresses: [...govP.values()], quadStresses: [...govQ.values()] };
}

/**
 * Mutate a combination bundle in place so per-combo and envelope results carry
 * shell stresses (recombined from per-case). No-op without shells.
 */
export function enrichComboShellStresses(
  perCase: Map<number, AnalysisResults3D>,
  perCombo: Map<number, AnalysisResults3D>,
  envelopeMaxAbs: AnalysisResults3D | undefined,
  combinations: Array<{ id: number; factors: Array<{ caseId: number; factor: number }> }>,
): void {
  const perCasePlates = new Map<number, Map<number, Membrane>>();
  const perCaseQuads = new Map<number, Map<number, Membrane>>();
  let any = false;
  for (const [cid, r] of perCase) {
    if ((r.plateStresses?.length ?? 0) || (r.quadStresses?.length ?? 0)) any = true;
    perCasePlates.set(cid, toMembraneMap(r.plateStresses));
    perCaseQuads.set(cid, toMembraneMap(r.quadStresses));
  }
  if (!any) return;

  for (const combo of combinations) {
    const r = perCombo.get(combo.id);
    if (!r) continue;
    const { plateStresses, quadStresses } = combineShellStresses(combo.factors, perCasePlates, perCaseQuads);
    r.plateStresses = plateStresses;
    r.quadStresses = quadStresses;
  }

  if (envelopeMaxAbs) {
    const env = envelopeShellStresses([...perCombo.values()]);
    envelopeMaxAbs.plateStresses = env.plateStresses;
    envelopeMaxAbs.quadStresses = env.quadStresses;
  }
}
