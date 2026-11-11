import type { LoadPlanInput } from '../../engine/loads/load-plan';
import type { EcFamily } from './refs';
import { categoryOfOccupancy } from './imposed';
import { SNOW_ADAPTER, type EcSnowInput } from './inputs';

export type ImposedCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

/** What the ψ factors of a plan depend on: the categories of the floors and roof, and the site's altitude when it snows. */
export interface EcPlanContext {
  categories: Set<ImposedCategory>;
  snowAltitudeM?: number;
}

export function planContextOf(family: EcFamily, input: LoadPlanInput): EcPlanContext {
  const categories = new Set<ImposedCategory>();
  const floor = categoryOfOccupancy(input.occupancyKey);
  if (floor) categories.add(floor);
  const roof = input.roof?.use === 'occupancy' ? categoryOfOccupancy(input.roof.occupancyKey) : undefined;
  if (roof) categories.add(roof);
  const altitude = (input.codeInputs?.[SNOW_ADAPTER[family]] as EcSnowInput | undefined)?.altitude;
  return { categories, ...(input.snow?.enabled && altitude !== undefined ? { snowAltitudeM: altitude } : {}) };
}
