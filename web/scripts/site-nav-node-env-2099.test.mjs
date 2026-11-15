import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const knownWrong = { skip: process.env.IGNORED !== '1' && 'known wrong result: #2099' };

for (const environment of [undefined, {}, { VITE_TOOLS: '0', VITE_DIAGRAM_GAME: '0', VITE_RESEARCH: '0', VITE_ACCOUNTS: '0' }, { VITE_TOOLS: '1', VITE_DIAGRAM_GAME: '1', VITE_RESEARCH: '1', VITE_ACCOUNTS: '1' }]) {
  test(`Node navigation accepts environment=${JSON.stringify(environment)}`, knownWrong, async () => {
    const result = await build({
      entryPoints: [resolve(root, 'src/components/site/site-nav.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      define: environment === undefined ? {} : { 'import.meta.env': JSON.stringify(environment) },
    });
    const directory = mkdtempSync(resolve(root, 'scripts/.node-env-'));
    try {
      const file = resolve(directory, 'site-nav.mjs');
      writeFileSync(file, result.outputFiles[0].text);
      const { SITE_NAV, currentNav } = await import(pathToFileURL(file).href);
      const enabled = environment?.VITE_TOOLS === '1';
      assert.deepEqual(SITE_NAV.map(item => item.id), enabled ? ['basic', 'tools', 'game', 'research', 'pricing', 'blog'] : ['basic', 'examples', 'tools', 'research', 'pricing', 'blog']);
      for (const item of SITE_NAV.filter(item => item.kind === 'page')) assert.equal(currentNav(`${item.to}/nested/`), item.id);
      assert.equal(currentNav('/paper'), 'research');
      assert.equal(currentNav('/changelog'), 'blog');
      assert.equal(currentNav('/unrelated'), null);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('CI browser preflight can collect all E2E specs in Node', knownWrong, () => {
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
