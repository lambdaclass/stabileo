import { defineConfig } from 'vitest/config';

// Source-only guards: no browser, application bootstrap or WASM build required.
export default defineConfig({
  test: { include: ['scripts/__tests__/e2e-policy.test.ts'], environment: 'node' },
});
