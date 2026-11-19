import { footingCover } from './footing-overlaps';
import { dropsVolume } from './footing-group';
import { scheduleElements } from './schedule/pieces';
import { scheduleOf } from './schedule/schedule';
import type { FootingRow, FoundationSystem } from './footing-types';
import type { SheetCode } from './types';

/** What a foundation layout comes to: its share of the building's plan, its concrete, m³, and steel, kg, its footings, strips and mats, and its rows that fail. */
export interface LayoutSummary {
  share: number | null;
  concrete: number; steel: number;
  count: { footing: number; strip: number; mat: number; cap: number };
  failing: number;
  /** The allowable pressure, kPa, the layout verifies at where the soil's does not hold some row of it at the plan the lines allow. */
  needs: number | null;
  /** The kinds the recommendation came to. */
  kinds: Array<'isolated' | 'combined' | 'strip' | 'mat' | 'pileCap'>;
}

export interface FoundationLayout { system: FoundationSystem; rows: FootingRow[]; summary: LayoutSummary }

const kindOf = (r: FootingRow) => (r.cap ? 'pileCap' as const : r.group?.kind ?? (r.combined ? 'combined' : 'isolated'));
const pilesVolume = (r: FootingRow) => (r.adopted.piles ? r.adopted.piles.at.length * Math.PI * r.adopted.piles.diameter ** 2 / 4 * r.adopted.piles.length : 0);

export function layoutSummary(rows: readonly FootingRow[], code: SheetCode | string): LayoutSummary {
  const live = rows.filter((r) => r.B > 0);
  const straps = live.flatMap((r) => (r.edge?.straps ?? []).filter((s) => s.group === undefined).map((s) => ({ key: [r.key, s.partnerKey].sort().join('|'), v: s.b * s.h * Math.max(0, s.L) })));
  const strapVolume = [...new Map(straps.map((s) => [s.key, s.v])).values()].reduce((t, v) => t + v, 0);
  const concrete = live.reduce((t, r) => t + r.B * r.L * r.h + (r.demand.group ? dropsVolume(r.demand.group, r.adopted) : 0) + pilesVolume(r) + (r.pedestal > 0 ? (r.group ? r.group.columns.reduce((s, c) => s + c.b * c.h, 0) : (r.demand.column?.b ?? 0) * (r.demand.column?.h ?? 0)) * r.pedestal : 0), 0) + strapVolume;
  const steel = scheduleOf(scheduleElements({ line: [], column: [], slab: [], wall: [], footing: [...live] }, { code: code as SheetCode, slabCover: 0.02 }), { code: code as SheetCode, scope: 'element' }).total.kg;
  const count = { footing: live.filter((r) => !r.group && !r.cap).length, cap: live.filter((r) => r.cap).length, strip: live.filter((r) => r.group?.kind === 'strip').length, mat: live.filter((r) => r.group?.kind === 'mat').length };
  const needs = rows.flatMap((r) => (r.sizing.needs !== undefined ? [r.sizing.needs] : []));
  return { share: footingCover(live)?.share ?? null, concrete, steel, count, failing: rows.filter((r) => r.status === 'fail').length, needs: needs.length ? Math.max(...needs) : null, kinds: [...new Set(live.map(kindOf))] };
}
