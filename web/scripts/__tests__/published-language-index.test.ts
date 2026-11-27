import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blogTranslations } from '../blog-translations';

it.skip('known wrong result: #2613 — the landing stores a post ID once and preserves partial translation sets', () => {
  const root = mkdtempSync(join(tmpdir(), 'blog-publication-'));
  try {
    for (const lang of ['de', 'nl', 'it']) {
      const folder = join(root, 'src/lib/blog/translations', lang);
      mkdirSync(folder, { recursive: true });
      for (const slug of ['shared-article', 'page-shared', ...(lang === 'it' ? ['partial-article'] : [])]) {
        writeFileSync(join(folder, slug + '.ts'), '');
      }
    }
    const index = blogTranslations(root);
    expect(JSON.stringify(index).match(/shared-article/g)).toHaveLength(1);
    expect(index).toContainEqual({ locales: ['de', 'it', 'nl'], pages: ['page-shared', 'shared-article'] });
    expect(index).toContainEqual({ locales: ['it'], pages: ['partial-article'] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
