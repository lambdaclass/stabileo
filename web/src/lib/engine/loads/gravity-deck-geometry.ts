import type { GravityShellKey } from './gravity-shell-partition';
import type { Polygon } from 'polygon-clipping';
import { orient2d, orient3d } from 'robust-predicates';
import { msg } from '../../codes/message';
import { clearanceMargin, compareClearance, doubledPlanPoint, exactElevation, exactPlaneHeight, type DoubledPlanPoint, type Elevation } from './gravity-exact-height';
import { footprintArea, footprintBounds, footprintIntersection, planarShell, refuseGravityGeometry, type FittedShellPlane, type PlaneBasis, type ShellPlane } from './gravity-shell-partition';

type Point = Polygon[number][number];
type Point3 = [number, number, number];
type HeightRange = readonly [number, number];

export type DeckSurface = {
  range: HeightRange;
  heights: (point: Point) => HeightRange;
  independentShells?: ReadonlySet<GravityShellKey>;
  exactHeight?: (point: DoubledPlanPoint) => Elevation;
};

type AffineHeight = { height: ShellPlane; exactHeight: NonNullable<DeckSurface['exactHeight']> };

export function deckSurface(range: HeightRange, plane?: AffineHeight): DeckSurface {
  return {
    range, exactHeight: plane?.exactHeight,
    heights: plane ? point => { const z = plane.height(point); return [z, z]; } : () => range,
  };
}

export type Deck = DeckSurface & {
  points: Point3[];
  basis?: PlaneBasis;
};

export function physicalDeck(points: Point3[], plane?: FittedShellPlane): Deck {
  const [a, ...rest] = points;
  const b = rest.find(p => p[0] !== a![0] || p[1] !== a![1]);
  const c = b && rest.find(p => orient2d(a![0], a![1], b[0], b[1], p[0], p[1]) !== 0);
  const basis: Deck['basis'] = a && b && c && points.every(p => orient3d(...a, ...b, ...c, ...p) === 0)
    ? [a, b, c] : undefined;
  const surface = plane ?? (basis && planarShell(0, basis));
  const range = points.reduce(([low, high], p) =>
    [Math.min(low, p[2]), Math.max(high, p[2])] as const, [Infinity, -Infinity] as HeightRange);
  const planeHeight = surface && { height: surface, exactHeight: (point: DoubledPlanPoint) => exactPlaneHeight(surface.basis, point) };
  return { points, basis, ...deckSurface(range, planeHeight) };
}

export type DeckFootprint = { footprint: Polygon[]; geometry: DeckSurface };
type Band = 'none' | 'full' | 'partial';

function above(upper: number, lower: number, limit: number): number {
  return Math.min(upper - (lower + limit), (upper - lower) - limit);
}

export function separatedDeckRanges(a: DeckSurface, b: DeckSurface, limit: number): boolean {
  return above(a.range[0], b.range[1], limit) > 0 || above(b.range[0], a.range[1], limit) > 0;
}

function hasHeight(deck: DeckSurface): boolean {
  return deck.range[0] === deck.range[1] || deck.exactHeight !== undefined;
}

function coversBand(minOrder: number, maxOrder: number, determinate: boolean): boolean {
  return determinate ? minOrder >= 0 && maxOrder <= 0 : minOrder > 0 && maxOrder < 0;
}

export function deckRangeBand(lower: DeckSurface, upper: DeckSurface, min: number, max: number): Band {
  const gap = (top: number, base: number, limit: number) => {
    const threshold = base + limit;
    return top === threshold ? compareClearance(exactElevation(top), exactElevation(base), limit) : Math.sign(top - threshold);
  };
  if (gap(upper.range[1], lower.range[0], min) <= 0 || gap(upper.range[0], lower.range[1], max) >= 0) return 'none';
  return coversBand(gap(upper.range[0], lower.range[1], min), gap(upper.range[1], lower.range[0], max),
    hasHeight(lower) && hasHeight(upper)) ? 'full' : 'partial';
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
  const elevationRange = ({ range: [min, max], exactHeight }: DeckSurface, point: DoubledPlanPoint): readonly [Elevation, Elevation] => {
    if (min !== max && exactHeight) {
      const z = exactHeight(point);
      return [z, z];
    }
    return [exactElevation(min), exactElevation(max)];
  };
  const elevationPair = (point: Point) => {
    const plan = doubledPlanPoint(point);
    return { base: elevationRange(lower, plan), top: elevationRange(upper, plan) };
  };
  let heights: ReturnType<typeof elevationPair>[] | undefined;
  const bounds = () => heights ??= part.flat().map(elevationPair);
  const smallest = ({ base, top }: ReturnType<typeof elevationPair>, limit: number) => compareClearance(top[0], base[1], limit);
  const largest = ({ base, top }: ReturnType<typeof elevationPair>, limit: number) => compareClearance(top[1], base[0], limit);
  const determinate = hasHeight(lower) && hasHeight(upper);
  const band = (min: number, max: number): Band => {
    if (lower.range[0] === lower.range[1] && upper.range[0] === upper.range[1]) return deckRangeBand(lower, upper, min, max);
    if (bounds().every(pair => largest(pair, min) <= 0) || bounds().every(pair => smallest(pair, max) >= 0)) return 'none';
    return bounds().every(pair => coversBand(smallest(pair, min), largest(pair, max), determinate)) ? 'full' : 'partial';
  };
  return {
    part, band,
    strictlyAbove: (limit: number) => bounds().every(pair => smallest(pair, limit) > 0),
    separated: (limit: number) => {
      const samples = part.flat().map(heightPair);
      return samples.every(p => above(p.topLow, p.baseHigh, limit) > 0)
        || samples.every(p => above(p.baseLow, p.topHigh, limit) > 0);
    },
    margin: determinate
      ? (point: Point, limit: number) => {
        const { base, top } = elevationPair(point);
        return clearanceMargin(top[0], base[0], limit);
      } : undefined,
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
  if (deckRangeBand(lower.geometry, upper.geometry, min, max) === 'none') return [];
  return deckOverlaps(lower, upper).flatMap(({ part, band, margin }) => {
    const coverage = band(min, max);
    return coverage === 'none' ? [] : [{ part, coverage, margin }];
  });
}
