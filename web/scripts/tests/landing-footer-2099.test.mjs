import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);

test('landing footer keeps its executable navigation and viewport cases (#2099)', () => {
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', 'e2e/landing-footer.spec.ts', '--list', '--reporter=line'], {
    cwd: root,
    env: { ...process.env, CI: '', E2E_PREBUILT: '0' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const width of [390, 820, 1440]) assert.match(result.stdout, new RegExp(`footer and section links at ${width}px`));
  assert.match(result.stdout, /the editor entry in the footer opens Basic/);
  assert.match(result.stdout, /the sections link to the pages that extend them/);
  assert.match(result.stdout, /the footer link \/en\/privacy\/ opens a real page/);
});
