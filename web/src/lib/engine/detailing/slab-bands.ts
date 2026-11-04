/**
 * A slab band's geometry in plan: its outline (a free polygon or its rectangle), the direction of
 * its bars at any angle, the bars it holds, and the share of its area per metre each axis reads;
 * packages of equal bands; moving a band and its text; and the average of what the slab asks
 * along a line or over a band, to choose a band by its stretch and not by a peak.
 *
 * Pure: no store, no runes.
 */
import type { SlabBand, SlabPanelReinforcement } from '../../design-contract/reinforcement';
import { elementNeeds, type PanelInput } from './slab-panel';

type P = { x: number; y: number };
type Key = 'topX' | 'topY' | 'bottomX' | 'bottomY';
const EPS = 1e-9;

/** The bars' direction, degrees from x. */
export const bandAngle = (b: SlabBand): number => b.angle ?? (b.dir === 'x' ? 0 : 90);

/** The band's outline in plan. */
export function bandOutline(b: SlabBand): P[] {
  return b.outline?.length ? b.outline : [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
}

export function insidePolygon(poly: readonly P[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, c = poly[j]!;
    // On an edge counts as inside.
    const cross = (c.x - a.x) * (y - a.y) - (c.y - a.y) * (x - a.x);
    if (Math.abs(cross) < 1e-9 && x >= Math.min(a.x, c.x) - EPS && x <= Math.max(a.x, c.x) + EPS && y >= Math.min(a.y, c.y) - EPS && y <= Math.max(a.y, c.y) + EPS) return true;
    if ((a.y > y) !== (c.y > y) && x < ((c.x - a.x) * (y - a.y)) / (c.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export const bandContains = (b: SlabBand, x: number, y: number): boolean => insidePolygon(bandOutline(b), x, y);

/** The share of the band's area per metre an axis reads: cos² of the angle in x, sin² in y. */
export function bandShare(b: SlabBand, dir: 'x' | 'y'): number {
  const t = (bandAngle(b) * Math.PI) / 180;
  const v = dir === 'x' ? Math.cos(t) ** 2 : Math.sin(t) ** 2;
  return v < 1e-9 ? 0 : v;
}

/**
 * The bars of a band as the detailing lays them: one every spacing across its width, the first
 * half a spacing in (`generateBandBars`), each the chord of the outline along the bars.
 */
export function bandChords(b: SlabBand): Array<[P, P]> {
  const t = (bandAngle(b) * Math.PI) / 180, u = { x: Math.cos(t), y: Math.sin(t) }, v = { x: -u.y, y: u.x };
  const poly = bandOutline(b);
  const pu = poly.map((p) => p.x * u.x + p.y * u.y), pv = poly.map((p) => p.x * v.x + p.y * v.y);
  const v0 = Math.min(...pv), v1 = Math.max(...pv);
  // Bars set per rib lie on the ribs the band covers (one at least, a rib strip at a slab edge
  // being half a spacing wide), so many to each; other bands at their spacing from one side.
  const ribs = b.perRib ? Math.max(1, Math.round((v1 - v0) / (b.spacing * b.perRib))) : 0;
  const lines = b.perRib
    ? Array.from({ length: ribs }, (_, j) => v0 + ((j + 0.5) * (v1 - v0)) / ribs).flatMap((v) => Array<number>(b.perRib!).fill(v))
    : Array.from({ length: Math.max(1, Math.floor((v1 - v0) / b.spacing + 1e-9)) }, (_, i) => v0 + (i + 0.5) * b.spacing);
  const out: Array<[P, P]> = [];
  for (const vm of lines) {
    const hits: number[] = [];
    for (let k = 0; k < poly.length; k++) {
      const j = (k + 1) % poly.length, a = pv[k]!, c = pv[j]!;
      if ((a - vm) * (c - vm) > 0 || Math.abs(c - a) < EPS) continue;
      hits.push(pu[k]! + ((vm - a) / (c - a)) * (pu[j]! - pu[k]!));
    }
    if (hits.length < 2) continue;
    const u0 = Math.min(...hits), u1 = Math.max(...hits);
    if (u1 - u0 < 1e-6) continue;
    out.push([{ x: u0 * u.x + vm * v.x, y: u0 * u.y + vm * v.y }, { x: u1 * u.x + vm * v.x, y: u1 * u.y + vm * v.y }]);
  }
  return out;
}

/** The bars of a band: how many, the length of the longest, and where the bar through the middle and the distribution line lie. */
export function bandBars(b: SlabBand): { count: number; length: number; bar: [P, P]; spread: [P, P]; hooks: number } {
  const t = (bandAngle(b) * Math.PI) / 180, u = { x: Math.cos(t), y: Math.sin(t) }, v = { x: -u.y, y: u.x };
  const poly = bandOutline(b);
  const pu = poly.map((p) => p.x * u.x + p.y * u.y), pv = poly.map((p) => p.x * v.x + p.y * v.y);
  const v0 = Math.min(...pv), v1 = Math.max(...pv), vm = (v0 + v1) / 2;
  // The chord of the outline along the bar through the middle.
  const hits: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length, a = pv[i]!, c = pv[j]!;
    if ((a - vm) * (c - vm) > 0 || Math.abs(c - a) < EPS) continue;
    const s = (vm - a) / (c - a);
    hits.push(pu[i]! + s * (pu[j]! - pu[i]!));
  }
  const u0 = hits.length ? Math.min(...hits) : Math.min(...pu), u1 = hits.length ? Math.max(...hits) : Math.max(...pu);
  const at = (uu: number, vv: number): P => ({ x: uu * u.x + vv * v.x, y: uu * u.y + vv * v.y });
  const um = (u0 + u1) / 2;
  const hooks = (b.hookStart ? 1 : 0) + (b.hookEnd ? 1 : 0);
  const chords = bandChords(b);
  return {
    count: chords.length,
    // A 90° hook adds 12 db past the bend (§25.3.1).
    length: Math.max(u1 - u0, ...chords.map(([a, c]) => Math.hypot(c.x - a.x, c.y - a.y))) + hooks * 12 * (b.diameter / 1000),
    bar: [at(u0, vm), at(u1, vm)],
    spread: [at(um, v0), at(um, v1)],
    hooks,
  };
}

/** Move a band (its outline, rectangle and text) by dx, dy in plan. */
export function moveBand(r: SlabPanelReinforcement, id: string, dx: number, dy: number): SlabPanelReinforcement {
  return { ...r, bands: r.bands.map((b) => (b.id !== id ? b : {
    ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy,
    ...(b.outline ? { outline: b.outline.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {}),
    ...(b.label ? { label: { x: b.label.x + dx, y: b.label.y + dy } } : {}),
  })) };
}

/** Put a band's text at a point of the plan. */
export function moveBandLabel(r: SlabPanelReinforcement, id: string, at: P): SlabPanelReinforcement {
  return { ...r, bands: r.bands.map((b) => (b.id === id ? { ...b, label: { ...at } } : b)) };
}

/** Whether bands can be one package: same face, direction, diameter, spacing and ends. */
export function samePackage(a: SlabBand, b: SlabBand): boolean {
  return a.face === b.face && Math.abs(bandAngle(a) - bandAngle(b)) < 1e-6 && a.diameter === b.diameter && Math.abs(a.spacing - b.spacing) < 1e-9 && !!a.hookStart === !!b.hookStart && !!a.hookEnd === !!b.hookEnd;
}

/** Group bands into one package under one mark; null when they differ (said by the caller). */
export function groupBands(r: SlabPanelReinforcement, ids: readonly string[], group: string): SlabPanelReinforcement | null {
  const sel = r.bands.filter((b) => ids.includes(b.id));
  if (sel.length < 2 || !sel.every((b) => samePackage(sel[0]!, b))) return null;
  return { ...r, bands: r.bands.map((b) => (ids.includes(b.id) ? { ...b, group } : b)) };
}

/** Undo a package: its bands are drawn and marked one by one again. */
export function ungroupBands(r: SlabPanelReinforcement, group: string): SlabPanelReinforcement {
  return { ...r, bands: r.bands.map((b) => { if (b.group !== group) return b; const { group: _g, ...rest } = b; return rest; }) };
}

export interface NeedStats { min: number; max: number; avg: number; samples: number }

const stats = (vs: number[]): NeedStats | null => (vs.length ? { min: Math.min(...vs), max: Math.max(...vs), avg: vs.reduce((s, v) => s + v, 0) / vs.length, samples: vs.length } : null);
const elementAt = (p: PanelInput, x: number, y: number) => p.elements.find((e) => Math.abs(x - e.cx) <= e.sx / 2 + EPS && Math.abs(y - e.cy) <= e.sy / 2 + EPS);

/** What the slab asks along a segment, cm²/m: the smallest, the largest and the mean of the elements it crosses. */
export function lineAverage(p: PanelInput, key: Key, a: P, b: P, n = 60): NeedStats | null {
  const vs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, e = elementAt(p, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (e) vs.push(elementNeeds(e, p.cover, p.fy)[key] * 1e4);
  }
  return stats(vs);
}

/** What the slab asks over a band, cm²/m: over the elements whose centroid falls inside it, weighted by their area. */
export function bandAverage(p: PanelInput, key: Key, b: SlabBand): NeedStats | null {
  const els = p.elements.filter((e) => bandContains(b, e.cx, e.cy));
  if (!els.length) return null;
  const vs = els.map((e) => elementNeeds(e, p.cover, p.fy)[key] * 1e4);
  const w = els.map((e) => e.sx * e.sy), W = w.reduce((s, x) => s + x, 0);
  return { min: Math.min(...vs), max: Math.max(...vs), avg: vs.reduce((s, v, i) => s + v * w[i]!, 0) / W, samples: vs.length };
}
