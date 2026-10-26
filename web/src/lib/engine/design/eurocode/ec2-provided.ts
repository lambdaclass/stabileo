/**
 * The bars a member holds, read as the EN 1992-1-1 design needs them: steel per face at a station
 * of a beam, the links there, and a column's steel per plane of bending. m², m²/m, m.
 *
 * Bar areas are π·d²/4. Beams follow the regions of `BeamRegions` (start and end supports up to
 * `regionT`, 0,25 by default, the span between): the bottom bars are the span's (groups, layers
 * or the single group, in that order), the top bars those of the support region the station is
 * in; in the span, the smaller of the two support groups, which is what continues into it. The
 * element-wide `top`, `bottom` and `stirrups` stand for every region. A column's bars by
 * `ColumnReinforcement`: the plane of My (bending over h) reads the bottom and top faces (two
 * corners and their face bars each), the plane of Mz the left and right faces; the bars along the
 * other faces sit near the neutral axis and are left out, which is on the safe side.
 */
import type { ProvidedReinforcement, RebarLayer, RebarGroup, LongBarGroup, StirrupDef } from '../../../design-contract/reinforcement';

const bar = (dMm: number) => (Math.PI * (dMm / 1000) ** 2) / 4;
const layers = (ls?: RebarLayer[]) => (ls ?? []).reduce((s, l) => s + l.count * bar(l.diameter), 0);
const group = (g?: RebarGroup) => (g ? g.count * bar(g.diameter) : 0);
const groups = (gs?: LongBarGroup[]) => (gs ?? []).reduce((s, g) => s + layers(g.layers), 0);
const first = (...v: number[]) => v.find((x) => x > 0) ?? 0;
const links = (s?: StirrupDef) => (s && s.spacing > 0 ? { aswS: (s.legs * bar(s.diameter)) / s.spacing, spacing: s.spacing, diameter: s.diameter } : null);

export interface BeamBarsAt { bottom: number; top: number; links: { aswS: number; spacing: number; diameter: number } | null }

/** A beam's steel at station t ∈ [0, 1]; null when the member holds no bars. */
export function beamBarsAt(r: ProvidedReinforcement | undefined, t: number): BeamBarsAt | null {
  if (!r) return null;
  const g = r.regions, rt = g?.regionT ?? 0.25;
  const bottom = first(groups(g?.bottomGroups), layers(g?.bottomSpanLayers), group(g?.bottomSpan), group(r.bottom));
  const start = first(groups(g?.topStartGroups), layers(g?.topStartLayers), group(g?.topStart), group(r.top));
  const end = first(groups(g?.topEndGroups), layers(g?.topEndLayers), group(g?.topEnd), group(r.top));
  const top = t <= rt ? start : t >= 1 - rt ? end : Math.min(start, end);
  const inSupport = t <= rt || t >= 1 - rt;
  const l = links((inSupport ? g?.stirrupsSupport : g?.stirrupsSpan) ?? g?.stirrupsSupport ?? g?.stirrupsSpan ?? r.stirrups);
  if (bottom <= 0 && top <= 0 && !l) return null;
  return { bottom, top, links: l };
}

export interface ColumnBars {
  total: number;
  /** Total steel each plane reads (twice its weaker face), m². */
  planeMy: number; planeMz: number;
  /** Cover to the corner bars' centres, m. */
  d2: number;
  links: { aswS: number; spacing: number; diameter: number } | null;
}

/** A column's steel; null without longitudinal bars. `cover` to the links, m; `linkDia` when the member states none, mm. */
export function columnBars(r: ProvidedReinforcement | undefined, cover: number, linkDia: number): ColumnBars | null {
  if (!r) return null;
  const l = links(r.stirrups);
  const tie = r.stirrups?.diameter ?? linkDia;
  if (r.column) {
    const c = r.column, corner = bar(c.cornerDia), face = bar(c.faceDia);
    const my = 2 * Math.min(2 * corner + c.nBottom * face, 2 * corner + c.nTop * face);
    const mz = 2 * Math.min(2 * corner + c.nLeft * face, 2 * corner + c.nRight * face);
    const total = 4 * corner + (c.nBottom + c.nTop + c.nLeft + c.nRight) * face;
    return { total, planeMy: my, planeMz: mz, d2: cover + (tie + c.cornerDia / 2) / 1000, links: l };
  }
  if (r.longitudinal && r.longitudinal.count >= 4) {
    // The legacy group: four corners and the rest spread evenly over the four faces.
    const g = r.longitudinal, rest = g.count - 4, perFace = Math.floor(rest / 4);
    const face = (2 + perFace) * bar(g.diameter);
    return { total: g.count * bar(g.diameter), planeMy: 2 * face, planeMz: 2 * face, d2: cover + (tie + g.diameter / 2) / 1000, links: l };
  }
  return null;
}
