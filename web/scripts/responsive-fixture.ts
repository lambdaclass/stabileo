import { createServer } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function createResponsiveFixtureRenderer() {
  const binary = process.env.CHROMIUM_PATH ?? [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ].find(existsSync);
  if (!binary) throw new Error('Set CHROMIUM_PATH to a Chromium executable for rendered checks');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls!.local[0]!;
  return {
    async render(fixture: string, width: number): Promise<string> {
      const profile = mkdtempSync(join(tmpdir(), 'stabileo-layout-'));
      try {
        const { stdout } = await promisify(execFile)(binary, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--window-size=${Math.max(width, 900)},1100`, '--force-device-scale-factor=1', '--virtual-time-budget=10000', '--dump-dom', `${url}scripts/fixtures/${fixture}.html?width=${width}`], { timeout: 45_000, maxBuffer: 5_000_000 });
        return stdout;
      } finally {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    },
    close: () => server.close(),
  };
}
