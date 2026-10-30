import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXPERIMENTS } from '../experiments';
import { RESEARCH_TOOLS_PATHS } from '../../../../scripts/seo/research-tools';
import catalog from '../../../../../research/papers.json';

describe('runnable research gallery coverage', () => {
  const page = readFileSync(resolve('src/components/research/ResearchPage.svelte'), 'utf8');
  const routes = [...page.matchAll(/route === '(\/research\/[^']+)'/g)].map((m) => m[1]);
  it('gives every live research route exactly one runnable card and prerender entry', () => {
    expect(routes.length).toBeGreaterThan(0);
    const paths = EXPERIMENTS.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect([...new Set(routes)].sort()).toEqual([...paths].sort());
    const prerenderRoutes = RESEARCH_TOOLS_PATHS.filter(path => path.startsWith('/research/'));
    expect([...new Set(prerenderRoutes)].sort()).toEqual([...paths].sort());
  });
  it.each(EXPERIMENTS)('$paperId has catalogue metadata and an existing thumbnail', (e) => {
    expect(catalog.papers.filter((p) => p.id === e.paperId)).toHaveLength(1);
    expect(e.thumbnail).not.toBe('');
    expect(e.thumbnailAlt).not.toBe('');
    expect(existsSync(resolve('public', e.thumbnail))).toBe(true);
  });
});
