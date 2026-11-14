import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { blogTranslations } from '../../../../scripts/blog-translations';
import { writtenIn } from '../../../../scripts/public-paths';
import { STANDING_PAGES } from '../../blog/pages';
import { addTranslations, inLocale, type Localized } from '../../blog/types';
import { PUBLIC_LOCALES } from '../offered';
import { publishedLocale, publishedLocales } from '../published';
import { alternateUrls, publicHref } from '../public-routes';

const webRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const additionalLocales = ['de', 'fr', 'tr', 'hu'] as const;
const item = () => ({ slug: 'a-post', i18n: { en: { title: 'en' }, es: { title: 'es' }, pt: { title: 'pt' } } as Localized<{ title: string }> });

describe('blog publication sources', () => {
  it.skip.each(['/terms', '/privacy', '/usage-data'])('known wrong result: #2081 publishes the existing Hungarian body of %s', (path) => {
    const page = STANDING_PAGES.find((page) => page.path === path)!;
    expect(page.i18n.hu).toBeDefined();
    expect(blogTranslations(webRoot)).toContain(`hu/page-${path.slice(1)}`);
    expect(writtenIn(path)).toEqual([...PUBLIC_LOCALES]);
    expect(publishedLocales(path)).toEqual([...PUBLIC_LOCALES]);
    expect(publishedLocale(path, 'hu')).toBe('hu');
    expect(publicHref(path, publishedLocale(path, 'hu'))).toBe(`/hu${path}/`);
    expect(alternateUrls(path, publishedLocales(path))).toContainEqual({ hreflang: 'hu', href: `https://stabileo.com/hu${path}/` });
    expect(inLocale(page.i18n, 'hu')).toBe(page.i18n.hu);
    expect(inLocale(page.i18n, 'hu')).not.toBe(page.i18n.en);
  });

  it.skip.each(additionalLocales)('known wrong result: #2081 refuses an inline %s body invisible to the publication manifest', (locale) => {
    const post = item();
    post.i18n[locale] = { title: locale };
    expect(() => addTranslations([post], (post) => post.slug, {})).toThrow(`inline blog translation must be a file: ${locale}/a-post`);
  });

  it.each(additionalLocales)('publishes a %s translation supplied through a file and retains the base body', (locale) => {
    const post = item();
    const english = post.i18n.en;
    const translated = { title: locale };
    addTranslations([post], (post) => post.slug, { [`./translations/${locale}/a-post.ts`]: translated });
    expect(inLocale(post.i18n, locale)).toBe(translated);
    expect(inLocale(post.i18n, 'en')).toBe(english);
  });

  it('keeps English fallback for a page with no Hungarian source', () => {
    expect(writtenIn('/paper')).toEqual(['en', 'es', 'pt']);
    expect(publishedLocale('/paper', 'hu')).toBe('en');
    expect(publicHref('/paper', publishedLocale('/paper', 'hu'))).toBe('/en/paper/');
    expect(alternateUrls('/paper', publishedLocales('/paper')).map(({ hreflang }) => hreflang)).toEqual(['en', 'es', 'pt', 'x-default']);
    const post = item();
    addTranslations([post], (post) => post.slug, {});
    expect(inLocale(post.i18n, 'hu')).toBe(post.i18n.en);
  });
});
