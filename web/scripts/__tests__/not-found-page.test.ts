import { describe, it, expect } from 'vitest';
import { notFoundPage } from '../not-found-page';
import { PUBLIC_LOCALES } from '../../src/lib/i18n/offered';

describe('notFoundPage', () => {
  it.each(PUBLIC_LOCALES)('%s is noindexed, in its language, and links to the public sections', (locale) => {
    const html = notFoundPage(locale, PUBLIC_LOCALES);
    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain('<meta name="robots" content="noindex">');
    for (const section of ['', 'research/', 'tools/', 'blog/']) {
      expect(html).toContain(`href="/${locale}/${section}"`);
    }
    for (const other of PUBLIC_LOCALES.filter((l) => l !== locale)) {
      expect(html).toContain(`href="/${other}/" hreflang="${other}"`);
    }
  });

  it('is served at any depth, so it references nothing by a relative URL', () => {
    for (const locale of PUBLIC_LOCALES) {
      const refs = [...notFoundPage(locale, PUBLIC_LOCALES).matchAll(/(?:href|src)="([^"]*)"|url\('([^']*)'\)/g)]
        .map((m) => m[1] ?? m[2]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(ref.startsWith('/')).toBe(true);
    }
  });

  it('says it in each language rather than in English everywhere', () => {
    const titles = PUBLIC_LOCALES.map((l) => notFoundPage(l, PUBLIC_LOCALES).match(/<title>([^<]*)<\/title>/)![1]);
    expect(new Set(titles).size).toBe(PUBLIC_LOCALES.length);
  });
});
