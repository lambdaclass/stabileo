import { describe, expect, it } from 'vitest';
import { readRegistry } from '../result-changes/registry.mjs';
import globalSetup from '../../e2e/global-setup';

describe('playwright results version', () => {
  it('is not read when the config loads, so listing the tests needs no git history', async () => {
    delete process.env.E2E_RESULTS_VERSION;
    const { default: config } = await import('../../playwright.config');
    expect(process.env.E2E_RESULTS_VERSION).toBeUndefined();
    expect(config.globalSetup).toBe('./e2e/global-setup.ts');
  });
  it('is read once in the global setup, for every worker to take from the environment', () => {
    delete process.env.E2E_RESULTS_VERSION;
    globalSetup();
    expect(process.env.E2E_RESULTS_VERSION).toBe(String(readRegistry().currentResultsVersion));
  });
});
