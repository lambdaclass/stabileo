import { afterEach, expect, it, vi } from 'vitest';
import { generateShareURL, generateEmbedURL } from '../url-sharing';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';

afterEach(() => { modelStore.clear(); uiStore.analysisMode = '2d'; vi.unstubAllGlobals(); });

it.each(['2d', 'pro'] as const)('shares and embeds %s models at their snapshot address', mode => {
  vi.stubGlobal('location', { origin: 'https://stabileo.com', pathname: '/@abcdef0/app/basic' });
  modelStore.addNode(0, 0);
  modelStore.addNode(4, 0);
  uiStore.analysisMode = mode;
  expect(generateShareURL()?.url).toMatch(/^https:\/\/stabileo\.com\/@abcdef0\/app\/basic#(data|code)=/);
  expect(generateEmbedURL()?.url).toMatch(/^https:\/\/stabileo\.com\/@abcdef0\/app\/basic#embed=/);
});

it('share addresses read globalThis.location, which a snapshot build does not rewrite to the unprefixed address', async () => {
  const { readFileSync } = await import('node:fs');
  const { pageAddress } = await import('../url-sharing');
  vi.stubGlobal('location', { origin: 'https://stabileo.com', pathname: '/@abcdef0/app/pro' });
  expect(pageAddress()).toBe('https://stabileo.com/@abcdef0/app/pro');
  for (const file of ['../url-sharing.ts', '../../../components/pro/ProProjectTab.svelte', '../../../components/edu/ExerciseAuthor.svelte']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(source, file).not.toMatch(/(?<!globalThis\.)\blocation\.origin\s*\+\s*location\.pathname|\$\{location\.origin\}\$\{location\.pathname\}/);
  }
});
