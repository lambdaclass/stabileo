import { checkMovingPathSegment, movingAxleStation, movingReferenceSampleCount, movingSampleStation } from './wasm-solver';

export interface RouteSegment {
  cumStart: number;
  length: number;
  startRoundoff: number;
  endRoundoff: number;
  lengthRoundoff: number;
}

export function checkAxlePath(path: readonly RouteSegment[]): void {
  for (const { cumStart, length, startRoundoff, endRoundoff } of path) {
    checkMovingPathSegment(cumStart, cumStart + length, length, startRoundoff, endRoundoff);
  }
}

type AxlePlacement<T> =
  | { kind: 'interior'; segment: T; a: number }
  | { kind: 'joint'; faces: [RouteFace<T> | undefined, RouteFace<T> | undefined] };

interface RouteFace<T> {
  segment: T;
  atEnd: boolean;
}

export function locateAxlePlacement<T extends RouteSegment>(
  path: readonly T[], reference: ReferencePosition, offset: number, isReversed: (segment: T) => boolean,
): AxlePlacement<T> | undefined {
  if (!path.length) return undefined;
  const [position, arithmetic] = axleStation(reference, offset);
  let index = path.findIndex((part) => position <= part.cumStart + part.length);
  if (index < 0) index = path.length - 1;
  const segment = path[index];
  const { cumStart, length, startRoundoff, endRoundoff } = segment;
  const reversed = isReversed(segment);
  const a = movingAxleStation(cumStart, cumStart + length, length, reversed, position, startRoundoff, endRoundoff, arithmetic);
  if (a === undefined) return undefined;
  if (a !== 0 && a !== length) return { kind: 'interior', segment, a };

  const joint = index + Number((a === length) !== reversed);
  const before = path[joint - 1], after = path[joint];
  return { kind: 'joint', faces: [
    before && { segment: before, atEnd: !isReversed(before) },
    after && { segment: after, atEnd: isReversed(after) },
  ] };
}

export function locateAxle<T extends RouteSegment>(
  path: readonly T[], reference: ReferencePosition, offset: number, isReversed: (segment: T) => boolean,
): { segment: T; a: number } | undefined {
  const placement = locateAxlePlacement(path, reference, offset, isReversed);
  if (placement?.kind !== 'joint') return placement;
  const face = placement.faces[0] ?? placement.faces[1]!;
  return { segment: face.segment, a: face.atEnd ? face.segment.length : 0 };
}

export type ReferencePosition = number | { base: number; step: number; index: number };

function axleStation(reference: ReferencePosition, offset: number): ArrayLike<number> & Iterable<number> {
  return typeof reference === 'number'
    ? [reference + offset, 0]
    : movingSampleStation(reference.base, reference.step, reference.index, offset);
}

export function referenceStation(reference: ReferencePosition): number {
  return axleStation(reference, 0)[0];
}

export function referenceGrid(start: number, end: number, step: number, endRoundoff = 0) {
  const count = movingReferenceSampleCount(start, end, step, endRoundoff);
  return {
    count,
    positions: (reversed = false): ReferencePosition[] => Array.from({ length: count }, (_, index) => ({
      base: reversed ? end : start, step: reversed ? -step : step, index,
    })),
  };
}
