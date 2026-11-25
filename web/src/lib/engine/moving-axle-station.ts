import { checkMovingPathSegment, movingAxleStation } from './wasm-solver';

interface RouteSegment {
  cumStart: number;
  length: number;
}

export function checkAxlePath(path: readonly RouteSegment[]): void {
  for (const { cumStart, length } of path) checkMovingPathSegment(cumStart, cumStart + length, length);
}

export function locateAxle<T extends RouteSegment>(
  path: readonly T[], position: number, isReversed: (segment: T) => boolean,
): { segment: T; a: number } | undefined {
  const segment = path.find((part) => position <= part.cumStart + part.length) ?? path.at(-1);
  if (!segment) return undefined;
  const { cumStart, length } = segment;
  const a = movingAxleStation(cumStart, cumStart + length, length, isReversed(segment), position);
  return a === undefined ? undefined : { segment, a };
}
