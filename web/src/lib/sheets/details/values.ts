/**
 * What the construction details are drawn with: the project's materials, covers, the bar
 * diameters each family of elements uses, its typical sizes and whether it is designed for
 * earthquake. The lengths on a detail (anchorages, laps, hooks) are derived from these with the
 * active CIRSOC 201 rules, so the number written on the sheet is the one the bars were cut to.
 *
 * Pure: the store reads the project into a `DetailValues` (`store/detail-catalog.ts`); a family
 * with nothing designed yet keeps a typical value and says so (`typical`).
 */
import { deriveCompressionDevelopment, deriveDevelopment, deriveHookedDevelopment, deriveLap } from '../../codes/cirsoc201/anchorage';
import { standardHook } from '../../codes/cirsoc201/bar-geometry';
import type { RegulationEdition } from '../../codes/regulation';

export type DetailFamily = 'general' | 'slabs' | 'beams' | 'columns' | 'joints' | 'foundations' | 'walls' | 'stairs' | 'tables';
export const DETAIL_FAMILIES: readonly DetailFamily[] = ['general', 'slabs', 'beams', 'columns', 'joints', 'foundations', 'walls', 'stairs', 'tables'];
/** The element kinds the values are kept by. */
export type ElementKind = 'slab' | 'beam' | 'column' | 'wall' | 'footing' | 'stair';
export const ELEMENT_KINDS: readonly ElementKind[] = ['slab', 'beam', 'column', 'wall', 'footing', 'stair'];

export interface DetailValues {
  /** f'c and fy, MPa. */
  fc: number; fy: number;
  /** As the notes name them: «H-25», «ADN 420». */
  concrete: string; steel: string;
  edition: RegulationEdition;
  seismic: boolean;
  /** Clear cover per kind, mm. */
  cover: Record<ElementKind, number>;
  /** Exposure per kind, as the project states it (its own words). */
  exposure?: Partial<Record<ElementKind, string>>;
  /** The longitudinal diameters each kind uses, most used first, mm. */
  bars: Record<ElementKind, number[]>;
  /** The tie or distribution diameter of each kind, mm. */
  ties: Record<ElementKind, number>;
  /** Typical sizes, mm: a beam's b×h, a column's b×h, a slab's, wall's, footing's and stair's thickness. */
  size: { beam: { b: number; h: number }; column: { b: number; h: number }; slab: number; wall: number; footing: number; stair: number; riser: number; tread: number };
  /** The kinds whose values are typical ones, nothing of that kind being designed yet. */
  typical: ElementKind[];
}

export const TYPICAL: DetailValues = {
  fc: 25, fy: 420, concrete: 'H-25', steel: 'ADN 420', edition: '2025', seismic: false,
  cover: { slab: 25, beam: 25, column: 25, wall: 25, footing: 50, stair: 25 },
  bars: { slab: [10, 8], beam: [16, 12], column: [16, 20], wall: [10, 12], footing: [12, 10], stair: [12, 8] },
  ties: { slab: 8, beam: 8, column: 8, wall: 8, footing: 10, stair: 8 },
  size: { beam: { b: 200, h: 500 }, column: { b: 300, h: 300 }, slab: 150, wall: 200, footing: 500, stair: 150, riser: 175, tread: 280 },
  typical: [...ELEMENT_KINDS],
};

/** The main diameter of a kind: the most used. */
export const mainBar = (v: DetailValues, k: ElementKind): number => v.bars[k][0] ?? TYPICAL.bars[k][0]!;

const up10 = (mm: number) => Math.ceil(mm / 10 - 1e-9) * 10;

export interface BarLengths {
  /** Straight development in tension, bottom and top bars (ψt = 1,3), mm. */
  ld: number; ldTop: number;
  /** Class B tension lap, bottom and top bars, mm. */
  lap: number; lapTop: number;
  /** Development of a standard hook in tension, mm. */
  ldh: number;
  /** Development and lap in compression, mm. */
  ldc: number; lapC: number;
  /** A beam bar hooked in a joint of a seismic frame (§18.8.5.1), mm. */
  ldhSeismic: number;
  /** Inside mandrel of the bar, its 90° hook's extension and its tie's 135° hook extension, mm. */
  mandrel: number; hook90: number; hook180: number;
}

/**
 * The lengths of a bar of `d` mm in this project, rounded up to 10 mm. The "other cases" row of
 * Table 25.4.2.3 is used, as the details do not know the spacing each bar will have.
 */
export function barLengths(v: DetailValues, d: number): BarLengths {
  const base = { diameterMm: d, fy: v.fy, fc: v.fc, favourableSpacing: false, edition: v.edition };
  const dev = deriveDevelopment(base), devTop = deriveDevelopment({ ...base, psiT: 1.3 });
  const h90 = standardHook(d, 90, 'longitudinal'), h180 = standardHook(d, 180, 'longitudinal');
  const lapC = Math.max(v.fy <= 420 ? 0.071 * v.fy * d : (0.13 * v.fy - 24) * d, 300);
  return {
    ld: up10(dev.ldM * 1000), ldTop: up10(devTop.ldM * 1000),
    lap: up10(deriveLap(dev, { edition: v.edition }).lapM * 1000), lapTop: up10(deriveLap(devTop, { edition: v.edition }).lapM * 1000),
    ldh: up10(deriveHookedDevelopment({ diameterMm: d, fy: v.fy, fc: v.fc, edition: v.edition }).ldhM * 1000),
    ldc: up10(deriveCompressionDevelopment({ diameterMm: d, fy: v.fy, fc: v.fc, edition: v.edition }).ldcM * 1000),
    lapC: up10(lapC),
    ldhSeismic: up10(Math.max((v.fy * d) / (5.4 * Math.sqrt(v.fc)), 8 * d, 150)),
    mandrel: Math.round(h90.mandrelDiameter * 1000), hook90: Math.round(h90.extension * 1000), hook180: Math.round(h180.extension * 1000),
  };
}

/** A tie's 135° hook: inside mandrel and extension, mm. */
export function tieHook(d: number): { mandrel: number; ext: number; radius: number } {
  const h = standardHook(d, 135, 'transverse');
  return { mandrel: Math.round(h.mandrelDiameter * 1000), ext: Math.round(h.extension * 1000), radius: h.centrelineRadius * 1000 };
}

/** Hoop spacing at the ends of a beam of a seismic frame (§18.6.4.4), mm. */
export const beamHoopSpacing = (v: DetailValues): number => {
  const d = v.size.beam.h - v.cover.beam - v.ties.beam - mainBar(v, 'beam') / 2;
  return Math.floor(Math.min(d / 4, 6 * Math.min(...v.bars.beam), 150) / 5) * 5;
};

/** Column confinement of a seismic frame (§18.7.5): length lo and spacing so, mm, for a clear height `hc`. */
export function columnConfinement(v: DetailValues, hc = 2700): { lo: number; so: number } {
  const { b, h } = v.size.column, db = Math.min(...v.bars.column);
  const hx = Math.min(350, Math.max(b, h) - 2 * v.cover.column);
  const sx = Math.min(150, Math.max(100, 100 + (350 - hx) / 3));
  return { lo: up10(Math.max(b, h, hc / 6, 450)), so: Math.floor(Math.min(Math.min(b, h) / 4, 6 * db, sx) / 5) * 5 };
}
