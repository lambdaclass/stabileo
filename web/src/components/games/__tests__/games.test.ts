import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { GAME_IDS, GAME_PATHS, isGameRoute } from '../../../lib/game-routes';
import { setPublicLocale } from '../../../lib/i18n/store.svelte';
import type { Locale } from '../../../lib/i18n/offered';
import { gameStrings } from '../../diagram-game/strings';
import { GAMES } from '../games';
import { hubStrings } from '../strings';
import { loadGamesPage } from '../load-page';
import GamesPage from '../GamesPage.svelte';

const LOCALES: Locale[] = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'zh'];
const width = (s: string) => s.length + (s.match(/[\p{Script=Han}　-〿＀-￯]/gu)?.length ?? 0);
afterEach(() => setPublicLocale('en'));

it('lists one card per game, each under /games, titled as the game page heads itself', () => {
  expect(GAMES.map(game => game.id)).toEqual([...GAME_IDS]);
  expect(GAME_PATHS).toEqual(['/games', ...GAME_IDS.map(id => `/games/${id}`)]);
  for (const path of ['/games', '/games/', '/games/diagram-game/']) expect(isGameRoute(path), path).toBe(true);
  for (const path of ['/diagram-game', '/games/unknown', '/gamesx']) expect(isGameRoute(path), path).toBe(false);
  for (const locale of LOCALES) {
    expect(GAMES[0]!.copy[locale].title, locale).toBe(gameStrings[locale]!.title);
    for (const game of GAMES) expect(width(game.copy[locale].description), `${game.id} ${locale}`).toBeGreaterThan(60);
  }
});

it('writes the hub in every language, with a title and description a result page shows whole', () => {
  for (const locale of LOCALES) {
    const copy = hubStrings[locale];
    if (locale !== 'en') for (const key of ['title', 'metaTitle', 'description', 'lead'] as const) expect(copy[key], `${locale} ${key}`).not.toBe(hubStrings.en[key]);
    expect(width(`${copy.metaTitle} — Stabileo`), locale).toBeGreaterThanOrEqual(25);
    expect(width(`${copy.metaTitle} — Stabileo`), locale).toBeLessThanOrEqual(120);
    expect(width(copy.description), locale).toBeGreaterThanOrEqual(90);
    expect(width(copy.description), locale).toBeLessThanOrEqual(300);
  }
});

it('renders a card that links to the game in the reader’s language', () => {
  for (const locale of ['es', 'zh'] as const) {
    setPublicLocale(locale);
    const body = render(GamesPage, { props: { path: '/games' } }).body;
    expect(body).toMatch(new RegExp(`<h1[^>]*>${hubStrings[locale].title}</h1>`));
    expect(body).toContain(GAMES[0]!.copy[locale].title);
    expect(body).toContain(`href="/${locale}/games/diagram-game/"`);
    expect(body).toContain('data-testid="game-card-diagram-game"');
  }
});

it('loads the hub for /games and the game page for its own address', async () => {
  expect(await loadGamesPage('/games')).toBe(GamesPage);
  expect(await loadGamesPage('/games/')).toBe(GamesPage);
  expect(await loadGamesPage('/games/diagram-game')).toBe((await import('../../diagram-game/DiagramGamePage.svelte')).default);
  for (const path of ['/games/constructor', '/games/toString', '/games/__proto__']) expect(await loadGamesPage(path), path).toBe(GamesPage);
});

it('speaks to the player as the rest of the site does: Sie, vous and the Turkish plural', () => {
  const word = (alts: string) => new RegExp(`(?<!\\p{L})(${alts})(?!\\p{L})`, 'iu');
  const informal: Partial<Record<Locale, RegExp>> = {
    de: word('du|dich|dir|dein\\p{L}*|Wähle|Finde|Tippe|Dreh|Prüfe|vergleiche'),
    fr: word('tu|te|toi|ton|ta|tes|choisis|vérifie|réessaie|touche une|tourne ton|compare les'),
    tr: word('seç|bul|dokun|dene|karşılaştır|çevir'),
  };

  for (const [locale, pattern] of Object.entries(informal) as [Locale, RegExp][]) {
    for (const [key, text] of Object.entries(gameStrings[locale]!)) expect(text, `${locale} ${key}`).not.toMatch(pattern);
    for (const game of GAMES) expect(game.copy[locale].description, `${game.id} ${locale}`).not.toMatch(pattern);
  }
});
