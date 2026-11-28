import { placementWithLegacy } from './stored-placement';
import { reinforcementSheets } from '../features';

export function ignoresAdoptedReinforcement(data?: { rcSheets?: { adopted?: Record<string, unknown> } } | null): boolean {
  return !reinforcementSheets() && Object.keys(data?.rcSheets?.adopted ?? {}).length > 0;
}

export function inactivePlacementRules(data?: { placement?: unknown; rcSheets?: { fixedPoints?: unknown } } | null): boolean {
  return !reinforcementSheets() && !!placementWithLegacy(data?.placement, data?.rcSheets?.fixedPoints).placement;
}
