import { compile } from 'svelte/compiler';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { accounts, setFeatureFlag } from '../features';
import { FROZEN_SERVICES_NOTICE, onlineServicesAvailable } from '../frozen-services';

afterEach(() => vi.unstubAllEnvs());

it.each(['/@abcdef0/', `/@${'a'.repeat(40)}/`])('keeps online services off in %s even with accounts enabled', (base) => {
  vi.stubEnv('BASE_URL', base);
  vi.stubGlobal('localStorage', { getItem: () => '1', setItem: () => {} });
  setFeatureFlag('accounts', true);
  expect(onlineServicesAvailable()).toBe(false);
  expect(accounts()).toBe(false);
  vi.unstubAllGlobals();
});

it('preserves live account overrides', () => {
  vi.stubEnv('BASE_URL', '/');
  vi.stubGlobal('localStorage', { getItem: () => '1' });
  expect(onlineServicesAvailable()).toBe(true);
  expect(accounts()).toBe(true);
  vi.unstubAllGlobals();
});

it('explains offline services in every public locale', () => {
  expect(Object.keys(FROZEN_SERVICES_NOTICE).sort()).toEqual(['de', 'en', 'es', 'fr', 'pt', 'tr']);
  for (const notice of Object.values(FROZEN_SERVICES_NOTICE)) expect(notice.length).toBeGreaterThan(60);
});

it('compiles the frozen explanation', () => {
  const filename = new URL('../../components/FrozenServicesNotice.svelte', import.meta.url);
  expect(() => compile(readFileSync(filename, 'utf8'), { filename: filename.pathname, generate: 'client' })).not.toThrow();
});
