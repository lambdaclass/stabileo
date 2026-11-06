import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PRO_VIDEOS, publishedVideos, videoUrl, videosOffered, markVideosOffered, type ProVideo } from '../videos';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';

const v = (youtube: ProVideo['youtube']): ProVideo => ({ id: 'building', titleKey: 't', descKey: 'd', minutes: 4, youtube });

describe("PRO's videos", () => {
  it('opens the Spanish version for the Spanish interface, and the English one otherwise', () => {
    expect(videoUrl(v({ en: 'EN1', es: 'ES1' }), 'es')).toBe('https://www.youtube.com/watch?v=ES1');
    expect(videoUrl(v({ en: 'EN1', es: 'ES1' }), 'pt')).toBe('https://www.youtube.com/watch?v=EN1');
    expect(videoUrl(v({ en: 'EN1' }), 'es')).toBe('https://www.youtube.com/watch?v=EN1');
  });

  it('recommends only what is published', () => {
    expect(publishedVideos('en', [v({}), v({ en: 'x' })])).toHaveLength(1);
    expect(publishedVideos('en', [v({})])).toEqual([]);
  });

  it('names every video in the six languages', async () => {
    for (const lang of ['es', 'en', 'pt', 'de', 'fr', 'tr']) {
      const d = (await import(`../../i18n/locales/${lang}.ts`)).default as Record<string, string>;
      for (const x of PRO_VIDEOS) for (const k of [x.titleKey, x.descKey]) expect(d[k], `${lang}: ${k}`).toBeTruthy();
    }
    expect((es as Record<string, string>)['videos.button']).toBeTruthy();
    expect((en as Record<string, string>)['videos.button']).toBeTruthy();
  });

  describe('the first-time recommendation', () => {
    const mem = new Map<string, string>();
    beforeAll(() => { vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, val: string) => void mem.set(k, val) }); });
    afterAll(() => { vi.unstubAllGlobals(); });
    it('is shown once per browser', () => {
      expect(videosOffered()).toBe(false);
      markVideosOffered();
      expect(videosOffered()).toBe(true);
    });
  });
});
