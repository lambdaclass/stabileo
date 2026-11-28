import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { GAME_IDS, GAME_PATHS, isGameRoute } from '../../../lib/game-routes';
import { setPublicLocale } from '../../../lib/i18n/store.svelte';
import type { Locale } from '../../../lib/i18n/offered';
import { LOCALE_NAMES } from '../../../lib/i18n/offered';
import { gameStrings, tg } from '../../diagram-game/strings';
import { GAMES } from '../games';
import { hubStrings } from '../strings';
import { loadGamesPage } from '../load-page';
import GamesPage from '../GamesPage.svelte';

const LOCALES: Locale[] = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'zh'];
for (const locale of Object.keys(LOCALE_NAMES) as Locale[]) {
  if (!LOCALES.includes(locale)) LOCALES.push(locale);
}
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
    tr: word('seç|bul|dokun|dene|karşılaştır|çevir|oyna|başla|çık|ilerle|canın'),
  };

  for (const [locale, pattern] of Object.entries(informal) as [Locale, RegExp][]) {
    for (const [key, text] of Object.entries(gameStrings[locale]!)) expect(text, `${locale} ${key}`).not.toMatch(pattern);
    for (const [key, text] of Object.entries(hubStrings[locale])) expect(text, `${locale} hub ${key}`).not.toMatch(pattern);
    for (const game of GAMES) {
      for (const [key, text] of Object.entries(game.copy[locale])) expect(text, `${game.id} ${locale} ${key}`).not.toMatch(pattern);
    }
  }
});

function isInternalForceOnlyTitle(title: string) {
  return title.includes('内力图') && !title.includes(gameStrings.zh!['kind.D']);
}

it.each([
  ['选出正确的内力图', true],
  ['选出正确的内力图或变形图', false],
  ['选出正确的变形图或内力图', false],
] as const)('classifies the scope of the Chinese diagram game title %s', (title, internalForceOnly) => {
  expect(isInternalForceOnlyTitle(title)).toBe(internalForceOnly);
});

it('describes both internal forces and deflected shapes on the Chinese diagram game card', () => {
  const card = GAMES[0]!.copy.zh;
  expect(card.description).toContain('内力图');
  expect(card.description).toContain(gameStrings.zh!['kind.D']);
  expect(isInternalForceOnlyTitle(card.title)).toBe(false);
});

it('addresses the player formally in Turkish game controls', () => {
  expect({
    play: hubStrings.tr.play,
    start: gameStrings.tr!.start,
    again: gameStrings.tr!.again,
    fullscreen: gameStrings.tr!['rotate.full'],
    quit: gameStrings.tr!.quit,
  }).toEqual({
    play: 'Oynayın',
    start: 'Başlayın',
    again: 'Yeniden oynayın',
    fullscreen: 'Tam ekran oynayın',
    quit: 'Oyundan çıkın',
  });
});

it('fits the Chinese diagram game title in a search result', () => {
  const titleWidth = width(`${gameStrings.zh!.title} — Stabileo`);
  expect(titleWidth).toBeGreaterThanOrEqual(25);
  expect(titleWidth).toBeLessThanOrEqual(120);
});

it.each(['meta', 'how.1'] as const)('describes both diagram types and asks for the structure in the Chinese reverse question (%s)', key => {
  const [forward, reverse] = gameStrings.zh![key].split('，或');
  expect.soft(forward).toContain('内力图或变形图');
  expect(reverse).toContain('根据给出的图找出对应的结构');
  expect(reverse).not.toMatch(/内力图|变形图/);
});

it.each([0, 1, 2, 3])('labels %i remaining lives in French', n => {
  setPublicLocale('fr');
  expect(tg('livesLeft', { n })).toBe(`Vies restantes : ${n}`);
});

it('known wrong result: #2595 — the Italian games hub renders its own heading and diagram game card', () => {
  setPublicLocale('it');
  const body = render(GamesPage, { props: { path: '/games' } }).body;
  expect.soft(body).toMatch(/<h1[^>]*>Giochi<\/h1>/);
  expect.soft(body).toContain(gameStrings.it!.title);
  expect.soft(body).toContain('Gioca');
  expect(body).toContain('href="/it/games/diagram-game/"');
});
