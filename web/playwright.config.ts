import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration (PR15).
 *
 * Design decisions and why:
 *  - PRODUCTION PREVIEW, not the dev server. `vite preview` serves the real build, so
 *    there is no HMR race and no on-demand transform latency, and the artifact under
 *    test is the one users get.
 *  - 127.0.0.1, not localhost — avoids IPv4/IPv6 resolution races.
 *  - Port 4173, isolated from dev (4000) and the other app on this machine (3000).
 *    `--strictPort` makes a collision a loud failure instead of a silent reassignment.
 *  - workers: 1. There is exactly one WebGL context and one WASM solver instance per
 *    page; serialising keeps timing and GPU behaviour deterministic.
 *  - SwiftShader software GL so rendering is identical on a laptop and on a CI runner.
 *  - Chromium only for the first landing (it is the only browser cached locally and
 *    the least fragile for Three.js/WebGL). Firefox/WebKit are a follow-up.
 *
 * Local commands:
 *   npm run test:e2e:install     # one-time: fetch the Chromium build
 *   npm run test:e2e:smoke       # blocking suite (fast, runs on every PR)
 *   npm run test:e2e:slow        # heavy suite (408-member model, screenshots)
 *   npm run test:e2e:ui          # interactive runner
 *   npm run test:e2e:update-snapshots
 */

const HOST = '127.0.0.1';
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // One retry in CI so a genuine flake is visible in the report rather than silently
  // re-run many times. A test that only passes on retry is treated as a bug.
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Only two screenshot comparisons exist; keep the tolerance small but non-zero
    // for font/AA differences between platforms.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: './e2e/.report', open: 'never' }], ['json', { outputFile: './e2e/.artifacts/results.json' }]]
    : [['list'], ['html', { outputFolder: './e2e/.report', open: 'on-failure' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    timezoneId: 'UTC',
    locale: 'en-US',
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-gpu-sandbox',
        '--force-device-scale-factor=1',
        '--force-color-profile=srgb',
        '--disable-lcd-text',
        '--hide-scrollbars',
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // VITE_E2E=1 is what compiles the read-only test hooks into the bundle. A normal
    // `npm run build` omits them entirely, so a production artifact can never expose
    // `window.__stabileo` — proved by src/lib/utils/__tests__/e2e-hook-gating.test.ts.
    command: `VITE_E2E=1 npm run build && npx vite preview --port ${PORT} --host ${HOST} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
