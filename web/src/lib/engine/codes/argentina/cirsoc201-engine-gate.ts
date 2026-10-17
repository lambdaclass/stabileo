/**
 * The engine has the last word on a CIRSOC 201 pass.
 *
 * `verifyElement` (cirsoc201.ts) designs a member and checks it with the same TypeScript, so a
 * defect in that code passes its own design. This gate takes the arrangement it settled on —
 * the bars, their real diameters, the stirrups — and asks the engine's checkers about it:
 *
 *   - beam flexure, shear and ductility: `cirsoc201-beam-kernel.ts` (Rust `cirsoc201_check`);
 *   - column axial force with moment: the Rust column kernel, on the app's standard layout of
 *     the chosen bars (`computeColumnLayout`, the layout the provided-reinforcement verifier
 *     reads for a bar count), under the compression and under any tension the member sees.
 *
 * A check the TypeScript passed and the engine fails becomes a FAILURE, with a diagnostic that
 * says so and the engine's numbers. An engine that is not loaded means the member was not
 * verified: also a failure, never the TypeScript verdict by default.
 *
 * Biaxial bending (Bresler), torsion and the slenderness magnifier are not re-checked here: the
 * engine has no checker for them yet. `engineRecheck.notRechecked` names them on each result.
 */
import type { RegulationEdition } from '../../../codes/regulation';
import type { SolverDiagnostic } from '../../types';
import { REBAR_DB, type ElementVerification, type VerifStatus } from './cirsoc201';
import { evaluateBeamSection } from './cirsoc201-beam-kernel';
import { computeColumnCapacity, computeColumnLayout } from '../../station-design-forces';
import { getColumnCapacityKernel } from '../../column-capacity-kernel';

export interface EngineRecheck {
  edition: RegulationEdition;
  /** Engine demand/capacity per check; Infinity when the engine says the section cannot carry it. */
  flexureRatio?: number;
  ductilityRatio?: number;
  shearRatio?: number;
  columnRatio?: number;
  /** Checks whose TypeScript pass the engine contradicted. */
  disagreements: string[];
  /** True when the engine could not be asked; the member is then not verified. */
  unavailable: boolean;
  /** TypeScript checks the engine does not cover yet. */
  notRechecked: string[];
}

const fail = (s: VerifStatus): boolean => s === 'fail';

/**
 * Re-check one verification with the engine. Returns the verification with statuses lowered
 * where the engine disagrees, and `engineRecheck` attached. Pure.
 *
 * `NuShear`: the axial force the shear check used, kN, + = compression.
 */
export function engineRecheckElement(
  v: ElementVerification,
  opts: { edition?: RegulationEdition; stirrupDia: number; NuShear?: number },
): ElementVerification & { engineRecheck: EngineRecheck } {
  const edition = opts.edition ?? '2025';
  const rc: EngineRecheck = { edition, disagreements: [], unavailable: false, notRechecked: [] };
  if (v.biaxial) rc.notRechecked.push('biaxial');
  if (v.torsion && !v.torsion.neglect) rc.notRechecked.push('torsion');
  if (v.slender?.isSlender) rc.notRechecked.push('slenderness');
  const out = { ...v, flexure: { ...v.flexure }, shear: { ...v.shear }, column: v.column && { ...v.column }, engineRecheck: rc };
  const stirrupM = opts.stirrupDia / 1000;

  // ── Beam flexure and ductility, with the bars actually chosen ──
  const f = v.flexure;
  const d = v.h - v.cover - stirrupM - f.barDia / 2000;
  const dPrime = f.barDiaComp ? v.cover + stirrupM + f.barDiaComp / 2000 : 0;
  const beam = f.AsProv > 0 ? evaluateBeamSection({
    edition, fc: v.fc * 1e6, fy: v.fy * 1e6, b: v.b, h: v.h, d,
    As: f.AsProv * 1e-4,
    AsComp: f.AsComp ? f.AsComp * 1e-4 : 0, dPrime,
    Av: v.shear.stirrupLegs * barArea(v.shear.stirrupDia) * 1e-4, s: v.shear.spacing,
    Ag: v.b * v.h, NuCompression: (opts.NuShear ?? v.Nu) * 1e3,
  }) : null;
  if (!beam) {
    rc.unavailable = true;
  } else {
    rc.flexureRatio = beam.flexureValid && beam.phiMn > 0 ? f.Mu / (beam.phiMn / 1e3) : Infinity;
    if (!fail(f.status) && f.Mu > 0 && !(rc.flexureRatio <= 1)) {
      rc.disagreements.push('flexure');
      out.flexure.status = 'fail';
    }
    // 9.3.3.1 / 10.3.5 bind a flexural member, which is what a beam is here.
    if (v.elementType === 'beam' && f.Mu > 0) {
      rc.ductilityRatio = beam.flexureValid && beam.epsilonT > 0 ? beam.epsilonTMin / beam.epsilonT : Infinity;
      if (!fail(f.status) && !(rc.ductilityRatio <= 1)) {
        rc.disagreements.push('ductility');
        out.flexure.status = 'fail';
      }
    }
    rc.shearRatio = beam.shearValid && beam.phiVn > 0 ? v.shear.Vu / (beam.phiVn / 1e3) : Infinity;
    if (!fail(v.shear.status) && v.shear.Vu > 0 && !(rc.shearRatio <= 1)) {
      rc.disagreements.push('shear');
      out.shear.status = 'fail';
    }
  }

  // ── Column: axial force with moment, on the Rust kernel only ──
  if (v.column && out.column) {
    const c = v.column;
    if (!getColumnCapacityKernel()) {
      rc.unavailable = true;
    } else {
      const layout = computeColumnLayout(c.barCount, c.barDia, v.b, v.h, v.cover, opts.stirrupDia);
      const loads = [c.Nu];
      if ((opts.NuShear ?? 0) < 0) loads.push(opts.NuShear!); // tension the member also sees
      let worst = 0;
      for (const Nu of loads) {
        const cap = computeColumnCapacity(layout.totalArea, v.b, v.h, v.fc, v.fy, v.cover, opts.stirrupDia,
          Nu, c.Mu, layout.bars, 'z');
        // computeColumnCapacity reports capacity/demand (≥ 1 passes); turn it around.
        const u = cap.strainCompatible && cap.ratio > 0 ? 1 / cap.ratio : Infinity;
        worst = Math.max(worst, cap.rhoOk ? u : Infinity);
      }
      rc.columnRatio = worst;
      if (!fail(c.status) && !(worst <= 1)) {
        rc.disagreements.push('column');
        out.column.status = 'fail';
      }
    }
  }

  const diags: SolverDiagnostic[] = [...(v.diagnostics ?? [])];
  if (rc.unavailable) {
    for (const k of ['flexure', 'shear', 'column'] as const) {
      const r = out[k];
      if (r && !fail(r.status)) r.status = 'fail';
    }
    diags.push({
      severity: 'error', code: 'VERIF_ENGINE_UNAVAILABLE', message: 'diag.verifEngineUnavailable',
      source: 'verification', elementIds: [v.elementId],
    });
  }
  if (rc.disagreements.length > 0) {
    diags.push({
      severity: 'error', code: 'VERIF_ENGINE_DISAGREES', message: 'diag.verifEngineDisagrees',
      source: 'verification', elementIds: [v.elementId],
      details: {
        checks: rc.disagreements.join(', '),
        ...(rc.flexureRatio !== undefined ? { flexureRatio: rc.flexureRatio } : {}),
        ...(rc.ductilityRatio !== undefined ? { ductilityRatio: rc.ductilityRatio } : {}),
        ...(rc.shearRatio !== undefined ? { shearRatio: rc.shearRatio } : {}),
        ...(rc.columnRatio !== undefined ? { columnRatio: rc.columnRatio } : {}),
      },
    });
  }
  if (rc.unavailable || rc.disagreements.length > 0) out.overallStatus = 'fail';
  out.diagnostics = diags.length > 0 ? diags : undefined;
  return out;
}

function barArea(diaMm: number): number {
  return REBAR_DB.find((r) => r.diameter === diaMm)?.area ?? (Math.PI / 4) * (diaMm / 10) ** 2;
}
