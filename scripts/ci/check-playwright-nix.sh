#!/usr/bin/env bash
# Linux host preflight: no app/WASM build or root privileges needed.
set -euo pipefail
if [[ $(uname -s) != Linux ]]; then
  echo 'Run this check on the Linux CI host, not macOS.' >&2
  exit 1
fi
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
nix develop .#e2e -c make web.deps NIX_RUN=
# List the real suite without starting its web server or requiring a prebuilt site.
nix develop .#e2e -c bash -c 'cd web && unset E2E_PREBUILT && npx playwright test --list'
# Keep the temporary config beneath web so @playwright/test resolves from web/node_modules.
smoke_dir=$(mktemp -d "$root/web/.nix-smoke.XXXXXX")
trap 'rm -rf "$smoke_dir"' EXIT
cat > "$smoke_dir/playwright.config.ts" <<'CONFIG'
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'smoke.spec.ts',
  reporter: 'list',
  workers: 1,
  retries: 0,
  use: { video: 'on' }, // Also exercise the packaged ffmpeg.
  // WebKit from nix does not start on Linux; Determinism (the only WebKit job) stays on GitHub.
  projects: ['chromium', 'firefox'].map(browserName => ({
    name: browserName, use: { browserName: browserName as 'chromium' | 'firefox' | 'webkit' },
  })),
});
CONFIG
cat > "$smoke_dir/smoke.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
test('Nix browser revisions, launch, rendering and WASM', async ({ page, browserName }) => {
  const { browsers } = JSON.parse(readFileSync(join(dirname(require.resolve('playwright-core/package.json')), 'browsers.json'), 'utf8'));
  for (const name of [browserName, 'chromium-headless-shell', 'ffmpeg']) {
    const browser = browsers.find((b: { name: string }) => b.name === name);
    const revision = browser.revisionOverrides?.[process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE!] ?? browser.revision;
    expect(existsSync(`${process.env.PLAYWRIGHT_BROWSERS_PATH}/${name.replaceAll('-', '_')}-${revision}`)).toBe(true);
  }
  await page.setContent('<h1 style="font-family: sans-serif">Nix browser smoke</h1>');
  await expect(page.locator('h1')).toHaveText('Nix browser smoke');
  expect(await page.evaluate(() => WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0])))).toBe(true);
  expect((await page.screenshot()).length).toBeGreaterThan(100);
});
SPEC
nix develop .#e2e -c bash -c 'cd web && npx playwright test --config "$1/playwright.config.ts" --output "$1/results"' bash "$smoke_dir"
