export function planarPointProjectionTooShort(dx: number, dPlan: number): boolean {
  return Math.hypot(dx, dPlan) < 1e-10;
}

export type PlanarPointMomentFields = { my?: unknown; mz?: unknown };

export function planarPointMoment({ my, mz }: PlanarPointMomentFields): number | undefined | null {
  if (my != null && (typeof my !== 'number' || !Number.isFinite(my))) return null;
  if (mz != null && (typeof mz !== 'number' || !Number.isFinite(mz))) return null;
  if (my) return mz && mz !== my ? null : my;
  return mz ?? my ?? undefined;
}

export function planarPointMomentWithoutProjection(
  d: PlanarPointMomentFields & { p?: unknown; px?: unknown },
  a: unknown,
): number | null {
  if ((d.p ?? 0) !== 0 || (d.px ?? 0) !== 0) return null;
  const moment = planarPointMoment(d);
  if (moment === null) return null;
  if (!moment) return 0;
  return a === 0 ? moment : null;
}
