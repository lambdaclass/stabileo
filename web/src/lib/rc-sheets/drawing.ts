import { ACI_BENDS, faceBars } from './bars';
import { confinedTies } from './column-row';
import { columnLayout } from './column-layout';
import { tiePaths, type Pt } from './column-tie-path';
import type { BendRules, HookAngle } from './shape';
import type { BarGroup, ColumnAdopted, Stirrups } from './types';


/** A rectangular section to draw, in metres from its bottom-left corner. */
export interface SectionDrawing {
  b: number; h: number; cover: number; tieDia: number;
  bars: Array<{ x: number; y: number; dia: number }>;
  /** A beam's inner stirrup legs, as segments. */
  ties: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** A column's closed hoop: its centreline from one 135° hook's free end, wrapped round a corner bar, round to the other's; `w` × `h` between centrelines, `box` its straight sides. */
  hoop?: { pts: Pt[]; w: number; h: number; box: { x0: number; y0: number; x1: number; y1: number }; mark?: string };
  /** A column's crossties, each from the free end of one hook to the other's, its straight `leg` tangent to the bars it engages: `hooks` at the start and end. */
  crossties?: Array<{ pts: Pt[]; hooks: [HookAngle, HookAngle]; across: 'h' | 'b'; length: number; leg: [Pt, Pt]; mark?: string }>;
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

export interface ColumnSectionOptions {
  /** Draw the crossties of the confinement zones (lo) where they are more than the rest of the storey's. */
  confined?: boolean;
  bends?: BendRules;
  /** The largest aggregate the bars were laid for, mm (`ColumnRow.aggregate`). */
  aggregate?: number;
  /** The marks the bending schedule gives the hoop and, by length between hook corners in m, each crosstie. */
  marks?: { hoop?: string; crossTie?: (length: number) => string | undefined };
}

/**
 * A column section: its bars as the design places them; the closed hoop with its two 135° hooks
 * round a corner bar; and each crosstie §25.7.2.3 asks for (chapter 18's in lo where it has more)
 * and each one a row inside takes, laid round the bars they engage with the code's hooks
 * (`tiePaths`), none crossing a bar.
 */
export function columnSection(b: number, h: number, cover: number, a: ColumnAdopted, o: ColumnSectionOptions = {}): SectionDrawing {
  const bars = columnLayout({ b, h }, a, cover, o.aggregate).bars.map((x) => ({ x: x.x + b / 2, y: x.y + h / 2, dia: x.dia }));
  const R = o.bends ?? ACI_BENDS;
  const plain = { ...a, confined: undefined };
  const held = confinedTies({ b, h }, o.confined ? a : plain, { cover }).along;
  const paths = tiePaths({ b, h }, a, cover, { held, extension: (angle) => R.extension(a.tieDia, angle, 'transverse'), hooks: R.crossTieHooks }, o.aggregate);
  const move = (p: Pt): Pt => [p[0] + b / 2, p[1] + h / 2];
  const box = paths.hoop.box;
  const hoop: NonNullable<SectionDrawing['hoop']> = {
    pts: paths.hoop.pts.map(move), w: box.x1 - box.x0, h: box.y1 - box.y0,
    box: { x0: box.x0 + b / 2, y0: box.y0 + h / 2, x1: box.x1 + b / 2, y1: box.y1 + h / 2 },
    ...(o.marks?.hoop ? { mark: o.marks.hoop } : {}),
  };
  const crossties: NonNullable<SectionDrawing['crossties']> = paths.crossties.map((t) => {
    const mark = o.marks?.crossTie?.(t.length);
    return { pts: t.pts.map(move), hooks: t.hooks, across: t.across, length: t.length, leg: [move(t.leg[0]), move(t.leg[1])], ...(mark ? { mark } : {}) };
  });
  const more = !!a.confined && (held.b.length > confinedTies({ b, h }, plain, { cover }).along.b.length || held.h.length > confinedTies({ b, h }, plain, { cover }).along.h.length);
  return { b, h, cover, tieDia: a.tieDia, bars, ties: [], hoop, crossties, zone: o.confined && more ? 'lo' : 'all' };
}
