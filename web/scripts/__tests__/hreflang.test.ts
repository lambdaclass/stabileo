import { describe, expect, it } from 'vitest';
import { declaredLocales } from '../hreflang';

describe('declaredLocales', () => {
  it('reads the hreflang set a page declares, without x-default, in the given order', () => {
    const head = '<link rel="canonical" href="https://stabileo.com/en/research/"><link rel="alternate" hreflang="pt" href="a"><link rel="alternate" hreflang="en" href="b"><link hreflang="x-default" rel="alternate" href="c"><link rel="alternate" type="application/rss+xml" href="d">';
    expect(declaredLocales(head, ['en', 'es', 'pt', 'de', 'fr', 'tr'])).toEqual(['en', 'pt']);
  });
  it('declares nothing when the page has no hreflang set', () => {
    expect(declaredLocales('<title>x</title>', ['en', 'es'])).toEqual([]);
  });
});
