import { describe, expect, it } from 'vitest';
import { readRegistry } from '../result-changes/registry.mjs';

describe('playwright config', () => {
  it('reads the results version once, for every worker to take from the environment', async () => {
    delete process.env.E2E_RESULTS_VERSION;
    await import('../../playwright.config');
    expect(process.env.E2E_RESULTS_VERSION).toBe(String(readRegistry().currentResultsVersion));
  });
});
