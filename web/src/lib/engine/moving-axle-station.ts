import { checkMovingPathSegment, movingAxleStation, movingReferenceSampleCount } from './wasm-solver';
import type { LoadTrain } from './moving-loads';

interface RouteSegment {
  cumStart: number;
  length: number;
}

export function checkAxlePath(path: readonly RouteSegment[], scale: number): void {
  for (const { cumStart, length } of path) checkMovingPathSegment(cumStart, cumStart + length, length, scale);
}

type AxlePlacement<T> =
  | { kind: 'interior'; segment: T; a: number }
  | { kind: 'joint'; faces: [RouteFace<T> | undefined, RouteFace<T> | undefined] };

interface RouteFace<T> {
  segment: T;
  atEnd: boolean;
}

export function locateAxlePlacement<T extends RouteSegment>(
  path: readonly T[], reference: number, offset: number, scale: number, isReversed: (segment: T) => boolean,
): AxlePlacement<T> | undefined {
  if (!path.length) return undefined;
  const position = reference + offset;
  let index = path.findIndex((part) => position <= part.cumStart + part.length);
  if (index < 0) index = path.length - 1;
  const segment = path[index];
  const { cumStart, length } = segment;
  const reversed = isReversed(segment);
  const a = movingAxleStation(cumStart, cumStart + length, length, reversed, position, Math.max(scale, Math.abs(offset)));
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
  path: readonly T[], reference: number, offset: number, scale: number, isReversed: (segment: T) => boolean,
): { segment: T; a: number } | undefined {
  const placement = locateAxlePlacement(path, reference, offset, scale, isReversed);
  if (placement?.kind !== 'joint') return placement;
  const face = placement.faces[0] ?? placement.faces[1]!;
  return { segment: face.segment, a: face.atEnd ? face.segment.length : 0 };
}

export function axleOffsetScale(train: LoadTrain): number {
  return train.axles.reduce((scale, axle) => Math.max(scale, Math.abs(axle.offset)), 0);
}

export function referenceGrid(start: number, end: number, step: number) {
  const count = movingReferenceSampleCount(start, end, step);
  return {
    count,
    positions: (reversed = false) => Array.from({ length: count }, (_, i) => reversed ? end - i * step : start + i * step),
  };
}
