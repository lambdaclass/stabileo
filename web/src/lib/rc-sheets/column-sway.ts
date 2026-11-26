/**
 * A column in a storey that sways: whether it does, by the storey's stability index Q against the
 * code's limit; its effective length by the sway alignment chart; and its end moments with the
 * part that sways the storey magnified, M = Mns + δs·Ms (CIRSOC 201-2025 and ACI 318-19 §6.6.4.6.1,
 * TS 500 7.6), Ms the moments of the combination's wind and earthquake cases. Where the
 * combinations were solved with P-Delta the moments carry the sway already and δs is 1.
 */
import { swayK } from '../engine/design/sway';
import type { ColumnCase, ColumnDemand, EndMoments } from './column-row';

/** How a combination's δs was reached. */
export type SwayMethod = 'Q' | 'Pc' | 'unstable' | 'secondOrder' | 'none';

export interface CaseSway { deltaS: number; method: SwayMethod; Q: number }

/** The storey is read and sways: Q past `limit` in some combination. */
export const storeySways = (d: ColumnDemand, limit: number): boolean => !!d.sway && d.sway.Q > limit + 1e-12;

/** The sway effective-length factor from the joints' Ψ, never under `kMin`. */
export const swayFactor = (d: Pick<ColumnDemand, 'psiTop' | 'psiBot'>, kMin: number): number => Math.max(kMin, swayK(d.psiTop, d.psiBot));

/**
 * δs of a combination by §6.6.4.6.2: 1/(1 − Q) where that is 1.5 at most (a), otherwise
 * 1/(1 − ΣPu/(0.75·ΣPc)) (b); unstable where ΣPu reaches 0.75·ΣPc. A combination that puts no
 * lateral shear on the storey has no Q of its own and nothing to magnify.
 */
export function aciDeltaS(d: ColumnDemand, combo: string): CaseSway {
  const s = d.sway;
  if (!s) return { deltaS: 1, method: 'none', Q: 0 };
  if (s.secondOrder) return { deltaS: 1, method: 'secondOrder', Q: s.byCombo[combo]?.Q ?? 0 };
  const own = s.byCombo[combo];
  if (!own) return { deltaS: 1, method: 'none', Q: 0 };
  const a = own.Q < 1 ? 1 / (1 - own.Q) : Number.POSITIVE_INFINITY;
  if (a <= 1.5) return { deltaS: Math.max(1, a), method: 'Q', Q: own.Q };
  const r = own.sumPc > 0 ? own.sumPu / (0.75 * own.sumPc) : Number.POSITIVE_INFINITY;
  return r < 1 ? { deltaS: Math.max(1, 1 / (1 - r)), method: 'Pc', Q: own.Q } : { deltaS: Number.POSITIVE_INFINITY, method: 'unstable', Q: own.Q };
}

/** The case with each end's sway part magnified, M = M + (δs − 1)·Ms, about the axes that are slender in the sway frame; `cap` keeps an unstable storey's δs finite for the section. */
export function swayMagnified(cs: ColumnCase, deltaS: number, axes: { x: boolean; y: boolean }, cap = 10): ColumnCase {
  const ms = cs.sway;
  if (!ms || deltaS <= 1 + 1e-12 || (!axes.x && !axes.y)) return cs;
  const k = Math.min(deltaS, cap) - 1;
  const add = (m: number, s: number, on: boolean) => (on ? m + k * s : m);
  return {
    ...cs,
    mxTop: add(cs.mxTop, ms.mxTop, axes.x), mxBot: add(cs.mxBot, ms.mxBot, axes.x),
    myTop: add(cs.myTop, ms.myTop, axes.y), myBot: add(cs.myBot, ms.myBot, axes.y),
  };
}

/** The larger end moment about each axis, first order: the P-Delta combination's own first-order moments where it has them. */
export function firstOrderM2(cs: ColumnCase): { x: number; y: number } {
  const m: EndMoments = cs.first ?? cs;
  return { x: Math.max(Math.abs(m.mxTop), Math.abs(m.mxBot)), y: Math.max(Math.abs(m.myTop), Math.abs(m.myBot)) };
}
