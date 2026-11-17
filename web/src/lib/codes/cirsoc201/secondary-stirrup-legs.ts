import type { StirrupDef } from '../../design-contract/reinforcement';

declare const secondaryDirection: unique symbol;
export type SecondaryStirrupLegs = number & { readonly [secondaryDirection]: true };

export const secondaryStirrupLegsUnavailableCode = 'VERIF_SECONDARY_STIRRUP_LEGS_UNAVAILABLE';
export const secondaryStirrupLegsUnavailable = 'Cannot determine secondary stirrup legs; provide a closed rectangular cage with valid stirrup data.';

export function secondaryStirrupLegs(cage: StirrupDef | undefined, rectangular = true): SecondaryStirrupLegs | undefined {
  if (!rectangular || !cage || (cage.shape !== undefined && cage.shape !== 'closedRectangular')
    || !Number.isSafeInteger(cage.legs) || cage.legs < 2
    || !Number.isFinite(cage.diameter) || cage.diameter <= 0
    || !Number.isFinite(cage.spacing) || cage.spacing <= 0) return undefined;
  const crossties = cage.secondaryCrossties === undefined ? 0 : cage.secondaryCrossties;
  if (crossties === null || !Number.isSafeInteger(crossties) || crossties < 0
    || !Number.isSafeInteger(2 + crossties)) return undefined;
  return (2 + crossties) as SecondaryStirrupLegs;
}
