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
  await render(820).catch(() => undefined);
}, 120_000);
afterAll(async () => { await server?.close(); });
async function render(width: number): Promise<string> {
  const profile = mkdtempSync(join(tmpdir(), 'stabileo-layout-'));
  try {
    const { stdout } = await promisify(execFile)(binary!, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--window-size=${Math.max(width, 900)},1100`, '--force-device-scale-factor=1', '--virtual-time-budget=10000', '--dump-dom', `${url}scripts/fixtures/nm-pairing-responsive.html?width=${width}`], { timeout: 45_000, maxBuffer: 5_000_000 });
    return stdout;
  } finally { rmSync(profile, { recursive: true, force: true }); }
}
it.each([390, 820])('the RC-NM-PAIRING explanation is shown, readable and inside the viewport at %ipx', async width => {
  const stdout = await render(width);
  const raw = stdout.match(/<pre id="checks">(.*?)<\/pre>/s)?.[1];
  expect(raw, stdout.slice(-3000)).toBeTruthy();
  const [check] = JSON.parse(raw!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  expect(check.width).toBe(width);
  expect(check.shown).toBe(true);
  expect(check.text).toContain('(#1316)');
  expect(check.text).not.toContain('knownIssue.');
  expect(check.text).toContain('1.2D+1.6L');
  expect(check.smallText).toEqual([]);
  expect(check.outside).toEqual([]);
  expect(check.scrollWidth).toBeLessThanOrEqual(width);
}, 60_000);
