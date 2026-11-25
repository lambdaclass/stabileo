import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './experimental-beams-tests',
  testMatch: '**/*.browser.ts',
  workers: 1,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5186', browserName: 'chromium' },
  webServer: {
    command: 'npx vite build --config vite.experimental-beams.config.ts && npx vite preview --config vite.experimental-beams.config.ts --host 127.0.0.1 --port 5186 --strictPort',
    url: 'http://127.0.0.1:5186/experimental-beams.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
