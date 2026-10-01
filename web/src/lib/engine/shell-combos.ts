// Combine per-case shell stresses into per-combination + envelope results.
//
// The WASM combination solver linearly combines displacements / reactions /
// element forces, but drops plate/quad stresses (combine_results_3d sets them
// to empty). Shell membrane stresses (σxx, σyy, τxy), bending moments
// (mx, my, mxy) and the quads' transverse shears (qx, qy) are LINEAR in the
// displacement field, so for a linear-elastic combo they equal
// Σ factorᵢ · (case-i value). We recombine them here from the per-case results.
//
// σ1, σ2 and Von Mises are not linear and are recomputed, each as the engine
// defines it for its element: on the worse face (membrane ± 6M/t²) for a DKT
// triangle, from the membrane for a quad. They used to be recomputed from the
// membrane for both, so a plate's Von Mises meant the face value in a case and
// the membrane value in a combination. Nodal Von Mises needs nodal components
// we don't carry, so combos fall back to the centroidal value.

import type { AnalysisResults3D, PlateStress, QuadStress } from './types-3d';
import { principalStresses, vonMisesPlane, worseFace } from './shell-stress';

export interface ComboFactor { caseId: number; factor: number; }

type Membrane = { sigmaXx: number; sigmaYy: number; tauXy: number; mx: number; my: number; mxy: number; qx?: number; qy?: number };

function combineMembrane(
  factors: ComboFactor[],
  perCase: Map<number, Map<number, Membrane>>,
  ids?: Set<number>,
): Map<number, Membrane> {
  if (!ids) {
    ids = new Set<number>();
    for (const f of factors) { const m = perCase.get(f.caseId); if (m) for (const id of m.keys()) ids.add(id); }
  }
  const out = new Map<number, Membrane>();
  for (const id of ids) {
    const acc: Membrane = { sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0 };
    let contributed = false;
    // Q only where every contributing case has it: a sum over part of the cases is no value.
    let qx: number | undefined = 0, qy: number | undefined = 0;
    for (const f of factors) {
      const s = perCase.get(f.caseId)?.get(id);
      if (!s) continue;
      contributed = true;
      acc.sigmaXx += f.factor * s.sigmaXx; acc.sigmaYy += f.factor * s.sigmaYy; acc.tauXy += f.factor * s.tauXy;
      acc.mx += f.factor * s.mx; acc.my += f.factor * s.my; acc.mxy += f.factor * s.mxy;
      qx = qx === undefined || s.qx === undefined ? undefined : qx + f.factor * s.qx;
      qy = qy === undefined || s.qy === undefined ? undefined : qy + f.factor * s.qy;
    }
    if (qx !== undefined && qy !== undefined) { acc.qx = qx; acc.qy = qy; }
    // Only include ids present in at least one of THIS combo's cases — with a
    // precomputed global union, absent ids would otherwise be written as zeros
    // (phantom zero-stress entries in the combo output).
    if (contributed) out.set(id, acc);
  }
  return out;
}

const toMembraneMap = (list: Array<{ elementId: number } & Membrane> | undefined): Map<number, Membrane> =>
  new Map((list ?? []).map(s => [s.elementId, { sigmaXx: s.sigmaXx, sigmaYy: s.sigmaYy, tauXy: s.tauXy, mx: s.mx, my: s.my, mxy: s.mxy, qx: s.qx, qy: s.qy }]));

/** The plates' thicknesses, which their face stresses need. */
export type PlateThickness = ReadonlyMap<number, { thickness: number }>;

/** Recombine plate + quad stresses for one combo from per-case results. */
export function combineShellStresses(
  factors: ComboFactor[],
  perCasePlates: Map<number, Map<number, Membrane>>,
  perCaseQuads: Map<number, Map<number, Membrane>>,
  plates: PlateThickness,
  ids?: { plates: Set<number>; quads: Set<number> },
): { plateStresses: PlateStress[]; quadStresses: QuadStress[] } {
  const plateOut: PlateStress[] = [];
  for (const [id, m] of combineMembrane(factors, perCasePlates, ids?.plates)) {
    const t = plates.get(id)?.thickness ?? 0;
    // No thickness, no faces: the membrane is all that can be said.
    const pr = t > 0 ? worseFace(m, t) : { ...principalStresses(m.sigmaXx, m.sigmaYy, m.tauXy), vonMises: vonMisesPlane(m.sigmaXx, m.sigmaYy, m.tauXy) };
    plateOut.push({ elementId: id, sigmaXx: m.sigmaXx, sigmaYy: m.sigmaYy, tauXy: m.tauXy, mx: m.mx, my: m.my, mxy: m.mxy, sigma1: pr.sigma1, sigma2: pr.sigma2, vonMises: pr.vonMises });
  }
  const quads: QuadStress[] = [];
  for (const [id, m] of combineMembrane(factors, perCaseQuads, ids?.quads)) {
    quads.push({ elementId: id, sigmaXx: m.sigmaXx, sigmaYy: m.sigmaYy, tauXy: m.tauXy, mx: m.mx, my: m.my, mxy: m.mxy, vonMises: vonMisesPlane(m.sigmaXx, m.sigmaYy, m.tauXy), ...(m.qx !== undefined ? { qx: m.qx, qy: m.qy } : {}) });
  }
  return { plateStresses: plateOut, quadStresses: quads };
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
  plates: PlateThickness,
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

  // The id union is constant across combos — build it once instead of inside
  // every combineMembrane call (was O(combos × cases × shells) of Set churn).
  const plateIds = new Set<number>();
  const quadIds = new Set<number>();
  for (const m of perCasePlates.values()) for (const id of m.keys()) plateIds.add(id);
  for (const m of perCaseQuads.values()) for (const id of m.keys()) quadIds.add(id);
  const ids = { plates: plateIds, quads: quadIds };

  for (const combo of combinations) {
    const r = perCombo.get(combo.id);
    if (!r) continue;
    const { plateStresses, quadStresses } = combineShellStresses(combo.factors, perCasePlates, perCaseQuads, plates, ids);
    r.plateStresses = plateStresses;
    r.quadStresses = quadStresses;
  }

  if (envelopeMaxAbs) {
    const env = envelopeShellStresses([...perCombo.values()]);
    envelopeMaxAbs.plateStresses = env.plateStresses;
    envelopeMaxAbs.quadStresses = env.quadStresses;
  }
}

/**
 * Every load case at factor 1, as a full result — the "All loads" baseline.
 *
 * `combined` is the engine's combination of the cases (displacements, reactions, member
 * forces). The engine leaves out everything else, and the baseline is read for more than the
 * frame: the floor design takes the slab moments from its quad stresses, the solve toasts its
 * solver diagnostics, and the diagnostics panel its structured findings. So, from the cases:
 *   · shell stresses and constraint forces are summed — both linear in the displacements;
 *   · the diagnostics, which describe the model and the solve rather than one case's loads,
 *     and the timings are the first case's.
 * Nodal shell stresses are not carried, as for every combination (see the header).
 */
export function allLoadsResult3D(
  combined: AnalysisResults3D,
  perCase: Map<number, AnalysisResults3D>,
  plateThickness: PlateThickness,
): AnalysisResults3D {
  const cases = [...perCase.values()];
  const first = cases[0];
  const factors = [...perCase.keys()].map((caseId) => ({ caseId, factor: 1 }));
  const plates = new Map([...perCase].map(([id, r]) => [id, toMembraneMap(r.plateStresses)]));
  const quads = new Map([...perCase].map(([id, r]) => [id, toMembraneMap(r.quadStresses)]));
  const shells = combineShellStresses(factors, plates, quads, plateThickness);
  const constraint = new Map<string, { nodeId: number; dof: string; force: number }>();
  for (const r of cases) {
    for (const c of r.constraintForces ?? []) {
      const key = `${c.nodeId}:${c.dof}`;
      const acc = constraint.get(key);
      if (acc) acc.force += c.force; else constraint.set(key, { ...c });
    }
  }
  return {
    ...combined,
    ...(shells.plateStresses.length ? { plateStresses: shells.plateStresses } : {}),
    ...(shells.quadStresses.length ? { quadStresses: shells.quadStresses } : {}),
    ...(constraint.size ? { constraintForces: [...constraint.values()] } : {}),
    ...(first?.diagnostics ? { diagnostics: first.diagnostics } : {}),
    ...(first?.solverDiagnostics ? { solverDiagnostics: first.solverDiagnostics } : {}),
    ...(first?.structuredDiagnostics ? { structuredDiagnostics: first.structuredDiagnostics } : {}),
    ...(first?.timings ? { timings: first.timings } : {}),
  };
}
