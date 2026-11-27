import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRegistry } from '../result-changes/registry.mjs';
import globalSetup from '../../e2e/global-setup';

describe('playwright results version', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is not read when the config loads, so listing the tests needs no git history', async () => {
    vi.stubEnv('E2E_RESULTS_VERSION', undefined);
    const { default: config } = await import('../../playwright.config');
    expect(process.env.E2E_RESULTS_VERSION).toBeUndefined();
    expect(config.globalSetup).toBe('./e2e/global-setup.ts');
  });
  it.each(['production', 'test'] as const)('sets the %s build version for every worker', profile => {
    vi.stubEnv('E2E_RESULTS_VERSION', undefined);
    vi.stubEnv('E2E_PREBUILT', '0');
    vi.stubEnv('STABILEO_E2E_PROFILE', profile);
    globalSetup();
    expect(process.env.E2E_RESULTS_VERSION).toBe(String(readRegistry().currentResultsVersion));
  });
});
