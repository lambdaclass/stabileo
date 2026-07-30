/**
 * Preliminary section recommendations, with termination guards.
 *
 * A section change alters stiffness, self-weight and force distribution, so every
 * recommendation here is explicitly PRELIMINARY: it is a closed-form screen against
 * the CURRENT (now stale) demands. Applying one must trigger a real re-solve and a
 * re-run of the selected code before any success claim. The screen never decides
 * adequacy — only exhaustive candidate search can do that (approved decision O1).
 *
 * Termination (so automated iteration cannot loop forever):
 *   - MAX_SECTION_ITERATIONS per member per user-initiated cycle
 *   - each iteration must STRICTLY increase b·h
 *   - hard dimensional caps per member type
 *   - a demand growth > DEMAND_GROWTH_ABORT after a re-solve stops the loop
 *
 * Pure: no store access, no side effects.
 */

import type { MemberContext } from './member-context';
import type { LimitingConstraint, SectionRecommendation, DesignReason } from './outcome';

/** Standard dimensional increment (m). */
export const SECTION_STEP = 0.05;
export const MAX_SECTION_ITERATIONS = 3;
/** Hard caps — beyond these the answer is a different structural system. */
export const CAPS = {
  beamH: 1.20, beamB: 0.60,
  columnB: 1.20, columnH: 1.20,
} as const;
/** Stop automated iteration when a re-solve grows the governing demand this much. */
export const DEMAND_GROWTH_ABORT = 0.25;

function snapUp(v: number, step = SECTION_STEP): number {
  return Math.ceil((v - 1e-9) / step) * step;
}
const r2 = (v: number) => +v.toFixed(3);

/** Screened utilization at a proposed size — advisory only. */
function screenBeamFlexure(Mu: number, b: number, h: number, fc: number, fy: number, cover: number, stirrupDia: number): number {
  const d = h - cover - stirrupDia / 1000 - 0.010;
  if (d <= 0 || b <= 0) return Number.POSITIVE_INFINITY;
  // Capacity at the tension-controlled envelope (εt = 5‰), the practical ceiling
  // before compression steel is required.
  const b1 = fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
  const c = d * 0.003 / 0.008;
  const a = b1 * c;
  const AsMax = 0.85 * fc * b * a / fy;                 // m²
  const phiMn = 0.9 * AsMax * fy * 1000 * (d - a / 2);  // kN·m
  return phiMn > 1e-6 ? Mu / phiMn : Number.POSITIVE_INFINITY;
}

function screenBeamShear(Vu: number, b: number, h: number, fc: number, cover: number, stirrupDia: number): number {
  const d = h - cover - stirrupDia / 1000 - 0.010;
  if (d <= 0 || b <= 0) return Number.POSITIVE_INFINITY;
  // Vs is capped at (2/3)√f'c·bw·d, so φVn,max = φ(Vc + Vs,max).
  const Vc = (1 / 6) * Math.sqrt(fc) * (b * 1000) * (d * 1000) / 1000;
  const VsMax = (2 / 3) * Math.sqrt(fc) * (b * 1000) * (d * 1000) / 1000;
  const phiVn = 0.75 * (Vc + VsMax);
  return phiVn > 1e-6 ? Vu / phiVn : Number.POSITIVE_INFINITY;
}

function screenColumnAxial(Nu: number, b: number, h: number, fc: number, fy: number, rho: number): number {
  const Ag = b * h;
  if (Ag <= 0) return Number.POSITIVE_INFINITY;
  const As = rho * Ag;
  const phiPn = 0.65 * 0.80 * (0.85 * fc * 1000 * (Ag - As) + fy * 1000 * As);
  return phiPn > 1e-6 ? Nu / phiPn : Number.POSITIVE_INFINITY;
}

export interface AdviceDemands {
  /** Governing flexural demand on the primary axis (kN·m). */
  Mu: number;
  /** Governing shear on the paired axis (kN). */
  Vu: number;
  /** Governing axial compression (kN). */
  Nu: number;
  /** Bars that could not be fitted in one row, when barFit governs. */
  requiredBarsPerRow?: number;
  requiredBarDia?: number;
}

/**
 * Propose a preliminary section. Returns null when reinforcement (not geometry) is
 * the limiting factor, or when a hard cap is already reached (then `capReached`).
 */
export function recommendSection(
  ctx: MemberContext,
  limiting: LimitingConstraint[],
  dem: AdviceDemands,
): SectionRecommendation | null {
  const { b, h } = ctx.section;
  const { fc, fy, cover, stirrupDia } = ctx.material;
  const isColumn = ctx.elementType === 'column';
  const reasons: DesignReason[] = [];

  // Priority order: capacity first, then fit/congestion, then detailing.
  const driver: LimitingConstraint | undefined =
    (['axialFlexure', 'biaxial', 'flexure', 'shear', 'maxSteel', 'barFit', 'congestion', 'cover', 'slenderness', 'tieSpacing'] as LimitingConstraint[])
      .find(k => limiting.includes(k));
  if (!driver) return null;

  let pb = b;
  let ph = h;
  const capB = isColumn ? CAPS.columnB : CAPS.beamB;
  const capH = isColumn ? CAPS.columnH : CAPS.beamH;

  if (isColumn) {
    // Grow the square column until the axial screen and the ρmax envelope both clear.
    let size = Math.max(b, h);
    for (let i = 0; i < 40; i++) {
      const u = screenColumnAxial(dem.Nu, size, size, fc, fy, 0.04);
      const eOverH = dem.Nu > 1e-6 ? (dem.Mu / dem.Nu) / size : 0;
      if (u <= 0.85 && eOverH <= 0.30) break;
      size = r2(size + SECTION_STEP);
      if (size > capH + 1e-9) break;
    }
    pb = Math.min(size, capB);
    ph = Math.min(size, capH);
    reasons.push({ key: 'design.advice.columnAxial', params: { nu: Math.round(dem.Nu), size: Math.round(ph * 1000) } });
  } else if (driver === 'flexure' || driver === 'maxSteel') {
    // Depth is the cheapest lever for flexure (capacity ~ d²).
    for (let i = 0; i < 40 && ph <= capH; i++) {
      if (screenBeamFlexure(dem.Mu, pb, ph, fc, fy, cover, stirrupDia) <= 0.85) break;
      ph = r2(ph + SECTION_STEP);
    }
    if (ph > capH) {
      ph = capH;
      // Depth capped — widen instead.
      for (let i = 0; i < 20 && pb < capB; i++) {
        if (screenBeamFlexure(dem.Mu, pb, ph, fc, fy, cover, stirrupDia) <= 0.85) break;
        pb = r2(pb + SECTION_STEP);
      }
    }
    reasons.push({ key: 'design.advice.beamFlexureDepth', params: { mu: Math.round(dem.Mu), h: Math.round(ph * 1000) } });
  } else if (driver === 'shear') {
    // Shear capacity scales with b·d; grow width first (cheaper than depth here).
    for (let i = 0; i < 20 && pb < capB; i++) {
      if (screenBeamShear(dem.Vu, pb, ph, fc, cover, stirrupDia) <= 0.85) break;
      pb = r2(pb + SECTION_STEP);
    }
    for (let i = 0; i < 20 && ph < capH; i++) {
      if (screenBeamShear(dem.Vu, pb, ph, fc, cover, stirrupDia) <= 0.85) break;
      ph = r2(ph + SECTION_STEP);
    }
    reasons.push({ key: 'design.advice.beamShearWidth', params: { vu: Math.round(dem.Vu), b: Math.round(pb * 1000) } });
  } else if (driver === 'barFit' || driver === 'congestion' || driver === 'cover') {
    const n = dem.requiredBarsPerRow ?? 4;
    const dia = (dem.requiredBarDia ?? 20) / 1000;
    const gap = Math.max(dia, 0.025);
    const needed = 2 * cover + 2 * (stirrupDia / 1000) + n * dia + (n - 1) * gap;
    pb = Math.min(capB, snapUp(needed));
    reasons.push({ key: 'design.advice.beamFitWidth', params: { bars: n, dia: dem.requiredBarDia ?? 20, b: Math.round(pb * 1000) } });
  } else if (driver === 'slenderness') {
    let size = Math.max(b, h);
    for (let i = 0; i < 20 && size < capH; i++) {
      const rGyr = size / Math.sqrt(12);
      if (ctx.L / rGyr <= 34) break;
      size = r2(size + SECTION_STEP);
    }
    pb = Math.min(size, capB); ph = Math.min(size, capH);
    reasons.push({ key: 'design.advice.slenderness', params: { size: Math.round(ph * 1000) } });
  } else {
    return null;
  }

  const capReached = (ph >= capH - 1e-9 && pb >= capB - 1e-9)
    || (r2(pb * ph) <= r2(b * h) + 1e-9);
  if (r2(pb * ph) <= r2(b * h) + 1e-9) {
    // No strict growth possible — report the cap rather than a no-op proposal.
    reasons.push({ key: 'design.advice.capReached', params: { b: Math.round(capB * 1000), h: Math.round(capH * 1000) } });
    return {
      preliminary: true, currentB: b, currentH: h, proposedB: b, proposedH: h,
      driver, rationale: reasons, capReached: true,
    };
  }

  const screened = isColumn
    ? screenColumnAxial(dem.Nu, pb, ph, fc, fy, 0.04)
    : driver === 'shear'
      ? screenBeamShear(dem.Vu, pb, ph, fc, cover, stirrupDia)
      : screenBeamFlexure(dem.Mu, pb, ph, fc, fy, cover, stirrupDia);

  return {
    preliminary: true,
    currentB: b, currentH: h,
    proposedB: r2(pb), proposedH: r2(ph),
    driver, rationale: reasons,
    screenedUtilization: Number.isFinite(screened) ? +screened.toFixed(3) : undefined,
    capReached,
  };
}

/** Guard used by the UI/command layer to stop runaway section iteration. */
export interface IterationGuardState {
  iterations: number;
  lastArea: number;
  lastGoverningDemand: number;
}

export type IterationVerdict =
  | { ok: true }
  | { ok: false; reason: 'maxIterations' | 'noGrowth' | 'demandGrowth' | 'capReached' };

export function checkIterationGuard(
  prev: IterationGuardState,
  nextArea: number,
  nextGoverningDemand: number,
  capReached: boolean,
): IterationVerdict {
  if (prev.iterations >= MAX_SECTION_ITERATIONS) return { ok: false, reason: 'maxIterations' };
  if (capReached) return { ok: false, reason: 'capReached' };
  if (nextArea <= prev.lastArea + 1e-9) return { ok: false, reason: 'noGrowth' };
  if (prev.lastGoverningDemand > 1e-6) {
    const growth = (nextGoverningDemand - prev.lastGoverningDemand) / prev.lastGoverningDemand;
    if (growth > DEMAND_GROWTH_ABORT) return { ok: false, reason: 'demandGrowth' };
  }
  return { ok: true };
}
