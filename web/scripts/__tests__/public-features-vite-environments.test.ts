import { resolveConfig } from 'vite';
import { expect, it } from 'vitest';
import { featuresForMode } from '../../config/public-features.mjs';

it('Vite serves feature globals to the test browser and leaves them stubbable in Node', async () => {
  const { environments } = await resolveConfig({ mode: 'test', logLevel: 'silent' }, 'serve', 'test');
  expect(environments.client.define.__PUBLIC_FEATURES__).toBe(JSON.stringify(featuresForMode('test')));
  expect(environments.ssr.define.__PUBLIC_FEATURES__).toBeUndefined();
});
