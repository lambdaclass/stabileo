/**
 * Where a level plan's package labels stand: each beside its own bar's longest leg, slid along it
 * and to either side until it clears the other labels, the leg lengths, the rods and the
 * distribution lines with their arrows. The workspace and the exported plan place them alike;
 * each passes its text size in plan metres.
 */
import type { PlanBarDrawing } from './slab-plan';

type Pt = [number, number];
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** A label's anchor: the middle of its baseline, the text running along x (`dir` x) or up along y (`dir` y, read from the right). */
export interface PlanLabelPlace { at: Pt; box: Box }

export interface PlanTextSize { char: number; height: number; gap: number; legChar?: number; legHeight?: number }

const ALONG = [0.5, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((i) => [0.5 - i * 0.05, 0.5 + i * 0.05])];
/** What a label crossing each thing costs: a label or a leg length, a rod, a distribution line's arrow, the dashed line itself. */
const COST = { box: 6, rod: 3, tip: 4, band: 1 };

const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Whether the segment p–q crosses the box (Liang–Barsky). */
export function segmentHitsBox(p: Pt, q: Pt, b: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [num, den] of [[p[0] - b.x0, -dx], [b.x1 - p[0], dx], [p[1] - b.y0, -dy], [b.y1 - p[1], dy]] as const) {
    if (Math.abs(den) < 1e-12) { if (num < 0) return false; continue; }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** The box a leg's length takes beside its leg, on the side away from the bar. */
export function legLabelBox(leg: PlanBarDrawing['legs'][number], text: string, s: PlanTextSize): { at: Pt; box: Box; anchor: 'start' | 'middle' | 'end' } {
  const w = text.length * (s.legChar ?? s.char), h = s.legHeight ?? s.height, g = s.gap;
  const [ox, oy] = leg.out;
  if (Math.abs(ox) >= Math.abs(oy)) {
    const x = leg.at[0] + Math.sign(ox) * g, y = leg.at[1] - h / 2;
    return { at: [x, y], box: ox > 0 ? { x0: x, y0: y, x1: x + w, y1: y + h } : { x0: x - w, y0: y, x1: x, y1: y + h }, anchor: ox > 0 ? 'start' : 'end' };
  }
  const y = oy > 0 ? leg.at[1] + g : leg.at[1] - g - h;
  return { at: [leg.at[0], y], box: { x0: leg.at[0] - w / 2, y0: y, x1: leg.at[0] + w / 2, y1: y + h }, anchor: 'middle' };
}

/** `fixed`: boxes the labels keep off as they keep off each other (the panels' names). */
export function placePlanLabels(bars: readonly PlanBarDrawing[], text: (b: PlanBarDrawing) => string, legText: (m: number) => string, s: PlanTextSize, fixed: readonly Box[] = []): Map<string, PlanLabelPlace> {
  const rods: Array<[Pt, Pt]> = [], bands: Array<[Pt, Pt]> = [];
  const boxes: Box[] = [...fixed], tips: Box[] = [];
  const tip = 1.2 * s.height;
  for (const b of bars) {
    for (let i = 1; i < b.pts.length; i++) rods.push([b.pts[i - 1]!, b.pts[i]!]);
    bands.push([b.band[0], b.band[1]]);
    for (const [x, y] of b.band) tips.push({ x0: x - tip, y0: y - tip, x1: x + tip, y1: y + tip });
    const main = mainLeg(b);
    b.legs.forEach((l, j) => { if (j !== main) boxes.push(legLabelBox(l, legText(l.length), s).box); });
  }
  const out = new Map<string, PlanLabelPlace>();
  for (const b of bars) {
    const main = mainLeg(b), a = b.pts[main]!, e = b.pts[main + 1]!;
    const w = text(b).length * s.char, h = s.height;
    const horizontal = b.dir === 'x';
    const [lo, hi] = horizontal ? [Math.min(a[0], e[0]), Math.max(a[0], e[0])] : [Math.min(a[1], e[1]), Math.max(a[1], e[1])];
    const fixed = horizontal ? a[1] : a[0];
    let best: { place: PlanLabelPlace; score: number } | null = null;
    for (const t of ALONG) {
      const u = Math.min(Math.max(lo + t * (hi - lo), lo + w / 2), hi - w / 2);
      const mid = hi - lo < w ? (lo + hi) / 2 : u;
      for (const side of [1, -1]) {
        const place: PlanLabelPlace = horizontal
          ? ((y) => ({ at: [mid, y] as Pt, box: { x0: mid - w / 2, y0: y, x1: mid + w / 2, y1: y + h } }))(side > 0 ? fixed + s.gap : fixed - s.gap - h)
          : ((x) => ({ at: [x, mid] as Pt, box: { x0: x - h, y0: mid - w / 2, x1: x, y1: mid + w / 2 } }))(side > 0 ? fixed - s.gap : fixed + s.gap + h);
        const score = COST.box * boxes.filter((q) => overlap(q, place.box)).length + COST.tip * tips.filter((q) => overlap(q, place.box)).length
          + COST.rod * rods.filter(([p, q]) => segmentHitsBox(p, q, place.box)).length + COST.band * bands.filter(([p, q]) => segmentHitsBox(p, q, place.box)).length;
        if (!best || score < best.score) best = { place, score };
        if (score === 0) break;
      }
      if (best?.score === 0) break;
    }
    out.set(b.id, best!.place);
    boxes.push(best!.place.box);
  }
  return out;
}

const mainLeg = (b: PlanBarDrawing) => b.legs.reduce((m, l, j) => (l.length > b.legs[m]!.length ? j : m), 0);
