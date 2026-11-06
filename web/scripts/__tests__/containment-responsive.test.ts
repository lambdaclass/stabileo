/** Real Chromium layout, with no Playwright dependency or runner. */
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let server: ViteDevServer;
let url: string;
const binary = process.env.CHROMIUM_PATH ?? [
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
].find(existsSync);
beforeAll(async () => {
  if (!binary) throw new Error('Set CHROMIUM_PATH to a Chromium executable for rendered checks');
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen(); url = server.resolvedUrls!.local[0]!;
  await render(810).catch(() => undefined);
}, 120_000);
afterAll(async () => { await server?.close(); });
async function render(width: number): Promise<string> {
  const profile = mkdtempSync(join(tmpdir(), 'stabileo-layout-'));
  try {
    const run = promisify(execFile)(binary!, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--window-size=${Math.max(width, 900)},1100`, '--force-device-scale-factor=1', '--virtual-time-budget=10000', '--dump-dom', `${url}scripts/fixtures/containment-responsive.html?width=${width}`], { timeout: 45_000, maxBuffer: 5_000_000 });
    const { stdout } = await run;
    if (run.child.killed) throw new Error(`Chromium did not finish the ${width}px page within 45 s`);
    return stdout;
  } finally { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
}
it.each([390, 810])('child panels and QuantityInput render accessibly at %ipx', async width => {
  const stdout = await render(width);
  const raw = stdout.match(/<pre id="checks">(.*?)<\/pre>/s)?.[1];
  expect(raw, stdout.slice(-3000)).toBeTruthy();
  const checks = JSON.parse(raw!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  expect(checks).toHaveLength(2);
  for (const check of checks) {
    expect(check.width).toBe(width);
    expect(check.smallText, check.id).toEqual([]);
    expect(check.smallTargets, check.id).toEqual([]);
    expect(check.outside, check.id).toEqual([]);
    expect(check.runAccessible, check.id).toBe(true);
    expect(check.controls).toBeGreaterThan(3);
  }
}, 60_000);
