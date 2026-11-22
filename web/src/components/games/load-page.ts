/** Keep the games behind their own route boundary, like the tools: the hub, or the game the path names. */
import type { Component } from 'svelte';
import type { GameId } from '../../lib/game-routes';

const PAGES: Record<GameId, () => Promise<{ default: Component<{ path: string }> }>> = {
  'diagram-game': () => import('../diagram-game/DiagramGamePage.svelte'),
};

export async function loadGamesPage(path = '/games') {
  const id = path.replace(/\/+$/, '').split('/')[2] as GameId | undefined;
  return (await (id && id in PAGES ? PAGES[id]() : import('./GamesPage.svelte'))).default;
}
