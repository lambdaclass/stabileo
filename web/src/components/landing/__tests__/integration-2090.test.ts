import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { ensurePublicLocale, i18n } from '../../../lib/i18n/store.svelte';
import en from '../../../lib/i18n/locales/en';
import hu from '../../../lib/i18n/locales/hu';
import Truss from '../TrussFigure.svelte';
import Topopt from '../hero/TopoptFigure.svelte';
import { HeroLoop } from '../hero/loop.svelte';
import { FRAME_ITERATION, FRAME_COMPLIANCE } from '../hero/topopt-data';

const dictionaries = import.meta.glob('../../../lib/i18n/locales/{en,es,pt,de,fr,tr,hu}.ts', {
  eager: true,
  import: 'default',
}) as Record<string, Record<string, string>>;

function dictionary(locale: string) {
  return dictionaries[`../../../lib/i18n/locales/${locale}.ts`];
}

function topologyAt(seconds: number) {
  vi.spyOn(HeroLoop.prototype, 'seconds', 'get').mockReturnValue(seconds);
  const html = render(Topopt).body;
  const caption = html.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)![1];
  const curve = html.match(/<polyline(?=[^>]*class="to-curve[ "])[^>]*points="([^"]+)"/)![1].split(' ');
  const [, x, y] = html.match(/<circle(?=[^>]*class="to-dot[ "])(?=[^>]*cx="([^"]+)")(?=[^>]*cy="([^"]+)")/)!;
  return {
    point: [x, y].map((coordinate) => Number(coordinate).toFixed(1)).join(','),
    curve,
    iteration: Number(caption.match(/<b>(\d+) \/ \d+<\/b>/)![1]),
    share: Number(caption.match(/<b>(\d+) % of the initial<\/b>/)![1]),
    cells: [...html.matchAll(/<path d="([^"]+)" class="to-cell/g)].map(([, path]) => path),
  };
}

function expectSavedNumbers(state: ReturnType<typeof topologyAt>, index: number) {
  expect(state.iteration).toBe(FRAME_ITERATION[index]);
  expect(state.point).toBe(state.curve[index]);
  expect(state.share).toBe(Math.round(100 * FRAME_COMPLIANCE[index]! / FRAME_COMPLIANCE[0]!));
}

afterEach(() => {
  vi.restoreAllMocks();
  i18n.locale = 'en';
});

it('#2090 the topology caption and density select the same saved frame', () => {
  i18n.locale = 'en';
  const initial = topologyAt(0);
  const firstTransitionBefore = topologyAt(0.19);
  const firstTransitionAfter = topologyAt(0.20);
  const second = topologyAt(0.38);
  const final = topologyAt(10);
  expect(initial.cells.length).toBeGreaterThan(0);
  expectSavedNumbers(initial, 0);
  expectSavedNumbers(topologyAt(0.05), 0);
  expectSavedNumbers(firstTransitionBefore, 0);
  expect(firstTransitionBefore.cells).toEqual(initial.cells);
  expectSavedNumbers(firstTransitionAfter, 1);
  expectSavedNumbers(second, 1);
  expect(firstTransitionAfter.cells).toEqual(second.cells);
  expect(second.cells).not.toEqual(initial.cells);
  expectSavedNumbers(final, FRAME_ITERATION.length - 1);
  expect(topologyAt(12)).toEqual(final);
});

it('#2090 the truss visibly identifies normalized deformation and near-zero members', async () => {
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
    await ensurePublicLocale(locale);
    i18n.locale = locale;
    const { body } = render(Truss, { props: { prefersReducedMotion: true } });
    const caption = body.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)![1];
    const labels = dictionary(locale);
    for (const key of ['landing.figDeformedNorm', 'landing.figZero']) {
      expect(labels[key], `${locale}: ${key}`).toBeTruthy();
      expect(caption).toContain(labels[key]);
    }
  }
});

it('#2090 section descriptions distinguish the fixed kern from load-dependent quantities', () => {
  const fixed = { en: /fixed/, es: /fijo/, pt: /fixo/, de: /fest/, fr: /fixe/, tr: /sabit/, hu: /állandó/ };
  for (const [locale, word] of Object.entries(fixed)) {
    expect.soft(dictionary(locale)['landing.secDesc'], locale).toMatch(word);
  }
});

it('#2090 Hungarian has its own translations for the hero labels', () => {
  const heroKeys = Object.keys(en).filter((key) => /^landing\.(heroFig|bld|shed|truss|sec|mohrFig|mohrTag|top(?:Title|Desc|Tag|Iteration|Compliance|Share)|mod(?:Title|Desc|Tag|Mode))/.test(key));
  expect(heroKeys).toContain('landing.modMode');
  expect(heroKeys.filter((key) => !hu[key] || hu[key] === en[key])).toEqual([]);
});

it('#2090 the changelog describes idle preloading and the data-saver exception', () => {
  const changelog = readFileSync(new URL('../../../../../CHANGELOG.md', import.meta.url), 'utf8');
  const entry = changelog.split(/^#{1,4} /m).find((section) =>
    section.startsWith('Animated structural figures on the landing page ('),
  );
  expect(entry).toMatch(/preload during idle time when data saving is off/);
});
