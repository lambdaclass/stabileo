// CIRSOC 201 — Slab (Losa) design per metre strip, sized and checked by the engine.
//
// One-way, two-way (crossed) and cantilever slabs. The strength arithmetic is the engine's: the
// steel a 1 m strip needs is the least the engine's beam check passes (`cirsoc201_design_beam`,
// singly reinforced, φ and the ductility floor of the edition), the capacity of the bars chosen
// is the engine's check of them (`cirsoc201_beam_batch`), and the minimum steel and maximum
// spacings come from `cirsoc201_slab_provisions` (2025: 0,0018·Ag, 7.6.1.1 / 8.6.1.1 / 24.4.3.2;
// s ≤ min(3h, 300 mm) one-way 7.7.2.3, min(2h, 300 mm) two-way 8.7.2.2, min(5h, 450 mm) for
// distribution steel 24.4.3.3). This module chooses bars and spacings (a search over the bar
// table) and reports. The TypeScript it replaced — ρ from the quadratic at φ = 0,90, a ρmax
// fallback that kept designing a slab too thin for its moment, φ taken at the required steel
// and the capacity re-derived with fs = fy — is the oracle in __tests__/differential/oracle/.
//
// Units: kN, m, MPa, cm² (for reinforcement areas)

import { REBAR_DB } from './cirsoc201';
import type { VerifStatus } from './cirsoc201';
import type { RegulationEdition } from '../../../codes/regulation';
import { evaluateBeamSection } from './cirsoc201-beam-kernel';
import { cirsoc201Engine, Cirsoc201EngineUnavailable } from './cirsoc201-engine';

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
  /** CIRSOC 201 edition. Default 2025, the edition in force. */
  edition?: RegulationEdition;
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

// ─── Engine helpers ───────────────────────────────────────────────

const B_UNIT = 1.0; // unit width = 1 m

/** Effective depth for slabs (single layer) */
function slabEffectiveDepth(h: number, cover: number, barDia: number): number {
  return h - cover - barDia / 2000;
}

/** [As,min (cm²/m), s,max one-way, s,max two-way, s,max distribution (m)] from the engine. */
function slabProvisions(edition: RegulationEdition, fy: number, h: number) {
  const v = cirsoc201Engine('slabProvisions')(Float64Array.of(edition === '2005' ? 2005 : 2025, fy * 1e6, h));
  return { AsMin: v[0] * 1e4, sOneWay: v[1], sTwoWay: v[2], sDistribution: v[3] };
}

/** The steel a 1 m strip needs for Mu (kN·m/m), from the engine: cm²/m, or NaN when none works. */
function computeAsFlexure(
  Mu: number, h: number, d: number, fc: number, fy: number, edition: RegulationEdition,
): { As: number; phi: number; possible: boolean } {
  const v = cirsoc201Engine('designBeam')(Float64Array.of(
    edition === '2005' ? 2005 : 2025, fc * 1e6, fy * 1e6, 0, B_UNIT, h, d, 0, 0, 0, 0,
    Math.abs(Mu) * 1e3, 0, 0, 0,
  ));
  return { As: v[1] * 1e4, phi: v[4], possible: v[0] !== 2 };
}

/** φMn (kN·m/m) of a 1 m strip with `AsCm2` per metre — the engine's check. */
function stripCapacity(AsCm2: number, h: number, d: number, fc: number, fy: number, edition: RegulationEdition): number {
  const r = evaluateBeamSection({ edition, fc: fc * 1e6, fy: fy * 1e6, b: B_UNIT, h, d, As: AsCm2 * 1e-4 });
  if (!r) throw new Cirsoc201EngineUnavailable('slab strip capacity');
  return r.flexureValid && Number.isFinite(r.phiMn) ? r.phiMn / 1e3 : 0;
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
  const edition = params.edition ?? '2025';
  const steps: string[] = [];
  const prov = slabProvisions(edition, fy, h);

  // 1. Minimum reinforcement
  const AsMin = prov.AsMin; // cm²/m
  steps.push(`As,mín = ${AsMin.toFixed(2)} cm²/m (CIRSOC 201-${edition}, motor)`);

  // 2. Effective depth (assume Ø8 initially)
  const d = slabEffectiveDepth(h, cover, 8);
  steps.push(`d = ${(h * 100).toFixed(0)} - ${(cover * 100).toFixed(1)} - 0.4 = ${(d * 100).toFixed(1)} cm`);

  // 3. Maximum spacings per slab type (the engine's)
  const sepMaxPrimary = type === 'bidirectional' ? prov.sTwoWay : prov.sOneWay;
  const sepMaxSecondary = type === 'bidirectional' ? prov.sTwoWay : prov.sDistribution;
  const minDiaPrimary = type === 'cantilever' ? 10 : 6;
  steps.push(`sep,máx principal = ${(sepMaxPrimary * 100).toFixed(0)} cm, secundaria = ${(sepMaxSecondary * 100).toFixed(0)} cm`);

  let impossible = false;
  const size = (Mu: number) => {
    const r = computeAsFlexure(Mu, h, d, fc, fy, edition);
    if (!r.possible) impossible = true;
    return r;
  };

  // 4. Primary reinforcement (X direction)
  const MuX = Math.abs(Mu_x);
  const resX = size(MuX);
  const AsReqX = resX.possible ? resX.As : NaN;
  const AsDesignX = resX.possible ? Math.max(AsReqX, AsMin) : AsMin;
  steps.push(resX.possible
    ? `As,req,X = ${AsReqX.toFixed(2)} cm²/m → diseño: ${AsDesignX.toFixed(2)} cm²/m`
    : `⚠ Ninguna armadura simple resiste Mu,X con la ductilidad exigida — losa demasiado delgada`);

  const primaryLayout = selectSlabRebar(AsDesignX, sepMaxPrimary, minDiaPrimary);
  primaryLayout.face = type === 'cantilever' ? 'top' : 'bottom';
  steps.push(`Armadura principal: ${primaryLayout.label} (As = ${primaryLayout.As.toFixed(2)} cm²/m) — cara ${primaryLayout.face === 'top' ? 'superior' : 'inferior'}`);

  // Capacity of the bars chosen — the engine's check
  const MdPrim = stripCapacity(primaryLayout.As, h, d, fc, fy, edition);
  const ratioPrim = MdPrim > 0 ? MuX / MdPrim : Infinity;
  steps.push(`φMn,X = ${MdPrim.toFixed(2)} kN·m/m → ratio = ${ratioPrim.toFixed(3)}`);

  // Bent-up bars (half dobladas, half sin doblar) — NOT for cantilevers
  let layoutBent: SlabRebarLayout | undefined;
  let layoutStraight: SlabRebarLayout | undefined;
  if (type !== 'cantilever') {
    const bentSpacing = primaryLayout.spacing * 2;
    const bentAs = primaryLayout.As / 2;
    layoutBent = {
      dia: primaryLayout.dia, spacing: bentSpacing, As: bentAs,
      label: `Ø${primaryLayout.dia} c/${(bentSpacing * 100).toFixed(0)} dobladas`, face: 'bottom',
    };
    layoutStraight = {
      dia: primaryLayout.dia, spacing: bentSpacing, As: bentAs,
      label: `Ø${primaryLayout.dia} c/${(bentSpacing * 100).toFixed(0)} sin doblar`, face: 'bottom',
    };
    steps.push(`Doblado: ${layoutBent.label} + ${layoutStraight.label}`);
  } else {
    steps.push(`Voladizo → sin alternar barras`);
  }

  // 5. Secondary reinforcement (Y direction or distribution)
  let AsReqY: number;
  let MuY = 0;
  if (type === 'bidirectional' && Mu_y !== undefined) {
    MuY = Math.abs(Mu_y);
    const resY = size(MuY);
    AsReqY = resY.possible ? Math.max(resY.As, AsMin) : AsMin;
    steps.push(`As,req,Y = ${resY.possible ? resY.As.toFixed(2) : '—'} cm²/m → diseño: ${AsReqY.toFixed(2)} cm²/m`);
  } else {
    // Distribution: at least the shrinkage-and-temperature steel, and a fifth of the main steel.
    AsReqY = Math.max(AsMin, AsDesignX / 5);
    steps.push(`Armadura repartición: máx(As,mín, As,princ/5) = ${AsReqY.toFixed(2)} cm²/m`);
  }
  const secondaryLayout = selectSlabRebar(AsReqY, sepMaxSecondary);
  secondaryLayout.face = 'bottom';
  steps.push(`Armadura secundaria: ${secondaryLayout.label} (As = ${secondaryLayout.As.toFixed(2)} cm²/m)`);
  const MdSec = stripCapacity(secondaryLayout.As, h, d, fc, fy, edition);
  const ratioSec = MuY > 0 ? (MdSec > 0 ? MuY / MdSec : Infinity) : 0;

  // 6. Negative moment at supports
  const support = (Mu: number, sepMax: number, label: string) => {
    const MuNeg = Math.abs(Mu);
    const res = size(MuNeg);
    const AsNeg = res.possible ? Math.max(res.As, AsMin) : AsMin;
    const layoutNeg = selectSlabRebar(AsNeg, sepMax);
    layoutNeg.face = 'top';
    const MdNeg = stripCapacity(layoutNeg.As, h, d, fc, fy, edition);
    const out = { As_req: AsNeg, layout: layoutNeg, Md: MdNeg, ratio: MdNeg > 0 ? MuNeg / MdNeg : Infinity };
    steps.push(`${label}: ${layoutNeg.label} (cara sup.) — ratio = ${out.ratio.toFixed(3)}`);
    return out;
  };
  const supportX = Mu_neg_x !== undefined && Math.abs(Mu_neg_x) > 0.01 ? support(Mu_neg_x, sepMaxPrimary, 'Apoyo X') : undefined;
  const supportY = Mu_neg_y !== undefined && Math.abs(Mu_neg_y) > 0.01 ? support(Mu_neg_y, sepMaxSecondary, 'Apoyo Y') : undefined;

  // 7. Constructive reinforcement (cantilever: bottom face = distribution rebar)
  let constructive: SlabRebarLayout | undefined;
  if (type === 'cantilever') {
    constructive = { ...secondaryLayout, face: 'bottom' };
    steps.push(`Armadura constructiva (cara inf.): ${constructive.label}`);
  }

  // 8. Overall status
  let overallStatus: VerifStatus = 'ok';
  if (!(ratioPrim <= 1.0)) overallStatus = 'fail';
  else if (ratioPrim > 0.9) overallStatus = 'warn';
  if (type === 'bidirectional' && !(ratioSec <= 1.0)) overallStatus = 'fail';
  if (supportX && !(supportX.ratio <= 1.0)) overallStatus = 'fail';
  if (supportY && !(supportY.ratio <= 1.0)) overallStatus = 'fail';
  if (impossible) overallStatus = 'fail';

  return {
    type, h, d, AsMin,
    primary: {
      As_req: AsDesignX, layout: primaryLayout, layout_bent: layoutBent, layout_straight: layoutStraight,
      Md: MdPrim, ratio: ratioPrim,
    },
    secondary: { As_req: AsReqY, layout: secondaryLayout, Md: MdSec, ratio: ratioSec },
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
