import { describe, it, expect } from 'vitest';
import { shouldShowDisclaimer, acknowledgeDisclaimer, DISCLAIMER_STORAGE_KEY } from '../disclaimer';
import { LEGAL_VERSION, legalHref, TERMS_PATH } from '../legal';

function memory(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

describe('the results disclaimer', () => {
  it('shows until acknowledged for the version in force', () => {
    const store = memory();
    expect(shouldShowDisclaimer(store)).toBe(true);
    acknowledgeDisclaimer(store);
    expect(store.map.get(DISCLAIMER_STORAGE_KEY)).toBe(LEGAL_VERSION);
    expect(shouldShowDisclaimer(store)).toBe(false);
  });

  it('shows again when the legal version moves', () => {
    expect(shouldShowDisclaimer(memory({ [DISCLAIMER_STORAGE_KEY]: '2020-01-01' }))).toBe(true);
  });

  it('never shows without storage, where it would come back on every open', () => {
    expect(shouldShowDisclaimer(null)).toBe(false);
  });
});

describe('legal links', () => {
  it('carry the reader language, and fall back to English for one the site does not publish', () => {
    expect(legalHref(TERMS_PATH, 'es')).toBe('/es/terms/');
    expect(legalHref(TERMS_PATH, 'pt')).toBe('/pt/terms/');
    expect(legalHref(TERMS_PATH, 'de')).toBe('/en/terms/');
  });
});

describe('the published legal pages', () => {
  it('sit at the paths the app links to and carry the version in force', async () => {
    const { STANDING_PAGES } = await import('../../blog/pages');
    const { PRIVACY_PATH, USAGE_DATA_PATH } = await import('../legal');
    for (const path of [TERMS_PATH, PRIVACY_PATH, USAGE_DATA_PATH]) {
      const page = STANDING_PAGES.find((p) => p.path === path);
      expect(page, path).toBeTruthy();
      expect(page!.updated, path).toBe(LEGAL_VERSION);
    }
  });
});
