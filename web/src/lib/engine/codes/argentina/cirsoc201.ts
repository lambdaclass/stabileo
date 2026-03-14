// CIRSOC 201 — Reinforced Concrete Verification Engine
// Implements design checks for flexure, shear, and flexo-compression
// per Argentine code CIRSOC 201-2005 (based on ACI 318)
//
// Units: kN, m, MPa, cm² (for reinforcement areas)

import type { SolverDiagnostic } from '../../types';

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
  a: number;           // stress block depth (m)
  AsReq: number;       // required steel area (cm²)
  AsMin: number;       // minimum steel area (cm²)
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
  phiPnx: number;       // capacity for Muz alone
  phiPny: number;       // capacity for Muy alone
  phiPn0: number;       // pure axial capacity
  phiPn: number;        // biaxial capacity (Bresler)
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
  shear: ShearResult;
  column?: ColumnResult;
  torsion?: TorsionResult;
  biaxial?: BiaxialResult;
  slender?: SlenderResult;
  overallStatus: VerifStatus;
  diagnostics?: SolverDiagnostic[];
}

// ─── CIRSOC 201 Constants ───────────────────────────────────────

const PHI_FLEXURE = 0.9;    // φ for flexure (tension-controlled)
const PHI_SHEAR = 0.75;     // φ for shear
const PHI_COLUMN = 0.65;    // φ for tied columns (compression-controlled)
const BETA1_THRESHOLD = 28; // MPa — β1 starts reducing above this
const EPSILON_Y_420 = 0.0021; // yield strain for fy=420

// ─── Helper Functions ───────────────────────────────────────────

/** Whitney stress block parameter β1 per CIRSOC 201 */
function beta1(fc: number): number {
  if (fc <= BETA1_THRESHOLD) return 0.85;
  const b = 0.85 - 0.05 * (fc - BETA1_THRESHOLD) / 7;
  return Math.max(0.65, b);
}

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

// ─── Flexure Check (CIRSOC 201 §10.2-10.3) ─────────────────────

export function checkFlexure(params: ConcreteDesignParams, Mu: number, Nu: number = 0): FlexureResult {
  const { fc, fy, cover, b, h, stirrupDia } = params;
  const steps: string[] = [];

  // Assume Ø16 for initial effective depth calculation
  const assumedBarDia = 16;
  const d = effectiveDepth(h, cover, stirrupDia, assumedBarDia);
  const dPrime = cover + (stirrupDia / 1000) + 0.008; // d' for compression steel
  steps.push(`d = ${(d * 100).toFixed(1)} cm, d' = ${(dPrime * 100).toFixed(1)} cm`);

  const MuAbs = Math.abs(Mu);
  // Reduce moment to centroid of tension steel if axial force present
  const phi0 = PHI_FLEXURE;
  const NuPhiTerm = Nu !== 0 ? (Nu / phi0) * (d - h / 2) : 0;
  const Mus = MuAbs + NuPhiTerm; // Mus = |Mu| + (Nu/φ)·(d - h/2), sign convention
  steps.push(`Mu = ${MuAbs.toFixed(2)} kN·m`);
  if (Nu !== 0) steps.push(`Mus = |Mu| + (Nu/φ)·(d-h/2) = ${Mus.toFixed(2)} kN·m`);

  const fc_kPa = fc * 1000; // MPa → kN/m²
  const fy_kPa = fy * 1000;

  // α1 and β1
  const alpha1 = 0.85;
  const b1 = beta1(fc);

  // Minimum reinforcement: As,min = max(√f'c/(4·fy), 1.4/fy) · bw · d
  const rhoMin1 = (0.25 * Math.sqrt(fc)) / fy;
  const rhoMin2 = 1.4 / fy;
  const rhoMin = Math.max(rhoMin1, rhoMin2);
  const AsMin = rhoMin * b * d * 1e4;
  steps.push(`As,mín = ${AsMin.toFixed(2)} cm²`);

  // Maximum reinforcement (singly reinforced): ρ_max for εt = 5‰
  // At εt=5‰: c/d = 3/(3+5) = 0.375, a = β1·c
  const cAtEt5 = d * 0.003 / (0.003 + 0.005); // c at εt = 5‰
  const aAtEt5 = b1 * cAtEt5;
  const AsMaxSingly = alpha1 * fc * b * aAtEt5 / fy * 1e4; // cm²
  steps.push(`As,máx (simple) = ${AsMaxSingly.toFixed(2)} cm²`);

  // Try singly-reinforced design first
  let phi = phi0;
  const MuDesign = Math.max(Mus, 0.01); // avoid zero
  const Rn = MuDesign / (phi * b * d * d);
  const term = 2 * Rn / (alpha1 * fc_kPa);

  let isDoubly = false;
  let AsReq: number;
  let AsCompReq = 0; // compression steel
  let a: number;
  let c: number;

  if (term < 1) {
    // Singly reinforced — quadratic formula for ρ
    const rho = (alpha1 * fc / fy) * (1 - Math.sqrt(1 - term));
    AsReq = rho * b * d * 1e4;
    a = (AsReq * 1e-4 * fy_kPa) / (alpha1 * fc_kPa * b);
    c = a / b1;

    // Verify εt
    const epsilonT = 0.003 * (d - c) / c;

    if (epsilonT >= 0.005) {
      phi = 0.9;
    } else if (epsilonT >= EPSILON_Y_420) {
      // Transition zone — need to iterate with reduced φ
      phi = 0.65 + 0.25 * (epsilonT - EPSILON_Y_420) / (0.005 - EPSILON_Y_420);
      // Re-solve with new φ: c/d = 3/(3+εt·1000), use εt at limit c/dt = 3/7
      const cLimit = d * 3 / 7; // c at εt = 4‰ transition boundary
      const aLimit = b1 * cLimit;
      const CcLimit = alpha1 * fc_kPa * aLimit * b;
      const MnStar = CcLimit * (d - aLimit / 2);
      const MdStar = phi * MnStar;
      steps.push(`εt = ${(epsilonT * 1000).toFixed(2)}‰ → zona transición → φ = ${phi.toFixed(3)}`);

      if (MdStar >= MuDesign) {
        // Sufficient without A's, just recalculate As
        const RnNew = MuDesign / (phi * b * d * d);
        const termNew = 2 * RnNew / (alpha1 * fc_kPa);
        if (termNew < 1) {
          const rhoNew = (alpha1 * fc / fy) * (1 - Math.sqrt(1 - termNew));
          AsReq = rhoNew * b * d * 1e4;
          a = (AsReq * 1e-4 * fy_kPa) / (alpha1 * fc_kPa * b);
          c = a / b1;
        }
      } else {
        // Needs compression reinforcement
        isDoubly = true;
        steps.push(`φMn* = ${MdStar.toFixed(2)} < Mu → se necesita A's (doble armadura)`);
        const deltaM = MuDesign / phi - MnStar;
        const jds = d - dPrime;
        const Cs = deltaM / jds; // kN
        // Check if A's yields: ε's = 3‰·(c-d')/c
        const epsPrime = 0.003 * (cLimit - dPrime) / cLimit;
        const fsPrime = epsPrime >= EPSILON_Y_420 ? fy_kPa : epsPrime * 200000 * 1000; // kN/m²
        AsCompReq = (Cs / (fsPrime - alpha1 * fc_kPa)) * 1e4; // cm²
        // Extra tension steel to balance compression: As_extra = Cs / fy
        const AsExtra = (Cs / fy_kPa) * 1e4; // cm²
        AsReq = AsMaxSingly + AsExtra; // total tension steel
        a = aLimit;
        c = cLimit;
        steps.push(`ΔM = ${(deltaM).toFixed(2)} kN·m, Cs = ${(Cs).toFixed(2)} kN`);
        steps.push(`A's,req = ${AsCompReq.toFixed(2)} cm²`);
      }
    } else {
      // εt < 2.1‰ — compression-controlled, definitely needs A's
      isDoubly = true;
      phi = 0.65;
      steps.push(`εt = ${(epsilonT * 1000).toFixed(2)}‰ < 2.1‰ → se necesita A's`);

      // Use c at εt = 4‰ (c/d = 3/7) as the target for doubly reinforced
      const cTarget = d * 3 / 7;
      const aTarget = b1 * cTarget;
      const CcStar = alpha1 * fc_kPa * aTarget * b;
      const MnStar = CcStar * (d - aTarget / 2);

      const deltaM = MuDesign / phi - MnStar;
      const jds = d - dPrime;
      const Cs = deltaM / jds;
      const epsPrime = 0.003 * (cTarget - dPrime) / cTarget;
      const fsPrime = epsPrime >= EPSILON_Y_420 ? fy_kPa : epsPrime * 200000 * 1000;
      AsCompReq = (Cs / (fsPrime - alpha1 * fc_kPa)) * 1e4;
      const AsExtra = (Cs / fy_kPa) * 1e4;
      AsReq = (CcStar / fy_kPa + Cs / fy_kPa) * 1e4;
      a = aTarget;
      c = cTarget;
      steps.push(`ΔM = ${deltaM.toFixed(2)} kN·m, A's,req = ${AsCompReq.toFixed(2)} cm²`);
    }
  } else {
    // Section insufficient even at ρ_max — doubly reinforced mandatory
    isDoubly = true;
    steps.push(`⚠ Sección insuficiente para flexión simple → doble armadura`);

    const cTarget = d * 3 / 7;
    const aTarget = b1 * cTarget;
    const CcStar = alpha1 * fc_kPa * aTarget * b;
    const MnStar = CcStar * (d - aTarget / 2);

    // Use φ for transition at εt = 4‰
    const epsTTarget = 0.003 * (d - cTarget) / cTarget;
    phi = epsTTarget >= 0.005 ? 0.9 :
      epsTTarget >= EPSILON_Y_420 ? 0.65 + 0.25 * (epsTTarget - EPSILON_Y_420) / (0.005 - EPSILON_Y_420) :
      0.65;

    const deltaM = Math.max(0, MuDesign / phi - MnStar);
    const jds = d - dPrime;
    const Cs = deltaM / jds;
    const epsPrime = 0.003 * (cTarget - dPrime) / cTarget;
    const fsPrime = epsPrime >= EPSILON_Y_420 ? fy_kPa : epsPrime * 200000 * 1000;
    AsCompReq = Math.max(0, (Cs / (fsPrime - alpha1 * fc_kPa)) * 1e4);
    AsReq = (CcStar / fy_kPa + Cs / fy_kPa) * 1e4;
    a = aTarget;
    c = cTarget;
    steps.push(`Mn* = ${MnStar.toFixed(2)} kN·m, ΔM = ${deltaM.toFixed(2)} kN·m`);
    steps.push(`A's,req = ${AsCompReq.toFixed(2)} cm²`);
  }

  // Apply minimum
  const AsDesign = Math.max(AsReq, AsMin);
  const AsMax = isDoubly ? AsDesign * 1.5 : AsMaxSingly; // relax max for doubly reinforced
  steps.push(`As,req (tracción) = ${AsDesign.toFixed(2)} cm²`);

  // Select tension reinforcement
  const rebar = selectRebar(AsDesign);
  steps.push(`Armadura tracción: ${rebar.label} (${rebar.area.toFixed(2)} cm²)`);

  // Select compression reinforcement if doubly reinforced
  let rebarComp: { count: number; dia: number; area: number; label: string } | undefined;
  if (isDoubly && AsCompReq > 0.1) {
    AsCompReq = Math.max(AsCompReq, AsMin * 0.5); // practical minimum
    rebarComp = selectRebar(AsCompReq);
    steps.push(`Armadura compresión: ${rebarComp.label} (${rebarComp.area.toFixed(2)} cm²)`);
  }

  // Recalculate capacity with provided steel
  const AsProv_m2 = rebar.area * 1e-4;
  const AsComp_m2 = rebarComp ? rebarComp.area * 1e-4 : 0;

  // T = As·fy, Cs = A's·(f's - α1·f'c), Cc = α1·f'c·β1·c·b
  // Equilibrium: T - Cc - Cs = Nu/φ → solve for c iteratively
  // Simplified: recalculate a from provided As
  let aFinal: number;
  let cFinal: number;
  if (isDoubly && AsComp_m2 > 0) {
    // T = AsProv·fy, Cs = AsComp·(fy - α1·f'c) [assuming A's yields]
    const T = AsProv_m2 * fy_kPa;
    const Cs = AsComp_m2 * (fy_kPa - alpha1 * fc_kPa);
    const Cc = T - Cs - (Nu / phi);
    aFinal = Math.max(0.001, Cc / (alpha1 * fc_kPa * b));
    cFinal = aFinal / b1;
  } else {
    aFinal = (AsProv_m2 * fy_kPa) / (alpha1 * fc_kPa * b);
    cFinal = aFinal / b1;
  }

  steps.push(`a = ${(aFinal * 100).toFixed(2)} cm, c = ${(cFinal * 100).toFixed(2)} cm`);

  // Final εt check
  const epsilonTFinal = cFinal > 0 ? 0.003 * (d - cFinal) / cFinal : 999;
  steps.push(`εt = ${(epsilonTFinal * 1000).toFixed(2)}‰`);

  if (epsilonTFinal >= 0.005) {
    phi = 0.9;
    steps.push(`εt ≥ 5‰ → F.C.T. → φ = 0.90`);
  } else if (epsilonTFinal >= EPSILON_Y_420) {
    phi = 0.65 + 0.25 * (epsilonTFinal - EPSILON_Y_420) / (0.005 - EPSILON_Y_420);
    steps.push(`zona transición → φ = ${phi.toFixed(3)}`);
  } else {
    phi = 0.65;
    steps.push(`compresión controlada → φ = 0.65`);
  }

  // Moment capacity
  let phiMn: number;
  if (isDoubly && AsComp_m2 > 0) {
    const Cc = alpha1 * fc_kPa * aFinal * b;
    const Cs = AsComp_m2 * (fy_kPa - alpha1 * fc_kPa);
    const jdc = d - aFinal / 2;
    const jds = d - dPrime;
    phiMn = phi * (Cc * jdc + Cs * jds);
  } else {
    phiMn = phi * AsProv_m2 * fy_kPa * (d - aFinal / 2);
  }
  steps.push(`φMn = ${phiMn.toFixed(2)} kN·m`);

  const ratio = MuAbs / phiMn;
  let status: VerifStatus = 'ok';
  if (ratio > 1.0) status = 'fail';
  else if (ratio > 0.9) status = 'warn';

  return {
    Mu: MuAbs, d, a: aFinal,
    AsReq: AsDesign,
    AsMin, AsMax,
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

// ─── Shear Check (CIRSOC 201 §11.2-11.4) ───────────────────────

export function checkShear(params: ConcreteDesignParams, Vu: number, Nu: number = 0): ShearResult {
  const { fc, fy, cover, b, h, stirrupDia } = params;
  const steps: string[] = [];
  const d = effectiveDepth(h, cover, stirrupDia, 16);
  const VuAbs = Math.abs(Vu);

  steps.push(`Vu = ${VuAbs.toFixed(2)} kN`);
  steps.push(`d = ${(d * 100).toFixed(1)} cm`);

  // Concrete contribution: Vc = (1/6)·√f'c·bw·d (CIRSOC 201 §11.2.1.1)
  // With axial compression: Vc = (1 + Nu/(14·Ag))·(1/6)·√f'c·bw·d
  // With axial tension: Vc = (1 + 0.3·Nu/Ag)·(1/6)·√f'c·bw·d (Nu negative)
  const Ag = b * h; // m²
  const Vc0 = (1 / 6) * Math.sqrt(fc) * (b * 1000) * (d * 1000) / 1000; // kN
  let Vc: number;
  if (Nu > 0) {
    // Compression improves shear resistance
    const factor = 1 + (Nu) / (14 * Ag * 1000); // Nu in kN, Ag in m², convert
    Vc = factor * Vc0;
    steps.push(`Vc = (1+Nu/(14Ag))·(1/6)·√f'c·bw·d = ${Vc.toFixed(2)} kN`);
  } else if (Nu < 0) {
    // Tension reduces shear resistance
    const factor = 1 + 0.3 * (Nu) / (Ag * 1000); // Nu negative in kN
    Vc = Math.max(0, factor * Vc0);
    steps.push(`Vc = (1+0.3·Nu/Ag)·(1/6)·√f'c·bw·d = ${Vc.toFixed(2)} kN`);
  } else {
    Vc = Vc0;
    steps.push(`Vc = (1/6)·√f'c·bw·d = ${Vc.toFixed(2)} kN`);
  }

  const phiVc = PHI_SHEAR * Vc;
  steps.push(`φVc = ${phiVc.toFixed(2)} kN`);

  // Required steel shear: Vs = (Vu/φ) - Vc
  const VsReq = Math.max(0, VuAbs / PHI_SHEAR - Vc);
  steps.push(`Vs,req = ${VsReq.toFixed(2)} kN`);

  // Maximum shear: Vs,max = (2/3)·√f'c·bw·d (CIRSOC 201)
  const VsMax = (2 / 3) * Math.sqrt(fc) * (b * 1000) * (d * 1000) / 1000;

  // Av/s required = Vs / (fy·d)
  // Units: kN / (MPa * m) = kN / (kN/m² * m) ... need care
  // Av/s (m²/m) = Vs(kN) / (fy(MPa) * d(m)) × (1/1000)
  const AvOverS = VsReq > 0 ? (VsReq / (fy * d)) * 10 : 0; // cm²/m

  // Minimum stirrups: Av,min/s = max((1/16)·√f'c, 0.33)·bw/fyt (CIRSOC 201)
  const AvOverSMin = Math.max((1 / 16) * Math.sqrt(fc), 0.33) * (b * 100) / fy; // cm²/cm → cm²/m ×100
  const AvOverSMinCm2m = AvOverSMin * 100;

  const AvOverSDesign = Math.max(AvOverS, AvOverSMinCm2m);

  // Select stirrups: 2-leg stirrups of given diameter
  const stirrupBar = REBAR_DB.find(r => r.diameter === stirrupDia) ?? REBAR_DB[1]; // default Ø8
  const legs = 2;
  const AvLeg = legs * stirrupBar.area; // cm² per stirrup set

  // Spacing = Av / (Av/s)
  let spacing = AvOverSDesign > 0 ? AvLeg / AvOverSDesign : d; // m
  // Max spacing per shear zone (CIRSOC 201):
  // Zone 1 (Vu ≤ φVc): s ≤ min(0.8d, 30cm)
  // Zone 2 (Vs ≤ (1/3)√f'c·bw·d): s ≤ min(d/2, 30cm)
  // Zone 3 ((1/3) < Vs ≤ (2/3)√f'c·bw·d): s ≤ min(d/4, 20cm)
  const VsThird = (1 / 3) * Math.sqrt(fc) * (b * 1000) * (d * 1000) / 1000; // kN
  let maxSpacing: number;
  if (VsReq <= 0) {
    maxSpacing = Math.min(0.8 * d, 0.3); // Zone 1
  } else if (VsReq <= VsThird) {
    maxSpacing = Math.min(d / 2, 0.3); // Zone 2
  } else {
    maxSpacing = Math.min(d / 4, 0.2); // Zone 3
  }
  spacing = Math.min(spacing, maxSpacing);
  // Round down to nearest 2.5cm
  spacing = Math.floor(spacing * 40) / 40;
  spacing = Math.max(spacing, 0.05); // min 5cm

  steps.push(`Av/s,req = ${AvOverSDesign.toFixed(2)} cm²/m`);
  steps.push(`Estribos: ${legs} ramas ${stirrupBar.label} c/${(spacing * 100).toFixed(0)} cm`);

  // Actual capacity
  const VsProv = (AvLeg / spacing) * fy * d / 10; // kN
  const phiVn = PHI_SHEAR * (Vc + VsProv);
  steps.push(`φVn = ${phiVn.toFixed(2)} kN`);

  const ratio = VuAbs / phiVn;
  let status: VerifStatus = 'ok';
  if (VsReq > VsMax) {
    status = 'fail';
    steps.push(`⚠ Vs > Vs,max = ${VsMax.toFixed(0)} kN — sección insuficiente`);
  } else if (ratio > 1.0) {
    status = 'fail';
  } else if (ratio > 0.9) {
    status = 'warn';
  }

  return {
    Vu: VuAbs, d, phiVc, Vs: VsReq,
    AvOverS: AvOverSDesign,
    AvOverSMin: AvOverSMinCm2m,
    spacing, stirrupDia: stirrupBar.diameter, stirrupLegs: legs,
    phiVn, ratio, status, steps,
  };
}

// ─── Column Check (Simplified Interaction, CIRSOC 201 §10.3) ───

export function checkColumn(params: ConcreteDesignParams, Nu: number, Mu: number): ColumnResult {
  const { fc, fy, cover, b, h, stirrupDia } = params;
  const steps: string[] = [];

  const NuAbs = Math.abs(Nu);
  const MuAbs = Math.abs(Mu);
  const d = effectiveDepth(h, cover, stirrupDia, 16);
  const dPrime = cover + (stirrupDia / 1000) + 0.008; // d' — distance to compression steel center

  steps.push(`Nu = ${NuAbs.toFixed(2)} kN (compresión)`);
  steps.push(`Mu = ${MuAbs.toFixed(2)} kN·m`);
  steps.push(`d = ${(d * 100).toFixed(1)} cm, d' = ${(dPrime * 100).toFixed(1)} cm`);

  const Ag = b * h; // m²
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;

  // Minimum reinforcement: 1% Ag, Maximum: 8% Ag (CIRSOC 201 §10.9.1)
  const AsMin = 0.01 * Ag * 1e4; // cm²
  const AsMax = 0.08 * Ag * 1e4;

  // Simplified approach: design for combined Nu + Mu using interaction
  // Pure axial capacity: φPn,max = φ·0.80·(0.85·f'c·(Ag-Ast) + fy·Ast)
  // We iterate to find required Ast

  let AsTotal: number;

  if (MuAbs < 0.01) {
    // Pure compression — minimum reinforcement
    AsTotal = AsMin;
    steps.push(`Momento despreciable → armadura mínima`);
  } else {
    // Approximate: treat as eccentric compression
    // e = Mu / Nu (eccentricity)
    const e = NuAbs > 0.1 ? MuAbs / NuAbs : 999;
    steps.push(`e = Mu/Nu = ${(e * 100).toFixed(1)} cm`);

    // Use Bresler reciprocal method simplified for rectangular sections
    // As a practical simplification: design for flexure with reduced d
    // Then add area for axial

    // Flexure component
    const flexAs = MuAbs / (PHI_FLEXURE * fy_kPa * (d - dPrime) * 0.8) * 1e4; // rough cm²

    // Axial component
    const axialAs = NuAbs / (PHI_COLUMN * fy_kPa) * 1e4; // cm²

    // Combined (conservative: sum)
    AsTotal = Math.max(flexAs + axialAs * 0.5, AsMin);
    steps.push(`As,flexión ≈ ${flexAs.toFixed(2)} cm²`);
    steps.push(`As,axial ≈ ${(axialAs * 0.5).toFixed(2)} cm²`);
  }

  AsTotal = Math.max(AsTotal, AsMin);
  steps.push(`As,total,req = ${AsTotal.toFixed(2)} cm²`);
  steps.push(`As,min = ${AsMin.toFixed(2)} cm² (1% Ag)`);
  steps.push(`As,max = ${AsMax.toFixed(2)} cm² (8% Ag)`);

  // Select rebar (distribute symmetrically, minimum 4 bars for columns)
  const rebar = selectRebar(AsTotal);
  let barCount = Math.max(rebar.count, 4); // columns need at least 4 bars
  if (barCount % 2 !== 0) barCount++;
  const barSpec = REBAR_DB.find(r => r.diameter === rebar.dia)!;
  const AsProv = barCount * barSpec.area;

  steps.push(`Armadura: ${barCount} ${barSpec.label} (As = ${AsProv.toFixed(2)} cm²)`);

  // Capacity check (simplified)
  const AsProv_m2 = AsProv * 1e-4;
  const phiPn = PHI_COLUMN * 0.80 * (0.85 * fc_kPa * (Ag - AsProv_m2) + fy_kPa * AsProv_m2);
  const phiMn = PHI_FLEXURE * AsProv_m2 * fy_kPa * (d - dPrime) * 0.8;

  steps.push(`φPn = ${phiPn.toFixed(0)} kN`);
  steps.push(`φMn = ${phiMn.toFixed(2)} kN·m`);

  // Utilization ratio (linear interaction, conservative)
  const ratio = (NuAbs / phiPn) + (MuAbs / phiMn);
  steps.push(`Ratio interacción = ${ratio.toFixed(3)}`);

  // Stirrups for columns (CIRSOC 201): Se = min(12·dB,min, 48·de, menor dim)
  const sMax1 = 12 * rebar.dia / 1000;
  const sMax2 = 48 * stirrupDia / 1000;
  const sMax3 = Math.min(b, h);
  const colStirrupSpacing = Math.min(sMax1, sMax2, sMax3);
  const roundedSpacing = Math.floor(colStirrupSpacing * 40) / 40;
  steps.push(`Estribos: Ø${stirrupDia} c/${(roundedSpacing * 100).toFixed(0)} cm`);

  let status: VerifStatus = 'ok';
  if (ratio > 1.0) status = 'fail';
  else if (ratio > 0.85) status = 'warn';
  if (AsProv > AsMax) {
    status = 'fail';
    steps.push(`⚠ As > As,max — sección insuficiente`);
  }

  return {
    Nu: NuAbs, Mu: MuAbs,
    AsTotal,
    AsProv,
    bars: `${barCount} ${barSpec.label}`,
    barCount,
    barDia: rebar.dia,
    phiPn, phiMn,
    ratio,
    status,
    stirrupDia,
    stirrupSpacing: roundedSpacing,
    steps,
  };
}

// ─── Torsion Check (CIRSOC 201 §11.5) ────────────────────────────

export function checkTorsion(params: ConcreteDesignParams, Tu: number, Vu: number = 0): TorsionResult {
  const { fc, fy, b, h, cover, stirrupDia } = params;
  const steps: string[] = [];
  const TuAbs = Math.abs(Tu);
  steps.push(`Tu = ${TuAbs.toFixed(3)} kN·m`);

  // Section properties for torsion
  const Acp = b * h; // m² — area enclosed by outer perimeter
  const pcp = 2 * (b + h); // m — perimeter

  // Cracking torsion: Tcr = 0.33·√f'c · Acp² / pcp (CIRSOC 201 §11.5.1)
  const Tcr = 0.33 * Math.sqrt(fc) * (Acp * Acp * 1e6) / (pcp) / 1000; // kN·m
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

  // Check combined shear + torsion limit (§11.5.3.1)
  const d = effectiveDepth(h, cover, stirrupDia, 16);
  const VuAbs = Math.abs(Vu);
  const vShear = VuAbs / (b * d) / 1000; // MPa
  const vTorsion = TuAbs / (1.7 * Aoh * Aoh * 1e6) * ph; // approx
  const Vc = 0.17 * Math.sqrt(fc); // MPa — simplified Vc/(bw·d)
  const vLimit = PHI_SHEAR * (Vc + 0.66 * Math.sqrt(fc));

  // At/s required for torsion (one leg): At/s = Tu / (φ·2·Ao·fy·cotθ)
  // cotθ = 1.0 (θ=45°, simplified)
  const AtOverS = (TuAbs / (PHI_SHEAR * 2 * Ao * fy * 1000)) * 1e6; // cm²/m
  steps.push(`At/s,req = ${AtOverS.toFixed(2)} cm²/m (una rama)`);

  // Longitudinal steel for torsion: Al = (At/s)·ph·(fy_stirrup/fy_long)·cotθ²
  // Assuming same fy: Al = (At/s)·ph
  const AlReq = AtOverS * ph * 100; // cm² (converting consistently)
  steps.push(`Al,req = ${AlReq.toFixed(2)} cm² (longitudinal por torsión)`);

  // Capacity: φTn = φ·2·Ao·At·fy/s (using provided stirrups)
  // For now compute with required At/s
  const phiTn = TuAbs; // at design level, capacity = demand when At/s is designed for it
  const ratio = TuAbs > 0 ? 1.0 : 0; // designed exactly for Tu

  let status: VerifStatus = 'ok';
  if (vShear + vTorsion > vLimit) {
    status = 'fail';
    steps.push(`⚠ Tensiones combinadas V+T exceden límite`);
  }

  return {
    Tu: TuAbs, Tcr, phiTn, AtOverS, AlReq,
    neglect: false, ratio, status, steps,
  };
}

// ─── Biaxial Flexo-compression (Bresler, CIRSOC 201 §10.3) ──────

export function checkBiaxial(
  params: ConcreteDesignParams,
  Nu: number, Muy: number, Muz: number,
  AsProvided: number, // cm² — total As already designed
): BiaxialResult {
  const { fc, fy, b, h, cover, stirrupDia } = params;
  const steps: string[] = [];

  const NuAbs = Math.abs(Nu);
  const MuyAbs = Math.abs(Muy);
  const MuzAbs = Math.abs(Muz);

  steps.push(`Nu = ${NuAbs.toFixed(1)} kN, Muy = ${MuyAbs.toFixed(2)} kN·m, Muz = ${MuzAbs.toFixed(2)} kN·m`);

  const Ag = b * h; // m²
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;
  const AsProv_m2 = AsProvided * 1e-4;

  const dy = effectiveDepth(h, cover, stirrupDia, 16); // for Muz (bending about Z)
  const dz = effectiveDepth(b, cover, stirrupDia, 16); // for Muy (bending about Y)

  // Pure axial capacity (no moment)
  const Pn0 = 0.85 * fc_kPa * (Ag - AsProv_m2) + fy_kPa * AsProv_m2;
  const phiPn0 = PHI_COLUMN * 0.80 * Pn0;
  steps.push(`φPn0 = ${phiPn0.toFixed(0)} kN (capacidad axial pura)`);

  // Uniaxial capacity about Z (for Muz): eccentric about strong axis
  // Simplified: φPnx at e = Muz/Nu
  const phiPnx = estimateUniaxialCapacity(fc_kPa, fy_kPa, b, dy, Ag, AsProv_m2, MuzAbs, NuAbs);
  steps.push(`φPnx (Muz solo) ≈ ${phiPnx.toFixed(0)} kN`);

  // Uniaxial capacity about Y (for Muy): eccentric about weak axis
  const phiPny = estimateUniaxialCapacity(fc_kPa, fy_kPa, h, dz, Ag, AsProv_m2, MuyAbs, NuAbs);
  steps.push(`φPny (Muy solo) ≈ ${phiPny.toFixed(0)} kN`);

  // Bresler reciprocal method: 1/φPn = 1/φPnx + 1/φPny - 1/φPn0
  let phiPn: number;
  if (phiPnx > 0 && phiPny > 0 && phiPn0 > 0) {
    const reciprocal = 1 / phiPnx + 1 / phiPny - 1 / phiPn0;
    phiPn = reciprocal > 0 ? 1 / reciprocal : phiPn0;
  } else {
    phiPn = Math.min(phiPnx || phiPn0, phiPny || phiPn0);
  }
  steps.push(`φPn (Bresler) = ${phiPn.toFixed(0)} kN`);

  const ratio = NuAbs / phiPn;
  steps.push(`Ratio Nu/φPn = ${ratio.toFixed(3)}`);

  let status: VerifStatus = 'ok';
  if (ratio > 1.0) status = 'fail';
  else if (ratio > 0.85) status = 'warn';

  return {
    Muy: MuyAbs, Muz: MuzAbs, Nu: NuAbs,
    phiPnx, phiPny, phiPn0, phiPn,
    ratio, status, steps,
  };
}

/** Estimate uniaxial eccentric capacity for Bresler method */
function estimateUniaxialCapacity(
  fc_kPa: number, fy_kPa: number,
  bw: number, d: number, Ag: number, As_m2: number,
  Mu: number, Nu: number,
): number {
  if (Nu < 0.01) return PHI_COLUMN * 0.80 * (0.85 * fc_kPa * Ag + fy_kPa * As_m2);
  const e = Mu / Nu; // eccentricity in m
  // Simplified: linear interpolation between pure compression and balanced point
  const eb = 0.4 * d; // approximate balanced eccentricity
  if (e <= eb) {
    // Compression-controlled: interpolate between Pn0 and Pb
    const Pn0 = 0.85 * fc_kPa * (Ag - As_m2) + fy_kPa * As_m2;
    const Pb = 0.85 * fc_kPa * bw * 0.6 * d + As_m2 * fy_kPa * 0.5; // rough balanced
    const t = e / eb;
    return PHI_COLUMN * ((1 - t) * Pn0 * 0.80 + t * Pb);
  } else {
    // Tension-controlled: capacity drops with eccentricity
    const Mnb = As_m2 * fy_kPa * (d - 0.4 * d * 0.5);
    return PHI_COLUMN * Mnb / e;
  }
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
interface PsiElement { id: number; nodeI: number; nodeJ: number; materialId: number; sectionId: number; hingeStart: boolean; hingeEnd: boolean }
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

      // Use Iz for strong-axis bending
      const Ig = sec.iz;
      const E = mat.e * 1000; // MPa → kN/m²

      // Classify: vertical elements are columns, horizontal are beams
      const horizLen = Math.sqrt(dx * dx + dz * dz);
      const isVert = Math.abs(dy) > horizLen;

      if (isVert) {
        // Column: 0.70·E·Ig / L
        colStiffnessSum += 0.70 * E * Ig / L;
      } else {
        // Beam: x · 0.35·E·Ig / L
        // x depends on far-end condition of this beam
        const farNodeId = elem.nodeI === jointNodeId ? elem.nodeJ : elem.nodeI;
        const farHinge = elem.nodeI === jointNodeId ? elem.hingeEnd : elem.hingeStart;
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
  // M2C = max(M2, Pu·(0.015 + 0.03·h))
  const eMin = 0.015 + 0.03 * h; // m
  const M2C = Math.max(MuAbs, NuAbs * eMin);
  if (M2C > MuAbs) {
    steps.push(`M2,mín = Pu·(15mm + 0.03h) = ${(NuAbs * eMin).toFixed(2)} kN·m > M2 → se usa M2,mín`);
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

  const flexure = checkFlexure(params, designMu);
  const shear = checkShear(params, input.Vu, input.Nu);
  let column: ColumnResult | undefined;
  let biaxial: BiaxialResult | undefined;
  let torsionResult: TorsionResult | undefined;

  if (isVertical) {
    column = checkColumn(params, input.Nu, designMu);

    // Biaxial check if Muy is provided
    if (input.Muy && Math.abs(input.Muy) > 0.01) {
      const AsProv = column.AsProv;
      biaxial = checkBiaxial(params, input.Nu, input.Muy, designMu, AsProv);
    }
  }

  // Torsion check if Tu is provided
  if (input.Tu && Math.abs(input.Tu) > 0.001) {
    torsionResult = checkTorsion(params, input.Tu, input.Vu);
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
  };
}

// ─── Classify element as beam or column ─────────────────────────

/** Heuristic: if element is more vertical than horizontal, it's a column.
 *  If it's vertical AND the section has high aspect ratio (b/h > 3 or h/b > 3), it's a wall. */
export function classifyElement(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  sectionB?: number, sectionH?: number,
): 'beam' | 'column' | 'wall' {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const dz = Math.abs(z2 - z1);
  const horizontal = Math.sqrt(dx * dx + dy * dy);
  // If vertical component dominates, it's a column or wall
  if (dz > horizontal) {
    // Detect wall: vertical element with high section aspect ratio
    if (sectionB && sectionH) {
      const ratio = Math.max(sectionB, sectionH) / Math.min(sectionB, sectionH);
      if (ratio > 3) return 'wall';
    }
    return 'column';
  }
  return 'beam';
}
