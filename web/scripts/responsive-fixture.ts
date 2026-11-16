import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

export async function createResponsiveFixtureRenderer() {
  const binary = process.env.CHROMIUM_PATH ?? [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ].find(existsSync);
  if (!binary) throw new Error('Set CHROMIUM_PATH to a Chromium executable for rendered checks');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  try {
    const browser = await chromium.launch({ executablePath: binary, headless: true });
    const url = server.resolvedUrls!.local[0]!;
    return {
      async render(fixture: string, width: number): Promise<string> {
        const started = performance.now();
        const page = await browser.newPage({ viewport: { width: Math.max(width, 900), height: 1100 }, deviceScaleFactor: 1 });
        const errors: string[] = [];
        const scriptError = new Promise<never>((_, reject) => {
          page.on('pageerror', error => { errors.push(error.message); reject(error); });
        });
        try {
          await Promise.race([
            (async () => {
              await page.goto(`${url}scripts/fixtures/${fixture}.html?width=${width}`, { timeout: Math.max(1, 45_000 - (performance.now() - started)) });
              await page.waitForFunction(() => !!document.getElementById('checks')?.textContent?.trim(), undefined, { timeout: Math.max(1, 45_000 - (performance.now() - started)) });
            })(),
            scriptError,
          ]);
          if (errors.length) throw new Error(errors.join('\n'));
          return await page.content();
        } catch (cause) {
          throw new Error(`Responsive fixture ${fixture} at ${width}px failed: ${errors.join('\n')}\n${await page.content().catch(() => '')}`, { cause });
        } finally {
          await page.context().close();
        }
      },
      async close() {
        try { await browser.close(); } finally { await server.close(); }
      },
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}
