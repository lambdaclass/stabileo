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
import { flexuralSteel, type RibbedGeometry } from '../design/slabs/ribbed';

export interface PanelElement {
  id: number;
  /** Centroid and plan size, m. */
  cx: number; cy: number; sx: number; sy: number;
  thickness: number;
  /** One moment field per combination, kN·m/m (sagging positive). */
  sets: ReadonlyArray<{ mx: number; my: number; mxy: number }>;
  /** Plan area, m². Given, a row's mean weighs each element by it (an unstructured mesh). */
  area?: number;
}

/**
 * A ribbed (waffle) panel: the analysis runs on the equivalent solid thickness, the steel sits in
 * the ribs. An element thinner than the ribs' depth is rib zone, designed per rib; one as deep or
 * deeper is solid (a drop or a solid band), designed as a slab of its own thickness.
 */
export interface PanelRibs { geometry: RibbedGeometry; fc: number }

export interface PanelInput {
  panelId: string;
  x0: number; x1: number; y0: number; y1: number;
  thickness: number;
  cover: number;
  fy: number;
  elements: readonly PanelElement[];
  /**
   * Rows along a strip gather the elements whose centroids fall in one step, m. Absent, a row is
   * the elements whose centroids agree to the centimetre (a structured mesh); an unstructured one
   * has no two alike, so the panel states its element size.
   */
  rowStep?: number;
  ribs?: PanelRibs;
}

type Key = 'topX' | 'topY' | 'bottomX' | 'bottomY';
const KEYS: Key[] = ['bottomX', 'bottomY', 'topX', 'topY'];
const faceOf = (k: Key) => (k.startsWith('top') ? 'top' : 'bottom') as 'top' | 'bottom';
const dirOf = (k: Key) => (k.endsWith('X') ? 'x' : 'y') as 'x' | 'y';
const area = (dMm: number) => Math.PI * (dMm / 2000) ** 2;

/** What an element needs, m²/m, per face and direction: the worst Wood–Armer of its combinations. */
export function elementNeeds(e: PanelElement, cover: number, fy: number, ribs?: PanelRibs): Record<Key, number> {
  const out: Record<Key, number> = { bottomX: 0, bottomY: 0, topX: 0, topY: 0 };
  const rib = ribs && isRibZone(e, ribs) ? ribs : undefined;
  const d = (rib ? rib.geometry.h : e.thickness) - cover - 0.006;
  for (const s of e.sets) {
    const w = woodArmer(s.mx, s.my, s.mxy);
    for (const k of KEYS) out[k] = Math.max(out[k], rib ? ribNeed(w[k], k, rib, d, fy) : (w[k] * 1000) / (0.9 * 0.9 * d * fy * 1e6));
  }
  return out;
}

/** Whether an element is rib zone: thinner than the ribs are deep. */
export const isRibZone = (e: Pick<PanelElement, 'thickness'>, ribs: PanelRibs): boolean => e.thickness < ribs.geometry.h - 1e-3;

/** Spacing of the ribs that carry bars in a direction, m. */
export const ribSpacing = (g: RibbedGeometry, dir: 'x' | 'y'): number => (dir === 'x' ? g.spacingX : g.spacingY ?? g.spacingX);

/**
 * One rib's need, spread per metre: a T with its share of topping in sagging, its own web in
 * hogging (`flexuralSteel`, φ = 0,9). A block that does not fit the rib needs more than any bar
 * gives, and says so as an infinite need.
 */
function ribNeed(m: number, k: Key, ribs: PanelRibs, d: number, fy: number): number {
  if (m <= 1e-9) return 0;
  const s = ribSpacing(ribs.geometry, dirOf(k));
  const b = faceOf(k) === 'bottom' ? s : ribs.geometry.ribBottom;
  const as = flexuralSteel(m * s, b, d, ribs.fc, fy);
  return as === null ? Number.POSITIVE_INFINITY : as / s;
}

export interface Strip { dir: 'x' | 'y'; kind: 'edge' | 'middle' | 'rib'; lo: number; hi: number; elements: number[] }

/**
 * The strips of a panel for a bar direction: edge strips L/4 wide at both sides, the middle between.
 *
 * A ribbed panel is cut by its ribs instead: one strip per rib line, a rib spacing wide, so each rib
 * carries the moment over it (a waffle floor's panel may span many bays, where a quarter of the
 * floor would average a column's peak away). An element joins every rib strip its plan box
 * reaches, so no rib goes without the elements over it when the mesh is coarser than the ribs.
 */
export function panelStrips(p: PanelInput, dir: 'x' | 'y'): Strip[] {
  const [a, b] = dir === 'x' ? [p.y0, p.y1] : [p.x0, p.x1];
  if (p.ribs) {
    const s = ribSpacing(p.ribs.geometry, dir), out: Strip[] = [];
    for (let k = 0; a + (k - 0.5) * s < b - 1e-9; k++) {
      const lo = Math.max(a, a + (k - 0.5) * s), hi = Math.min(b, a + (k + 0.5) * s);
      const elements = p.elements.filter((e) => {
        const c = dir === 'x' ? e.cy : e.cx, h = (dir === 'x' ? e.sy : e.sx) / 2;
        return c - h < hi - 1e-9 && c + h > lo + 1e-9;
      }).map((e) => e.id);
      if (elements.length) out.push({ dir, kind: 'rib', lo, hi, elements });
    }
    return out;
  }
  const w = Math.min(p.x1 - p.x0, p.y1 - p.y0) / 4;
  const bounds: Array<[number, number, 'edge' | 'middle']> = b - a > 2 * w + 1e-9
    ? [[a, a + w, 'edge'], [a + w, b - w, 'middle'], [b - w, b, 'edge']]
    : [[a, (a + b) / 2, 'edge'], [(a + b) / 2, b, 'edge']];
  return bounds.map(([lo, hi, kind]) => ({
    dir, kind, lo, hi,
    elements: p.elements.filter((e) => { const c = dir === 'x' ? e.cy : e.cx; return c >= lo - 1e-9 && c < hi - 1e-9 || (hi === b && Math.abs(c - b) < 1e-9); }).map((e) => e.id),
  }));
}

/** A strip's rows along its span: elements grouped by their centroid along the bars (`rowStep`). */
function rows(strip: Strip, els: ReadonlyMap<number, PanelElement>, step?: number): Array<{ at: number; half: number; ids: number[] }> {
  const by = new Map<number, number[]>();
  for (const id of strip.elements) {
    const e = els.get(id)!;
    const c = strip.dir === 'x' ? e.cx : e.cy;
    const at = step ? Math.round(c / step) * step : Math.round(c * 100) / 100;
    by.set(at, [...(by.get(at) ?? []), id]);
  }
  return [...by].sort((p, q) => p[0] - q[0]).map(([at, ids]) => ({ at, half: Math.max(...ids.map((id) => (strip.dir === 'x' ? els.get(id)!.sx : els.get(id)!.sy) / 2), (step ?? 0) / 2), ids }));
}

/**
 * Where a strip reads what an element is given: at the element's centroid; on a rib strip, which
 * an element may only reach the edge of, on the rib's line at the element's place along it.
 */
function probe(strip: Strip, e: PanelElement): [number, number] {
  if (strip.kind !== 'rib') return [e.cx, e.cy];
  const mid = (strip.lo + strip.hi) / 2;
  return strip.dir === 'x' ? [e.cx, mid] : [mid, e.cy];
}

/** A row's mean of a per-element value, weighed by area when the elements give it. */
function rowMean(ids: readonly number[], els: ReadonlyMap<number, PanelElement>, f: (e: PanelElement) => number): number {
  let sw = 0, sv = 0;
  for (const id of ids) { const e = els.get(id)!; const w = e.area ?? 1; sw += w; sv += w * f(e); }
  return sw > 0 ? sv / sw : 0;
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

export interface PanelStripCheck { dir: 'x' | 'y'; face: 'top' | 'bottom'; kind: Strip['kind']; lo: number; hi: number; need: number; given: number; utilization: number; at: number }

/** Every strip, face and row against what is given there. */
export function checkPanel(p: PanelInput, r: SlabPanelReinforcement): { strips: PanelStripCheck[]; worst: number; minimumOk: boolean; spacing: PanelSpacingCheck[]; spacingOk: boolean } {
  const els = new Map(p.elements.map((e) => [e.id, e]));
  const need = new Map(p.elements.map((e) => [e.id, elementNeeds(e, p.cover, p.fy, p.ribs)]));
  const out: PanelStripCheck[] = [];
  for (const dir of ['x', 'y'] as const) for (const strip of panelStrips(p, dir)) for (const face of ['bottom', 'top'] as const) {
    const k = `${face}${dir.toUpperCase()}` as Key;
    let worst: PanelStripCheck | null = null;
    for (const row of rows(strip, els, p.rowStep)) {
      const n = rowMean(row.ids, els, (e) => need.get(e.id)![k]);
      const g = rowMean(row.ids, els, (e) => providedAt(r, k, ...probe(strip, e)));
      const u = n > 1e-12 ? (g > 1e-12 ? n / g : Number.POSITIVE_INFINITY) : 0;
      if (!worst || u > worst.utilization) worst = { dir, face, kind: strip.kind, lo: strip.lo, hi: strip.hi, need: n, given: g, utilization: u, at: row.at };
    }
    if (worst) out.push(worst);
  }
  const asMin = SHRINKAGE_RATIO * p.thickness;
  // A ribbed panel's minimum is the rib's (9.6.1.2), per rib; a solid one's the mat's (24.4.3.2).
  const minimumOk = (['bottomX', 'bottomY'] as Key[]).every((k) => {
    const b = r.base[k];
    if (!b) return false;
    if (!p.ribs) return area(b.diameter) / b.spacing >= asMin - 1e-12;
    const s = ribSpacing(p.ribs.geometry, dirOf(k));
    return (area(b.diameter) * s) / b.spacing >= ribMinimum(p, p.ribs) - 1e-12;
  });
  // §8.7.2.2: every base mat; every band on a face and direction with no base mat there (over a
  // base the band only adds bars between the base's, so the base's spacing is the one that holds).
  const limit = panelMaxSpacing(p.thickness);
  const sp = (source: 'base' | 'band', face: 'top' | 'bottom', dir: 'x' | 'y', spacing: number, id?: string): PanelSpacingCheck =>
    ({ source, ...(id ? { id } : {}), face, dir, spacing, limit, ratio: spacing / limit, ok: spacing <= limit + 1e-9 });
  // Bars set per rib sit where the ribs are: their spacing is the ribs' (8.8.1.4, `ribbedRules`).
  const spacing: PanelSpacingCheck[] = [
    ...KEYS.flatMap((k) => (r.base[k] && !r.base[k]!.perRib ? [sp('base', faceOf(k), dirOf(k), r.base[k]!.spacing)] : [])),
    ...r.bands.filter((b) => !b.perRib && !r.base[`${b.face}${b.dir.toUpperCase()}` as Key]).map((b) => sp('band', b.face, b.dir, b.spacing, b.id)),
  ];
  return { strips: out, worst: Math.max(0, ...out.map((c) => c.utilization)), minimumOk, spacing, spacingOk: spacing.every((c) => c.ok) };
}

/**
 * The panel's reinforcement as the design proposes it: the base (the minimum, bottom, both ways,
 * or the project's predetermined base), then a band over each strip whose need passes it.
 *
 * A ribbed panel (`p.ribs`) gives its bars per rib: the base is the rib minimum of 9.6.1.2 at the
 * bottom and the top of every rib, both ways; each drop and solid band gets the solid minimum at its
 * bottom; a band adds whole bars per rib (`ribBars`).
 */
export function proposePanel(p: PanelInput, opts: { base?: SlabPanelReinforcement['base']; sMax: number }): SlabPanelReinforcement {
  const asMin = SHRINKAGE_RATIO * p.thickness;
  const ribs = p.ribs;
  const base: SlabPanelReinforcement['base'] = opts.base ?? (ribs ? ribBase(p, ribs) : { bottomX: barsFor(asMin, opts.sMax), bottomY: barsFor(asMin, opts.sMax) });
  const r: SlabPanelReinforcement = { base, bands: ribs ? solidBands(p, ribs, base) : [] };
  // What the strips are measured against: the base and the solid zones' bands, before any strip band.
  const before: SlabPanelReinforcement = { base, bands: [...r.bands] };
  const els = new Map(p.elements.map((e) => [e.id, e]));
  const need = new Map(p.elements.map((e) => [e.id, elementNeeds(e, p.cover, p.fy, ribs)]));
  let n = r.bands.length;
  for (const dir of ['x', 'y'] as const) for (const strip of panelStrips(p, dir)) for (const face of ['bottom', 'top'] as const) {
    const k = `${face}${dir.toUpperCase()}` as Key;
    const all = rows(strip, els, p.rowStep);
    const short = all.map((row) => ({ ...row, n: rowMean(row.ids, els, (e) => need.get(e.id)![k]), g: rowMean(row.ids, els, (e) => providedAt(before, k, ...probe(strip, e))) })).filter((row) => row.n > row.g + 1e-12);
    if (!short.length) continue;
    // One band per run of consecutive rows that need more, so a top band at each support.
    const runs: Array<typeof short> = [];
    for (const row of short) {
      const last = runs[runs.length - 1];
      const prevIdx = last ? all.findIndex((x) => x.at === last[last.length - 1]!.at) : -2;
      const idx = all.findIndex((x) => x.at === row.at);
      if (last && idx === prevIdx + 1) last.push(row); else runs.push([row]);
    }
    for (const run of runs) {
      const extra = Math.max(...run.map((row) => row.n - row.g));
      const bars = ribs ? ribBars(extra, ribSpacing(ribs.geometry, dir)) : barsFor(extra, opts.sMax);
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

/**
 * Whole bars per rib for an area per metre: one or two bars (two is what a rib's width takes with
 * its cover and clear spacing), the least steel that gives it, the fewer bars on a tie. Spacing is
 * the rib spacing over the bars per rib, so a strip's area per metre reads as a solid slab's. Past
 * two Ø25 the bars are two Ø25 and the check reports the shortfall.
 */
export function ribBars(asPerM: number, spacing: number): { diameter: number; spacing: number; perRib: number } {
  const want = asPerM * spacing;
  let best: { diameter: number; perRib: number; as: number } | null = null;
  for (const n of [1, 2]) for (const d of [8, 10, 12, 16, 20, 25]) {
    const as = n * area(d);
    if (as >= want - 1e-12 && (!best || as < best.as - 1e-12)) best = { diameter: d, perRib: n, as };
  }
  const pick = best ?? { diameter: 25, perRib: 2 };
  return { diameter: pick.diameter, spacing: +(spacing / pick.perRib).toFixed(4), perRib: pick.perRib };
}

/** One rib's minimum steel, 9.6.1.2, m². */
export function ribMinimum(p: Pick<PanelInput, 'cover' | 'fy'>, ribs: PanelRibs): number {
  const g = ribs.geometry, d = g.h - p.cover - 0.006;
  return Math.max((0.25 * Math.sqrt(ribs.fc)) / p.fy, 1.4 / p.fy) * g.ribBottom * d;
}

/**
 * The rib minimum at the bottom and at the top of every rib both ways. The top base runs the ribs'
 * length so the bands over the supports are only what the hogging needs past it, rather than a
 * band along every rib wherever a small hogging moment reaches.
 */
function ribBase(p: PanelInput, ribs: PanelRibs): SlabPanelReinforcement['base'] {
  const asRib = ribMinimum(p, ribs);
  const at = (dir: 'x' | 'y') => { const s = ribSpacing(ribs.geometry, dir); return ribBars(asRib / s, s); };
  return { bottomX: at('x'), bottomY: at('y'), topX: at('x'), topY: at('y') };
}

/**
 * The solid zones of a ribbed panel (drops and solid bands: elements as deep as the ribs or
 * deeper), each as the plan box of its touching elements, with the solid minimum of 24.4.3.2 at
 * its bottom both ways over what the rib base already gives.
 */
function solidBands(p: PanelInput, ribs: PanelRibs, base: SlabPanelReinforcement['base']): SlabBand[] {
  const solid = p.elements.filter((e) => !isRibZone(e, ribs));
  const box = (e: PanelElement) => ({ x0: e.cx - e.sx / 2, x1: e.cx + e.sx / 2, y0: e.cy - e.sy / 2, y1: e.cy + e.sy / 2 });
  const zones: Array<{ x0: number; x1: number; y0: number; y1: number; t: number }> = [];
  for (const e of solid) {
    const b = { ...box(e), t: e.thickness };
    const touching = zones.filter((z) => z.x0 <= b.x1 + 1e-3 && z.x1 >= b.x0 - 1e-3 && z.y0 <= b.y1 + 1e-3 && z.y1 >= b.y0 - 1e-3);
    const merged = touching.reduce((m, z) => ({ x0: Math.min(m.x0, z.x0), x1: Math.max(m.x1, z.x1), y0: Math.min(m.y0, z.y0), y1: Math.max(m.y1, z.y1), t: Math.min(m.t, z.t) }), b);
    for (const z of touching) zones.splice(zones.indexOf(z), 1);
    zones.push(merged);
  }
  const out: SlabBand[] = [];
  zones.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).forEach((z, i) => {
    for (const dir of ['x', 'y'] as const) {
      const k = `bottom${dir.toUpperCase()}` as Key, b = base[k];
      const extra = SHRINKAGE_RATIO * z.t - (b ? area(b.diameter) / b.spacing : 0);
      if (extra <= 1e-12) continue;
      out.push({ id: `${p.panelId}-D${i + 1}${dir}`, face: 'bottom', dir, x0: z.x0, x1: z.x1, y0: z.y0, y1: z.y1, ...ribBars(extra, ribSpacing(ribs.geometry, dir)) });
    }
  });
  return out;
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
