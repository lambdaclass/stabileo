import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { disabledFeatures } from './public-features-test-fixture.mjs';

const root = resolve(import.meta.dirname, '..');

for (const [features, expected] of [
  [undefined, ['basic', 'tools', 'game', 'research', 'pricing', 'blog']],
  [disabledFeatures, ['basic', 'examples', 'tools', 'research', 'pricing', 'blog']],
  [Object.fromEntries(Object.keys(disabledFeatures).map(key => [key, true])), ['basic', 'tools', 'game', 'research', 'pricing', 'blog']],
]) {
  test(`Node navigation uses features=${JSON.stringify(features)}`, async () => {
    const result = await build({
      entryPoints: [resolve(root, 'src/components/site/site-nav.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      define: features === undefined ? {} : { __PUBLIC_FEATURES__: JSON.stringify(features) },
    });
    const directory = mkdtempSync(resolve(root, 'scripts/.node-env-'));
    try {
      const file = resolve(directory, 'site-nav.mjs');
      writeFileSync(file, result.outputFiles[0].text);
      const { SITE_NAV, currentNav } = await import(pathToFileURL(file).href);
      assert.deepEqual(SITE_NAV.map(item => item.id), expected);
      for (const item of SITE_NAV.filter(item => item.kind === 'page')) assert.equal(currentNav(`${item.to}/nested/`), item.id);
      assert.equal(currentNav('/paper'), 'research');
      assert.equal(currentNav('/changelog'), 'blog');
      assert.equal(currentNav('/unrelated'), null);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('CI browser preflight can collect all E2E specs in Node', () => {
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=line'], {
    cwd: root,
    env: { ...process.env, CI: '', E2E_PREBUILT: '0' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tools\.spec\.ts/);
  assert.match(result.stdout, /tools-models\.spec\.ts/);
  assert.match(result.stdout, /landing-footer\.spec\.ts/);
});
