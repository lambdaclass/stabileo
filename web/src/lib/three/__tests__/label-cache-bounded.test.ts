/**
 * The label caches stay bounded together: a material is freed with the texture it shows, so labels
 * rebuilt on every edit do not leave one material (and its GPU texture) behind each time.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createTextSpriteCached, labelCacheSizes } from '../selection-helpers';

// A canvas that draws nothing: enough for the textures to be made outside a browser.
const ctx = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 64, height: 32, getContext: () => ctx }) }));
afterAll(() => vi.unstubAllGlobals());

describe('cached label sprites', () => {
  it('free a material with its texture when the cache evicts', () => {
    for (let i = 0; i < 4096 + 300; i++) createTextSpriteCached(`n${i}`, '#ffffff', 36, i % 2 === 0);
    const { textures, materials } = labelCacheSizes();
    expect(textures).toBeLessThanOrEqual(4096);
    expect(materials).toBeLessThanOrEqual(textures);
  });
});
