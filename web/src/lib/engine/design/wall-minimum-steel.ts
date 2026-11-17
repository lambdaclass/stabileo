/**
 * The minimum distributed reinforcement of a wall checked as a member (the verifier's wall path),
 * CIRSOC 201-2025 Tabla 11.6.1 or §11.6.2 by `minimumWallRatios`, on the bars the member holds.
 *
 * The verifier reads a wall member's bars as a beam's or a column's: every longitudinal bar is a
 * vertical bar of the wall, ρl = their area over Ag = b·h; the stirrups are its horizontal bars,
 * one on each face per spacing, ρt = 2·Ab/(s·t) with t the thickness, min(b, h). The table's row
 * is read by each direction's largest bar. In-plane: the length is max(b, h), the shear along it
 * the one that pairs with that depth (Vz over h, Vy over b, as `design-axes.ts` pairs them), hw
 * the member's length.
 *
 * Pure.
 */
import type { ProvidedReinforcement, RebarGroup, RebarLayer, LongBarGroup } from '../../design-contract/reinforcement';
import type { ProvidedRebarCheck } from '../station-design-forces';
import { minimumWallRatios } from '../detailing/wall-design';
import { utilizationStatus } from './outcome';

const bar = (dMm: number) => (Math.PI * (dMm / 1000) ** 2) / 4;
type Bars = { area: number; maxDia: number };
const none: Bars = { area: 0, maxDia: 0 };
const add = (a: Bars, b: Bars): Bars => ({ area: a.area + b.area, maxDia: Math.max(a.maxDia, b.maxDia) });
const group = (g?: RebarGroup): Bars => (g && g.count > 0 ? { area: g.count * bar(g.diameter), maxDia: g.diameter } : none);
const layers = (ls?: RebarLayer[]): Bars => (ls ?? []).reduce<Bars>((s, l) => add(s, { area: l.count * bar(l.diameter), maxDia: l.diameter }), none);
const groups = (gs?: LongBarGroup[]): Bars => (gs ?? []).reduce<Bars>((s, g) => add(s, layers(g.layers)), none);
const face = (g?: RebarGroup, ls?: RebarLayer[], gs?: LongBarGroup[]): Bars => (gs?.length ? groups(gs) : ls?.length ? layers(ls) : group(g));

/** The member's longitudinal bars at its leanest section. */
function verticalBars(r: ProvidedReinforcement): Bars {
  if (r.column) {
    const c = r.column, faces = c.nBottom + c.nTop + c.nLeft + c.nRight;
    return { area: 4 * bar(c.cornerDia) + faces * bar(c.faceDia), maxDia: Math.max(c.cornerDia, faces > 0 ? c.faceDia : 0) };
  }
  if (r.longitudinal) return group(r.longitudinal);
  if (r.regions) {
    const g = r.regions;
    const bottom = face(g.bottomSpan, g.bottomSpanLayers, g.bottomGroups);
    const ts = face(g.topStart, g.topStartLayers, g.topStartGroups), te = face(g.topEnd, g.topEndLayers, g.topEndGroups);
    return add(bottom, ts.area <= te.area ? ts : te);
  }
  return add(group(r.top), group(r.bottom));
}

export interface WallMemberGeometry {
  b: number; h: number;
  /** The member's length, hw, m. */
  L: number;
  fc: number; fy: number;
  /** The in-plane shear, the largest, kN. */
  vu: number;
}

/** Tabla 11.6.1 (or §11.6.2) on a wall member's bars: ρl and ρt rows, or none without bars. */
export function wallMemberMinimumChecks(r: ProvidedReinforcement, g: WallMemberGeometry): ProvidedRebarCheck[] {
  const v = verticalBars(r);
  const st = r.regions?.stirrupsSpan ?? r.regions?.stirrupsSupport ?? r.stirrups;
  if (v.area <= 0 && !st) return [];
  const t = Math.min(g.b, g.h), lw = Math.max(g.b, g.h), Ag = g.b * g.h;
  const rhoL = v.area / Ag;
  const rhoT = st ? (2 * bar(st.diameter)) / (st.spacing * t) : 0;
  const req = minimumWallRatios(v.maxDia || (st?.diameter ?? 0), g.fy, '2025', {
    horizontalDiameterMm: st?.diameter ?? v.maxDia,
    shear: { vu: g.vu, fc: g.fc, acv: Ag, hw: g.L, lw, rhoTProvided: rhoT },
  });
  const clause = req.refs[0]!.clause;
  const row = (dir: 'ρl' | 'ρt', need: number, has: number, what: string): ProvidedRebarCheck => {
    const u = has > 1e-12 ? need / has : Number.POSITIVE_INFINITY;
    return {
      category: `Wall ${dir} (${clause})`, demandCategory: null,
      required: +(need * 100).toFixed(4), provided: +(has * 100).toFixed(4),
      ratio: Number.isFinite(u) ? +u.toFixed(3) : u, status: utilizationStatus(u), unit: '%', method: 'area', tuplesChecked: 0,
      description: `${dir} = ${(has * 100).toFixed(3)}% ≥ ${(need * 100).toFixed(3)}%, ${what}; ${req.note}`,
      limiting: 'minSteel', ...(has > 1e-12 ? {} : { missingReinforcement: true }),
    };
  };
  return [
    row('ρl', req.rhoL, rhoL, `vertical bars ${(v.area * 1e4).toFixed(2)} cm² over Ag = ${(Ag * 1e4).toFixed(0)} cm²`),
    row('ρt', req.rhoT, rhoT, st ? `horizontal Ø${st.diameter} c/${(st.spacing * 100).toFixed(0)} cm on both faces, t = ${(t * 100).toFixed(0)} cm` : 'no horizontal bars'),
  ];
}
