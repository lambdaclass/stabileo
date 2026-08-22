import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Playwright configuration (PR15).
 *
 * Design decisions and why:
 *  - PRODUCTION PREVIEW, not the dev server. `vite preview` serves the real build, so
 *    there is no HMR race and no on-demand transform latency, and the artifact under
 *    test is the one users get.
 *  - 127.0.0.1, not localhost — avoids IPv4/IPv6 resolution races.
 *  - A per-worktree derived port (see `worktreePort` below), isolated from dev
 *    (4000) and the other app on this machine (3000).
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
/*
 * A port of this worktree's own, derived from its path.
 *
 * 4173 is Vite's default preview port, so every worktree of this repo claims
 * it, and with `reuseExistingServer` on locally a run silently attaches to
 * whichever one got there first. It then tests a DIFFERENT BRANCH'S BUILD and
 * reports the differences as failures in yours — a ribbon missing the commands
 * your branch added reads as "the feature is broken", not as "wrong bundle".
 * The failure is entirely convincing, which is what makes it expensive: it has
 * cost this project an afternoon of chasing defects that were not there.
 *
 * A comment saying "set E2E_PORT" was here before and did not prevent it,
 * because the person who needs the warning is the one who does not know yet
 * that they are on a shared port. So the default no longer collides: it is
 * derived from the worktree's own directory, which is different for every
 * checkout by construction. E2E_PORT still overrides, for CI or for pinning.
 */
function worktreePort(): number {
  let h = 0;
  /*
   * Hash THIS FILE'S directory, not process.cwd(): the port must be a property
   * of the worktree, stable no matter which directory the run is invoked from,
   * and the config file always sits at <worktree>/web/playwright.config.ts.
   * (`import.meta.url` rather than `__dirname` — the config loads as ESM.)
   */
  const configDir = fileURLToPath(new URL('.', import.meta.url));
  for (const ch of configDir) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  /*
   * 1000 slots in 5200–6199: the repo keeps 60+ worktrees, so 200 slots
   * collided in practice. The band stays clear of everything this project
   * binds by hand — dev on 4000, Vite's default preview on 4173 — and of the
   * ephemeral range up at 49152+.
   */
  return 5200 + (h % 1000);
}

const PORT = Number(process.env.E2E_PORT ?? worktreePort());
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
    /*
     * An explicit E2E_PORT means "give me my own server", so reuse is off for
     * it. Reuse plus a fixed port is what let a run attach to whatever was
     * already listening — first another worktree's preview, then a leftover of
     * an earlier run of this one — and in both cases the tests exercised a
     * build that was never asked for VITE_E2E=1, so every PRO fixture timed out
     * waiting for hooks that bundle does not contain.
     */
    reuseExistingServer: !process.env.CI && !process.env.E2E_PORT,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
