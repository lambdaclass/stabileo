import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The site built under its commit (`make web.build.snapshot`, web/scripts/snapshot.ts), served by
 * `vite preview` under that prefix: the research page and the application work there and stay
 * there. Needs the build in web/dist-snapshot/.
 *
 *   make web.build.snapshot && make e2e.web.snapshot
 */
const WEB = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
/**
 * SNAPSHOT_E2E_URL + SNAPSHOT_PREFIX test a deployed host instead (Caddy's routes, staging):
 *   SNAPSHOT_E2E_URL=https://snapshots.staging.stabileo.com SNAPSHOT_PREFIX=/@abc1234/ npx playwright test -c snapshot-e2e/playwright.config.ts
 */
const REMOTE = process.env.SNAPSHOT_E2E_URL;
const prefix = REMOTE
  ? process.env.SNAPSHOT_PREFIX!
  : (JSON.parse(readFileSync(resolve(WEB, 'dist-snapshot/SNAPSHOT.json'), 'utf8')) as { prefix: string }).prefix;
if (!/^\/@[0-9a-f]{7}\/$/.test(prefix ?? '')) throw new Error(`snapshot prefix ${prefix}: expected /@<7 hex>/`);
const PORT = Number(process.env.SNAPSHOT_E2E_PORT ?? 5196);
process.env.SNAPSHOT_PREFIX = prefix;

export default defineConfig({
  testDir: '.',
  testMatch: 'snapshot.spec.ts',
  outputDir: './.artifacts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: { baseURL: REMOTE ?? `http://127.0.0.1:${PORT}`, viewport: { width: 1400, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: REMOTE ? undefined : {
    // --base from the build itself; no BASE_PATH, so the config does not re-derive the snapshot.
    command: `npx vite preview --outDir dist-snapshot --base ${prefix} --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: WEB,
    url: `http://127.0.0.1:${PORT}${prefix}SNAPSHOT.json`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
