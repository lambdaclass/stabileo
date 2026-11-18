import { PUBLIC_LOCALES, type Locale } from '../../i18n/offered';
import { describe, expect, it } from 'vitest';
import { POSTS } from '..';


function checkMetadata(locale: Locale) {
  expect(PUBLIC_LOCALES).toContain(locale);
  const lengths = POSTS.map((post) => {
    const body = post.i18n[locale];
    expect(body, `${locale}/${post.slug}: missing translation`).toBeDefined();
    return { url: `/${locale}/blog/${post.slug}/`, title: `${body!.title} — Stabileo`.length, description: body!.excerpt.length };
  });
  expect(lengths.length).toBeGreaterThan(0);
  expect(lengths.filter(({ title, description }) => title < 25 || title > 120 || description < 90 || description > 300)).toEqual([]);
}

describe('search metadata for every German, French, Turkish and Hungarian blog post', () => {
  it.each(['de', 'fr', 'tr', 'hu'] as const)('%s fits the published URL title and description limits', checkMetadata);
});
