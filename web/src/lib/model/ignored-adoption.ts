import { reinforcementSheets } from '../features';

export function ignoresAdoptedReinforcement(data?: { rcSheets?: { adopted?: Record<string, unknown> } } | null): boolean {
  return !reinforcementSheets() && Object.keys(data?.rcSheets?.adopted ?? {}).length > 0;
}
