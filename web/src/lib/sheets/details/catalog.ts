/**
 * The catalogue of construction details: every detail by family, with its own code, the sheet it
 * goes on, and what is chosen when a project has not chosen yet. A choice is the detail and the
 * plan kind it goes on; the drawing set places it on that kind's first entry, or on the details
 * sheet when the set has no such entry (`placeDetails`).
 */
import type { DrawingInput } from '../compose';
import { place } from '../primitives';
import { modelBounds } from './sketch';
import { sheetToSvg } from '../to-svg';
import { BEAMS } from './beams';
import { COLUMNS } from './columns';
import type { DetailDef, Tr } from './def';
import { FOUNDATIONS } from './foundations';
import { GENERAL } from './general';
import { JOINTS } from './joints';
import { SLABS } from './slabs';
import { STAIRS } from './stairs';
import { TABLES } from './tables';
import { DETAIL_FAMILIES, type DetailFamily, type DetailValues } from './values';
import { WALLS } from './walls';

export const DETAILS: readonly DetailDef[] = [...GENERAL, ...SLABS, ...BEAMS, ...COLUMNS, ...JOINTS, ...FOUNDATIONS, ...WALLS, ...STAIRS, ...TABLES];
const BY_ID = new Map(DETAILS.map((d) => [d.id, d]));
export const detailDef = (id: string): DetailDef | undefined => BY_ID.get(id);
export const familyDetails = (f: DetailFamily): DetailDef[] => DETAILS.filter((d) => d.family === f);
export { DETAIL_FAMILIES };

export interface DetailChoice { id: string; target: string }

/** What a project shows before choosing: the six basic details and the anchorage table on the details sheet; a seismic project's joint, beam and column in their seismic variant. */
export function defaultChoices(seismic: boolean): DetailChoice[] {
  const ids = ['hooks', 'tie', 'lap', 'starters', 'slab-edge', seismic ? 'joint-interior-seismic' : 'joint', ...(seismic ? ['beam-seismic', 'column-seismic'] : []), 'chars-anchorage'];
  return ids.map((id) => ({ id, target: 'details' }));
}

/** The chosen details drawn, in catalogue order, the unknown ids dropped. */
export function drawDetails(choices: readonly DetailChoice[], v: DetailValues, tr: Tr, fmt: (v: number, d: number) => string): DrawingInput[] {
  const want = new Set(choices.map((c) => c.id));
  return DETAILS.filter((d) => want.has(d.id)).map((d) => d.draw(v, tr, fmt));
}

/**
 * Which entry of the set each chosen detail goes on: the first entry of its target kind, else
 * the first details entry. `unplaced`: the ones the set has no sheet for.
 */
export function placeDetails(choices: readonly DetailChoice[], entries: ReadonlyArray<{ id: string; kind: string }>): { byEntry: Map<string, DetailChoice[]>; unplaced: DetailChoice[] } {
  const first = new Map<string, string>();
  for (const e of entries) if (!first.has(e.kind)) first.set(e.kind, e.id);
  const byEntry = new Map<string, DetailChoice[]>(), unplaced: DetailChoice[] = [];
  for (const c of choices) {
    if (!BY_ID.has(c.id)) continue;
    const at = first.get(c.target) ?? first.get('details');
    if (!at) { unplaced.push(c); continue; }
    byEntry.set(at, [...(byEntry.get(at) ?? []), c]);
  }
  return { byEntry, unplaced };
}

/** A detail as a small SVG for the catalogue: its drawing placed at its scale on a page of its size. */
export function detailPreviewSvg(d: DrawingInput): string {
  const s = d.paper ? 1 : d.scale ?? 1, m = 3;
  const ps = place(d.primitives, s, { x: m, y: m }, d.origin);
  const b = modelBounds(ps, 1);
  return sheetToSvg(Math.max(b.x1, d.paper ? d.width : d.width / s) + m, Math.max(b.y1, d.paper ? d.height : d.height / s) + m, ps);
}
