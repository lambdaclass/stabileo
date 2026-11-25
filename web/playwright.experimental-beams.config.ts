import { defineConfig } from '@playwright/test';

// Independent checkouts on a shared runner must not compete for a fixed port.
const hash = [...import.meta.url].reduce((n, c) => (31 * n + c.charCodeAt(0)) >>> 0, 0);
const port = 7200 + hash % 1000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './experimental-beams-tests',
  testMatch: '**/*.browser.ts',
  workers: 1,
  timeout: 30_000,
  use: { baseURL, browserName: 'chromium' },
  webServer: {
    command: `npx vite build --config vite.experimental-beams.config.ts && npx vite preview --config vite.experimental-beams.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/experimental-beams.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
