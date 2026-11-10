import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const detailStrings = '../feher2026/strings';
afterEach(() => {
  vi.doUnmock(detailStrings);
  vi.doUnmock('../summaries');
});

it.skip('known wrong result: #1886: the gallery renders without loading the Fehér article dictionaries', async () => {
  vi.doMock(detailStrings, () => {
    throw new Error('The gallery loaded the Fehér article dictionaries');
  });
  vi.doMock('../summaries', () => {
    throw new Error('The gallery loaded summaries for runnable papers');
  });
  const { default: Gallery } = await import('../Gallery.svelte');
  expect(render(Gallery).body).toContain('Steering a bent strip between two shapes');
});
