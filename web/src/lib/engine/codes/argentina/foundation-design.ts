/**
 * Foundation Design — Isolated Spread Footings (Zapatas Aisladas)
 * Pure JS implementation per CIRSOC 201-2005 / ACI 318
 *
 * Follows connection-design.ts wrapper pattern:
 *  - Embedded code tables from CIRSOC 201
 *  - Focused input/result interfaces
 *  - Pure functions, no side effects, no WASM dependency
 *
 * Units: kN, m, MPa, kPa, cm²
 *
 * References:
 *  - CIRSOC 201-2005 §11.11 (punching shear)
 *  - CIRSOC 201-2005 §11.3 (one-way shear)
 *  - CIRSOC 201-2005 §10.2-10.3 (flexure)
 *  - CIRSOC 201-2005 §7.12 (minimum reinforcement)
 */

import { REBAR_DB } from './cirsoc201';

// ─── Constants ──────────────────────────────────────────────

const PHI_SHEAR = 0.75;
const PHI_FLEXURE = 0.90;
const CONCRETE_DENSITY = 24; // kN/m³

// ─── Input Interface ────────────────────────────────────────

export interface FootingInput {
  // Footing geometry
  B: number;          // footing width (m) — direction of moment
  L: number;          // footing length (m)
  H: number;          // footing depth (m)

  // Column/pedestal dimensions
  bc: number;         // column width (m) — parallel to B
  lc: number;         // column length (m) — parallel to L

  // Materials
  fc: number;         // concrete f'c (MPa)
  fy: number;         // rebar yield (MPa), typically 420
  cover: number;      // concrete cover (m), typically 0.05-0.075

  // Soil
  sigmaAdm: number;   // allowable bearing capacity (kPa)

  // Loading (service/factored)
  Nu: number;         // axial load (kN, compression positive)
  Mu: number;         // moment about B direction (kN·m)
  Vu?: number;        // horizontal shear (kN), typically 0

  // Options
  includeSelfWeight: boolean;
  stirrupDia?: number; // mm, default 0 (footings rarely have stirrups)
}

// ─── Result Interfaces ──────────────────────────────────────

export type PressureType = 'uniform' | 'trapezoidal' | 'triangular' | 'no-contact';

export interface PressureResult {
  type: PressureType;
  qMax: number;       // maximum pressure (kPa)
  qMin: number;       // minimum pressure (kPa)
  eccentricity: number; // e = M/N (m)
  eLimit: number;     // B/6 — kern limit (m)
  ratio: number;      // qMax / sigmaAdm
  status: 'ok' | 'fail';
  steps: string[];
}

export interface OneWayShearResult {
  Vu: number;         // factored shear at critical section (kN)
  phiVc: number;      // concrete shear capacity (kN)
  d: number;          // effective depth (m)
  criticalX: number;  // distance from footing edge to critical section (m)
  ratio: number;
  status: 'ok' | 'fail';
  steps: string[];
}

export interface PunchingResult {
  Vu: number;         // factored punching shear (kN)
  phiVc: number;      // punching capacity (kN)
  d: number;          // effective depth (m)
  b0: number;         // perimeter of critical section (m)
  ratio: number;
  status: 'ok' | 'fail';
  steps: string[];
}

export interface FootingFlexureResult {
  Mu: number;         // factored moment at face of column (kN·m per m width)
  AsReq: number;      // required steel per m width (cm²/m)
  AsMin: number;      // minimum steel (cm²/m)
  AsProv: number;     // provided steel (cm²/m)
  bars: string;       // e.g. "Ø12 c/20"
  barDia: number;     // mm
  barSpacing: number; // m
  totalBars: number;  // total count across footing width
  ratio: number;
  status: 'ok' | 'fail';
  steps: string[];
}

export interface FootingDesignResult {
  // Input echo
  B: number;
  L: number;
  H: number;
  d: number;          // effective depth (m)

  // Check results
  pressure: PressureResult;
  oneWayShearB: OneWayShearResult; // shear parallel to B
  oneWayShearL: OneWayShearResult; // shear parallel to L
  punching: PunchingResult;
  flexureB: FootingFlexureResult;  // bending about B (reinforcement in L direction)
  flexureL: FootingFlexureResult;  // bending about L (reinforcement in B direction)

  // Overall
  overallStatus: 'ok' | 'fail';
  selfWeight: number;  // kN
  totalWeight: number; // kN (Nu + selfWeight)

  // For BBS integration
  rebarWeightB: number; // kg — steel in B direction
  rebarWeightL: number; // kg — steel in L direction
  concreteVolume: number; // m³
}

// ─── Main Design Function ───────────────────────────────────

export function designSpreadFooting(input: FootingInput): FootingDesignResult {
  const { B, L, H, bc, lc, fc, fy, cover, sigmaAdm, Nu, Mu, includeSelfWeight } = input;
  const stirrupDia = input.stirrupDia ?? 0;

  // Effective depth (assume Ø12 bottom bars as starting point)
  const barDiaEst = 12;
  const d = H - cover - (stirrupDia / 1000) - (barDiaEst / 2000);

  // Self-weight
  const selfWeight = includeSelfWeight ? B * L * H * CONCRETE_DENSITY : 0;
  const totalN = Nu + selfWeight;

  // ── 1. Bearing Pressure Check ──
  const pressure = checkBearingPressure(B, L, totalN, Mu, sigmaAdm);

  // ── 2. Factored pressures for strength checks ──
  // Use 1.4-factor approximation for ultimate state
  // (Conservative: actual load factors depend on combination)
  const Nuf = 1.4 * totalN;
  const Muf = 1.4 * Mu;
  const ef = Muf / Math.max(Nuf, 0.01);
  const qMaxF = computeQmax(B, L, Nuf, ef);
  const qMinF = computeQmin(B, L, Nuf, ef);

  // ── 3. One-Way Shear Checks ──
  // In B direction: critical section at d from column face
  const oneWayShearB = checkOneWayShear(B, L, bc, d, qMaxF, qMinF, fc, 'B');
  // In L direction
  const oneWayShearL = checkOneWayShear(L, B, lc, d, qMaxF, qMinF, fc, 'L');

  // ── 4. Punching Shear ──
  const punching = checkPunchingShear(B, L, bc, lc, d, Nuf, selfWeight * 1.4, fc);

  // ── 5. Flexural Design ──
  const flexureB = designFlexure(B, L, bc, d, qMaxF, qMinF, fc, fy, cover, 'B');
  const flexureL = designFlexure(L, B, lc, d, qMaxF, qMinF, fc, fy, cover, 'L');

  // Rebar weight for BBS
  const steelDensity = 7850; // kg/m³
  const areaB_m2 = (flexureB.AsProv / 1e4); // cm² → m² per m width
  const rebarWeightB = areaB_m2 * L * B * steelDensity;
  const areaL_m2 = (flexureL.AsProv / 1e4);
  const rebarWeightL = areaL_m2 * B * L * steelDensity;

  const concreteVolume = B * L * H;

  const overallStatus =
    pressure.status === 'fail' ||
    oneWayShearB.status === 'fail' ||
    oneWayShearL.status === 'fail' ||
    punching.status === 'fail' ||
    flexureB.status === 'fail' ||
    flexureL.status === 'fail'
      ? 'fail' : 'ok';

  return {
    B, L, H, d,
    pressure,
    oneWayShearB,
    oneWayShearL,
    punching,
    flexureB,
    flexureL,
    overallStatus,
    selfWeight,
    totalWeight: totalN,
    rebarWeightB,
    rebarWeightL,
    concreteVolume,
  };
}

// ─── Bearing Pressure ───────────────────────────────────────

function checkBearingPressure(
  B: number, L: number, N: number, M: number, sigmaAdm: number,
): PressureResult {
  const steps: string[] = [];
  const A = B * L;
  const e = M / Math.max(N, 0.01);
  const eLimit = B / 6;

  steps.push(`A = ${B.toFixed(2)} × ${L.toFixed(2)} = ${A.toFixed(2)} m²`);
  steps.push(`e = M/N = ${M.toFixed(1)} / ${N.toFixed(1)} = ${e.toFixed(3)} m`);
  steps.push(`e_lim = B/6 = ${eLimit.toFixed(3)} m`);

  let qMax: number;
  let qMin: number;
  let type: PressureType;

  if (N <= 0) {
    // Tension — no bearing
    type = 'no-contact';
    qMax = 0;
    qMin = 0;
    steps.push('N ≤ 0 → no soil contact (tension)');
  } else if (Math.abs(e) <= 0.001) {
    // Concentric
    type = 'uniform';
    qMax = N / A;
    qMin = qMax;
    steps.push(`q = N/A = ${qMax.toFixed(1)} kPa (uniform)`);
  } else if (Math.abs(e) <= eLimit) {
    // Trapezoidal (within kern)
    type = 'trapezoidal';
    const S = B * B * L / 6;
    qMax = N / A + M / S;
    qMin = N / A - M / S;
    steps.push(`q_max = N/A + M/S = ${qMax.toFixed(1)} kPa`);
    steps.push(`q_min = N/A - M/S = ${qMin.toFixed(1)} kPa`);
  } else {
    // Triangular (outside kern)
    type = 'triangular';
    const contactLen = 3 * (B / 2 - Math.abs(e));
    if (contactLen <= 0) {
      type = 'no-contact';
      qMax = Infinity;
      qMin = 0;
      steps.push('e > B/2 → overturning risk, no valid pressure');
    } else {
      qMax = (2 * N) / (contactLen * L);
      qMin = 0;
      steps.push(`Contact length = ${contactLen.toFixed(3)} m`);
      steps.push(`q_max = 2N/(c·L) = ${qMax.toFixed(1)} kPa (triangular)`);
    }
  }

  const ratio = qMax / sigmaAdm;
  steps.push(`q_max / σ_adm = ${qMax.toFixed(1)} / ${sigmaAdm.toFixed(0)} = ${ratio.toFixed(2)}`);

  return {
    type,
    qMax,
    qMin,
    eccentricity: e,
    eLimit,
    ratio,
    status: ratio <= 1.0 ? 'ok' : 'fail',
    steps,
  };
}

// ─── One-Way Shear (CIRSOC 201 §11.3) ──────────────────────

function checkOneWayShear(
  span: number,        // footing dimension in shear direction
  perpSpan: number,    // footing dimension perpendicular
  colDim: number,      // column dimension in shear direction
  d: number,
  qMax: number,        // factored max pressure (kPa)
  qMin: number,        // factored min pressure (kPa)
  fc: number,
  dir: 'B' | 'L',
): OneWayShearResult {
  const steps: string[] = [];

  // Critical section at d from face of column
  const cantilever = (span - colDim) / 2;
  const criticalDist = cantilever - d;

  if (criticalDist <= 0) {
    // Column covers entire footing or d > cantilever — no shear concern
    return {
      Vu: 0, phiVc: Infinity, d, criticalX: 0, ratio: 0, status: 'ok',
      steps: [`${dir}: d ≥ cantilever → shear not critical`],
    };
  }

  // Pressure at critical section (linear interpolation)
  const tCrit = (span / 2 + colDim / 2 + d) / span; // from the low-pressure edge
  const qAtCrit = qMin + (qMax - qMin) * tCrit;

  // Average pressure on the loaded strip (from critical section to footing edge)
  const qAvg = (qAtCrit + qMax) / 2;
  const Vu = qAvg * criticalDist * perpSpan;

  steps.push(`${dir}: cantilever = ${cantilever.toFixed(3)} m`);
  steps.push(`Critical section at d = ${d.toFixed(3)} m from column face`);
  steps.push(`q at critical = ${qAtCrit.toFixed(1)} kPa`);
  steps.push(`Vu = ${qAvg.toFixed(1)} × ${criticalDist.toFixed(3)} × ${perpSpan.toFixed(2)} = ${Vu.toFixed(1)} kN`);

  // Concrete shear capacity: φVc = φ · (1/6) · √f'c · b · d
  // CIRSOC 201 §11.3.1.1: Vc = (1/6)·√f'c·bw·d (in MPa, m → kN)
  const Vc = (1 / 6) * Math.sqrt(fc) * perpSpan * d * 1000; // ×1000 for MPa·m² → kN
  const phiVc = PHI_SHEAR * Vc;

  steps.push(`Vc = (1/6)·√${fc}·${perpSpan.toFixed(2)}·${d.toFixed(3)}·1000 = ${Vc.toFixed(1)} kN`);
  steps.push(`φVc = ${PHI_SHEAR}·${Vc.toFixed(1)} = ${phiVc.toFixed(1)} kN`);

  const ratio = Vu / phiVc;
  steps.push(`Vu/φVc = ${ratio.toFixed(2)}`);

  return {
    Vu,
    phiVc,
    d,
    criticalX: cantilever - d,
    ratio,
    status: ratio <= 1.0 ? 'ok' : 'fail',
    steps,
  };
}

// ─── Punching Shear (CIRSOC 201 §11.11) ────────────────────

function checkPunchingShear(
  B: number, L: number,
  bc: number, lc: number,
  d: number, Nuf: number, _selfWeightF: number, fc: number,
): PunchingResult {
  const steps: string[] = [];

  // Critical perimeter at d/2 from column face
  const b0_bc = bc + d;  // punching rectangle width
  const b0_lc = lc + d;  // punching rectangle length
  const b0 = 2 * (b0_bc + b0_lc);

  // Area inside critical perimeter (to subtract from total load)
  const Apunch = b0_bc * b0_lc;
  const Afooting = B * L;

  // Check if punching perimeter extends beyond footing
  if (b0_bc >= B || b0_lc >= L) {
    return {
      Vu: 0, phiVc: Infinity, d, b0, ratio: 0, status: 'ok',
      steps: ['Punching perimeter extends beyond footing — not critical'],
    };
  }

  // Factored shear for punching: total load minus pressure inside critical area
  const Vu = Nuf * (1 - Apunch / Afooting);

  steps.push(`b0 = 2·(${b0_bc.toFixed(3)} + ${b0_lc.toFixed(3)}) = ${b0.toFixed(3)} m`);
  steps.push(`A_punch = ${Apunch.toFixed(3)} m², A_foot = ${Afooting.toFixed(2)} m²`);
  steps.push(`Vu = ${Nuf.toFixed(1)} × (1 - ${(Apunch / Afooting).toFixed(3)}) = ${Vu.toFixed(1)} kN`);

  // CIRSOC 201 §11.11.2.1: Three criteria, take minimum
  const sqrtFc = Math.sqrt(fc);
  const beta_c = Math.max(bc, lc) / Math.min(bc, lc); // column aspect ratio
  const alpha_s = 40; // interior column (30 edge, 20 corner)

  // (a) Vc = (1/3)·√f'c·b0·d
  const Vc_a = (1 / 3) * sqrtFc * b0 * d * 1000;
  // (b) Vc = (1/6)·(1 + 2/βc)·√f'c·b0·d
  const Vc_b = (1 / 6) * (1 + 2 / beta_c) * sqrtFc * b0 * d * 1000;
  // (c) Vc = (1/12)·(αs·d/b0 + 2)·√f'c·b0·d
  const Vc_c = (1 / 12) * (alpha_s * d / b0 + 2) * sqrtFc * b0 * d * 1000;

  const Vc = Math.min(Vc_a, Vc_b, Vc_c);
  const phiVc = PHI_SHEAR * Vc;

  steps.push(`βc = ${beta_c.toFixed(2)}, αs = ${alpha_s}`);
  steps.push(`Vc(a) = ${Vc_a.toFixed(1)} kN, Vc(b) = ${Vc_b.toFixed(1)} kN, Vc(c) = ${Vc_c.toFixed(1)} kN`);
  steps.push(`Vc = min = ${Vc.toFixed(1)} kN`);
  steps.push(`φVc = ${phiVc.toFixed(1)} kN`);

  const ratio = Vu / phiVc;
  steps.push(`Vu/φVc = ${ratio.toFixed(2)}`);

  return { Vu, phiVc, d, b0, ratio, status: ratio <= 1.0 ? 'ok' : 'fail', steps };
}

// ─── Flexural Design ────────────────────────────────────────

function designFlexure(
  span: number,          // footing dimension in bending direction
  perpSpan: number,      // footing dimension perpendicular (reinforcement runs along this)
  colDim: number,        // column dimension in bending direction
  d: number,
  qMax: number, qMin: number, // factored pressures (kPa)
  fc: number, fy: number, cover: number,
  dir: 'B' | 'L',
): FootingFlexureResult {
  const steps: string[] = [];

  // Cantilever from column face to footing edge
  const cantilever = (span - colDim) / 2;
  if (cantilever <= 0) {
    return {
      Mu: 0, AsReq: 0, AsMin: 0, AsProv: 0,
      bars: '—', barDia: 0, barSpacing: 0, totalBars: 0,
      ratio: 0, status: 'ok',
      steps: [`${dir}: no cantilever`],
    };
  }

  // Pressure at face of column (linear interpolation)
  const tFace = (span / 2 + colDim / 2) / span;
  const qAtFace = qMin + (qMax - qMin) * tFace;

  // Moment at face of column = integral of pressure × lever arm on cantilever
  // For trapezoidal distribution:
  // Mu = (qAtFace · c²/2) + (qMax - qAtFace) · c²/3  (per unit width)
  // Then multiply by perpendicular span
  const c = cantilever;
  const qDiff = qMax - qAtFace;
  const mu_per_m = (qAtFace * c * c / 2) + (qDiff * c * c / 3); // kN·m per m
  const Mu = mu_per_m; // per meter width (design per strip)

  steps.push(`${dir}: cantilever = ${c.toFixed(3)} m`);
  steps.push(`q at face = ${qAtFace.toFixed(1)} kPa, q at edge = ${qMax.toFixed(1)} kPa`);
  steps.push(`Mu = ${Mu.toFixed(1)} kN·m/m`);

  // Required As per meter width
  // Mu = φ · As · fy · (d - a/2) where a = As·fy / (0.85·f'c·b), b = 1m
  // Iterative: start with lever arm = 0.9d
  let As = (Mu * 1e-3) / (PHI_FLEXURE * (fy / 1000) * 0.9 * d); // very rough first guess (m²)
  // Refine
  for (let iter = 0; iter < 5; iter++) {
    const a = (As * fy / 1000) / (0.85 * fc / 1000 * 1.0); // a in m (b=1m, forces in MN)
    const jd = d - a / 2;
    As = Mu / (PHI_FLEXURE * fy * 1000 * jd); // As in m² per m width (Mu in kN·m, fy in kPa)
  }
  const AsReq_cm2 = As * 1e4; // m² → cm² per m width

  // Minimum reinforcement per CIRSOC 201 §7.12:
  // As,min = 0.0018 · b · h (for fy=420)
  // or 0.0020 · b · h (for fy<420)
  const rhoMin = fy >= 420 ? 0.0018 : 0.0020;
  const H = d + cover + 0.006; // approximate total depth
  const AsMin_cm2 = rhoMin * 100 * H * 100; // cm²/m (b=1m=100cm, H in cm)

  const AsDesign = Math.max(AsReq_cm2, AsMin_cm2);

  steps.push(`As,req = ${AsReq_cm2.toFixed(2)} cm²/m`);
  steps.push(`As,min = ${rhoMin} × 100 × ${(H * 100).toFixed(1)} = ${AsMin_cm2.toFixed(2)} cm²/m`);

  // Select bars
  const selection = selectFootingBars(AsDesign, perpSpan);
  const AsProv = selection.totalArea / perpSpan; // cm²/m

  steps.push(`${dir}: ${selection.count} ${selection.label} c/${(selection.spacing * 100).toFixed(0)} → As,prov = ${AsProv.toFixed(2)} cm²/m`);

  const ratio = AsDesign / AsProv;

  return {
    Mu,
    AsReq: AsReq_cm2,
    AsMin: AsMin_cm2,
    AsProv,
    bars: `${selection.label} c/${(selection.spacing * 100).toFixed(0)}`,
    barDia: selection.dia,
    barSpacing: selection.spacing,
    totalBars: selection.count,
    ratio: Math.min(ratio, 1.5),
    status: AsProv >= AsDesign ? 'ok' : 'fail',
    steps,
  };
}

// ─── Bar Selection for Footings ─────────────────────────────

function selectFootingBars(
  AsReq_cm2_per_m: number, width: number,
): { count: number; dia: number; spacing: number; totalArea: number; label: string } {
  // Try different diameters, pick one that gives reasonable spacing (10-30cm)
  const candidates: Array<{ count: number; dia: number; spacing: number; totalArea: number; label: string }> = [];

  for (const rebar of REBAR_DB) {
    if (rebar.diameter < 8 || rebar.diameter > 25) continue;

    const totalAsNeeded = AsReq_cm2_per_m * width; // total cm²
    const nBars = Math.max(Math.ceil(totalAsNeeded / rebar.area), 3);
    const spacing = width / nBars;

    // Practical spacing limits
    if (spacing < 0.08 || spacing > 0.35) continue;

    candidates.push({
      count: nBars,
      dia: rebar.diameter,
      spacing: Math.round(spacing * 200) / 200, // round to 0.5cm
      totalArea: nBars * rebar.area,
      label: rebar.label,
    });
  }

  if (candidates.length === 0) {
    // Fallback: Ø12 at minimum spacing
    const rebar = REBAR_DB.find(r => r.diameter === 12)!;
    const n = Math.max(Math.ceil(AsReq_cm2_per_m * width / rebar.area), 5);
    return { count: n, dia: 12, spacing: width / n, totalArea: n * rebar.area, label: 'Ø12' };
  }

  // Prefer: fewest bars with spacing 15-25cm
  candidates.sort((a, b) => {
    const idealA = Math.abs(a.spacing - 0.20);
    const idealB = Math.abs(b.spacing - 0.20);
    return idealA - idealB;
  });

  return candidates[0];
}

// ─── Pressure Helpers ───────────────────────────────────────

function computeQmax(B: number, L: number, N: number, e: number): number {
  if (N <= 0) return 0;
  const A = B * L;
  const S = B * B * L / 6;
  const eLimit = B / 6;
  if (Math.abs(e) <= eLimit) {
    return N / A + Math.abs(e) * N / S;
  }
  // Triangular
  const contactLen = 3 * (B / 2 - Math.abs(e));
  if (contactLen <= 0) return Infinity;
  return (2 * N) / (contactLen * L);
}

function computeQmin(B: number, L: number, N: number, e: number): number {
  if (N <= 0) return 0;
  const A = B * L;
  const S = B * B * L / 6;
  const eLimit = B / 6;
  if (Math.abs(e) <= eLimit) {
    return Math.max(0, N / A - Math.abs(e) * N / S);
  }
  return 0; // triangular → min = 0
}

// ─── SVG Generation ─────────────────────────────────────────

export interface FootingSvgOpts {
  width?: number;
  height?: number;
  labels?: {
    pressure?: string;
    punching?: string;
    oneWayShear?: string;
    reinforcement?: string;
  };
}

/**
 * Generate a combined footing detail SVG:
 * - Plan view (top) with column footprint, rebar grid, punching perimeter
 * - Section view (bottom) with pressure distribution, critical sections
 */
export function generateFootingSvg(result: FootingDesignResult, opts?: FootingSvgOpts): string {
  const W = opts?.width ?? 500;
  const totalH = opts?.height ?? 520;
  const planH = totalH * 0.48;
  const secH = totalH * 0.48;
  const gap = totalH * 0.04;

  const { B, L, H, d, pressure, punching, flexureB, flexureL } = result;

  // Scale factors (fit footing in view with margin)
  const margin = 40;
  const scaleX = (W - 2 * margin) / Math.max(B, L);
  const scaleY_plan = (planH - 2 * margin) / Math.max(B, L);
  const scale = Math.min(scaleX, scaleY_plan);

  const svg: string[] = [];
  svg.push(`<svg width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="background:#1a2a40;border-radius:6px">`);

  // ─── Plan View ───
  const pcx = W / 2;
  const pcy = planH / 2;
  const fW = B * scale;
  const fL = L * scale;

  // Footing outline
  svg.push(`<rect x="${pcx - fW / 2}" y="${pcy - fL / 2}" width="${fW}" height="${fL}" fill="none" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // Column footprint (estimate from punching perimeter: b0 includes bc+d and lc+d)
  const bc_est = (punching.b0 / 2 - (d)) > 0 ? Math.min((punching.b0 / 4 - d / 2), B * 0.4) : B * 0.2;
  const lc_est = bc_est; // approximate
  const colW = bc_est * scale;
  const colL = lc_est * scale;
  svg.push(`<rect x="${pcx - colW / 2}" y="${pcy - colL / 2}" width="${colW}" height="${colL}" fill="#555" stroke="#aaa" stroke-width="1"/>`);

  // Punching perimeter (dashed)
  const punchW = (bc_est + d) * scale;
  const punchL = (lc_est + d) * scale;
  svg.push(`<rect x="${pcx - punchW / 2}" y="${pcy - punchL / 2}" width="${punchW}" height="${punchL}" fill="none" stroke="#f0a500" stroke-width="1" stroke-dasharray="4,3"/>`);

  // Reinforcement grid (simplified — show bar lines)
  // Bars in B direction (horizontal lines)
  if (flexureL.totalBars > 0 && flexureL.barSpacing > 0) {
    const nBarsVis = Math.min(flexureL.totalBars, 20);
    const sp = fL / (nBarsVis + 1);
    for (let i = 1; i <= nBarsVis; i++) {
      const y = pcy - fL / 2 + i * sp;
      svg.push(`<line x1="${pcx - fW / 2 + 3}" y1="${y}" x2="${pcx + fW / 2 - 3}" y2="${y}" stroke="#e94560" stroke-width="0.7" opacity="0.6"/>`);
    }
  }
  // Bars in L direction (vertical lines)
  if (flexureB.totalBars > 0 && flexureB.barSpacing > 0) {
    const nBarsVis = Math.min(flexureB.totalBars, 20);
    const sp = fW / (nBarsVis + 1);
    for (let i = 1; i <= nBarsVis; i++) {
      const x = pcx - fW / 2 + i * sp;
      svg.push(`<line x1="${x}" y1="${pcy - fL / 2 + 3}" x2="${x}" y2="${pcy + fL / 2 - 3}" stroke="#e94560" stroke-width="0.7" opacity="0.6"/>`);
    }
  }

  // Dimensions
  const dimY = pcy + fL / 2 + 18;
  svg.push(`<line x1="${pcx - fW / 2}" y1="${dimY}" x2="${pcx + fW / 2}" y2="${dimY}" stroke="#69a" stroke-width="0.5"/>`);
  svg.push(`<text x="${pcx}" y="${dimY + 12}" text-anchor="middle" fill="#69a" font-size="10">${(B * 100).toFixed(0)} cm</text>`);

  const dimX = pcx - fW / 2 - 18;
  svg.push(`<line x1="${dimX}" y1="${pcy - fL / 2}" x2="${dimX}" y2="${pcy + fL / 2}" stroke="#69a" stroke-width="0.5"/>`);
  svg.push(`<text x="${dimX - 2}" y="${pcy}" text-anchor="end" fill="#69a" font-size="10" transform="rotate(-90,${dimX - 2},${pcy})">${(L * 100).toFixed(0)} cm</text>`);

  // Labels
  svg.push(`<text x="${pcx}" y="14" text-anchor="middle" fill="#888" font-size="10">${opts?.labels?.reinforcement ?? 'Plan View'}</text>`);
  if (flexureB.bars !== '—') {
    svg.push(`<text x="${pcx + fW / 2 + 4}" y="${pcy}" fill="#e94560" font-size="9">${flexureB.bars}</text>`);
  }
  if (flexureL.bars !== '—') {
    svg.push(`<text x="${pcx}" y="${pcy - fL / 2 - 4}" text-anchor="middle" fill="#e94560" font-size="9">${flexureL.bars}</text>`);
  }

  // ─── Section View ───
  const secY0 = planH + gap;
  const secCx = W / 2;
  const secCy = secY0 + secH / 2;
  const secScale = Math.min((W - 2 * margin) / B, (secH - 2 * margin) / H) * 0.7;
  const secW = B * secScale;
  const secHt = H * secScale;

  // Footing section outline
  svg.push(`<rect x="${secCx - secW / 2}" y="${secCy - secHt / 2}" width="${secW}" height="${secHt}" fill="none" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // Column on top
  const colSecW = bc_est * secScale;
  const colSecH = Math.min(H * 0.8, 0.5) * secScale;
  svg.push(`<rect x="${secCx - colSecW / 2}" y="${secCy - secHt / 2 - colSecH}" width="${colSecW}" height="${colSecH}" fill="none" stroke="#aaa" stroke-width="1"/>`);

  // Bottom rebar dots
  const rebarY = secCy + secHt / 2 - 4;
  const nDots = Math.min(flexureB.totalBars, 12);
  if (nDots > 0) {
    const dotSpacing = (secW - 8) / (nDots - 1 || 1);
    for (let i = 0; i < nDots; i++) {
      const dx = secCx - secW / 2 + 4 + i * dotSpacing;
      svg.push(`<circle cx="${dx}" cy="${rebarY}" r="2.5" fill="#e94560"/>`);
    }
  }

  // Pressure distribution below
  const pressY = secCy + secHt / 2 + 2;
  const pressH = 30;
  const qMaxFrac = pressure.qMax > 0 ? 1 : 0;
  const qMinFrac = pressure.qMax > 0 ? pressure.qMin / pressure.qMax : 0;

  if (pressure.type === 'uniform') {
    svg.push(`<rect x="${secCx - secW / 2}" y="${pressY}" width="${secW}" height="${pressH}" fill="rgba(74,138,191,0.3)" stroke="#4a8abf" stroke-width="0.5"/>`);
  } else if (pressure.type === 'trapezoidal') {
    const hMax = pressH * qMaxFrac;
    const hMin = pressH * qMinFrac;
    svg.push(`<polygon points="${secCx - secW / 2},${pressY} ${secCx + secW / 2},${pressY} ${secCx + secW / 2},${pressY + hMax} ${secCx - secW / 2},${pressY + hMin}" fill="rgba(74,138,191,0.3)" stroke="#4a8abf" stroke-width="0.5"/>`);
  } else if (pressure.type === 'triangular') {
    const hMax = pressH;
    svg.push(`<polygon points="${secCx - secW / 2},${pressY} ${secCx + secW / 2},${pressY} ${secCx + secW / 2},${pressY + hMax}" fill="rgba(191,74,74,0.3)" stroke="#bf4a4a" stroke-width="0.5"/>`);
  }

  // Pressure labels
  if (pressure.qMax > 0) {
    svg.push(`<text x="${secCx + secW / 2 + 4}" y="${pressY + pressH / 2 + 4}" fill="#4a8abf" font-size="9">q_max=${pressure.qMax.toFixed(0)} kPa</text>`);
  }
  if (pressure.qMin > 0 && pressure.type === 'trapezoidal') {
    svg.push(`<text x="${secCx - secW / 2 - 4}" y="${pressY + pressH * qMinFrac / 2 + 4}" text-anchor="end" fill="#4a8abf" font-size="9">q_min=${pressure.qMin.toFixed(0)}</text>`);
  }

  // Section height dimension
  const secDimX = secCx - secW / 2 - 14;
  svg.push(`<line x1="${secDimX}" y1="${secCy - secHt / 2}" x2="${secDimX}" y2="${secCy + secHt / 2}" stroke="#69a" stroke-width="0.5"/>`);
  svg.push(`<text x="${secDimX - 2}" y="${secCy}" text-anchor="end" fill="#69a" font-size="9">${(H * 100).toFixed(0)}</text>`);

  // Section label
  svg.push(`<text x="${secCx}" y="${secY0 + 14}" text-anchor="middle" fill="#888" font-size="10">${opts?.labels?.pressure ?? 'Section'}</text>`);

  // Status indicators
  const statusColor = result.overallStatus === 'ok' ? '#4ecdc4' : '#e94560';
  svg.push(`<circle cx="${W - 15}" cy="15" r="6" fill="${statusColor}"/>`);
  svg.push(`<text x="${W - 15}" y="19" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">${result.overallStatus === 'ok' ? '✓' : '✗'}</text>`);

  svg.push('</svg>');
  return svg.join('\n');
}
