import type { Polygon } from 'polygon-clipping';
import { orient2d, orient3d } from 'robust-predicates';
import { msg } from '../../codes/message';
import { footprintArea, footprintBounds, footprintIntersection, planarShell, refuseGravityGeometry, type GravityShellKey, type ShellPlane } from './gravity-shell-partition';

type Point = Polygon[number][number];
type Point3 = [number, number, number];
type HeightRange = readonly [number, number];

export type DeckSurface = {
  range: HeightRange;
  heights: (point: Point) => HeightRange;
};

export function deckSurface(range: HeightRange, plane?: ShellPlane): DeckSurface {
  return {
    range,
    heights: plane ? point => { const z = plane(point); return [z, z]; } : () => range,
  };
}

export type Deck = DeckSurface & {
  points: Point3[];
  basis?: [Point3, Point3, Point3];
};

export function physicalDeck(points: Point3[], plane?: ShellPlane): Deck {
  const [a, ...rest] = points;
  const b = rest.find(p => p[0] !== a![0] || p[1] !== a![1]);
  const c = b && rest.find(p => orient2d(a![0], a![1], b[0], b[1], p[0], p[1]) !== 0);
  const basis: Deck['basis'] = a && b && c && points.every(p => orient3d(...a, ...b, ...c, ...p) === 0)
    ? [a, b, c] : undefined;
  const surface = plane ?? (basis && planarShell(0, basis));
  const range = points.reduce(([low, high], p) =>
    [Math.min(low, p[2]), Math.max(high, p[2])] as const, [Infinity, -Infinity] as HeightRange);
  return { points, basis, ...deckSurface(range, surface) };
}

export type DeckFootprint = { footprint: Polygon[]; geometry: DeckSurface; independentShells?: ReadonlySet<GravityShellKey> };
type Band = 'none' | 'full' | 'partial';

function above(upper: number, lower: number, limit: number): number {
  return Math.min(upper - (lower + limit), (upper - lower) - limit);
}

function below(upper: number, lower: number, limit: number): number {
  return Math.min((lower + limit) - upper, limit - (upper - lower));
}

export function separatedDeckRanges(a: DeckSurface, b: DeckSurface, limit: number): boolean {
  return above(a.range[0], b.range[1], limit) > 0 || above(b.range[0], a.range[1], limit) > 0;
}

function canOverlapInBand(lower: DeckSurface, upper: DeckSurface, min: number, max: number): boolean {
  return above(upper.range[1], lower.range[0], min) > 0 && below(upper.range[0], lower.range[1], max) > 0;
}

function clearanceOver(part: Polygon, lower: DeckSurface, upper: DeckSurface) {
  const heightPair = (point: Point) => {
    const [baseLow, baseHigh] = lower.heights(point);
    const [topLow, topHigh] = upper.heights(point);
    if (![topLow, topHigh, baseLow, baseHigh, topLow - baseHigh, topHigh - baseLow].every(Number.isFinite)) {
      refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    }
    return { baseLow, baseHigh, topLow, topHigh };
  };
  const samples = part.flat().map(heightPair);
  const band = (min: number, max: number): Band => {
    if (samples.every(p => above(p.topHigh, p.baseLow, min) <= 0) ||
        samples.every(p => below(p.topLow, p.baseHigh, max) <= 0)) return 'none';
    return samples.every(p => above(p.topLow, p.baseHigh, min) >= 0 && below(p.topHigh, p.baseLow, max) >= 0)
      ? 'full' : 'partial';
  };
  return {
    part, band,
    separated: (limit: number) => samples.every(p => above(p.topLow, p.baseHigh, limit) > 0)
      || samples.every(p => above(p.baseLow, p.topHigh, limit) > 0),
    clearance: samples.every(p => p.topLow === p.topHigh && p.baseLow === p.baseHigh)
      ? (point: Point) => { const { topLow, baseHigh } = heightPair(point); return topLow - baseHigh; }
      : undefined,
  };
}

export function deckOverlaps(lower: DeckFootprint, upper: DeckFootprint) {
  return lower.footprint.flatMap(source => {
    const a = footprintBounds(source[0]!);
    return upper.footprint.flatMap(cover => {
      const b = footprintBounds(cover[0]!);
      if (a.right <= b.left || b.right <= a.left || a.top <= b.bottom || b.top <= a.bottom) return [];
      return footprintIntersection(source, cover).map(part => {
        const area = footprintArea([part]);
        if (!(area > 0) || !Number.isFinite(area)) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
        return clearanceOver(part, lower.geometry, upper.geometry);
      });
    });
  });
}

export function deckOverlapsInBand(lower: DeckFootprint, upper: DeckFootprint, min: number, max: number) {
  if (!canOverlapInBand(lower.geometry, upper.geometry, min, max)) return [];
  return deckOverlaps(lower, upper).flatMap(({ part, band, clearance }) => {
    const coverage = band(min, max);
    return coverage === 'none' ? [] : [{ part, coverage, clearance }];
  });
}
