// CIRSOC 201 — Slab (Losa) Verification & Design
// Implements reinforcement design for one-way, two-way (crossed), and cantilever slabs
// per CIRSOC 201-2005. Does NOT modify the solver.
//
// Units: kN, m, MPa, cm² (for reinforcement areas)

import { REBAR_DB } from './cirsoc201';
import type { VerifStatus } from './cirsoc201';

// ─── Types ────────────────────────────────────────────────────────

export type SlabType = 'unidirectional' | 'bidirectional' | 'cantilever';

export interface SlabDesignParams {
  type: SlabType;
  h: number;          // slab thickness (m)
  fc: number;         // f'c (MPa)
  fy: number;         // steel yield (MPa), typically 420
  cover: number;      // cover (m), typically 0.02 for slabs
  Mu_x: number;       // moment in X direction (kN·m per m width)
  Mu_y?: number;      // moment in Y direction (kN·m per m width) — required for bidirectional
  Mu_neg_x?: number;  // negative moment at supports in X (kN·m per m width)
  Mu_neg_y?: number;  // negative moment at supports in Y (kN·m per m width)
}

export interface SlabRebarLayout {
  dia: number;         // bar diameter (mm)
  spacing: number;     // bar spacing (m)
  As: number;          // area per meter width (cm²/m)
  label: string;       // e.g. "Ø10 c/15"
  face: 'bottom' | 'top';
}

export interface SlabDesignResult {
  type: SlabType;
  h: number;
  d: number;           // effective depth (m)
  AsMin: number;       // minimum reinforcement (cm²/m)
  // Primary direction (X or short span)
  primary: {
    As_req: number;       // required (cm²/m)
    layout: SlabRebarLayout;
    layout_bent?: SlabRebarLayout;   // bent-up bars (half spacing, only if not cantilever)
    layout_straight?: SlabRebarLayout; // straight bars (half spacing)
    Md: number;           // design capacity (kN·m per m)
    ratio: number;
  };
  // Secondary direction (Y or long span / distribution)
  secondary: {
    As_req: number;
    layout: SlabRebarLayout;
    Md: number;
    ratio: number;
  };
  // Negative moment reinforcement at supports
  support_x?: { As_req: number; layout: SlabRebarLayout; Md: number; ratio: number };
  support_y?: { As_req: number; layout: SlabRebarLayout; Md: number; ratio: number };
  // Constructive reinforcement (cantilever: bottom face)
  constructive?: SlabRebarLayout;
  overallStatus: VerifStatus;
  steps: string[];
}

export interface SlabSupportResult {
  As_levantada: number;   // total raised steel from both slabs (cm²/m)
  As_nec: number;         // required at support (cm²/m)
  deficit: number;        // As_nec - As_levantada (cm²/m), 0 if none
  caballetes?: SlabRebarLayout;  // additional stirrup bars if needed
  steps: string[];
}

export interface SlabTorsionResult {
  layout: SlabRebarLayout;
  extension: number;      // length from corner (m)
  faces: ('top' | 'bottom')[];
  steps: string[];
}

// ─── Constants ────────────────────────────────────────────────────

const PHI_FLEXURE = 0.9;
const RHO_MIN_SLAB = 0.0018; // CIRSOC 201 §7.12: As,min = 0.0018·b·h
const B_UNIT = 1.0; // unit width = 1 m

// ─── Helpers ──────────────────────────────────────────────────────

/** β1 per CIRSOC 201 */
function beta1(fc: number): number {
  if (fc <= 28) return 0.85;
  const b = 0.85 - 0.05 * (fc - 28) / 7;
  return Math.max(0.65, b);
}

/** Effective depth for slabs (single layer) */
function slabEffectiveDepth(h: number, cover: number, barDia: number): number {
  return h - cover - barDia / 2000;
}

/** Compute required As for flexure in a unit-width strip (kN·m per m) */
function computeAsFlexure(
  Mu: number, d: number, fc: number, fy: number,
): { As: number; a: number; phi: number } {
  const MuAbs = Math.abs(Mu);
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;

  let phi = PHI_FLEXURE;
  const Rn = MuAbs / (phi * B_UNIT * d * d);
  const term = 2 * Rn / (0.85 * fc_kPa);

  let rho: number;
  if (term >= 1) {
    // Section too thin — use ρ_max
    rho = 0.75 * beta1(fc) * 0.85 * fc / fy * (0.003 / (0.003 + fy / 200000));
  } else {
    rho = (0.85 * fc / fy) * (1 - Math.sqrt(1 - term));
  }

  const As = rho * B_UNIT * d * 1e4; // cm²/m
  const As_m2 = As * 1e-4;
  const a = (As_m2 * fy_kPa) / (0.85 * fc_kPa * B_UNIT);

  // Verify εt and adjust φ
  const c = a / beta1(fc);
  if (c > 0) {
    const epsilonT = 0.003 * (d - c) / c;
    if (epsilonT >= 0.005) {
      phi = 0.9;
    } else if (epsilonT >= 0.0021) {
      phi = 0.65 + 0.25 * (epsilonT - 0.0021) / (0.005 - 0.0021);
    } else {
      phi = 0.65;
    }
  }

  return { As, a, phi };
}

/** Select slab rebar: prefer small diameters with good distribution */
function selectSlabRebar(
  AsReq: number, sepMax: number, minDia: number = 6,
): SlabRebarLayout & { sepActual: number } {
  // Try diameters from small to large — prefer smaller bars, closer spacing
  const candidates: (SlabRebarLayout & { sepActual: number; waste: number })[] = [];

  for (const bar of REBAR_DB) {
    if (bar.diameter < minDia) continue;
    if (bar.diameter > 16) continue; // slabs rarely use > Ø16

    // Required spacing: As_per_bar / AsReq_per_m × 100
    const sepCalc = bar.area / AsReq * 100; // cm → m conversion: area(cm²) / AsReq(cm²/m)
    let sep = Math.floor(sepCalc * 100) / 100; // round down to nearest cm
    sep = Math.min(sep, sepMax);
    sep = Math.max(sep, 0.05); // minimum 5cm

    // Round to nearest standard spacing (multiples of 1cm)
    sep = Math.floor(sep * 100) / 100;

    if (sep < 0.05) continue;

    const AsProv = bar.area / sep; // cm²/m (area per bar / spacing in m)
    if (AsProv < AsReq * 0.99) continue; // must provide enough

    candidates.push({
      dia: bar.diameter,
      spacing: sep,
      As: AsProv,
      label: `${bar.label} c/${(sep * 100).toFixed(0)}`,
      face: 'bottom',
      sepActual: sep,
      waste: AsProv - AsReq,
    });
  }

  if (candidates.length === 0) {
    // Fallback: Ø12 at minimum spacing
    const bar = REBAR_DB.find(r => r.diameter === 12)!;
    const sep = 0.10;
    return {
      dia: 12, spacing: sep,
      As: bar.area / sep,
      label: `${bar.label} c/10`,
      face: 'bottom',
      sepActual: sep,
    };
  }

  // Prefer: smaller waste, smaller diameter (better distribution)
  candidates.sort((a, b) => a.dia - b.dia || a.waste - b.waste);
  return candidates[0];
}

// ─── Main Slab Design ─────────────────────────────────────────────

export function designSlab(params: SlabDesignParams): SlabDesignResult {
  const { type, h, fc, fy, cover, Mu_x, Mu_y, Mu_neg_x, Mu_neg_y } = params;
  const steps: string[] = [];

  // 1. Minimum reinforcement
  const AsMin = RHO_MIN_SLAB * B_UNIT * h * 1e4; // cm²/m
  steps.push(`As,mín = 0.0018·b·h = 0.0018·100·${(h * 100).toFixed(0)} = ${AsMin.toFixed(2)} cm²/m`);

  // 2. Effective depth (assume Ø8 initially)
  const d = slabEffectiveDepth(h, cover, 8);
  steps.push(`d = ${(h * 100).toFixed(0)} - ${(cover * 100).toFixed(1)} - 0.4 = ${(d * 100).toFixed(1)} cm`);

  // 3. Maximum spacings per slab type
  let sepMaxPrimary: number;
  let sepMaxSecondary: number;
  const minDiaPrimary = type === 'cantilever' ? 10 : 6;

  switch (type) {
    case 'unidirectional':
      // Primary: min(2.5h, 25·dB, 250mm)
      sepMaxPrimary = Math.min(2.5 * h, 0.25);
      // Distribution: min(3h, 250mm)
      sepMaxSecondary = Math.min(3 * h, 0.25);
      steps.push(`sep,máx principal = mín(2.5h, 250mm) = ${(sepMaxPrimary * 100).toFixed(0)} cm`);
      steps.push(`sep,máx repartición = mín(3h, 250mm) = ${(sepMaxSecondary * 100).toFixed(0)} cm`);
      break;
    case 'bidirectional':
      // Both directions: min(2h, 25·dB, 250mm)
      sepMaxPrimary = Math.min(2 * h, 0.25);
      sepMaxSecondary = Math.min(2 * h, 0.25);
      steps.push(`sep,máx = mín(2h, 250mm) = ${(sepMaxPrimary * 100).toFixed(0)} cm`);
      break;
    case 'cantilever':
      // Primary: min(2.5h, 25·dB, 250mm)
      sepMaxPrimary = Math.min(2.5 * h, 0.25);
      // Distribution: min(3h, 250mm)
      sepMaxSecondary = Math.min(3 * h, 0.25);
      steps.push(`sep,máx principal = mín(2.5h, 250mm) = ${(sepMaxPrimary * 100).toFixed(0)} cm`);
      break;
  }

  // 4. Primary reinforcement (X direction)
  const MuX = Math.abs(Mu_x);
  const { As: AsReqX, a: aX, phi: phiX } = computeAsFlexure(MuX, d, fc, fy);
  const AsDesignX = Math.max(AsReqX, AsMin);
  steps.push(`As,req,X = ${AsReqX.toFixed(2)} cm²/m → diseño: ${AsDesignX.toFixed(2)} cm²/m`);

  const primaryLayout = selectSlabRebar(AsDesignX, sepMaxPrimary, minDiaPrimary);
  primaryLayout.face = type === 'cantilever' ? 'top' : 'bottom';
  steps.push(`Armadura principal: ${primaryLayout.label} (As = ${primaryLayout.As.toFixed(2)} cm²/m) — cara ${primaryLayout.face === 'top' ? 'superior' : 'inferior'}`);

  // Recalculate capacity
  const AsPrimProv_m2 = primaryLayout.As * 1e-4;
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;
  const aPrim = (AsPrimProv_m2 * fy_kPa) / (0.85 * fc_kPa * B_UNIT);
  const MdPrim = phiX * AsPrimProv_m2 * fy_kPa * (d - aPrim / 2);
  const ratioPrim = MuX / MdPrim;
  steps.push(`φMn,X = ${MdPrim.toFixed(2)} kN·m/m → ratio = ${ratioPrim.toFixed(3)}`);

  // Bent-up bars (half dobladas, half sin doblar) — NOT for cantilevers
  let layoutBent: SlabRebarLayout | undefined;
  let layoutStraight: SlabRebarLayout | undefined;
  if (type !== 'cantilever') {
    const bentSpacing = primaryLayout.spacing * 2;
    const bentAs = primaryLayout.As / 2;
    layoutBent = {
      dia: primaryLayout.dia,
      spacing: bentSpacing,
      As: bentAs,
      label: `Ø${primaryLayout.dia} c/${(bentSpacing * 100).toFixed(0)} dobladas`,
      face: 'bottom',
    };
    layoutStraight = {
      dia: primaryLayout.dia,
      spacing: bentSpacing,
      As: bentAs,
      label: `Ø${primaryLayout.dia} c/${(bentSpacing * 100).toFixed(0)} sin doblar`,
      face: 'bottom',
    };
    steps.push(`Doblado: ${layoutBent.label} + ${layoutStraight.label}`);
  } else {
    steps.push(`Voladizo → sin alternar barras`);
  }

  // 5. Secondary reinforcement (Y direction or distribution)
  let AsReqY: number;
  let phiY = PHI_FLEXURE;
  let aY = 0;
  let MuY = 0;

  if (type === 'bidirectional' && Mu_y !== undefined) {
    MuY = Math.abs(Mu_y);
    const resY = computeAsFlexure(MuY, d, fc, fy);
    AsReqY = Math.max(resY.As, AsMin);
    phiY = resY.phi;
    aY = resY.a;
    steps.push(`As,req,Y = ${resY.As.toFixed(2)} cm²/m → diseño: ${AsReqY.toFixed(2)} cm²/m`);
  } else {
    // Distribution reinforcement: max(AsMin, As_principal/5)
    AsReqY = Math.max(AsMin, AsDesignX / 5);
    steps.push(`Armadura repartición: máx(As,mín, As,princ/5) = ${AsReqY.toFixed(2)} cm²/m`);
  }

  const secondaryLayout = selectSlabRebar(AsReqY, sepMaxSecondary);
  secondaryLayout.face = 'bottom';
  steps.push(`Armadura secundaria: ${secondaryLayout.label} (As = ${secondaryLayout.As.toFixed(2)} cm²/m)`);

  // Secondary capacity
  const AsSecProv_m2 = secondaryLayout.As * 1e-4;
  const aSec = (AsSecProv_m2 * fy_kPa) / (0.85 * fc_kPa * B_UNIT);
  const MdSec = phiY * AsSecProv_m2 * fy_kPa * (d - aSec / 2);
  const ratioSec = MuY > 0 ? MuY / MdSec : 0;

  // 6. Negative moment at supports
  let supportX: SlabDesignResult['support_x'];
  let supportY: SlabDesignResult['support_y'];

  if (Mu_neg_x !== undefined && Math.abs(Mu_neg_x) > 0.01) {
    const MuNegX = Math.abs(Mu_neg_x);
    const resNeg = computeAsFlexure(MuNegX, d, fc, fy);
    const AsNeg = Math.max(resNeg.As, AsMin);
    const layoutNeg = selectSlabRebar(AsNeg, sepMaxPrimary);
    layoutNeg.face = 'top';
    const AsNeg_m2 = layoutNeg.As * 1e-4;
    const aNeg = (AsNeg_m2 * fy_kPa) / (0.85 * fc_kPa * B_UNIT);
    const MdNeg = resNeg.phi * AsNeg_m2 * fy_kPa * (d - aNeg / 2);
    supportX = { As_req: AsNeg, layout: layoutNeg, Md: MdNeg, ratio: MuNegX / MdNeg };
    steps.push(`Apoyo X: ${layoutNeg.label} (cara sup.) — ratio = ${supportX.ratio.toFixed(3)}`);
  }

  if (Mu_neg_y !== undefined && Math.abs(Mu_neg_y) > 0.01) {
    const MuNegY = Math.abs(Mu_neg_y);
    const resNeg = computeAsFlexure(MuNegY, d, fc, fy);
    const AsNeg = Math.max(resNeg.As, AsMin);
    const layoutNeg = selectSlabRebar(AsNeg, sepMaxSecondary);
    layoutNeg.face = 'top';
    const AsNeg_m2 = layoutNeg.As * 1e-4;
    const aNeg = (AsNeg_m2 * fy_kPa) / (0.85 * fc_kPa * B_UNIT);
    const MdNeg = resNeg.phi * AsNeg_m2 * fy_kPa * (d - aNeg / 2);
    supportY = { As_req: AsNeg, layout: layoutNeg, Md: MdNeg, ratio: MuNegY / MdNeg };
    steps.push(`Apoyo Y: ${layoutNeg.label} (cara sup.) — ratio = ${supportY.ratio.toFixed(3)}`);
  }

  // 7. Constructive reinforcement (cantilever: bottom face = distribution rebar)
  let constructive: SlabRebarLayout | undefined;
  if (type === 'cantilever') {
    constructive = { ...secondaryLayout, face: 'bottom' };
    steps.push(`Armadura constructiva (cara inf.): ${constructive.label}`);
  }

  // 8. Overall status
  let overallStatus: VerifStatus = 'ok';
  if (ratioPrim > 1.0) overallStatus = 'fail';
  else if (ratioPrim > 0.9) overallStatus = 'warn';
  if (type === 'bidirectional' && ratioSec > 1.0) overallStatus = 'fail';
  if (supportX && supportX.ratio > 1.0) overallStatus = 'fail';
  if (supportY && supportY.ratio > 1.0) overallStatus = 'fail';

  return {
    type, h, d, AsMin,
    primary: {
      As_req: AsDesignX,
      layout: primaryLayout,
      layout_bent: layoutBent,
      layout_straight: layoutStraight,
      Md: MdPrim,
      ratio: ratioPrim,
    },
    secondary: {
      As_req: AsReqY,
      layout: secondaryLayout,
      Md: MdSec,
      ratio: ratioSec,
    },
    support_x: supportX,
    support_y: supportY,
    constructive,
    overallStatus,
    steps,
  };
}

// ─── Support Check (Continuous Slabs) ─────────────────────────────

/**
 * Check if bent-up bars from adjacent slabs are enough at a continuous support,
 * or if caballetes (additional stirrup bars) are needed.
 */
export function checkSlabSupport(
  As_adop_L1: number,  // adopted As in slab L1 (cm²/m)
  As_adop_L2: number,  // adopted As in slab L2 (cm²/m)
  As_nec_apoyo: number, // required As at support (cm²/m)
): SlabSupportResult {
  const steps: string[] = [];

  // Each slab contributes half of its adopted reinforcement (bent-up bars)
  const As_levantada = As_adop_L1 / 2 + As_adop_L2 / 2;
  steps.push(`As,levantada = ${(As_adop_L1 / 2).toFixed(2)} + ${(As_adop_L2 / 2).toFixed(2)} = ${As_levantada.toFixed(2)} cm²/m`);
  steps.push(`As,nec,apoyo = ${As_nec_apoyo.toFixed(2)} cm²/m`);

  const deficit = Math.max(0, As_nec_apoyo - As_levantada);

  if (deficit <= 0.01) {
    steps.push(`As,levantada ≥ As,nec → no se necesitan caballetes`);
    return { As_levantada, As_nec: As_nec_apoyo, deficit: 0, steps };
  }

  steps.push(`Déficit = ${deficit.toFixed(2)} cm²/m → se necesitan caballetes`);

  // Select caballetes
  const cab = selectSlabRebar(deficit, 0.25);
  cab.face = 'top';
  cab.label = cab.label.replace(/(Ø\d+)/, '$1 caballetes');
  steps.push(`Caballetes: ${cab.label} (As = ${cab.As.toFixed(2)} cm²/m)`);

  return { As_levantada, As_nec: As_nec_apoyo, deficit, caballetes: cab, steps };
}

// ─── Torsion Reinforcement (Crossed Slabs) ────────────────────────

/**
 * Corner torsion reinforcement for bidirectional slabs.
 * @param cornerType '2dir' = no continuity in both directions → top + bottom
 *                   '1dir' = no continuity in one direction → top only
 * @param lnMayor larger clear span (m)
 */
export function slabTorsionReinforcement(
  cornerType: '2dir' | '1dir',
  lnMayor: number,
): SlabTorsionResult {
  const steps: string[] = [];

  // Standard: Ø10 c/15 per CIRSOC practice
  const bar = REBAR_DB.find(r => r.diameter === 10)!;
  const spacing = 0.15;
  const As = bar.area / spacing; // cm²/m

  const extension = lnMayor / 5;

  const faces: ('top' | 'bottom')[] = cornerType === '2dir'
    ? ['top', 'bottom']
    : ['top'];

  const layout: SlabRebarLayout = {
    dia: 10,
    spacing,
    As,
    label: `Ø10 c/15`,
    face: 'top',
  };

  steps.push(`Armadura de torsión: Ø10 c/15 (${As.toFixed(2)} cm²/m)`);
  steps.push(`Extensión: ln,mayor/5 = ${(lnMayor).toFixed(2)}/5 = ${(extension * 100).toFixed(0)} cm`);
  steps.push(`Caras: ${faces.join(' e ')}`);
  if (cornerType === '2dir') {
    steps.push(`Esquina sin continuidad en 2 direcciones → superior e inferior`);
  } else {
    steps.push(`Esquina sin continuidad en 1 dirección → solo superior`);
  }

  return { layout, extension, faces, steps };
}
