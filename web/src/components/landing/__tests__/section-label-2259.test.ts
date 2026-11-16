import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SectionFigure from '../hero/SectionFigure.svelte';
import { ensurePublicLocale, i18n } from '../../../lib/i18n/store.svelte';

afterEach(() => { i18n.locale = 'en'; });

it('known wrong result: #2259 the section kern annotation uses the selected language', async () => {
  await ensurePublicLocale('de');
  i18n.locale = 'de';
  const german = render(SectionFigure, { props: { prefersReducedMotion: true } }).body;
  expect(german).toMatch(/<text[^>]*class="sa-tag-nc[^"]*"[^>]*>Kern<\/text>/);
  i18n.locale = 'en';
  const english = render(SectionFigure, { props: { prefersReducedMotion: true } }).body;
  expect(english).toMatch(/<text[^>]*class="sa-tag-nc[^"]*"[^>]*>K<\/text>/);
});
