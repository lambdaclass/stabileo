import { afterEach, expect, it, vi } from 'vitest';
import { applyPageMeta, restorePageMeta } from '../../../lib/page-meta';
import { configs } from '../../../../scripts/research-preview-utils';

afterEach(() => vi.unstubAllGlobals());

it('sets absolute research image URLs and a large Twitter card, then restores metadata', () => {
  const tags = new Map<string, Map<string, string>>();
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[name="twitter:card"]']) {
    tags.set(selector, new Map([['content', 'original']]));
  }
  vi.stubGlobal('document', {
    title: 'Site', documentElement: { lang: 'en' }, head: { lastElementChild: null },
    querySelectorAll: () => [],
    querySelector: (selector: string) => {
      const attrs = tags.get(selector);
      return attrs ? { getAttribute: (k: string) => attrs.get(k) ?? null, setAttribute: (k: string, v: string) => attrs.set(k, v) } : null;
    },
  });
  const image = `https://stabileo.com${configs[0].path}/preview.png`;
  applyPageMeta({ title: 'Experiment', description: 'Description', locale: 'en', path: configs[0].path, image });
  expect(tags.get('meta[property="og:image"]')?.get('content')).toBe(image);
  expect(tags.get('meta[name="twitter:image"]')?.get('content')).toBe(image);
  expect(tags.get('meta[name="twitter:card"]')?.get('content')).toBe('summary_large_image');
  restorePageMeta();
  expect(tags.get('meta[property="og:image"]')?.get('content')).toBe('original');
  expect(tags.get('meta[name="twitter:card"]')?.get('content')).toBe('original');
});
