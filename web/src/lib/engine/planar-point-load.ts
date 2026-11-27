import { isFiniteInputNumber } from './model-input-numbers';

export function planarPointProjectionTooShort(dx: number, dPlan: number): boolean {
  return Math.hypot(dx, dPlan) < 1e-10;
}

export type PlanarMomentFields = { my?: unknown; mz?: unknown };

export function planarPointMoment({ my, mz }: PlanarMomentFields): number | undefined | null {
  if (my !== undefined && !isFiniteInputNumber(my)) return null;
  if (mz !== undefined && !isFiniteInputNumber(mz)) return null;
  if (my) return mz && mz !== my ? null : my;
  return mz ?? my ?? undefined;
}

export function planarNodalMoment(fields: PlanarMomentFields): number | undefined | null {
  const moment = planarPointMoment(fields);
  return moment !== null && fields.my === 0 ? 0 : moment;
}

export function planarPointMomentWithoutProjection(
  d: PlanarMomentFields & { p?: unknown; px?: unknown },
  a: unknown,
): number | null {
  if ((d.p ?? 0) !== 0 || (d.px ?? 0) !== 0) return null;
  const moment = planarPointMoment(d);
  if (moment === null) return null;
  if (!moment) return 0;
  return a === 0 ? moment : null;
}
