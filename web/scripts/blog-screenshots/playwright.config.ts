import base from '../../playwright.config';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'capture.spec.ts',
  outputDir: `${WEB}e2e/.artifacts/blog-screenshots`,
  reporter: [['list']],
  retries: 0,
  timeout: 180_000,
  use: { ...base.use, viewport: { width: 1200, height: 750 }, deviceScaleFactor: 2 },
  webServer: base.webServer && !Array.isArray(base.webServer) ? { ...base.webServer, cwd: WEB } : base.webServer,
});
