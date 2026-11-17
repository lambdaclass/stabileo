import type { LoadPlanInput } from '../../engine/loads/load-plan';
import type { EcFamily } from './refs';
import { categoryOfOccupancy, columnAlphaN, findEcOccupancy } from './imposed';
import { SNOW_ADAPTER, type EcSnowInput } from './inputs';

export type ImposedCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

/** What the ψ factors of a plan depend on: the categories of the floors and roof, and the site's altitude when it snows. */
export interface EcPlanContext {
  categories: Set<ImposedCategory>;
  /** The floors' category, and the roof's where it has an occupancy of its own. */
  floor?: ImposedCategory;
  roof?: ImposedCategory;
  snowAltitudeM?: number;
  alphaN?: number;
}

/** The roof's imposed load is a part of its own (`load-plan.ts`, `imposedGroup`) when its category is not the floors'. */
export const roofPartOf = (ctx: EcPlanContext | undefined): ImposedCategory | undefined =>
  (ctx?.roof && ctx.roof !== ctx.floor ? ctx.roof : undefined);

export function planContextOf(family: EcFamily, input: LoadPlanInput): EcPlanContext {
  const categories = new Set<ImposedCategory>();
  const floor = categoryOfOccupancy(input.occupancyKey);
  if (floor) categories.add(floor);
  const roof = input.roof?.use === 'occupancy' ? categoryOfOccupancy(input.roof.occupancyKey) : undefined;
  if (roof) categories.add(roof);
  const altitude = (input.codeInputs?.[SNOW_ADAPTER[family]] as EcSnowInput | undefined)?.altitude;
  const occupancy = findEcOccupancy(family, input.occupancyKey);
  const alphaN = input.applyLiveReduction && occupancy && !occupancy.noReduction ? columnAlphaN(family, input.reductionElementKind, input.floorsSupported) : 1;
  return {
    categories, ...(floor ? { floor } : {}), ...(roof ? { roof } : {}), ...(input.snow?.enabled && altitude !== undefined ? { snowAltitudeM: altitude } : {}),
    ...(alphaN < 1 ? { alphaN } : {}),
  };
}
