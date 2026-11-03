/**
 * TEST ORACLE. Not imported by the app.
 *
 * The TypeScript shell recombination that `shell-combos.ts` ran, silently, whenever the engine's
 * shell combination kernel was not registered. The app now asks only the kernel
 * (`engine/src/shell_combination_kernel.rs`) and throws `EngineUnavailableError` without it. This
 * copy is the independent statement the kernel is compared with in `shell-combos.test.ts`.
 */
import type { AnalysisResults3D, PlateStress, QuadStress, ShellEnvelope, ShellEnvelopeKey, ShellEnvelopeSource } from '../../types-3d';
import { principalStresses, vonMisesPlane, worseFace } from '../../shell-stress';
import { type ComboFactor, type PlateThickness } from '../../shell-combos';
import { woodArmer } from '../../wood-armer';

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


/** Recombine plate + quad stresses for one combo from per-case results. */
export function combineShellStressesOracle(
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

/** `enrichComboShellStresses` as the TypeScript fallback computed it. */
export function enrichComboShellStressesOracle(
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
    const { plateStresses, quadStresses } = combineShellStressesOracle(combo.factors, perCasePlates, perCaseQuads, plates, ids);
    r.plateStresses = plateStresses;
    r.quadStresses = quadStresses;
  }

  if (envelopeMaxAbs) {
    const env = envelopeShellStressesOracle([...perCombo].map(([id, results]) => ({ source: { kind: 'combination' as const, id }, results })));
    envelopeMaxAbs.plateStresses = env.plateStresses;
    envelopeMaxAbs.quadStresses = env.quadStresses;
  }
}


type Shell = PlateStress | QuadStress;

function componentsOf(s: Shell, plate: boolean): Partial<Record<ShellEnvelopeKey, number>> {
  const p = principalStresses(s.sigmaXx, s.sigmaYy, s.tauXy);
  const w = woodArmer(s.mx, s.my, s.mxy);
  return {
    sigmaXx: s.sigmaXx, sigmaYy: s.sigmaYy, tauXy: s.tauXy, mx: s.mx, my: s.my, mxy: s.mxy,
    ...(s.qx !== undefined && s.qy !== undefined ? { qx: s.qx, qy: s.qy } : {}),
    vonMises: s.vonMises, sigma1: p.sigma1, sigma2: p.sigma2,
    woodArmerBottomX: w.bottomX, woodArmerBottomY: w.bottomY, woodArmerTopX: w.topX, woodArmerTopY: w.topY,
    ...(plate ? { faceSigma1: (s as PlateStress).sigma1, faceSigma2: (s as PlateStress).sigma2 } : {}),
  };
}

function envelopeList(lists: Array<{ source: ShellEnvelopeSource; rows: Shell[] }>, plate: boolean): Shell[] {
  const order: number[] = [];
  const byId = new Map<number, { envelope: ShellEnvelope; missing: Set<ShellEnvelopeKey> }>();
  const all: ShellEnvelopeKey[] = ['sigmaXx', 'sigmaYy', 'tauXy', 'mx', 'my', 'mxy', 'qx', 'qy', 'vonMises', 'sigma1', 'sigma2',
    'woodArmerBottomX', 'woodArmerBottomY', 'woodArmerTopX', 'woodArmerTopY', 'faceSigma1', 'faceSigma2'];
  for (const { source, rows } of lists) {
    for (const s of rows) {
      let e = byId.get(s.elementId);
      if (!e) { e = { envelope: {}, missing: new Set() }; byId.set(s.elementId, e); order.push(s.elementId); }
      const c = componentsOf(s, plate);
      for (const k of all) {
        const v = c[k];
        if (v === undefined) { e.missing.add(k); continue; }
        const x = e.envelope[k];
        if (!x) { e.envelope[k] = { max: v, maxSource: source, min: v, minSource: source }; continue; }
        if (v > x.max) { x.max = v; x.maxSource = source; }
        if (v < x.min) { x.min = v; x.minSource = source; }
      }
    }
  }
  const peak = (x: { max: number; min: number } | undefined) => (!x ? 0 : Math.abs(x.max) >= Math.abs(x.min) ? x.max : x.min);
  return order.map((id) => {
    const { envelope, missing } = byId.get(id)!;
    for (const k of missing) delete envelope[k];
    const base = {
      elementId: id, sigmaXx: peak(envelope.sigmaXx), sigmaYy: peak(envelope.sigmaYy), tauXy: peak(envelope.tauXy),
      mx: peak(envelope.mx), my: peak(envelope.my), mxy: peak(envelope.mxy), vonMises: envelope.vonMises?.max ?? 0,
      ...(envelope.qx && envelope.qy ? { qx: peak(envelope.qx), qy: peak(envelope.qy) } : {}),
    };
    return plate ? { ...base, sigma1: envelope.faceSigma1?.max ?? NaN, sigma2: envelope.faceSigma2?.min ?? NaN, envelope } : { ...base, envelope };
  });
}

/** Each component's own extremes over the sets, written independently of the engine's kernel. */
export function envelopeShellStressesOracle(
  sets: ReadonlyArray<{ source: ShellEnvelopeSource; results: AnalysisResults3D }>,
): { plateStresses: PlateStress[]; quadStresses: QuadStress[] } {
  return {
    plateStresses: envelopeList(sets.map((s) => ({ source: s.source, rows: s.results.plateStresses ?? [] })), true) as PlateStress[],
    quadStresses: envelopeList(sets.map((s) => ({ source: s.source, rows: s.results.quadStresses ?? [] })), false) as QuadStress[],
  };
}
