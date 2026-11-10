import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const detailStrings = '../feher2026/strings';
afterEach(() => vi.doUnmock(detailStrings));

it.skip('known wrong result: #1885: the gallery renders without loading the bent-strip article dictionaries', async () => {
  vi.doMock(detailStrings, () => {
    throw new Error('The gallery loaded the bent-strip article dictionaries');
  });
  const { default: Gallery } = await import('../Gallery.svelte');
  expect(render(Gallery).body).toContain('Steering a bent strip between two shapes');
});
