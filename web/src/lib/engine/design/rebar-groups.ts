/**
 * The cut groups of a beam face, kept in step with its edited layers.
 *
 * A face may split its bars into groups that run through to the adjacent regions and groups that
 * are cut off. An edit of the layers used to delete the groups, which made every retouched beam
 * full-length in the detailing. Shared by the single-member editor and the batch edit.
 */
import type { LongBarGroup, RebarLayer } from '../../store/model.svelte';

/** Bars of a group that run through both adjacent regions. */
function runsThrough(g: LongBarGroup): boolean {
  return g.continueStart !== false && g.continueEnd !== false;
}

/**
 * Split edited layers into the groups a face had: as many bars as ran through keep running
 * through (row by row, from the first row), and the rest take the first cut-off group's ends.
 * `null` when the face had no cut groups, or when every bar now runs through, unless the bars
 * running through carry hooks (§25.4.3): then one group keeps them.
 */
export function regroupBars(groups: LongBarGroup[] | undefined, layers: RebarLayer[]): LongBarGroup[] | null {
  if (!groups || groups.length === 0 || layers.length === 0) return null;
  const cut = groups.find((g) => !runsThrough(g));
  // Bars that all run through keep their group only for the hooks it carries.
  const ends = (g?: LongBarGroup) => ({ ...(g?.anchorageStart ? { anchorageStart: g.anchorageStart } : {}), ...(g?.anchorageEnd ? { anchorageEnd: g.anchorageEnd } : {}) });
  const hooked = groups.find((g) => runsThrough(g) && (g.anchorageStart || g.anchorageEnd));
  if (!cut) return hooked ? [{ layers: layers.map((l, row) => ({ ...l, row })), label: hooked.label ?? 'all', continueStart: true, continueEnd: true, ...ends(hooked) }] : null;
  let through = groups.filter(runsThrough).reduce((s, g) => s + g.layers.reduce((n, l) => n + l.count, 0), 0);
  const total = layers.reduce((s, l) => s + l.count, 0);
  if (through >= total) return hooked ? [{ layers: layers.map((l, row) => ({ ...l, row })), label: hooked.label ?? 'all', continueStart: true, continueEnd: true, ...ends(hooked) }] : null;
  const full: RebarLayer[] = [];
  const rest: RebarLayer[] = [];
  layers.forEach((l, row) => {
    const take = Math.min(l.count, through);
    through -= take;
    if (take > 0) full.push({ ...l, count: take, row });
    if (l.count - take > 0) rest.push({ ...l, count: l.count - take, row });
  });
  const { layers: _old, ...cutEnds } = cut;
  const out: LongBarGroup[] = [];
  if (full.length > 0) out.push({ layers: full, label: 'full-length', continueStart: true, continueEnd: true, ...ends(hooked) });
  out.push({ ...cutEnds, layers: rest });
  return out;
}
