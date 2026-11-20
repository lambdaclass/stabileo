import { PILE_COVER, PILE_EMBED } from './pile-cap';
import type { BarShape, BendRules } from './shape';
import type { FootingRow } from './footing-types';

/** Sides of the polygon a pile's hoop is drawn and cut with, and how many of them it laps over. */
const HOOP_SIDES = 16, HOOP_LAP = 2;

/**
 * A pile cap's piles as placed, m from the cap's centroid and over its underside: each pile's
 * bars round a ring inside its hoops, from its toe's cover up through the pile head into the cap
 * to the cap's top cover; its hoops, closed and lapped, at their spacing down the shaft.
 */
export interface PileDetail {
  diameter: number; length: number;
  piles: Array<{ x: number; y: number }>;
  bar: { dia: number; shape: BarShape; z0: number; ring: Array<[number, number]> };
  hoop: { dia: number; shape: BarShape; zs: number[] };
}

export function pileDetail(r: Pick<FootingRow, 'adopted' | 'cover' | 'cap'>, R: BendRules): PileDetail | null {
  const p = r.adopted.piles;
  if (!p || !r.cap) return null;
  const D = p.diameter, db = p.bars.dia / 1000, dh = p.hoop.dia / 1000;
  const ring = D / 2 - PILE_COVER - dh - db / 2;
  const z0 = -p.length + PILE_COVER, zTop = r.adopted.h - r.cap.topCover - (r.adopted.x.dia + r.adopted.y.dia) / 1000;
  const bar: BarShape = { pts: [[0, 0], [zTop - z0, 0]], mandrel: R.mandrel(p.bars.dia, 'longitudinal'), dia: p.bars.dia };
  const rh = D / 2 - PILE_COVER - dh / 2;
  const hoop: BarShape = { pts: Array.from({ length: HOOP_SIDES + HOOP_LAP + 1 }, (_, j) => { const t = (2 * Math.PI * j) / HOOP_SIDES; return [rh * Math.cos(t), rh * Math.sin(t)] as [number, number]; }), mandrel: R.mandrel(p.hoop.dia, 'transverse'), dia: p.hoop.dia };
  const top = PILE_EMBED - dh, bottom = z0 + dh / 2, s = p.hoop.spacing;
  const n = s > 0 ? Math.floor((top - bottom) / s + 1e-9) + 1 : 0;
  return {
    diameter: D, length: p.length, piles: p.at.map(([x, y]) => ({ x, y })),
    bar: { dia: p.bars.dia, shape: bar, z0, ring: Array.from({ length: p.bars.count }, (_, k) => { const t = (2 * Math.PI * k) / p.bars.count; return [ring * Math.cos(t), ring * Math.sin(t)] as [number, number]; }) },
    hoop: { dia: p.hoop.dia, shape: hoop, zs: Array.from({ length: n }, (_, k) => top - k * s) },
  };
}
