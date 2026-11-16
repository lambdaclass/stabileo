import { defineConfig, devices } from '@playwright/test';

/**
 * Cross-runtime determinism of the WASM engine (determinism.spec.ts): the same cases in
 * Chromium, Firefox and WebKit, each compared bit for bit with Node. A static server only
 * (serve.mjs), no app build. Needs the WASM build in src/lib/wasm.
 */
const PORT = Number(process.env.DETERMINISM_PORT ?? 5195);

export default defineConfig({
  testDir: '.',
  testMatch: ['determinism.spec.ts', 'gravity-density.spec.ts'],
  outputDir: './.artifacts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // The command runs in this directory.
    command: `node serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/determinism/cases.mjs`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
