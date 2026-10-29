import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { RESULTS_CHANGED_IN, WHATS_NEW_STORAGE_KEY, shouldShowWhatsNew, dismissWhatsNew, releaseNotesUrl } from '../whats-new';
import { APP_VERSION } from '../../build-info';

function memoryStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

const repo = resolve(__dirname, '../../../../..');

describe("what's-new notice", () => {
  it('shows until dismissed, then stays dismissed for this release', () => {
    const s = memoryStore();
    expect(shouldShowWhatsNew(s)).toBe(true);
    dismissWhatsNew(s);
    expect(s.getItem(WHATS_NEW_STORAGE_KEY)).toBe(RESULTS_CHANGED_IN);
    expect(shouldShowWhatsNew(s)).toBe(false);
  });

  it('comes back when a later release changes results', () => {
    expect(shouldShowWhatsNew(memoryStore({ [WHATS_NEW_STORAGE_KEY]: '0.1.0' }))).toBe(true);
  });

  it('is not shown without storage (it would reappear on every open)', () => {
    expect(shouldShowWhatsNew(null)).toBe(false);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(shouldShowWhatsNew(throwing)).toBe(false);
    expect(() => dismissWhatsNew(throwing)).not.toThrow();
  });

  it('links notes that exist in the repository, in each offered language', () => {
    for (const [locale, file] of [['en', ''], ['es', '.es'], ['pt', '.pt'], ['de', '.de'], ['fr', '.fr'], ['tr', '.tr'], ['it', '']] as const) {
      const url = releaseNotesUrl(locale);
      expect(url).toBe(`https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v${RESULTS_CHANGED_IN}${file}.md`);
      expect(existsSync(resolve(repo, `docs/releases/v${RESULTS_CHANGED_IN}${file}.md`))).toBe(true);
    }
  });

  it('the app version is package.json\'s, and the notice is not for a future release', () => {
    const pkg = JSON.parse(readFileSync(resolve(repo, 'web/package.json'), 'utf8'));
    expect(APP_VERSION).toBe(pkg.version);
    const cmp = (a: string, b: string) => a.split('.').map(Number).reduce((r, x, i) => r || x - Number(b.split('.')[i]), 0);
    expect(cmp(RESULTS_CHANGED_IN, pkg.version)).toBeLessThanOrEqual(0);
  });
});
