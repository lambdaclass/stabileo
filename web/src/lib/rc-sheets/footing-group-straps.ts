import { strapDefault } from './footing-strap';
import type { FootingAction, FootingAdopted, FootingGroup, GroupStrap, StrapPartner } from './footing-types';

type Axis = 'x' | 'y';

/** A member column placed from the footing's centroid, as the group reads it. */
interface At { demand: FootingGroup['members'][number]; x: number; y: number }

/** The least arm a strap keeps past the footing's centroid, m: a strap no longer than its offset balances nothing. */
const MIN_ARM = 0.1;

/**
 * A strap's pull on a strip held along a line, at one column (`strap-footing.ts`, as a single
 * footing's): its moment M = P·e + |w| over the strip's centroid across, e the column's offset
 * there, and the end force V = M/(L − e) the beam brings down on the strip, toward the footing it
 * runs to; the partner's relief (P·e − |w|)/(L − e), not taken.
 */
export function stripStrapPull(p: At, q: FootingAction, axis: Axis, lever: number): { V: number; M: number; e: number; L: number; relief: number; partner: StrapPartner } | null {
  const partner = p.demand.edge?.partners.find((x) => x.axis === axis);
  if (!partner) return null;
  const e = Math.abs(axis === 'x' ? p.x : p.y), w = Math.abs(axis === 'x' ? q.My + lever * q.Vx : q.Mx - lever * q.Vy);
  const arm = Math.max(MIN_ARM, partner.L - e), P = Math.abs(q.N);
  return { V: (P * e + w) / arm, M: P * e + w, e, L: partner.L, relief: (P * e - w) / arm, partner };
}

/** Each column's strap as the strip's row gives it: the largest moment and end force over the combinations, the service reaction and the section, its own or the default. */
export function stripStraps(cols: readonly At[], axis: Axis, lever: number, a: Pick<FootingAdopted, 'h' | 'straps'>, combos: readonly string[]): GroupStrap[] {
  return cols.flatMap((p): GroupStrap[] => {
    const s = p.demand.service ? stripStrapPull(p, p.demand.service, axis, lever) : null;
    if (!s) return [];
    let M = 0, V = 0, combo: string | null = null, relief = Infinity;
    for (const name of combos) {
      const q = p.demand.combos.find((k) => k.combo === name);
      const r = q ? stripStrapPull(p, q, axis, lever) : null;
      if (!r) continue;
      if (r.M > M) { M = r.M; V = r.V; combo = name; }
      relief = Math.min(relief, r.relief);
    }
    const P1 = Math.abs(p.demand.service!.N), sec = a.straps?.[axis] ?? s.partner.beam ?? strapDefault(p.demand, a, axis);
    return [{
      axis, partner: s.partner.name, partnerKey: s.partner.key, L: s.L, e: s.e, b: sec.b, h: sec.h, M, V, factor: P1 > 0 ? (P1 + s.V) / P1 : 1, relief: Number.isFinite(relief) ? relief : 0,
      combo, R1: P1 + s.V, P1, holder: p.demand.key, column: p.demand.name, from: { x: p.demand.at.x, y: p.demand.at.y },
      ...(s.partner.beam ? { group: s.partner.beam.group } : {}),
    }];
  });
}
