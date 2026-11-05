import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXPERIMENTS } from '../experiments';
import { RESEARCH_PAPER_PATHS } from '../locales';
import { publicPaths } from '../../../../scripts/public-paths';
import catalog from '../../../../../research/papers.json';

describe('runnable research gallery coverage', () => {
  const page = readFileSync(resolve('src/components/research/load-detail.ts'), 'utf8');
  const routes = [...page.matchAll(/'(\/research\/[^']+)':/g)].map((m) => m[1]);
  it('gives every live research route exactly one runnable card and prerender entry', async () => {
    expect(routes.length).toBeGreaterThan(0);
    const paths = EXPERIMENTS.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect([...new Set(routes)].sort()).toEqual([...paths].sort());
    expect(RESEARCH_PAPER_PATHS).toEqual(paths);
    const prerendered = (await publicPaths()).filter((p) => p.startsWith('/research'));
    expect(prerendered.sort()).toEqual(['/research', ...paths].sort());
  });
  it.each(EXPERIMENTS)('$paperId has catalogue metadata and an existing thumbnail', (e) => {
    expect(catalog.papers.filter((p) => p.id === e.paperId)).toHaveLength(1);
    expect(e.thumbnail).not.toBe('');
    expect(e.thumbnailAlt).not.toBe('');
    expect(existsSync(resolve('public', e.thumbnail))).toBe(true);
  });
});
