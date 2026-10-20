/**
 * A slab panel as one entity, designed by strips.
 *
 * Each finite element of the panel says what it needs per metre, face and bar direction: the
 * Wood–Armer moments of every combination (`woodArmer`), the worst kept, As = Mu/(φ·0,9·d·fy).
 * For each bar direction the panel is cut across into strips, an edge strip a quarter of the
 * shorter span wide at each side and the middle strip between, and along it into rows of
 * elements; a strip's need at a row is the mean over the strip's width there (the steel spreads
 * across a strip), and its need is the worst row. The panel is reinforced with a base mat (the
 * minimum §24.4.3.2 asks for, at the bottom, unless the project gives another) and bands of extra
 * bars over each strip where its need passes the base, from the first row that needs them to the
 * last and a development length (40·db) past each, clamped to the panel. The check reads every
 * strip and row against the base plus the bands that cover its elements, and the spacing of every
 * base mat and band against §8.7.2.2 (`panelMaxSpacing`).
 */
import type { SlabBand, SlabPanelReinforcement } from '../../design-contract/reinforcement';
import { woodArmer, SHRINKAGE_RATIO } from './slab-design';
import { bandContains, bandShare } from './slab-bands';

export interface PanelElement {
  id: number;
  /** Centroid and plan size, m. */
  cx: number; cy: number; sx: number; sy: number;
  thickness: number;
  /** One moment field per combination, kN·m/m (sagging positive). */
  sets: ReadonlyArray<{ mx: number; my: number; mxy: number }>;
}

export interface PanelInput {
  panelId: string;
  x0: number; x1: number; y0: number; y1: number;
  thickness: number;
  cover: number;
  fy: number;
  elements: readonly PanelElement[];
}

type Key = 'topX' | 'topY' | 'bottomX' | 'bottomY';
const KEYS: Key[] = ['bottomX', 'bottomY', 'topX', 'topY'];
const faceOf = (k: Key) => (k.startsWith('top') ? 'top' : 'bottom') as 'top' | 'bottom';
const dirOf = (k: Key) => (k.endsWith('X') ? 'x' : 'y') as 'x' | 'y';
const area = (dMm: number) => Math.PI * (dMm / 2000) ** 2;

/** What an element needs, m²/m, per face and direction: the worst Wood–Armer of its combinations. */
export function elementNeeds(e: PanelElement, cover: number, fy: number): Record<Key, number> {
  const d = e.thickness - cover - 0.006;
  const out: Record<Key, number> = { bottomX: 0, bottomY: 0, topX: 0, topY: 0 };
  for (const s of e.sets) {
    const w = woodArmer(s.mx, s.my, s.mxy);
    for (const k of KEYS) out[k] = Math.max(out[k], (w[k] * 1000) / (0.9 * 0.9 * d * fy * 1e6));
  }
  return out;
}

export interface Strip { dir: 'x' | 'y'; kind: 'edge' | 'middle'; lo: number; hi: number; elements: number[] }

/** The strips of a panel for a bar direction: edge strips L/4 wide at both sides, the middle between. */
export function panelStrips(p: PanelInput, dir: 'x' | 'y'): Strip[] {
  const [a, b] = dir === 'x' ? [p.y0, p.y1] : [p.x0, p.x1];
  const w = Math.min(p.x1 - p.x0, p.y1 - p.y0) / 4;
  const bounds: Array<[number, number, 'edge' | 'middle']> = b - a > 2 * w + 1e-9
    ? [[a, a + w, 'edge'], [a + w, b - w, 'middle'], [b - w, b, 'edge']]
    : [[a, (a + b) / 2, 'edge'], [(a + b) / 2, b, 'edge']];
  return bounds.map(([lo, hi, kind]) => ({
    dir, kind, lo, hi,
    elements: p.elements.filter((e) => { const c = dir === 'x' ? e.cy : e.cx; return c >= lo - 1e-9 && c < hi - 1e-9 || (hi === b && Math.abs(c - b) < 1e-9); }).map((e) => e.id),
  }));
}

/** A strip's rows along its span: elements grouped by their centroid along the bars. */
function rows(strip: Strip, els: ReadonlyMap<number, PanelElement>): Array<{ at: number; half: number; ids: number[] }> {
  const by = new Map<number, number[]>();
  for (const id of strip.elements) {
    const e = els.get(id)!;
    const at = Math.round((strip.dir === 'x' ? e.cx : e.cy) * 100) / 100;
    by.set(at, [...(by.get(at) ?? []), id]);
  }
  return [...by].sort((p, q) => p[0] - q[0]).map(([at, ids]) => ({ at, half: Math.max(...ids.map((id) => (strip.dir === 'x' ? els.get(id)!.sx : els.get(id)!.sy) / 2)), ids }));
}

/** As per metre given at a plan point, m²/m, for a face and direction. */
export function providedAt(r: SlabPanelReinforcement, k: Key, x: number, y: number): number {
  const b = r.base[k];
  let as = b ? area(b.diameter) / b.spacing : 0;
  // A band counts in the direction its bars run, by the share its angle gives (cos² in x, sin² in y),
  // over its outline (`slab-bands.ts`).
  for (const band of r.bands) {
    if (band.face !== faceOf(k)) continue;
    const share = bandShare(band, dirOf(k));
    if (share > 0 && bandContains(band, x, y)) as += (share * area(band.diameter)) / band.spacing;
  }
  return as;
}

/** Bars for an area per metre: the smallest diameter at a 25 mm-module spacing from 75 to 300 mm. */
export function barsFor(as: number, sMax: number): { diameter: number; spacing: number } {
  for (const d of [8, 10, 12, 16, 20, 25]) {
    const s = Math.min(sMax, Math.floor((area(d) / Math.max(as, 1e-12)) / 0.025) * 0.025);
    if (s >= 0.075) return { diameter: d, spacing: +s.toFixed(4) };
  }
  return { diameter: 25, spacing: 0.075 };
}

/**
 * CIRSOC 201-2025 §8.7.2.2, solid non-prestressed slabs: the spacing of the deformed longitudinal
 * bars is at most the lesser of 2h and 300 mm at the critical sections, and of 3h and 300 mm
 * elsewhere. The base mat runs through the critical sections and the bands sit where the moment
 * peaks, so both are held to the critical-section limit, min(2h, 300 mm). (The shrinkage and
 * temperature steel's min(5h, 450 mm), §24.4.3.3, is a different rule.)
 */
export const SLAB_SPACING_CAP = 0.3;
export const panelMaxSpacing = (thickness: number): number => Math.min(2 * thickness, SLAB_SPACING_CAP);

/** One base mat or band against §8.7.2.2. */
export interface PanelSpacingCheck {
  source: 'base' | 'band';
  /** The band's id, for a band. */
  id?: string;
  face: 'top' | 'bottom'; dir: 'x' | 'y';
  spacing: number; limit: number;
  /** spacing / limit. */
  ratio: number;
  ok: boolean;
}

export interface PanelStripCheck { dir: 'x' | 'y'; face: 'top' | 'bottom'; kind: 'edge' | 'middle'; lo: number; hi: number; need: number; given: number; utilization: number; at: number }

/** Every strip, face and row against what is given there. */
export function checkPanel(p: PanelInput, r: SlabPanelReinforcement): { strips: PanelStripCheck[]; worst: number; minimumOk: boolean; spacing: PanelSpacingCheck[]; spacingOk: boolean } {
  const els = new Map(p.elements.map((e) => [e.id, e]));
  const need = new Map(p.elements.map((e) => [e.id, elementNeeds(e, p.cover, p.fy)]));
  const out: PanelStripCheck[] = [];
  for (const dir of ['x', 'y'] as const) for (const strip of panelStrips(p, dir)) for (const face of ['bottom', 'top'] as const) {
    const k = `${face}${dir.toUpperCase()}` as Key;
    let worst: PanelStripCheck | null = null;
    for (const row of rows(strip, els)) {
      const n = row.ids.reduce((s, id) => s + need.get(id)![k], 0) / row.ids.length;
      const g = row.ids.reduce((s, id) => s + providedAt(r, k, els.get(id)!.cx, els.get(id)!.cy), 0) / row.ids.length;
      const u = n > 1e-12 ? (g > 1e-12 ? n / g : Number.POSITIVE_INFINITY) : 0;
      if (!worst || u > worst.utilization) worst = { dir, face, kind: strip.kind, lo: strip.lo, hi: strip.hi, need: n, given: g, utilization: u, at: row.at };
    }
    if (worst) out.push(worst);
  }
  const asMin = SHRINKAGE_RATIO * p.thickness;
  const minimumOk = (['bottomX', 'bottomY'] as Key[]).every((k) => {
    const b = r.base[k];
    return !!b && area(b.diameter) / b.spacing >= asMin - 1e-12;
  });
  // §8.7.2.2: every base mat; every band on a face and direction with no base mat there (over a
  // base the band only adds bars between the base's, so the base's spacing is the one that holds).
  const limit = panelMaxSpacing(p.thickness);
  const sp = (source: 'base' | 'band', face: 'top' | 'bottom', dir: 'x' | 'y', spacing: number, id?: string): PanelSpacingCheck =>
    ({ source, ...(id ? { id } : {}), face, dir, spacing, limit, ratio: spacing / limit, ok: spacing <= limit + 1e-9 });
  const spacing: PanelSpacingCheck[] = [
    ...KEYS.flatMap((k) => (r.base[k] ? [sp('base', faceOf(k), dirOf(k), r.base[k]!.spacing)] : [])),
    ...r.bands.filter((b) => !r.base[`${b.face}${b.dir.toUpperCase()}` as Key]).map((b) => sp('band', b.face, b.dir, b.spacing, b.id)),
  ];
  return { strips: out, worst: Math.max(0, ...out.map((c) => c.utilization)), minimumOk, spacing, spacingOk: spacing.every((c) => c.ok) };
}

/**
 * The panel's reinforcement as the design proposes it: the base (the minimum, bottom, both ways,
 * or the project's predetermined base), then a band over each strip whose need passes it.
 */
export function proposePanel(p: PanelInput, opts: { base?: SlabPanelReinforcement['base']; sMax: number }): SlabPanelReinforcement {
  const asMin = SHRINKAGE_RATIO * p.thickness;
  const base: SlabPanelReinforcement['base'] = opts.base ?? { bottomX: barsFor(asMin, opts.sMax), bottomY: barsFor(asMin, opts.sMax) };
  const r: SlabPanelReinforcement = { base, bands: [] };
  const els = new Map(p.elements.map((e) => [e.id, e]));
  const need = new Map(p.elements.map((e) => [e.id, elementNeeds(e, p.cover, p.fy)]));
  let n = 0;
  for (const dir of ['x', 'y'] as const) for (const strip of panelStrips(p, dir)) for (const face of ['bottom', 'top'] as const) {
    const k = `${face}${dir.toUpperCase()}` as Key;
    const b = base[k] ? area(base[k]!.diameter) / base[k]!.spacing : 0;
    const short = rows(strip, els).map((row) => ({ ...row, n: row.ids.reduce((s, id) => s + need.get(id)![k], 0) / row.ids.length })).filter((row) => row.n > b + 1e-12);
    if (!short.length) continue;
    // One band per run of consecutive rows that need more, so a top band at each support.
    const all = rows(strip, els);
    const runs: Array<typeof short> = [];
    for (const row of short) {
      const last = runs[runs.length - 1];
      const prevIdx = last ? all.findIndex((x) => x.at === last[last.length - 1]!.at) : -2;
      const idx = all.findIndex((x) => x.at === row.at);
      if (last && idx === prevIdx + 1) last.push(row); else runs.push([row]);
    }
    for (const run of runs) {
      const extra = Math.max(...run.map((row) => row.n)) - b;
      const bars = barsFor(extra, opts.sMax);
      const ld = 40 * bars.diameter / 1000;
      const [a0, a1] = dir === 'x' ? [p.x0, p.x1] : [p.y0, p.y1];
      const from = Math.max(a0, run[0]!.at - run[0]!.half - ld), to = Math.min(a1, run[run.length - 1]!.at + run[run.length - 1]!.half + ld);
      const band: SlabBand = dir === 'x'
        ? { id: `${p.panelId}-B${++n}`, face, dir, x0: from, x1: to, y0: strip.lo, y1: strip.hi, ...bars }
        : { id: `${p.panelId}-B${++n}`, face, dir, x0: strip.lo, x1: strip.hi, y0: from, y1: to, ...bars };
      r.bands.push(band);
    }
  }
  return r;
}

/** Equalize the bands of a region (a plan rectangle): each takes the heaviest of its face and direction. */
export function equalizeBands(r: SlabPanelReinforcement, region: { x0: number; x1: number; y0: number; y1: number }): SlabPanelReinforcement {
  const inside = (b: SlabBand) => b.x0 < region.x1 && b.x1 > region.x0 && b.y0 < region.y1 && b.y1 > region.y0;
  const heaviest = new Map<string, SlabBand>();
  for (const b of r.bands.filter(inside)) {
    const k = `${b.face}${b.dir}`, h = heaviest.get(k);
    if (!h || area(b.diameter) / b.spacing > area(h.diameter) / h.spacing) heaviest.set(k, b);
  }
  return { ...r, bands: r.bands.map((b) => (inside(b) ? { ...b, diameter: heaviest.get(`${b.face}${b.dir}`)!.diameter, spacing: heaviest.get(`${b.face}${b.dir}`)!.spacing } : b)) };
}
