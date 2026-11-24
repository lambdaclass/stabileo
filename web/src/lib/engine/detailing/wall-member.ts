/**
 * A wall on one level as a member: its bars placed explicitly, its in-plane axial force and moment
 * checked on them by strain compatibility (the general section engine, the length as the depth),
 * its bending out of the plane checked on a metre strip in both directions (the vertical strip with
 * its share of the axial load, §11.5.2.2 reads it as a compression member), and the bars beside its
 * openings (§11.7.5.1: at least two Ø16 per side, or their area). When the distributed steel does
 * not carry the in-plane moment the design concentrates bars at both ends (boundary elements)
 * before closing the spacing.
 */
import type { WallReinforcement } from '../../design-contract/reinforcement';
import { momentCapacityAtAxial, axialRange } from '../codes/argentina/cirsoc-flex-surface';
import type { Bar } from '../codes/argentina/cirsoc201-section';
import { CIRSOC201_DESIGN_EDITION } from '../codes/argentina/cirsoc201-basis';
import { computeFlexureCapacity } from '../station-design-forces';

const area = (dMm: number) => Math.PI * (dMm / 1000) ** 2 / 4;

/** The vertical bars of a wall in its section, x along the length, y across the thickness, m about the centre. */
export function wallVerticalBars(length: number, thickness: number, cover: number, r: WallReinforcement): Bar[] {
  const out: Bar[] = [];
  const hd = r.horizontal.diameter / 1000, vd = r.vertical.diameter / 1000;
  // The verticals sit inside the horizontals on each curtain.
  const ys = r.curtains === 2 ? [-(thickness / 2 - cover - hd - vd / 2), thickness / 2 - cover - hd - vd / 2] : [0];
  const n = Math.max(2, Math.floor(length / r.vertical.spacing) + 1);
  const span = length - 2 * (cover + hd + vd / 2);
  for (const y of ys) for (let i = 0; i < n; i++) out.push({ x: -span / 2 + (span * i) / (n - 1), y, area: area(r.vertical.diameter) });
  if (r.boundary && r.boundary.count > 0) {
    // Each end's extra bars, split between the curtains, inward from the end bar at 2·db (≥ 50 mm).
    const bd = r.boundary.diameter / 1000, pitch = Math.max(0.05, 2 * bd);
    const per = Math.ceil(r.boundary.count / ys.length);
    for (const end of [-1, 1]) for (const y of ys) for (let i = 0; i < per; i++) {
      out.push({ x: end * (span / 2 - (i + 1) * pitch), y, area: area(r.boundary.diameter) });
    }
  }
  return out;
}

export interface WallCheck { category: string; utilization: number; description: string; ok: boolean }

/** In-plane P–M on the wall's own bars, at its axial load in its own direction. */
export function wallInPlane(o: { length: number; thickness: number; cover: number; fc: number; fy: number; pu: number; mu: number; r: WallReinforcement }): WallCheck & { phiMn: number } {
  const bars = wallVerticalBars(o.length, o.thickness, o.cover, o.r);
  const outline = { kind: 'rect' as const, b: o.length, h: o.thickness };
  const mat = { fc: o.fc, fy: o.fy, edition: CIRSOC201_DESIGN_EDITION };
  const range = axialRange(outline, bars, mat);
  let u: number, phiMn = 0;
  if (o.pu > range.max || o.pu < range.min) u = Number.POSITIVE_INFINITY;
  else if (o.mu < 1e-6) u = o.pu > 0 ? o.pu / Math.max(range.max, 1e-9) : 0;
  else {
    // In-plane bending: the strain varies along the length, the section's x.
    const cap = momentCapacityAtAxial(outline, bars, mat, o.pu, 1e-9, o.mu);
    phiMn = cap?.phiMn ?? 0;
    u = phiMn > 1e-9 ? o.mu / phiMn : Number.POSITIVE_INFINITY;
  }
  return {
    category: 'In-plane P-M', utilization: u, ok: u <= 1 + 1e-9, phiMn,
    description: `Pu = ${o.pu.toFixed(0)} kN, Mu = ${o.mu.toFixed(0)} kN·m, φMn = ${phiMn.toFixed(0)} kN·m on ${bars.length} bars (strain compatibility)`,
  };
}

/** Out of the plane, on a metre strip: the verticals with the axial share, the horizontals alone. */
export function wallOutOfPlane(o: { length: number; thickness: number; cover: number; fc: number; fy: number; pu: number; muV: number; muH: number; r: WallReinforcement }): WallCheck[] {
  const out: WallCheck[] = [];
  const t = o.thickness;
  if (o.muV > 1e-6) {
    const stripBars: Bar[] = [];
    const per = 1 / o.r.vertical.spacing;
    const ys = o.r.curtains === 2 ? [-(t / 2 - o.cover - o.r.horizontal.diameter / 1000 - o.r.vertical.diameter / 2000), t / 2 - o.cover - o.r.horizontal.diameter / 1000 - o.r.vertical.diameter / 2000] : [0];
    for (const y of ys) stripBars.push({ x: 0, y, area: area(o.r.vertical.diameter) * per });
    const outline = { kind: 'rect' as const, b: 1, h: t };
    const Pm = Math.max(0, o.pu / Math.max(o.length, 1e-6));
    const cap = momentCapacityAtAxial(outline, stripBars, { fc: o.fc, fy: o.fy, edition: CIRSOC201_DESIGN_EDITION }, Pm, o.muV, 1e-9);
    const u = cap && cap.phiMn > 1e-9 ? o.muV / cap.phiMn : Number.POSITIVE_INFINITY;
    out.push({ category: 'Out-of-plane (vertical bars)', utilization: u, ok: u <= 1 + 1e-9, description: `Mu = ${o.muV.toFixed(1)} kN·m/m at Pu = ${Pm.toFixed(0)} kN/m, φMn = ${(cap?.phiMn ?? 0).toFixed(1)} kN·m/m` });
  }
  if (o.muH > 1e-6) {
    const As = (area(o.r.horizontal.diameter) / o.r.horizontal.spacing) * 1e4; // one curtain, cm²/m
    const d = o.r.curtains === 2 ? t - o.cover - o.r.horizontal.diameter / 2000 : t / 2;
    const phiMn = computeFlexureCapacity(As, 1, d, o.fc, o.fy)?.phiMn ?? 0;
    const u = phiMn > 1e-9 ? o.muH / phiMn : Number.POSITIVE_INFINITY;
    out.push({ category: 'Out-of-plane (horizontal bars)', utilization: u, ok: u <= 1 + 1e-9, description: `Mu = ${o.muH.toFixed(1)} kN·m/m, φMn = ${phiMn.toFixed(1)} kN·m/m` });
  }
  return out;
}

/** §11.7.5.1: beside each side of each opening, at least the area of 2Ø16. */
export function wallOpenings(openingCount: number, r: WallReinforcement): WallCheck | null {
  if (!(openingCount > 0)) return null;
  const need = 2 * area(16);
  const have = r.openings ? r.openings.count * area(r.openings.diameter) : 0;
  return {
    category: 'Openings (§11.7.5)', utilization: have > 0 ? need / have : Number.POSITIVE_INFINITY, ok: have >= need - 1e-12,
    description: `${openingCount} opening(s): ${r.openings ? `${r.openings.count}Ø${r.openings.diameter}` : 'no bars'} beside each side, at least 2Ø16 (${(need * 1e4).toFixed(2)} cm²)`,
  };
}

/**
 * The wall's reinforcement as the design proposes it: the distributed minimum at the given bar,
 * then boundary bars at both ends while the in-plane P–M does not hold (2 to 8 bars of Ø12 to
 * Ø25 each end), then the opening bars.
 */
export function proposeWallReinforcement(o: {
  length: number; thickness: number; cover: number; fc: number; fy: number; pu: number; mu: number;
  barDiameterMm: number; verticalSpacing: number; horizontalSpacing: number; curtains: 1 | 2; openingCount: number;
}): WallReinforcement {
  const base: WallReinforcement = {
    vertical: { diameter: o.barDiameterMm, spacing: o.verticalSpacing },
    horizontal: { diameter: o.barDiameterMm, spacing: o.horizontalSpacing },
    curtains: o.curtains,
    ...(o.openingCount > 0 ? { openings: { count: 2, diameter: 16 } } : {}),
  };
  const holds = (r: WallReinforcement) => wallInPlane({ ...o, r }).ok;
  if (holds(base)) return base;
  for (const diameter of [12, 16, 20, 25]) for (const count of [2, 4, 6, 8]) {
    const r = { ...base, boundary: { count, diameter } };
    if (holds(r)) return r;
  }
  return { ...base, boundary: { count: 8, diameter: 25 } };
}
