import { isMainToolPath } from './main-tool-routes';
import { isGameRoute } from './game-routes';

export type PublicFeatures = { research: boolean; tools: boolean; diagramGame: boolean; accounts?: boolean };

export function publicFeatureEnabledWithFlags(path: string, flags: PublicFeatures): boolean {
  const route = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (['/register', '/terms', '/privacy', '/usage-data'].includes(route)) return flags.accounts ?? false;
  if (route.startsWith('/tools/')) return flags.tools || isMainToolPath(route);
  if (route === '/diagram-game' || isGameRoute(route)) return flags.diagramGame;
  return true;
}
