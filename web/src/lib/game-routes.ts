/** The games hub and one page per game under it. A game added to the hub adds its id here. */
export const GAME_IDS = ['diagram-game'] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAMES_HUB = '/games';
export const GAME_PATHS: readonly string[] = [GAMES_HUB, ...GAME_IDS.map(id => `${GAMES_HUB}/${id}`)];

export function isGameRoute(path: string): boolean {
  return GAME_PATHS.includes(path.replace(/\/+$/, '') || '/');
}
