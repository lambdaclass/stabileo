// CIRSOC 201 — Reinforced Concrete Verification Engine
// Implements design checks for flexure, shear, and flexo-compression per Argentine code CIRSOC
// 201 (based on ACI 318). Flexure, shear, columns and biaxial bending are sized against the
// engine (`cirsoc201_design_beam`, `cirsoc201_check`, the section engine) by the edition asked
// for, 2025 when none is. Torsion is computed here: §22.7 with the 2025 material limits
// (§22.7.2) when the edition is 2025, and the cross-section limit of §22.7.7.1 from the shared
// §22.7 module.
//
// Units: kN, m, MPa, cm² (for reinforcement areas)

import { deriveDevelopment, deriveHookedDevelopment, topBarFactor, concreteBelowTopBars } from '../../../codes/cirsoc201/anchorage';
import type { SolverDiagnostic } from '../../types';
import { transverseSpacingLimits } from '../../../codes/cirsoc201/transverse-spacing';
import { minFlexuralSteelCm2, tensionControlledStrain, COLUMN_STEEL_RATIO, editionCode, shearFy, shearSqrtFc, type Cirsoc201EditionLike } from './cirsoc201-basis';
import type { RegulationEdition } from '../../../codes/regulation';
import { evaluateBeamSection } from './cirsoc201-beam-kernel';
import { cirsoc201Engine, Cirsoc201EngineUnavailable } from './cirsoc201-engine';
import { computeColumnLayout, computeColumnCapacity, computeBiaxialCapacity } from '../../station-design-forces';
import { checkTorsion2025 } from '../../../codes/cirsoc201/torsion';

// ─── Rebar Database ─────────────────────────────────────────────

export interface RebarSpec {
  diameter: number;  // mm
  area: number;      // cm²
  label: string;
}

export const REBAR_DB: RebarSpec[] = [
  { diameter: 6,  area: 0.283, label: 'Ø6' },
  { diameter: 8,  area: 0.503, label: 'Ø8' },
  { diameter: 10, area: 0.785, label: 'Ø10' },
  { diameter: 12, area: 1.131, label: 'Ø12' },
  { diameter: 16, area: 2.011, label: 'Ø16' },
  { diameter: 20, area: 3.142, label: 'Ø20' },
  { diameter: 25, area: 4.909, label: 'Ø25' },
  { diameter: 32, area: 8.042, label: 'Ø32' },
];

// ─── Design Parameters ──────────────────────────────────────────

export interface ConcreteDesignParams {
  fc: number;        // f'c — compressive strength (MPa)
  fy: number;        // steel yield strength (MPa), typically 420
  cover: number;     // concrete cover (m), typically 0.025-0.04
  b: number;         // section width (m)
  h: number;         // section total height (m)
  stirrupDia: number; // stirrup diameter (mm), typically 8
}

// ─── Verification Results ───────────────────────────────────────

export type VerifStatus = 'ok' | 'fail' | 'warn';

export interface FlexureResult {
  Mu: number;          // design moment (kN·m)
  d: number;           // effective depth (m)
  a: number;           // stress block depth for the PROVIDED bars (m)
  /**
   * The same four quantities at the REQUIRED steel, which is what a worked
   * example in a textbook or a spreadsheet prints. See the note where they
   * are computed.
   */
  aReq: number;        // stress block depth for AsFlexural (m)
  c: number;           // neutral axis depth at AsFlexural (m)
  cMax: number;        // c at εt = 5 ‰ — the tension-controlled limit (m)
  epsilonT: number;    // net tensile strain at AsFlexural
  AsReq: number;       // required steel area (cm²) — already max(AsFlexural, AsMin)
  /**
   * Steel required by FLEXURAL STRENGTH alone, cm² — before any minimum is applied.
   *
   * `AsReq` above is `max(AsFlexural, AsMin)`, and `AsMin` here is the BEAM minimum
   * (§9.6.1.2's `max(0,25·√f'c/f_y, 1,4/f_y)·b_w·d`). A member whose minimum comes from a
   * different clause — a footing mat takes §7.6.1's `0,0018·A_g` — cannot use either of
   * those two numbers and needs the strength requirement on its own. Without this field the
   * only way to get it was to re-derive the stress block, i.e. to write a second flexural
   * engine, which is how one project comes to hold two answers about the same section.
   *
   * Added as an OUTPUT only: no existing caller's numbers change.
   */
  AsFlexural: number;
  AsMin: number;       // minimum steel area (cm²) — the BEAM minimum, see AsFlexural
  AsMax: number;       // maximum steel area (cm²)
  AsProv: number;      // provided steel area (cm²)
  bars: string;        // e.g. "4 Ø16"
  barCount: number;
  barDia: number;      // mm
  phiMn: number;       // design capacity (kN·m)
  ratio: number;       // Mu / phiMn
  status: VerifStatus;
  steps: string[];     // calculation steps for memo
  // Doubly reinforced (compression steel A's)
  isDoublyReinforced: boolean;
  AsComp?: number;     // compression steel area (cm²)
  barsComp?: string;   // compression bars description
  barCountComp?: number;
  barDiaComp?: number; // mm
}

export interface ShearResult {
  Vu: number;          // design shear (kN)
  d: number;           // effective depth (m)
  phiVc: number;       // concrete contribution (kN)
  Vs: number;          // steel contribution required (kN)
  AvOverS: number;     // required Av/s (cm²/m)
  AvOverSMin: number;  // minimum Av/s (cm²/m)
  /** Av/s the shear asks before the minimum applies (cm²/m). */
  AvOverSReq?: number;
  spacing: number;     // proposed stirrup spacing (m)
  stirrupDia: number;  // mm
  stirrupLegs: number;
  phiVn: number;       // total design capacity (kN)
  ratio: number;       // Vu / phiVn
  status: VerifStatus;
  steps: string[];
}

export interface ColumnResult {
  Nu: number;          // axial force (kN, + = compression)
  Mu: number;          // moment (kN·m)
  AsTotal: number;     // total longitudinal steel (cm²)
  AsProv: number;      // provided steel (cm²)
  bars: string;        // e.g. "8 Ø16"
  barCount: number;
  barDia: number;      // mm
  phiPn: number;       // design axial capacity (kN)
  phiMn: number;       // design moment capacity (kN·m)
  ratio: number;       // utilization ratio
  status: VerifStatus;
  stirrupDia: number;
  stirrupSpacing: number;
  steps: string[];
}

export interface TorsionResult {
  Tu: number;           // design torsion (kN·m)
  Tcr: number;          // cracking torsion (kN·m)
  phiTn: number;        // design torsion capacity (kN·m)
  AtOverS: number;      // required At/s for torsion (cm²/m, one leg)
  AlReq: number;        // required longitudinal steel for torsion (cm²)
  neglect: boolean;     // if Tu < φ·Tcr/4 → torsion can be neglected
  ratio: number;
  status: VerifStatus;
  steps: string[];
}

export interface BiaxialResult {
  Muy: number;          // moment about Y axis (kN·m)
  Muz: number;          // moment about Z axis (kN·m)
  Nu: number;           // axial force (kN)
  /** No longer computed (Bresler's uniaxial loads); NaN. */
  phiPnx: number;
  phiPny: number;
  phiPn0: number;       // φPn,max (kN)
  phiPn: number;        // the axial force the load contour is cut at (kN, + compression)
  /** Moment capacity on the load contour along the demand's direction, and the demand (kN·m). */
  phiMn: number;
  Mres: number;
  ratio: number;
  status: VerifStatus;
  steps: string[];
}

export interface SlenderResult {
  lu: number;           // unsupported length (m)
  r: number;            // radius of gyration (m)
  k: number;            // effective length factor
  klu_r: number;        // slenderness ratio k·lu/r
  lambda_lim: number;   // slenderness limit (22-40)
  isSlender: boolean;
  Cm: number;           // moment coefficient
  delta_ns: number;     // moment amplification factor (≥ 1.0)
  Mc: number;           // amplified moment (kN·m)
  psiA?: number;        // restraint coefficient at end A
  psiB?: number;        // restraint coefficient at end B
  steps: string[];
}

export interface ElementVerification {
  elementId: number;
  elementType: 'beam' | 'column' | 'wall';
  // Design solicitations (from envelope or specific combination)
  Mu: number;    // kN·m (max absolute moment)
  Vu: number;    // kN (max absolute shear)
  Nu: number;    // kN (axial, + = compression)
  // Section & material
  b: number;     // m
  h: number;     // m
  fc: number;    // MPa
  fy: number;    // MPa
  cover: number; // m
  // Results
  flexure: FlexureResult;
  /** Local bending axis the beam flexure check used: 'My' (vertical-plane,
   *  gravity, depth=h) or 'Mz' (horizontal-plane, lateral, depth=b). Columns
   *  always use 'Mz' (strong axis, SEAM-3). Set by auto-verify. */
  flexureAxis?: 'My' | 'Mz';
  shear: ShearResult;
  column?: ColumnResult;
  torsion?: TorsionResult;
  biaxial?: BiaxialResult;
  slender?: SlenderResult;
  overallStatus: VerifStatus;
  diagnostics?: SolverDiagnostic[];
  /** Governing combination per force component (from combo-driven verification). */
  governingCombos?: {
    flexure?: { comboId: number; comboName: string };
    shear?: { comboId: number; comboName: string };
    axial?: { comboId: number; comboName: string };
    momentY?: { comboId: number; comboName: string };
    shearZ?: { comboId: number; comboName: string };
    torsion?: { comboId: number; comboName: string };
  };
  /** RC detailing rules per CIRSOC 201 Ch. 12 */
  detailing?: DetailingResult;
  /** The engine's re-check of this verification (cirsoc201-engine-gate.ts). */
  engineRecheck?: import('./cirsoc201-engine-gate').EngineRecheck;
  /** Station-based design demands (when available from station-design-forces.ts) */
  stationDemands?: import('../../station-design-forces').ElementDesignDemands;
}

export interface DetailingResult {
  /** Per bar diameter used in this element */
  bars: Array<{
    diameter: number;   // mm
    ld: number;         // straight development length (m)
    ldh: number;        // hooked development length (m)
    lapSplice: number;  // Class B splice = 1.3 × ld (m)
  }>;
  /** Minimum clear spacing between longitudinal bars (m) */
  minClearSpacing: number;
  /** Stirrup hook description */
  stirrupHook: string;
  /** Cover used (m) */
  cover: number;
}

// ─── CIRSOC 201 Constants ───────────────────────────────────────

const PHI_SHEAR = 0.75;     // φ for shear, Tabla 21.2.1 (b)
/**
 * The yield strain the φ ramp starts from.
 *
 * This was a constant, 0.0021, named for fy = 420 and applied whatever fy it
 * was handed. §10.3.3 defines the compression-controlled limit as the yield
 * strain itself, so for a 500 MPa bar the ramp was starting 0.4 ‰ early and
 * crediting a section with more φ than the clause allows. Identical at 420,
 * which is why it survived: every model in the test corpus uses it.
 *
 * `yieldStrain` lives in `cirsoc201-basis.ts` with the rest of the clause.
 */

// ─── Helper Functions ───────────────────────────────────────────


/** Effective depth: h - cover - stirrup - bar/2 */
function effectiveDepth(h: number, cover: number, stirrupDia: number, barDia: number): number {
  return h - cover - (stirrupDia / 1000) - (barDia / 2000);
}

/** Select rebar layout: find best combination of bars to provide As */
function selectRebar(AsReq: number): { count: number; dia: number; area: number; label: string } {
  // Try from Ø12 upward, find min bars
  const candidates: { count: number; dia: number; area: number; label: string }[] = [];

  for (const rebar of REBAR_DB) {
    if (rebar.diameter < 10) continue; // skip Ø6, Ø8 for longitudinal
    const n = Math.ceil(AsReq / rebar.area);
    if (n < 2) continue; // minimum 2 bars
    candidates.push({
      count: Math.max(n, 2),
      dia: rebar.diameter,
      area: Math.max(n, 2) * rebar.area,
      label: `${Math.max(n, 2)} ${rebar.label}`,
    });
  }

  if (candidates.length === 0) {
    // Fallback: max bars of Ø32
    const r = REBAR_DB[REBAR_DB.length - 1];
    const n = Math.max(Math.ceil(AsReq / r.area), 2);
    return { count: n, dia: r.diameter, area: n * r.area, label: `${n} ${r.label}` };
  }

  // Prefer fewer, larger bars (sort by count ascending, then by diameter)
  candidates.sort((a, b) => a.count - b.count || a.dia - b.dia);
  return candidates[0];
}

// ─── Flexure (CIRSOC 201-2025 §22.2, 21.2.2, 9.3.3.1, 9.6.1.2) ─────────
//
// The legacy designer sizes against the ENGINE. It used to carry its own 2005-style rules — ρ
// from the quadratic at φ = 0,90, a doubly-reinforced branch anchored at εt = 4 ‰ with the
// compression steel assumed to yield, a capacity re-derived with fs = fy — and then the engine
// gate (`cirsoc201-engine-gate.ts`) had to reject what they got wrong (a 25×50 under 330 kN·m
// came out at εt = 2,6 ‰). Now the requirement is the least steel the engine's beam check
// passes (`cirsoc201_design_beam`, which searches `cirsoc201_check` itself), the bars are
// chosen for it, and the verdict is the engine's check of the bars chosen, at the depth those
// bars give. The TypeScript that did it is the oracle in __tests__/differential/oracle/.

/** Bar diameter this check assumes for `d` when the caller states none, mm. */
export const ASSUMED_FLEXURE_BAR_DIA_MM = 16;

export interface FlexureOptions {
  /**
   * Bar diameter the tension steel will be, mm — sets the `d` the requirement is sized and
   * reported at. Omitted: Ø16. Either way the bars chosen are checked where THEY sit.
   */
  barDiameterMm?: number;
  /** CIRSOC 201 edition. Absent: 2025, the edition in force. */
  edition?: RegulationEdition;
  /** A compression flange (T or L section), m. Absent: a rectangle of width `b`. */
  flange?: { bf: number; hf: number };
}

interface EngineFlexureDesign {
  kind: 'singly' | 'doubly' | 'impossible';
  /** cm² */
  As: number; AsComp: number;
  /** kN·m, –, m, m, – */
  phiMn: number; phi: number; c: number; a: number; epsilonT: number; epsilonTMin: number;
}

/** The engine's least reinforcement for Mu (kN·m) under Nu (kN, + compression). */
function engineFlexureDesign(
  edition: RegulationEdition, fc: number, fy: number, b: number, h: number, d: number, dPrime: number,
  Mu: number, Nu: number, flange?: { bf: number; hf: number }, allowCompressionSteel = true,
): EngineFlexureDesign {
  const v = cirsoc201Engine('designBeam')(Float64Array.of(
    edition === '2005' ? 2005 : 2025, fc * 1e6, fy * 1e6, 0, b, h, d, dPrime,
    flange?.bf ?? 0, flange?.hf ?? 0, 0, Math.abs(Mu) * 1e3, Nu * 1e3, allowCompressionSteel ? 1 : 0, 0,
  ));
  return {
    kind: v[0] === 0 ? 'singly' : v[0] === 1 ? 'doubly' : 'impossible',
    As: v[1] * 1e4, AsComp: v[2] * 1e4, phiMn: v[3] / 1e3, phi: v[4], c: v[5], a: v[6],
    epsilonT: v[7], epsilonTMin: v[8],
  };
}

export function checkFlexure(
  params: ConcreteDesignParams, Mu: number, Nu: number = 0, opts: FlexureOptions = {},
): FlexureResult {
  const { fc, fy, cover, b, h, stirrupDia } = params;
  const edition = opts.edition ?? '2025';
  const steps: string[] = [];
  const MuAbs = Math.abs(Mu);
  const fixedDia = opts.barDiameterMm !== undefined && opts.barDiameterMm > 0 ? opts.barDiameterMm : undefined;
  const flange = opts.flange && opts.flange.bf > b && opts.flange.hf > 0 ? opts.flange : undefined;
  /* d' to the compression bars' centre, as before (Ø16 assumed until bars are chosen). */
  const dPrimeAssumed = cover + (stirrupDia / 1000) + 0.008;
  const AsMaxPractical = 0.04 * b * h * 1e4; // cm², the stated practical ceiling (not a clause)

  const Ag = flange ? flange.bf * flange.hf + b * (h - flange.hf) : b * h;
  const ductilityApplies = MuAbs > 0 && Nu < 0.10 * fc * 1000 * Ag;

  /*
   * Size at the depth the assumed bar gives (Ø16, or the caller's), choose bars, and check the
   * bars chosen at the depth THEY give. If that check fails (a bigger bar sits higher), size
   * again at that depth — until the bars chosen pass, or the depth stops changing.
   */
  let barDia = fixedDia ?? ASSUMED_FLEXURE_BAR_DIA_MM;
  let d = 0, AsMin = 0, AsDesign = 0;
  let design!: EngineFlexureDesign;
  let rebar!: { count: number; dia: number; area: number; label: string };
  let rebarComp: { count: number; dia: number; area: number; label: string } | undefined;
  let check!: NonNullable<ReturnType<typeof evaluateBeamSection>>;
  let first: { d: number; design: EngineFlexureDesign; AsMin: number; AsDesign: number } | undefined;
  for (let pass = 0; pass < 5; pass++) {
    d = effectiveDepth(h, cover, stirrupDia, barDia);
    design = engineFlexureDesign(edition, fc, fy, b, h, d, dPrimeAssumed, MuAbs, Nu, flange);
    AsMin = minFlexuralSteelCm2(fc, fy, b, d);
    // No steel within the engine's search (tension steel up to 10 % of Ag) works: report that
    // bound, which is above every feasible requirement, so the answer never falls as Mu rises.
    AsDesign = design.kind === 'impossible' ? 0.10 * Ag * 1e4 : Math.max(design.As, AsMin);
    first ??= { d, design, AsMin, AsDesign };
    rebar = selectRebar(AsDesign);
    rebarComp = design.kind === 'doubly' ? selectRebar(Math.max(design.AsComp, AsMin * 0.5)) : undefined;
    // The verdict: the engine's check of the bars chosen, at the depths those bars give.
    const dReal = effectiveDepth(h, cover, stirrupDia, rebar.dia);
    const dPrimeReal = rebarComp ? cover + stirrupDia / 1000 + rebarComp.dia / 2000 : 0;
    const r = evaluateBeamSection({
      edition, fc: fc * 1e6, fy: fy * 1e6, b, h, d: dReal,
      As: rebar.area * 1e-4, AsComp: rebarComp ? rebarComp.area * 1e-4 : 0, dPrime: dPrimeReal,
      Ag, NuCompression: Nu * 1e3, bf: flange?.bf, hf: flange?.hf,
    });
    if (!r) throw new Cirsoc201EngineUnavailable('beam flexure check');
    check = r;
    /*
     * Bars come in whole numbers, so the tension steel provided is more than required — and a
     * section sized AT the ductility limit then falls below it. Top up the compression steel
     * until the bars actually chosen are ductile again (a search; each step is the engine's
     * check), as a designer would, rather than hand back a section the check rejects.
     */
    if (r.flexureValid && ductilityApplies && r.epsilonT < r.epsilonTMin && design.kind !== 'impossible') {
      const compDia = rebarComp?.dia ?? ASSUMED_FLEXURE_BAR_DIA_MM;
      const dPrimeTop = cover + stirrupDia / 1000 + compDia / 2000;
      const ask = (AsCompCm2: number) => evaluateBeamSection({
        edition, fc: fc * 1e6, fy: fy * 1e6, b, h, d: dReal, As: rebar.area * 1e-4,
        AsComp: AsCompCm2 * 1e-4, dPrime: dPrimeTop, Ag, NuCompression: Nu * 1e3, bf: flange?.bf, hf: flange?.hf,
      });
      const ok = (x: number) => { const q = ask(x); return !!q && q.flexureValid && q.epsilonT >= q.epsilonTMin && q.phiMn / 1e3 >= MuAbs; };
      const hiComp = 0.08 * Ag * 1e4;
      if (dPrimeTop < dReal && ok(hiComp)) {
        let lo = rebarComp?.area ?? 0, hi = hiComp;
        for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
        rebarComp = selectRebar(hi);
        // Checked where THOSE bars sit.
        const q = evaluateBeamSection({
          edition, fc: fc * 1e6, fy: fy * 1e6, b, h, d: dReal, As: rebar.area * 1e-4,
          AsComp: rebarComp.area * 1e-4, dPrime: cover + stirrupDia / 1000 + rebarComp.dia / 2000,
          Ag, NuCompression: Nu * 1e3, bf: flange?.bf, hf: flange?.hf,
        });
        if (q) check = q;
      }
    }
    const passes = check.flexureValid && check.phiMn / 1e3 >= MuAbs && !(ductilityApplies && check.epsilonT < check.epsilonTMin);
    if (passes || design.kind === 'impossible' || rebar.dia === barDia) break;
    barDia = rebar.dia;
  }
  /*
   * The requirement reported is the one at the stated depth (the assumed bar, or the caller's):
   * it is what a worked example prints, and it rises with the moment. The bars, and the verdict,
   * are those of the last pass, at the depth the chosen bars give.
   */
  const barsDesign = design;
  ({ d, design, AsMin, AsDesign } = first!);
  // "Needs compression steel" also when no singly-reinforced steel works at all (a footing reports it).
  const isDoubly = barsDesign.kind !== 'singly' || rebarComp !== undefined;
  steps.push(`d = ${(d * 100).toFixed(1)} cm, d' = ${(dPrimeAssumed * 100).toFixed(1)} cm`);
  steps.push(`Mu = ${MuAbs.toFixed(2)} kN·m${Nu !== 0 ? `, Nu = ${Nu.toFixed(2)} kN (+ compresión)` : ''}`);
  steps.push(`As,mín = ${AsMin.toFixed(2)} cm²`);
  if (design.kind === 'impossible') {
    steps.push('⚠ Ninguna armadura dentro de los límites cumple flexión y ductilidad (motor) — sección insuficiente: agrandar la sección');
  } else {
    steps.push(
      `As,req (motor, CIRSOC 201-${edition}) = ${design.As.toFixed(2)} cm²: φMn = ${design.phiMn.toFixed(2)} kN·m, ` +
      `εt = ${(design.epsilonT * 1000).toFixed(2)} ‰${design.epsilonTMin > 0 ? ` ≥ εt,mín = ${(design.epsilonTMin * 1000).toFixed(2)} ‰` : ''}`,
    );
    if (rebarComp) {
      steps.push(`A's,req = ${design.AsComp.toFixed(2)} cm² → armadura compresión: ${rebarComp.label} (${rebarComp.area.toFixed(2)} cm²), ` +
        `dúctil con las barras elegidas`);
    }
  }
  steps.push(`As,req (tracción) = ${AsDesign.toFixed(2)} cm²`);
  steps.push(`Armadura tracción: ${rebar.label} (${rebar.area.toFixed(2)} cm²)`);

  const phiMn = check.flexureValid && Number.isFinite(check.phiMn) ? check.phiMn / 1e3 : 0;
  const epsilonTProv = check.flexureValid ? check.epsilonT : 0;
  const notDuctile = ductilityApplies && check.flexureValid && epsilonTProv < check.epsilonTMin;
  steps.push(`a = ${(check.a * 100).toFixed(2)} cm, c = ${(check.c * 100).toFixed(2)} cm`);
  steps.push(`εt = ${(epsilonTProv * 1000).toFixed(2)}‰ → φ = ${check.phi.toFixed(3)}`);
  steps.push(`φMn = ${phiMn.toFixed(2)} kN·m`);

  const ratio = phiMn > 0 ? MuAbs / phiMn : Infinity;
  let status: VerifStatus = 'ok';
  if (!(ratio <= 1.0)) status = 'fail';
  else if (ratio > 0.9) status = 'warn';
  if (notDuctile) {
    status = 'fail';
    steps.push(`⚠ εt = ${(epsilonTProv * 1000).toFixed(2)} ‰ < εt,mín = ${(check.epsilonTMin * 1000).toFixed(2)} ‰ (${edition === '2005' ? '§10.3.5' : '§9.3.3.1'})`);
  }
  if (design.kind === 'impossible' || barsDesign.kind === 'impossible') status = 'fail';
  if (AsDesign > AsMaxPractical) {
    status = 'fail';
    steps.push(
      `⚠ As,req = ${AsDesign.toFixed(1)} cm² supera el máximo práctico ${AsMaxPractical.toFixed(1)} cm² (4 %·b·h) — sección insuficiente: agrandar la sección`,
    );
  }

  const etc = tensionControlledStrain(fy, edition);
  return {
    Mu: MuAbs, d, a: check.a,
    aReq: design.a, c: design.c, cMax: (d * 0.003) / (0.003 + etc), epsilonT: design.epsilonT,
    AsReq: AsDesign,
    AsFlexural: design.kind === 'impossible' ? 0.10 * Ag * 1e4 : design.As,
    AsMin, AsMax: AsMaxPractical,
    AsProv: rebar.area,
    bars: rebar.label,
    barCount: rebar.count,
    barDia: rebar.dia,
    phiMn,
    ratio,
    status,
    steps,
    isDoublyReinforced: isDoubly,
    AsComp: rebarComp?.area,
    barsComp: rebarComp?.label,
    barCountComp: rebarComp?.count,
    barDiaComp: rebarComp?.dia,
  };
}

// ─── Shear (CIRSOC 201-2025 §22.5, 9.6.3, 9.7.6.2.2) ────────────────
//
// Stirrups are chosen against the engine's shear strength (Tabla 22.5.5.1 with λs, the √f'c
// and fyt caps, Vs ≤ 0,66·√f'c·bw·d, Av,min of 9.6.3.4): the widest spacing, within the
// spacing table, whose φVn reaches Vu with at least Av,min. It used to be 2005's
// (1 + Nu/14Ag)·√f'c/6 with fy uncapped for Vs.

export function checkShear(
  params: ConcreteDesignParams, Vu: number, Nu: number = 0,
  opts: { edition?: RegulationEdition; AsTensionCm2?: number } = {},
): ShearResult {
  const { fc, fy, cover, b, h, stirrupDia } = params;
  const edition = opts.edition ?? '2025';
  const steps: string[] = [];
  const d = effectiveDepth(h, cover, stirrupDia, 16);
  const VuAbs = Math.abs(Vu);
  const stirrupBar = REBAR_DB.find(r => r.diameter === stirrupDia) ?? REBAR_DB[1]; // default Ø8
  steps.push(`Vu = ${VuAbs.toFixed(2)} kN`);
  steps.push(`d = ${(d * 100).toFixed(1)} cm`);

  const ask = (legs: number, s: number) => {
    const r = evaluateBeamSection({
      edition, fc: fc * 1e6, fy: fy * 1e6, b, h, d,
      As: Math.max(opts.AsTensionCm2 ?? 0, 0) * 1e-4,
      Av: legs * stirrupBar.area * 1e-4, s, fyt: fy * 1e6, Ag: b * h, NuCompression: Nu * 1e3,
    });
    if (!r) throw new Cirsoc201EngineUnavailable('beam shear check');
    return r;
  };

  // The concrete's share with the minimum stirrups present (row (a) of Tabla 22.5.5.1).
  const trial = ask(2, Math.max(0.05, Math.floor((d / 2) * 40) / 40));
  const Vc = trial.shearValid ? trial.Vc / 1e3 : 0;
  const phiVc = PHI_SHEAR * Vc;
  const VsReq = Math.max(0, VuAbs / PHI_SHEAR - Vc);
  steps.push(`φVc (motor, CIRSOC 201-${edition}) = ${phiVc.toFixed(2)} kN`);
  steps.push(`Vs,req = ${VsReq.toFixed(2)} kN`);

  // Table 9.7.6.2.2, through THE one evaluator: the spacing along the member and the legs.
  const table = transverseSpacingLimits('2025', {
    VsRequired: VsReq, bw: b, d, fc, cover, stirrupDiaMm: stirrupBar.diameter,
  });
  const legs = table.requiredLegs;

  // The widest spacing (multiples of 2,5 cm, 5 cm at least) the engine passes.
  let spacing = 0.05;
  let chosen = ask(legs, spacing);
  for (let s = Math.floor(table.alongMax * 40) / 40; s >= 0.05 - 1e-9; s -= 0.025) {
    const r = ask(legs, s);
    if (r.shearValid && !r.avBelowMin && r.phiVn / 1e3 >= VuAbs) { spacing = s; chosen = r; break; }
  }
  const phiVn = chosen.shearValid ? chosen.phiVn / 1e3 : 0;
  const AvProv = legs * stirrupBar.area; // cm² per set
  /*
   * The Av/s the demand requires: the spacing at which the engine's φVn equals Vu (a search on
   * s; Vs is Av·fyt·d/s with fyt capped, 22.5.8.5.3), never below Av,min/s.
   */
  let AvOverSReq = 0;
  if (VuAbs > phiVc) {
    let lo = 1e-4, hi = 10;
    for (let k = 0; k < 80; k++) {
      const mid = Math.sqrt(lo * hi);
      const r = ask(legs, mid);
      if (r.shearValid && r.phiVn / 1e3 >= VuAbs) lo = mid; else hi = mid;
    }
    AvOverSReq = AvProv / lo;
  }
  const AvOverSMin = spacing > 0 ? (chosen.AvMin * 1e4) / spacing : 0;
  steps.push(`Av/s,req = ${Math.max(AvOverSReq, AvOverSMin).toFixed(2)} cm²/m`);
  steps.push(`Estribos: ${legs} ramas ${stirrupBar.label} c/${(spacing * 100).toFixed(0)} cm`);
  steps.push(`φVn = ${phiVn.toFixed(2)} kN`);

  const ratio = phiVn > 0 ? VuAbs / phiVn : Infinity;
  let status: VerifStatus = 'ok';
  if (chosen.vsCapped && ratio > 1.0) {
    status = 'fail';
    steps.push(`⚠ Vs limitado a Vs,máx (§22.5.1.2) — sección insuficiente`);
  } else if (!(ratio <= 1.0)) {
    status = 'fail';
  } else if (ratio > 0.9) {
    status = 'warn';
  }
  if (chosen.avBelowMin && h > 0.25) {
    status = 'fail';
    steps.push(`⚠ Av < Av,mín (§9.6.3.4)`);
  }

  return {
    Vu: VuAbs, d, phiVc, Vs: VsReq,
    AvOverS: Math.max(AvOverSReq, AvOverSMin),
    AvOverSReq,
    AvOverSMin,
    spacing, stirrupDia: stirrupBar.diameter, stirrupLegs: legs,
    phiVn, ratio, status, steps,
  };
}

// ─── Column (CIRSOC 201-2025 §22.4, 10.6.1.1) ─────────────────────
//
// Sized against the engine: the least bars, on the app's standard column layout
// (`computeColumnLayout`, the layout the provided-reinforcement verifier and the engine gate
// read), whose design moment at the design axial force reaches Mu — for the compression AND for
// any tension the member sees (`axialLoads`). It used to add an "As for the moment" to half an
// "As for the axial load", a rule with no interaction in it, and to check a straight-line
// interaction with φMn = 0,9·As·fy·0,8·(d − d'); and it took the axial force as a magnitude, so a
// member in tension was checked as if compressed.

export function checkColumn(
  params: ConcreteDesignParams, Nu: number, Mu: number,
  opts: { edition?: RegulationEdition; axialLoads?: number[] } = {},
): ColumnResult {
  const { fc, fy, cover, b, h, stirrupDia } = params;
  const edition = opts.edition ?? '2025';
  const steps: string[] = [];
  const MuAbs = Math.abs(Mu);
  const loads = [...new Set([Nu, ...(opts.axialLoads ?? [])].filter(Number.isFinite))];
  steps.push(`Nu = ${loads.map((n) => `${n.toFixed(2)}`).join(' / ')} kN (+ compresión, − tracción)`);
  steps.push(`Mu = ${MuAbs.toFixed(2)} kN·m`);

  const Ag = b * h;
  const AsMin = COLUMN_STEEL_RATIO.min * Ag * 1e4;
  const AsMax = COLUMN_STEEL_RATIO.max * Ag * 1e4;

  type Candidate = { count: number; dia: number; area: number; worst: number; phiMn: number; phiPn: number; layout: ReturnType<typeof computeColumnLayout> };
  const evaluate = (count: number, dia: number): Candidate | null => {
    const layout = computeColumnLayout(count, dia, b, h, cover, stirrupDia);
    if (layout.bars.length < 4) return null;
    let worst = 0;
    let phiMn = Infinity;
    let phiPn = 0;
    for (const load of loads) {
      const cap = computeColumnCapacity(layout.totalArea, b, h, fc, fy, cover, stirrupDia, load, MuAbs, layout.bars, 'z', edition);
      const u = cap.strainCompatible && cap.ratio > 0 ? 1 / cap.ratio : Infinity;
      worst = Math.max(worst, u);
      phiMn = Math.min(phiMn, cap.phiMn);
      phiPn = cap.phiPn;
    }
    return { count, dia, area: layout.totalArea, worst, phiMn, phiPn, layout };
  };

  // Every standard arrangement within 1 %–8 % of Ag, least steel first.
  const options: Array<{ count: number; dia: number; area: number }> = [];
  for (const rebar of REBAR_DB) {
    if (rebar.diameter < 12) continue;
    for (let count = 4; count <= 24; count += 2) {
      const area = count * rebar.area;
      if (area >= AsMin - 1e-9 && area <= AsMax + 1e-9) options.push({ count, dia: rebar.diameter, area });
    }
  }
  options.sort((p, q) => p.area - q.area || p.count - q.count);
  let chosen: Candidate | null = null;
  let heaviest: Candidate | null = null;
  for (const o of options) {
    const c = evaluate(o.count, o.dia);
    if (!c) continue;
    if (!c.layout.constructible) continue;
    heaviest = !heaviest || c.area > heaviest.area ? c : heaviest;
    if (c.worst <= 1) { chosen = c; break; }
  }
  const impossible = !chosen;
  const pick = chosen ?? heaviest ?? evaluate(4, REBAR_DB[REBAR_DB.length - 1].diameter);
  if (!pick) throw new Cirsoc201EngineUnavailable('column check');
  const barSpec = REBAR_DB.find(r => r.diameter === pick.dia)!;

  steps.push(`As,mín = ${AsMin.toFixed(2)} cm² (1 % Ag), As,máx = ${AsMax.toFixed(2)} cm² (8 % Ag)`);
  steps.push(`Armadura: ${pick.count} ${barSpec.label} (As = ${pick.area.toFixed(2)} cm²)`);
  steps.push(`φPn,máx = ${pick.phiPn.toFixed(0)} kN, φMn(Nu) = ${pick.phiMn.toFixed(2)} kN·m (motor, CIRSOC 201-${edition})`);
  steps.push(`Relación demanda/capacidad = ${pick.worst.toFixed(3)}`);
  if (impossible) steps.push('⚠ Ninguna disposición hasta 8 % de Ag resiste la demanda — sección insuficiente');

  // Stirrups for columns: s ≤ min(12·db, 48·dst, least dimension), as before (detailing).
  const sMax = Math.min(12 * pick.dia / 1000, 48 * stirrupDia / 1000, Math.min(b, h));
  const roundedSpacing = Math.floor(sMax * 40) / 40;
  steps.push(`Estribos: Ø${stirrupDia} c/${(roundedSpacing * 100).toFixed(0)} cm`);

  let status: VerifStatus = 'ok';
  if (impossible || !(pick.worst <= 1.0)) status = 'fail';
  else if (pick.worst > 0.85) status = 'warn';

  return {
    Nu, Mu: MuAbs,
    AsTotal: pick.area,
    AsProv: pick.area,
    bars: `${pick.count} ${barSpec.label}`,
    barCount: pick.count,
    barDia: pick.dia,
    phiPn: pick.phiPn, phiMn: Number.isFinite(pick.phiMn) ? pick.phiMn : 0,
    ratio: pick.worst,
    status,
    stirrupDia,
    stirrupSpacing: roundedSpacing,
    steps,
  };
}

// ─── Torsion Check (CIRSOC 201 §11.5) ────────────────────────────

/**
 * `edition` '2025' applies §22.7.2: √f'c ≤ 8,3 MPa in Tcr (22.7.2.1) and in Vc (22.5.3.1), fy and
 * fyt ≤ 420 MPa in the torsion steel (22.7.2.2 → 20.2.1.3). The default '2005' is unchanged.
 */
export function checkTorsion(params: ConcreteDesignParams, Tu: number, Vu: number = 0, edition: Cirsoc201EditionLike = '2005'): TorsionResult {
  const { fc, b, h, cover, stirrupDia } = params;
  const lim = editionCode(edition) === 2025;
  const fy = lim ? shearFy(params.fy) : params.fy;
  const sqT = lim ? shearSqrtFc(fc) : Math.sqrt(fc);
  const steps: string[] = [];
  if (lim && fy < params.fy) steps.push(`fy, fyt = ${fy} MPa en la armadura de torsión (§22.7.2.2, §20.2.1.3)`);
  if (lim && sqT < Math.sqrt(fc)) steps.push(`√f'c = ${sqT} MPa en Tcr y Vc (§22.7.2.1, §22.5.3.1)`);
  const TuAbs = Math.abs(Tu);
  steps.push(`Tu = ${TuAbs.toFixed(3)} kN·m`);

  // Section properties for torsion
  const Acp = b * h; // m² — area enclosed by outer perimeter
  const pcp = 2 * (b + h); // m — perimeter

  // Cracking torsion: Tcr = 0.33·√f'c · Acp² / pcp (CIRSOC 201 §11.5.1)
  const Tcr = 0.33 * sqT * (Acp * Acp * 1e6) / (pcp) / 1000; // kN·m
  steps.push(`Tcr = 0.33·√f'c·Acp²/pcp = ${Tcr.toFixed(3)} kN·m`);

  // Neglect torsion if Tu < φ·Tcr/4 (§11.5.1)
  const threshold = PHI_SHEAR * Tcr / 4;
  if (TuAbs < threshold) {
    steps.push(`Tu < φ·Tcr/4 = ${threshold.toFixed(3)} kN·m → torsión despreciable`);
    return {
      Tu: TuAbs, Tcr, phiTn: threshold, AtOverS: 0, AlReq: 0,
      neglect: true, ratio: TuAbs / threshold, status: 'ok', steps,
    };
  }

  // Aoh = area enclosed by centerline of stirrups
  const x0 = b - 2 * cover - stirrupDia / 1000;
  const y0 = h - 2 * cover - stirrupDia / 1000;
  const Aoh = x0 * y0; // m²
  const ph = 2 * (x0 + y0); // m — perimeter of Aoh
  const Ao = 0.85 * Aoh; // effective area

  steps.push(`Aoh = ${(Aoh * 1e4).toFixed(1)} cm², ph = ${(ph * 100).toFixed(1)} cm`);

  /*
   * The cross-section limit is §22.7.7.1(a) for a solid section, evaluated below through the
   * shared §22.7 module. The limit this function kept added the two stresses linearly, which is
   * (b), the hollow-section form, and took the torsion stress in kN/m² divided by 1e6 instead of
   * 1e3, a thousand times too small: it never bound (Tu = 120 kN·m on a 30×60 passed). It is
   * removed, not repaired: one limit, one place.
   */
  const d = effectiveDepth(h, cover, stirrupDia, 16);
  const VuAbs = Math.abs(Vu);

  // At/s required for torsion (one leg): At/s = Tu / (φ·2·Ao·fyt·cotθ), cotθ = 1 (θ = 45°).
  // kN·m / (m²·kN/m²) = m²/m; ×1e4 is cm²/m. It was ×1e6, a hundred times too large.
  const AtOverS = (TuAbs / (PHI_SHEAR * 2 * Ao * fy * 1000)) * 1e4; // cm²/m
  steps.push(`At/s,req = ${AtOverS.toFixed(2)} cm²/m (una rama)`);

  // Longitudinal steel for torsion: Al = (At/s)·ph·(fyt/fy)·cot²θ, the same fy for both.
  // cm²/m × m = cm². It was ×100 on top of the ×1e6 above: ten thousand times too large.
  const AlReq = AtOverS * ph; // cm²
  steps.push(`Al,req = ${AlReq.toFixed(2)} cm² (longitudinal por torsión)`);

  /*
   * The capacity this row states. It was the demand itself (φTn = Tu, ratio 1,00 for any Tu): the
   * stirrups are sized here for Tu, so φ·2·Ao·At·fyt/s equals Tu by construction and says nothing.
   * What can bind at this stage is the cross-section (§22.7.7.1): the torque the section admits
   * alongside its Vu, from the same §22.7 module the provided-steel verifier uses. With the
   * section ratio r(T) = √(vV² + vT²)/φ(vc + 0,66√f'c), linear in T under the root, that torque is
   * Tu·√(1 − r(0)²)/√(r(Tu)² − r(0)²), nil when the shear alone fills the section.
   */
  const section = (t: number) => checkTorsion2025({
    b, h, d, cover, stirrupDiaMm: stirrupDia, fc, fy: params.fy, fyt: params.fy, Vu: VuAbs, Tu: t,
  }).sectionRatio;
  const r0 = section(0), r1 = section(TuAbs);
  const phiTn = r0 >= 1 ? 0 : TuAbs * Math.sqrt(1 - r0 * r0) / Math.sqrt(Math.max(r1 * r1 - r0 * r0, 1e-30));
  const ratio = phiTn > 0 ? TuAbs / phiTn : Number.POSITIVE_INFINITY;
  steps.push(`φTn,máx = ${phiTn.toFixed(3)} kN·m con Vu = ${VuAbs.toFixed(2)} kN (§22.7.7.1) → Tu/φTn = ${Number.isFinite(ratio) ? ratio.toFixed(3) : '∞'}`);

  // The status the ratio states: a section the torque overfills fails (§22.7.7.1(a)).
  let status: VerifStatus = 'ok';
  if (!(ratio <= 1 + 1e-6)) {
    status = 'fail';
    steps.push(`⚠ Tensiones combinadas V+T exceden el límite de la sección (§22.7.7.1a)`);
  }

  return {
    Tu: TuAbs, Tcr, phiTn, AtOverS, AlReq,
    neglect: false, ratio, status, steps,
  };
}

// ─── Biaxial bending with axial force (CIRSOC 201-2025 §22.2, 22.4) ─────
//
// The engine's load contour: the moment capacity at the demand's axial force along the demand's
// own moment direction, with the column's bars where the standard layout puts them
// (`computeBiaxialCapacity`, `Section::biaxial`). This was Bresler's reciprocal load with
// uniaxial capacities "estimated" by linear interpolation to a "rough balanced" point, and was
// not re-checked by the engine.

export function checkBiaxial(
  params: ConcreteDesignParams,
  Nu: number, Muy: number, Muz: number,
  AsProvided: number, // cm² — total As already designed
  opts: { edition?: RegulationEdition; barCount?: number; barDia?: number } = {},
): BiaxialResult {
  const { fc, fy, b, h, cover, stirrupDia } = params;
  const edition = opts.edition ?? '2025';
  const steps: string[] = [];
  const MuyAbs = Math.abs(Muy);
  const MuzAbs = Math.abs(Muz);
  steps.push(`Nu = ${Nu.toFixed(1)} kN, Muy = ${MuyAbs.toFixed(2)} kN·m, Muz = ${MuzAbs.toFixed(2)} kN·m`);

  // The bars: the stated arrangement, or the least standard one that gives the stated area.
  let count = opts.barCount ?? 0;
  let dia = opts.barDia ?? 0;
  if (!(count >= 4 && dia > 0)) {
    const spec = REBAR_DB.filter((r) => r.diameter >= 12)
      .map((r) => ({ r, n: Math.max(4, 2 * Math.ceil(AsProvided / r.area / 2)) }))
      .sort((p, q) => p.n * p.r.area - q.n * q.r.area)[0];
    count = spec.n; dia = spec.r.diameter;
  }
  const layout = computeColumnLayout(count, dia, b, h, cover, stirrupDia);
  const cap = computeBiaxialCapacity(layout.totalArea, b, h, fc, fy, cover, stirrupDia, Nu, MuyAbs, MuzAbs, layout.bars, edition);
  const ratio = cap.ratio > 0 ? 1 / cap.ratio : Infinity;
  steps.push(`Armadura: ${count} Ø${dia} (As = ${layout.totalArea.toFixed(2)} cm²)`);
  steps.push(`φPn,máx = ${cap.phiPn0.toFixed(0)} kN`);
  steps.push(`φMn sobre la dirección de (Muy, Muz) a Nu (motor, contorno de carga) = ${cap.phiMn.toFixed(2)} kN·m`);
  steps.push(`Relación √(Muy² + Muz²)/φMn = ${Number.isFinite(ratio) ? ratio.toFixed(3) : '∞'}`);

  let status: VerifStatus = 'ok';
  if (!cap.rhoOk || !(ratio <= 1.0)) status = 'fail';
  else if (ratio > 0.85) status = 'warn';

  return {
    Muy: MuyAbs, Muz: MuzAbs, Nu,
    phiPnx: NaN, phiPny: NaN, phiPn0: cap.phiPn0, phiPn: Nu,
    phiMn: cap.phiMn, Mres: Math.hypot(MuyAbs, MuzAbs),
    ratio, status, steps,
  };
}

// ─── Slender Column Moment Amplification (CIRSOC 201 §10.10) ────

/**
 * Compute effective length factor k from restraint coefficients Ψ
 * Formula: k = 1 - 1/(5+9·ΨA) - 1/(5+9·ΨB) - 1/(10+ΨA·ΨB), with k ≥ 0.6
 * For non-sway (braced) frames.
 */
export function computeK(psiA: number, psiB: number): number {
  const clamped_A = Math.max(0.2, Math.min(20, psiA));
  const clamped_B = Math.max(0.2, Math.min(20, psiB));
  const k = 1 - 1 / (5 + 9 * clamped_A) - 1 / (5 + 9 * clamped_B) - 1 / (10 + clamped_A * clamped_B);
  return Math.max(0.6, k);
}

/**
 * Compute restraint coefficient Ψ at a joint.
 * @param colStiffness sum of Ic/lc for all columns meeting at the joint (reduced: 0.7·Ig)
 * @param beamStiffness sum of x·Iv/lv for all beams meeting at the joint (reduced: 0.35·Ig)
 *   where x = 0 (cantilever), 0.5 (far end pinned), 1.0 (far end fixed)
 */
export function computePsi(colStiffness: number, beamStiffness: number): number {
  if (beamStiffness <= 0) return 20; // pinned end
  return Math.max(0.2, Math.min(20, colStiffness / beamStiffness));
}

/**
 * Minimal interfaces for model data needed by Ψ computation.
 * Avoids coupling to the full model store types.
 */
interface PsiNode { id: number; x: number; y: number; z?: number }
interface PsiElement {
  id: number; nodeI: number; nodeJ: number; materialId: number; sectionId: number;
  releaseI?: { my: boolean; mz: boolean; t: boolean };
  releaseJ?: { my: boolean; mz: boolean; t: boolean };
}
interface PsiSection { id: number; iz: number; iy?: number; b?: number; h?: number }
interface PsiMaterial { id: number; e: number }
interface PsiSupport { nodeId: number }

/**
 * Compute restraint coefficients Ψ at both ends of a column from model topology.
 *
 * Ψ = Σ(EI_col / L_col) / Σ(x · EI_beam / L_beam)
 *   - Column stiffness uses 0.70·Ig (CIRSOC 201 §10.10.6.1)
 *   - Beam stiffness uses 0.35·Ig
 *   - x = boundary modifier: 1.0 (far end fixed/continuous), 0.5 (far end pinned/hinged)
 *   - If a joint has a support, Ψ = 0.2 (quasi-fixed) for fixed supports
 *     or 20 (quasi-pinned) for pinned/roller supports
 *
 * Returns { psiA, psiB } for the column's nodeI (A) and nodeJ (B).
 */
export function computeJointPsiFromModel(
  columnId: number,
  nodes: Map<number, PsiNode>,
  elements: Map<number, PsiElement>,
  sections: Map<number, PsiSection>,
  materials: Map<number, PsiMaterial>,
  supports: Map<number, PsiSupport & { type?: string }>,
): { psiA: number; psiB: number } {
  const col = elements.get(columnId);
  if (!col) return { psiA: 1.0, psiB: 1.0 };
  // A 3D model is Z-up; a model with no Z at all is a plane frame, Y-up.
  let zUp = false;
  for (const [, n] of nodes) if (Math.abs(n.z ?? 0) > 1e-9) { zUp = true; break; }

  function computeAtJoint(jointNodeId: number): number {
    // Check if joint has a support
    const sup = supports.get(jointNodeId);
    if (sup) {
      const t = (sup as any).type as string | undefined;
      if (t === 'fixed' || t === 'fixed3d') return 0.2;   // quasi-empotrado
      return 20; // pinned, roller, etc. → quasi-articulado
    }

    // Find all elements meeting at this joint
    let colStiffnessSum = 0;
    let beamStiffnessSum = 0;

    for (const [, elem] of elements) {
      if (elem.nodeI !== jointNodeId && elem.nodeJ !== jointNodeId) continue;

      const nI = nodes.get(elem.nodeI);
      const nJ = nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;

      const dx = nJ.x - nI.x;
      const dy = nJ.y - nI.y;
      const dz = (nJ.z ?? 0) - (nI.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-6) continue;

      const sec = sections.get(elem.sectionId);
      const mat = materials.get(elem.materialId);
      if (!sec || !mat) continue;

      const E = mat.e * 1000; // MPa → kN/m²

      // Classify: vertical elements are columns, horizontal are beams, along the model's up axis.
      const up = zUp ? dz : dy;
      const horizLen = zUp ? Math.sqrt(dx * dx + dy * dy) : Math.sqrt(dx * dx + dz * dz);
      const isVert = Math.abs(up) > horizLen;
      // One Ψ serves both planes: a beam bends about its strong axis (Iz), and a column takes its
      // larger inertia, which gives the larger Ψ and so the larger magnifier.
      const Ig = isVert ? Math.max(sec.iz, sec.iy ?? sec.iz) : sec.iz;

      if (isVert) {
        // Column: 0.70·E·Ig / L
        colStiffnessSum += 0.70 * E * Ig / L;
      } else {
        // Beam: x · 0.35·E·Ig / L
        // x depends on far-end condition of this beam
        const farNodeId = elem.nodeI === jointNodeId ? elem.nodeJ : elem.nodeI;
        const farHinge = elem.nodeI === jointNodeId ? (elem.releaseJ?.mz === true) : (elem.releaseI?.mz === true);
        const farSup = supports.get(farNodeId);

        let x = 1.0; // default: far end fixed or continuous
        if (farHinge) {
          x = 0.5; // far end has hinge → pinned condition
        } else if (farSup) {
          const ft = (farSup as any).type as string | undefined;
          if (ft === 'pinned' || ft === 'pinned3d' || ft?.startsWith('roller')) {
            x = 0.5; // far end pinned support
          }
        }

        beamStiffnessSum += x * 0.35 * E * Ig / L;
      }
    }

    return computePsi(colStiffnessSum, beamStiffnessSum);
  }

  return {
    psiA: computeAtJoint(col.nodeI),
    psiB: computeAtJoint(col.nodeJ),
  };
}

/**
 * M2,min of §6.6.4.5.4 (ACI 318-19 6.6.4.5.4): a slender column is designed for at least
 * Pu·(15 mm + 0.03·h), h in metres being the depth in the direction of the moment.
 *
 * The non-sway magnifier multiplies M2, and a column whose analysis gives it no end moment —
 * a pin-ended strut, a column under a symmetric floor — would otherwise be magnified from zero
 * and checked as pure compression however slender it is. One function, so the report
 * (`checkSlender`) and the verifier (`verifyProvidedReinforcement`) cannot disagree on it.
 * Tension (Pu ≤ 0) asks for nothing.
 */
export function slenderMinimumMoment(Pu: number, h: number): number {
  return Pu > 0 ? Pu * (0.015 + 0.03 * h) : 0;
}

export function checkSlender(
  params: ConcreteDesignParams,
  Nu: number, Mu: number, Lu: number,
  opts?: {
    M1?: number;      // smaller end moment (+ = same sign as M2, - = reverse curvature)
    M2?: number;      // larger end moment (always positive)
    psiA?: number;    // restraint Ψ at end A
    psiB?: number;    // restraint Ψ at end B
    PuD?: number;     // factored dead load (kN) for βdns
    PuL?: number;     // factored live load (kN) for βdns
  },
): SlenderResult {
  const { fc, b, h } = params;
  const steps: string[] = [];

  const NuAbs = Math.abs(Nu);
  const MuAbs = Math.abs(Mu);

  // Radius of gyration: r = 0.3·h for rectangular sections (§10.10.1.2)
  const r = 0.3 * h;
  steps.push(`r = 0.3·h = ${(r * 100).toFixed(1)} cm`);

  // ─── Effective length factor k ───
  let k: number;
  let psiAVal: number | undefined;
  let psiBVal: number | undefined;
  if (opts?.psiA !== undefined && opts?.psiB !== undefined) {
    psiAVal = Math.max(0.2, Math.min(20, opts.psiA));
    psiBVal = Math.max(0.2, Math.min(20, opts.psiB));
    k = computeK(psiAVal, psiBVal);
    steps.push(`ΨA = ${psiAVal.toFixed(2)}, ΨB = ${psiBVal.toFixed(2)}`);
    steps.push(`k = ${k.toFixed(3)} (fórmula con Ψ)`);
  } else {
    k = 1.0; // Conservative default for non-sway
    steps.push(`k = 1.0 (conservador, sin datos de nudos)`);
  }

  const klu_r = k * Lu / r;
  steps.push(`Lu = ${(Lu * 100).toFixed(0)} cm`);
  steps.push(`k·Lu/r = ${klu_r.toFixed(1)}`);

  // ─── Slenderness limit λm,lím ───
  let M1 = opts?.M1;
  let M2 = opts?.M2;
  let lambda_lim: number;

  if (M1 !== undefined && M2 !== undefined && Math.abs(M2) > 0.01) {
    // M1/M2 ratio: positive if same curvature, negative if reverse
    const ratio_M = M1 / M2;
    lambda_lim = Math.min(Math.max(34 - 12 * ratio_M, 22), 40);
    steps.push(`M1/M2 = ${ratio_M.toFixed(3)} → λm,lím = 34 - 12·(M1/M2) = ${lambda_lim.toFixed(1)}`);
  } else if (MuAbs < 0.01) {
    // No moment: M1 = M2 = 0
    lambda_lim = 22;
    steps.push(`M1 = M2 = 0 → λm,lím = 22`);
  } else {
    // Unknown end moments — use conservative limit
    lambda_lim = 22;
    steps.push(`λm,lím = 22 (sin datos M1/M2)`);
  }

  const isSlender = klu_r > lambda_lim;

  if (klu_r > 100) {
    steps.push(`⚠ k·Lu/r > 100 → requiere análisis de 2° orden o redimensionar`);
  }

  if (!isSlender) {
    steps.push(`k·Lu/r = ${klu_r.toFixed(1)} < ${lambda_lim.toFixed(1)} → columna corta`);
    return {
      lu: Lu, r, k, klu_r, lambda_lim,
      isSlender: false, Cm: 1.0, delta_ns: 1.0, Mc: MuAbs,
      psiA: psiAVal, psiB: psiBVal,
      steps,
    };
  }

  steps.push(`k·Lu/r = ${klu_r.toFixed(1)} > ${lambda_lim.toFixed(1)} → columna esbelta → momentos amplificados`);

  // ─── Cm coefficient ───
  let Cm: number;
  if (M1 !== undefined && M2 !== undefined && Math.abs(M2) > 0.01) {
    Cm = Math.max(0.4, 0.6 + 0.4 * (M1 / M2));
    steps.push(`Cm = 0.6 + 0.4·(M1/M2) = ${Cm.toFixed(3)}`);
  } else {
    Cm = 1.0; // Conservative default (single curvature)
    steps.push(`Cm = 1.0 (conservador)`);
  }

  // ─── βdns (sustained load factor) ───
  let betaDns: number;
  if (opts?.PuD !== undefined && opts?.PuL !== undefined && NuAbs > 0.01) {
    betaDns = (Math.abs(opts.PuD) + 0.2 * Math.abs(opts.PuL)) / NuAbs;
    betaDns = Math.min(betaDns, 1.0); // cap at 1.0
    steps.push(`βdns = (PuD + 0.2·PuL)/Pu = ${betaDns.toFixed(3)}`);
  } else {
    betaDns = 0.6; // Default for typical sustained loading
    steps.push(`βdns = 0.6 (estimación)`);
  }

  // ─── Euler critical load Pc ───
  const Ec = 4700 * Math.sqrt(fc); // MPa
  const Ig = b * Math.pow(h, 3) / 12; // m⁴
  const EI_eff = (0.4 * Ec * 1000 * Ig) / (1 + betaDns); // kN·m²
  const Pc = Math.PI * Math.PI * EI_eff / Math.pow(k * Lu, 2);
  steps.push(`EI,eff = 0.4·Ec·Ig/(1+βdns) = ${EI_eff.toFixed(0)} kN·m²`);
  steps.push(`Pc = π²·EI,eff/(k·Lu)² = ${Pc.toFixed(0)} kN`);

  // ─── Moment amplification δns ───
  let delta_ns = Cm / (1 - NuAbs / (0.75 * Pc));
  if (delta_ns < 1.0) delta_ns = 1.0;
  if (!isFinite(delta_ns) || delta_ns > 10) {
    delta_ns = 10;
    steps.push(`⚠ δns muy alto → columna inestable`);
  }
  steps.push(`δns = Cm/(1-Pu/(0.75·Pc)) = ${delta_ns.toFixed(3)}`);

  // ─── Design moment M2C and Mc ───
  // M2C = max(M2, M2,min), §6.6.4.5.4 — the same function the verifier applies.
  const M2min = slenderMinimumMoment(NuAbs, h);
  const M2C = Math.max(MuAbs, M2min);
  if (M2C > MuAbs) {
    steps.push(`M2,mín = Pu·(15mm + 0.03h) = ${M2min.toFixed(2)} kN·m > M2 → se usa M2,mín`);
  }

  const McFinal = delta_ns * M2C;
  steps.push(`Mc = δns·M2C = ${delta_ns.toFixed(3)}·${M2C.toFixed(2)} = ${McFinal.toFixed(2)} kN·m`);

  return {
    lu: Lu, r, k, klu_r, lambda_lim,
    isSlender, Cm, delta_ns, Mc: McFinal,
    psiA: psiAVal, psiB: psiBVal,
    steps,
  };
}

// ─── Main Verification Function ─────────────────────────────────

export interface VerificationInput {
  elementId: number;
  elementType: 'beam' | 'column' | 'wall';
  Mu: number;    // kN·m (max |Mz|)
  Vu: number;    // kN (max |Vy|)
  Nu: number;    // kN (+ = compression)
  /**
   * Axial force for the shear check, kN, + = compression, − = tension. Absent → `Nu`.
   *
   * Separate because `Nu` above is a magnitude the column checks read as compression, and the
   * concrete's shear strength goes the other way under tension: §11.3 takes it down, not up.
   */
  NuShear?: number;
  /**
   * Every signed axial force the member sees, kN, + = compression. The column is checked under
   * each; absent → `[Nu]`. (`Nu` above is a magnitude, and checking a member in tension under it
   * as compression was the legacy column verdict's defect.)
   */
  axialLoads?: number[];
  /** CIRSOC 201 edition. Absent: 2025, the edition in force. */
  edition?: RegulationEdition;
  b: number;     // m
  h: number;     // m
  fc: number;    // MPa
  fy: number;    // MPa (rebar)
  cover: number; // m
  stirrupDia: number; // mm
  // Sprint 2 — optional additional solicitations
  Muy?: number;   // kN·m — moment about Y (for biaxial columns)
  Vz?: number;    // kN — shear in Z direction
  Tu?: number;    // kN·m — torsion
  Lu?: number;    // m — unsupported length (for slender columns)
  // Slender column parameters (optional — conservative defaults if omitted)
  M1?: number;    // kN·m — smaller end moment (positive = same curvature as M2)
  M2?: number;    // kN·m — larger end moment (always taken positive)
  psiA?: number;  // restraint coefficient Ψ at end A (0.2 = fixed, 20 = pinned)
  psiB?: number;  // restraint coefficient Ψ at end B
  PuD?: number;   // kN — factored dead load for βdns
  PuL?: number;   // kN — factored live load for βdns
}

// ─── Detailing Rules (CIRSOC 201 Ch. 12) ────────────────────

/**
 * Development and lap lengths for the report's detailing table, Tabla 25.4.2.3 and §25.4.2.5.
 *
 * The table knows a diameter and the member, not the bar layout, so it prints the length that
 * is safe for every bar of that diameter in the member: the «other cases» row, and for a beam
 * the top-bar ψt = 1,3 when its depth leaves more than 300 mm of concrete below the top steel.
 * It printed the favourable row with ψt = 1 — a third short for an unestablished layout, and
 * 30 % more for a top bar. A column's bars are vertical: ψt = 1.
 */
function computeDetailingRules(fc: number, fy: number, cover: number, stirrupDia: number, barDiameters: number[], member: { isBeam: boolean; h: number }): DetailingResult {
  const uniqueDias = [...new Set(barDiameters)].sort((a, b) => a - b);

  const bars = uniqueDias.map(db => {
    // ld from Tabla 25.4.2.3, the same source as the design check and the drawings. The 2005
    // fy·db/(3,2·√f'c) printed about half of it in the report's detailing table.
    const concreteBelowM = member.isBeam ? concreteBelowTopBars(member.h, cover, stirrupDia, db) : 0;
    const ld = deriveDevelopment({
      diameterMm: db, fy, fc, favourableSpacing: false, psiT: topBarFactor(concreteBelowM), edition: '2025',
    }).ldM;
    // ldh by §25.4.3.1 with √f'c ≤ 8,3 MPa (§25.4.1.4), the one implementation.
    const ldh = deriveHookedDevelopment({ diameterMm: db, fy, fc, edition: '2025' }).ldhM;
    // Lap splice Class B = 1.3 × ld (CIRSOC 201 12.15.1)
    const lapSplice = 1.3 * ld;

    return {
      diameter: db,
      ld: Math.round(ld * 100) / 100,
      ldh: Math.round(ldh * 100) / 100,
      lapSplice: Math.round(lapSplice * 100) / 100,
    };
  });

  // Min clear spacing per CIRSOC 201 7.6.1: max(db, 25mm, 4/3 × dagg)
  const maxDb = Math.max(...uniqueDias) / 1000;
  const minClearSpacing = Math.max(maxDb, 0.025, (4 / 3) * 0.019);

  // Stirrup hook per CIRSOC 201 7.1.3
  const extension = stirrupDia <= 16 ? 6 * stirrupDia : 8 * stirrupDia;
  const stirrupHook = `135° + ${extension}mm (${stirrupDia <= 16 ? 6 : 8}db)`;

  return { bars, minClearSpacing: Math.round(minClearSpacing * 1000) / 1000, stirrupHook, cover };
}

export function verifyElement(input: VerificationInput): ElementVerification {
  const params: ConcreteDesignParams = {
    fc: input.fc,
    fy: input.fy,
    cover: input.cover,
    b: input.b,
    h: input.h,
    stirrupDia: input.stirrupDia,
  };

  // Walls and columns share the same structural checks (flexo-compression)
  const isVertical = input.elementType === 'column' || input.elementType === 'wall';

  // For slender columns/walls, amplify moment before flexure/column check
  let slender: SlenderResult | undefined;
  let designMu = input.Mu;
  if (isVertical && input.Lu && input.Lu > 0) {
    slender = checkSlender(params, input.Nu, input.Mu, input.Lu, {
      M1: input.M1,
      M2: input.M2,
      psiA: input.psiA,
      psiB: input.psiB,
      PuD: input.PuD,
      PuL: input.PuL,
    });
    if (slender.isSlender) {
      designMu = slender.Mc; // use amplified moment
    }
  }

  const edition = input.edition ?? '2025';
  /*
   * A beam's flexure is checked with the axial force acting on it (finding 17): the signed
   * force the shear check uses, which is the tension whenever the member sees any. A column's
   * flexural steel is the column check's business; its beam-style flexure stays axial-free.
   */
  const flexureNu = isVertical ? 0 : (input.NuShear ?? 0);
  const flexure = checkFlexure(params, designMu, flexureNu, { edition });
  const shear = checkShear(params, input.Vu, input.NuShear ?? input.Nu, { edition, AsTensionCm2: flexure.AsProv });
  let column: ColumnResult | undefined;
  let biaxial: BiaxialResult | undefined;
  let torsionResult: TorsionResult | undefined;

  if (isVertical) {
    const loads = input.axialLoads && input.axialLoads.length > 0 ? input.axialLoads : [input.Nu];
    column = checkColumn(params, loads[0], designMu, { edition, axialLoads: loads.slice(1) });

    // Biaxial check if Muy is provided, under every axial force the member sees
    if (input.Muy && Math.abs(input.Muy) > 0.01) {
      let worst: BiaxialResult | undefined;
      for (const load of loads) {
        const r = checkBiaxial(params, load, input.Muy, designMu, column.AsProv,
          { edition, barCount: column.barCount, barDia: column.barDia });
        if (!worst || !(r.ratio <= worst.ratio)) worst = r;
      }
      biaxial = worst;
    }
  }

  // Torsion check if Tu is provided
  if (input.Tu && Math.abs(input.Tu) > 0.001) {
    torsionResult = checkTorsion(params, input.Tu, input.Vu, edition);
  }

  // Overall status
  let overallStatus: VerifStatus = 'ok';
  const allStatuses = [flexure.status, shear.status, column?.status, torsionResult?.status, biaxial?.status];
  if (allStatuses.some(s => s === 'fail')) {
    overallStatus = 'fail';
  } else if (allStatuses.some(s => s === 'warn')) {
    overallStatus = 'warn';
  }

  // Build diagnostics from check results
  const diags: SolverDiagnostic[] = [];

  if (flexure.status === 'fail') {
    diags.push({ severity: 'error', code: 'VERIF_FAIL_FLEXURE', message: 'diag.verifFailFlexure', source: 'verification', elementIds: [input.elementId], details: { ratio: flexure.ratio, phiMn: flexure.phiMn, Mu: flexure.Mu } });
  } else if (flexure.status === 'warn') {
    diags.push({ severity: 'warning', code: 'VERIF_WARN_FLEXURE', message: 'diag.verifWarnFlexure', source: 'verification', elementIds: [input.elementId], details: { ratio: flexure.ratio } });
  }

  if (shear.status === 'fail') {
    diags.push({ severity: 'error', code: 'VERIF_FAIL_SHEAR', message: 'diag.verifFailShear', source: 'verification', elementIds: [input.elementId], details: { ratio: shear.ratio, phiVn: shear.phiVn, Vu: shear.Vu } });
  } else if (shear.status === 'warn') {
    diags.push({ severity: 'warning', code: 'VERIF_WARN_SHEAR', message: 'diag.verifWarnShear', source: 'verification', elementIds: [input.elementId], details: { ratio: shear.ratio } });
  }

  if (column) {
    if (column.status === 'fail') {
      diags.push({ severity: 'error', code: 'VERIF_FAIL_COLUMN', message: 'diag.verifFailColumn', source: 'verification', elementIds: [input.elementId], details: { ratio: column.ratio, phiPn: column.phiPn, Nu: column.Nu } });
    } else if (column.status === 'warn') {
      diags.push({ severity: 'warning', code: 'VERIF_WARN_COLUMN', message: 'diag.verifWarnColumn', source: 'verification', elementIds: [input.elementId], details: { ratio: column.ratio } });
    }
  }

  if (torsionResult && !torsionResult.neglect) {
    if (torsionResult.status === 'fail') {
      diags.push({ severity: 'error', code: 'VERIF_FAIL_TORSION', message: 'diag.verifFailTorsion', source: 'verification', elementIds: [input.elementId], details: { ratio: torsionResult.ratio, Tu: torsionResult.Tu } });
    } else if (torsionResult.status === 'warn') {
      diags.push({ severity: 'warning', code: 'VERIF_WARN_TORSION', message: 'diag.verifWarnTorsion', source: 'verification', elementIds: [input.elementId], details: { ratio: torsionResult.ratio } });
    }
  }

  if (biaxial) {
    if (biaxial.status === 'fail') {
      diags.push({ severity: 'error', code: 'VERIF_FAIL_BIAXIAL', message: 'diag.verifFailBiaxial', source: 'verification', elementIds: [input.elementId], details: { ratio: biaxial.ratio, phiPn: biaxial.phiPn, Nu: biaxial.Nu } });
    } else if (biaxial.status === 'warn') {
      diags.push({ severity: 'warning', code: 'VERIF_WARN_BIAXIAL', message: 'diag.verifWarnBiaxial', source: 'verification', elementIds: [input.elementId], details: { ratio: biaxial.ratio } });
    }
  }

  if (slender && slender.isSlender && slender.delta_ns > 2.0) {
    diags.push({ severity: 'warning', code: 'VERIF_WARN_SLENDER', message: 'diag.verifWarnSlender', source: 'verification', elementIds: [input.elementId], details: { delta_ns: slender.delta_ns, klu_r: slender.klu_r } });
  }

  return {
    elementId: input.elementId,
    elementType: input.elementType,
    Mu: input.Mu,
    Vu: input.Vu,
    Nu: input.Nu,
    b: input.b,
    h: input.h,
    fc: input.fc,
    fy: input.fy,
    cover: input.cover,
    flexure,
    shear,
    column,
    torsion: torsionResult,
    biaxial,
    slender,
    overallStatus,
    diagnostics: diags.length > 0 ? diags : undefined,
    detailing: computeDetailingRules(
      input.fc, input.fy, input.cover, input.stirrupDia,
      column
        ? [column.barDia, flexure.barDia].filter(d => d > 0)
        : [flexure.barDia],
      { isBeam: input.elementType === 'beam', h: input.h },
    ),
  };
}

// ─── Classify element as beam or column ─────────────────────────

/**
 * Heuristic: if a bar is more vertical than horizontal, it's a column; otherwise a beam.
 * Convention: Z is the vertical (gravity) axis — Z-up, matching the project's canonical 3D convention.
 *
 * A bar is never a wall. Walls are modelled with shells and designed by the floor pass; a bar
 * whose section is longer than three times its width (a 20×70 column, common in practice) used
 * to come back 'wall' here and be refused by the design. It is a column, designed with the
 * column rules, and `isElongatedSection` lets the design surface say so.
 * The section arguments are kept for the callers' signature and no longer change the answer.
 */
export function classifyElement(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  _sectionB?: number, _sectionH?: number,
): 'beam' | 'column' | 'wall' {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const dz = Math.abs(z2 - z1);
  const horizontal = Math.sqrt(dx * dx + dy * dy);
  return dz > horizontal ? 'column' : 'beam';
}

/** A section longer than three times its width: designed as a column, flagged as such. */
export function isElongatedSection(b?: number, h?: number): boolean {
  if (!b || !h) return false;
  return Math.max(b, h) / Math.min(b, h) > 3;
}
