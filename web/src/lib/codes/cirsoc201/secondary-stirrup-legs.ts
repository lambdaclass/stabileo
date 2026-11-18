import { msg } from '../message';
import type { StirrupDef } from '../../design-contract/reinforcement';

declare const secondaryDirection: unique symbol;
export type SecondaryStirrupLegs = number & { readonly [secondaryDirection]: true };

export const secondaryStirrupLegsUnavailableCode = 'VERIF_SECONDARY_STIRRUP_LEGS_UNAVAILABLE';
export const secondaryStirrupLegsUnavailable = msg('check.rc.secondaryStirrupLegsUnavailable').key;

export function isClosedRectangularStirrup(cage: StirrupDef | undefined, rectangular = true): cage is StirrupDef {
  return rectangular && !!cage && (cage.shape === undefined || cage.shape === 'closedRectangular')
    && Number.isSafeInteger(cage.legs) && cage.legs >= 2
    && Number.isFinite(cage.diameter) && cage.diameter > 0
    && Number.isFinite(cage.spacing) && cage.spacing > 0;
}

export function secondaryStirrupLegs(cage: StirrupDef | undefined, rectangular = true): SecondaryStirrupLegs | undefined {
  if (!isClosedRectangularStirrup(cage, rectangular)) return undefined;
  const crossties = cage.secondaryCrossties === undefined ? 0 : cage.secondaryCrossties;
  if (crossties === null || !Number.isSafeInteger(crossties) || crossties < 0
    || !Number.isSafeInteger(2 + crossties)) return undefined;
  return (2 + crossties) as SecondaryStirrupLegs;
}

export function weakestStirrups(
  line: readonly StirrupDef[] | null | undefined, support?: StirrupDef, span?: StirrupDef,
): readonly (StirrupDef | undefined)[] {
  if (line === null || (line === undefined && (!support || !span))) return [undefined];
  const cages = [...(line ?? []), ...(support ? [support] : []), ...(span ? [span] : [])];
  if (!cages.length) return [undefined];
  const invalid = cages.find(cage => !isClosedRectangularStirrup(cage));
  if (invalid) return [invalid];
  const legs = Math.min(...cages.map(cage => cage.legs));
  const spacing = Math.max(...cages.map(cage => cage.spacing));
  const secondary = cages.map(cage => secondaryStirrupLegs(cage));
  const secondaryCrossties = secondary.some(legs => legs === undefined) ? null : Math.min(...secondary.map(legs => legs!)) - 2;
  return [...new Set(cages.map(cage => cage.diameter))].map(diameter => ({ diameter, legs, spacing, secondaryCrossties }));
}
