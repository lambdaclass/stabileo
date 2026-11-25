import { checkMovingPathSegment, movingAxleStation, movingReferenceSampleCount } from './wasm-solver';
import type { LoadTrain } from './moving-loads';

interface RouteSegment {
  cumStart: number;
  length: number;
}

export function checkAxlePath(path: readonly RouteSegment[], scale: number): void {
  for (const { cumStart, length } of path) checkMovingPathSegment(cumStart, cumStart + length, length, scale);
}

export function locateAxle<T extends RouteSegment>(
  path: readonly T[], reference: number, offset: number, scale: number, isReversed: (segment: T) => boolean,
): { segment: T; a: number } | undefined {
  const position = reference + offset;
  const segment = path.find((part) => position <= part.cumStart + part.length) ?? path.at(-1);
  if (!segment) return undefined;
  const { cumStart, length } = segment;
  const a = movingAxleStation(cumStart, cumStart + length, length, isReversed(segment), position, Math.max(scale, Math.abs(offset)));
  return a === undefined ? undefined : { segment, a };
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
