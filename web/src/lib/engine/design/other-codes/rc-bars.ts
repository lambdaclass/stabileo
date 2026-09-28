/**
 * The provided reinforcement a reinforced-concrete checker reads at one demand: the bars on the
 * face in tension, the bars on the opposite face, their depths and the stirrups there.
 *
 * It reads the same statement the CIRSOC verification reads — `Element.reinforcement`, resolved
 * with the same helpers — so a member's bars mean one thing whatever code checks them:
 *
 *   · beams: the three regions (start support, span, end support) at `regionT`, sagging against
 *     the bottom bars and hogging against the top bars of the region the station falls in. A
 *     face that reaches another region only counts there when its continuity says it does,
 *     which is the engineer's statement; anchorage lengths are each code's rule and are not
 *     reapplied here;
 *   · columns: the bars on the two faces across the bending axis. The side bars are left out and
 *     both faces carry the smaller of the two, so an unsymmetric column reads on the safe side
 *     whichever way it bends.
 *
 * Areas in m², lengths in m.
 */
import type { ProvidedReinforcement, RebarLayer } from '../../../store/model.svelte';
import {
  resolveLayers, layersTotalArea, layerCentroid, resolveBarGroups, resolveColumnReinf,
  type GoverningDemand,
} from '../../station-design-forces';
import type { MomentAxis } from '../design-axes';
import { tupleMoment, tupleShear } from '../design-axes';
import { DEFAULT_STIRRUP_DIA } from '../member-context';

export interface RcAt {
  /** Width and total depth across the bending axis. */
  b: number; h: number;
  /** Effective depth of the bars in tension, and depth of the bars in compression. */
  d: number; dPrime: number;
  asTension: number; asCompression: number;
  /** Stirrup area per spacing and the spacing, when stirrups are stated there. */
  av?: number; s?: number;
  /** Moment about the bending axis (kN·m, sagging positive) and the paired shear (kN). */
  M: number; V: number;
}

const CM2 = 1e-4;
const barArea = (dia: number) => (Math.PI * (dia / 1000) ** 2) / 4;

function stirrups(st: { diameter: number; legs: number; spacing: number } | undefined) {
  if (!st || !(st.spacing > 0) || !(st.legs > 0)) return {};
  return { av: st.legs * barArea(st.diameter), s: st.spacing };
}

const union = (groups: Array<{ layers: RebarLayer[] }>) => groups.flatMap((g) => g.layers);
const continuing = <T extends { continueStart?: boolean; continueEnd?: boolean }>(groups: T[], into: 'start' | 'end') =>
  groups.filter((g) => (into === 'start' ? g.continueStart : g.continueEnd) !== false);

/** A beam at one demand, bending about `axis` over the section's depth h. */
export function beamBarsAt(
  r: ProvidedReinforcement, sec: { b: number; h: number }, cover: number,
  d: GoverningDemand, axis: MomentAxis, shearAxis: 'Vy' | 'Vz',
): RcAt {
  const reg = r.regions;
  const bottom = resolveLayers(reg?.bottomSpanLayers, reg?.bottomSpan ?? r.bottom);
  const topStart = resolveLayers(reg?.topStartLayers, reg?.topStart ?? r.top);
  const topEnd = resolveLayers(reg?.topEndLayers, reg?.topEnd ?? r.top);
  const cont = reg?.continuity;
  const bottomG = resolveBarGroups(reg?.bottomGroups, bottom, cont?.bottomIntoStart !== false, cont?.bottomIntoEnd !== false);
  const topStartG = resolveBarGroups(reg?.topStartGroups, topStart, true, cont?.topStartIntoSpan !== false);
  const topEndG = resolveBarGroups(reg?.topEndGroups, topEnd, cont?.topEndIntoSpan !== false, true);

  const tS = reg?.regionT ?? 0.25;
  const region = d.stationT <= tS ? 'start' : d.stationT >= 1 - tS ? 'end' : 'span';
  // The bars on each face at this station.
  // Groups, when stated, override the flat layers of their face (`BeamRegions`).
  const bottomHere = region === 'span' ? union(bottomG) : union(continuing(bottomG, region));
  const topFromStart = union(continuing(topStartG, 'end')), topFromEnd = union(continuing(topEndG, 'start'));
  const topHere = region === 'start' ? union(topStartG) : region === 'end' ? union(topEndG)
    : layersTotalArea(topFromStart) >= layersTotalArea(topFromEnd) ? topFromStart : topFromEnd;

  const st = region === 'span' ? (reg?.stirrupsSpan ?? r.stirrups) : (reg?.stirrupsSupport ?? r.stirrups);
  const stDia = st?.diameter ?? DEFAULT_STIRRUP_DIA;
  const M = tupleMoment(d.forces, axis);
  const [tension, compression] = M >= 0 ? [bottomHere, topHere] : [topHere, bottomHere];
  return {
    b: sec.b, h: sec.h,
    d: sec.h - layerCentroid(tension, cover, stDia),
    dPrime: layerCentroid(compression, cover, stDia),
    asTension: layersTotalArea(tension) * CM2,
    asCompression: layersTotalArea(compression) * CM2,
    ...stirrups(st),
    M, V: tupleShear(d.forces, shearAxis),
  };
}

/** A column at one demand, bending about `axis`: My over the depth h, Mz over the width b. */
export function columnBarsAt(
  r: ProvidedReinforcement, sec: { b: number; h: number }, cover: number,
  d: GoverningDemand, axis: MomentAxis, shearAxis: 'Vy' | 'Vz',
): RcAt | null {
  const col = resolveColumnReinf(r.column, r.longitudinal);
  if (!col) return null;
  const overH = axis === 'My';
  const [n1, n2] = overH ? [col.nBot, col.nTop] : [col.nLeft, col.nRight];
  const face = (n: number) => 2 * barArea(col.cornerDia) + n * barArea(col.faceDia);
  const as = Math.min(face(n1), face(n2));
  const stDia = r.stirrups?.diameter ?? DEFAULT_STIRRUP_DIA;
  const edge = cover + stDia / 1000 + Math.max(col.cornerDia, col.faceDia) / 2000;
  const [b, h] = overH ? [sec.b, sec.h] : [sec.h, sec.b];
  return {
    b, h, d: h - edge, dPrime: edge,
    asTension: as, asCompression: as,
    ...stirrups(r.stirrups),
    M: tupleMoment(d.forces, axis), V: tupleShear(d.forces, shearAxis),
  };
}

/** True when the element states any longitudinal bars at all. */
export function hasLongitudinalBars(r: ProvidedReinforcement | undefined): boolean {
  if (!r) return false;
  if (resolveColumnReinf(r.column, r.longitudinal)) return true;
  const reg = r.regions;
  return [
    resolveLayers(reg?.bottomSpanLayers, reg?.bottomSpan ?? r.bottom),
    resolveLayers(reg?.topStartLayers, reg?.topStart ?? r.top),
    resolveLayers(reg?.topEndLayers, reg?.topEnd ?? r.top),
  ].some((l) => l.length > 0) || !!(reg?.bottomGroups?.length || reg?.topStartGroups?.length || reg?.topEndGroups?.length);
}
