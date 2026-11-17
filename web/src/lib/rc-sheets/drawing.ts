import { ACI_BENDS, faceBars } from './bars';
import { columnBars, confinedTies, innerCrossties } from './column-row';
import type { BendRules, HookAngle } from './shape';
import type { BarGroup, ColumnAdopted, Stirrups } from './types';

type Pt = [number, number];

/** A rectangular section to draw, in metres from its bottom-left corner. */
export interface SectionDrawing {
  b: number; h: number; cover: number; tieDia: number;
  bars: Array<{ x: number; y: number; dia: number }>;
  /** A beam's inner stirrup legs, as segments. */
  ties: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** A column's closed hoop: its centreline from one 135° hook's free end round to the other's, both at the top-left corner bar; `w` × `h` between centrelines. */
  hoop?: { pts: Pt[]; w: number; h: number; mark?: string };
  /** A column's crossties, each between the two bars it engages, from the free end of one hook to the other's: `hooks` at the start and end. */
  crossties?: Array<{ pts: Pt[]; hooks: [HookAngle, HookAngle]; across: 'h' | 'b'; length: number; mark?: string }>;
  /** The zone the crossties drawn hold in: chapter 18's lo where it has more than the rest of the storey. */
  zone?: 'lo' | 'all';
}

/** A beam section: top and bottom bars layer by layer inside the stirrup, and the stirrup's inner legs. */
export function beamSection(b: number, h: number, cover: number, top: readonly BarGroup[], bottom: readonly BarGroup[], st: Stirrups): SectionDrawing {
  const sd = st.dia;
  const bars = [
    ...faceBars(bottom, b, cover, sd).map((x) => ({ x: x.x, y: x.depth, dia: x.dia })),
    ...faceBars(top, b, cover, sd).map((x) => ({ x: x.x, y: h - x.depth, dia: x.dia })),
  ];
  const leg = cover + sd / 2000, ties: SectionDrawing['ties'] = [];
  for (let k = 1; k < st.legs - 1; k++) {
    const x = leg + (k * (b - 2 * leg)) / (st.legs - 1);
    ties.push({ x1: x, y1: leg, x2: x, y2: h - leg });
  }
  return { b, h, cover, tieDia: sd, bars, ties };
}

const SQ = Math.SQRT1_2;

const rotate = (v: Pt, deg: number): Pt => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };

export interface ColumnSectionOptions {
  /** Draw the crossties of the confinement zones (lo) where they are more than the rest of the storey's. */
  confined?: boolean;
  bends?: BendRules;
  /** The marks the bending schedule gives the hoop and, by length between hook corners in m, each crosstie. */
  marks?: { hoop?: string; crossTie?: (length: number) => string | undefined };
}

/**
 * A column section: its bars as the design places them; the closed hoop with its two 135° hooks
 * round the top-left corner bar; and each crosstie §25.7.2.3 asks for (chapter 18's in lo where it
 * has more) between the two facing bars it engages, a 135° hook at one end and a 90° hook at the
 * other, alternating from one crosstie to the next (§18.7.5.2(c)).
 */
export function columnSection(b: number, h: number, cover: number, a: ColumnAdopted, o: ColumnSectionOptions = {}): SectionDrawing {
  const ctx = { mat: { fc: 0, fy: 0 }, cover, tieDia: a.tieDia, diameters: [] };
  const diaAt = (i: number) => (i < 4 ? a.corner : i < 4 + 2 * a.nx ? a.dx : i < 4 + 2 * a.nx + 2 * a.ny ? a.dy : a.inner?.dia ?? a.dy);
  const bars = columnBars({ b, h }, a, ctx).map((x, i) => ({ x: x.x + b / 2, y: x.y + h / 2, dia: diaAt(i) }));
  const R = o.bends ?? ACI_BENDS;
  const td = a.tieDia / 1000, ext = (angle: HookAngle) => R.extension(a.tieDia, angle, 'transverse') + td;
  const x0 = cover + td / 2, x1 = b - x0, y0 = cover + td / 2, y1 = h - y0;
  const wrap = (dia: number) => dia / 2000 + td / 2;
  const k = wrap(a.corner), t135 = ext(135);
  const hoop: NonNullable<SectionDrawing['hoop']> = {
    pts: [[x0 + k + t135 * SQ, y1 - t135 * SQ], [x0 + k, y1], [x1, y1], [x1, y0], [x0, y0], [x0, y1 - k], [x0 + t135 * SQ, y1 - k - t135 * SQ]],
    w: x1 - x0, h: y1 - y0, ...(o.marks?.hoop ? { mark: o.marks.hoop } : {}),
  };
  const plain = { ...a, confined: undefined };
  const held = confinedTies({ b, h }, o.confined ? a : plain, { cover }).along;
  const edge = cover + td + a.corner / 2000;
  const crossties: NonNullable<SectionDrawing['crossties']> = [];
  const tie = (from: Pt, to: Pt, at135Start: boolean, across: 'h' | 'b', length: number, wrapR: number) => {
    const u: Pt = [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])];
    const tail = (p: Pt, v: Pt, angle: HookAngle): Pt => { const r = rotate(v, -angle), l = ext(angle), back = angle === 90 ? 2 * wrapR : 0; return [p[0] + l * r[0] - back * v[0], p[1] + l * r[1] - back * v[1]]; };
    const startTail = tail(from, [-u[0], -u[1]], at135Start ? 135 : 90);
    const endTail = tail(to, u, at135Start ? 90 : 135);
    const mark = o.marks?.crossTie?.(length);
    crossties.push({ pts: [startTail, from, to, endTail], hooks: at135Start ? [135, 90] : [90, 135], across, length, ...(mark ? { mark } : {}) });
  };
  const H = y1 - y0, W = x1 - x0;
  held.b.forEach((i, n) => {
    const x = edge + (i * (b - 2 * edge)) / (a.nx + 1), r = wrap(a.dx);
    tie([x, edge - r], [x, h - edge + r], n % 2 === 0, 'h', H, r);
  });
  held.h.forEach((i, n) => {
    const y = edge + (i * (h - 2 * edge)) / (a.ny + 1), r = wrap(a.dy);
    tie([edge - r, y], [b - edge + r, y], n % 2 === 1, 'b', W, r);
  });
  innerCrossties({ b, h }, a, { cover }).ties.forEach((t, n) => {
    const r = wrap(a.inner?.dia ?? a.dx), half = t.length / 2 - td / 2;
    if (t.across === 'h') tie([b / 2 + t.at, h / 2 - half - r + td / 2], [b / 2 + t.at, h / 2 + half + r - td / 2], n % 2 === 0, 'h', t.length, r);
    else tie([b / 2 - half - r + td / 2, h / 2 + t.at], [b / 2 + half + r - td / 2, h / 2 + t.at], n % 2 === 1, 'b', t.length, r);
  });
  const more = !!a.confined && (held.b.length > confinedTies({ b, h }, plain, { cover }).along.b.length || held.h.length > confinedTies({ b, h }, plain, { cover }).along.h.length);
  return { b, h, cover, tieDia: a.tieDia, bars, ties: [], hoop, crossties, zone: o.confined && more ? 'lo' : 'all' };
}
