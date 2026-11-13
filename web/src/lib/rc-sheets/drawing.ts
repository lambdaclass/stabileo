import { faceBars } from './bars';
import { bracedFaceBars, columnBars } from './column-row';
import type { BarGroup, ColumnAdopted, Stirrups } from './types';

/** A rectangular section to draw, in metres from its bottom-left corner. */
export interface SectionDrawing {
  b: number; h: number; cover: number; tieDia: number;
  bars: Array<{ x: number; y: number; dia: number }>;
  /** Legs inside the hoop and crossties, as segments. */
  ties: Array<{ x1: number; y1: number; x2: number; y2: number }>;
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

/** A column section: its bars as the design places them, and the crossties §25.7.2.3 asks for. */
export function columnSection(b: number, h: number, cover: number, a: ColumnAdopted): SectionDrawing {
  const ctx = { mat: { fc: 0, fy: 0 }, cover, tieDia: a.tieDia, diameters: [] };
  const diaAt = (i: number) => (i < 4 ? a.corner : i < 4 + 2 * a.nx ? a.dx : a.dy);
  const bars = columnBars({ b, h }, a, ctx).map((x, i) => ({ x: x.x + b / 2, y: x.y + h / 2, dia: diaAt(i) }));
  const leg = cover + a.tieDia / 2000, edge = cover + a.tieDia / 1000 + a.corner / 2000, ties: SectionDrawing['ties'] = [];
  for (const i of bracedFaceBars(b, a.nx, a.dx, a.corner, { cover }, a.tieDia)) {
    const x = edge + (i * (b - 2 * edge)) / (a.nx + 1);
    ties.push({ x1: x, y1: leg, x2: x, y2: h - leg });
  }
  for (const i of bracedFaceBars(h, a.ny, a.dy, a.corner, { cover }, a.tieDia)) {
    const y = edge + (i * (h - 2 * edge)) / (a.ny + 1);
    ties.push({ x1: leg, y1: y, x2: b - leg, y2: y });
  }
  return { b, h, cover, tieDia: a.tieDia, bars, ties };
}
