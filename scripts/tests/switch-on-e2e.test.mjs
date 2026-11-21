import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../../web/', import.meta.url));
const collector = 'scripts/run-switch-on-e2e.mjs';
const playwright = 'node_modules/@playwright/test/cli.js';
const knownWrong = { skip: 'known wrong result: #2399' };

function fixture(t, specs, { config = '', sameProfiles = false } = {}) {
  const cwd = mkdtempSync(resolve(web, '.switch-on-collector-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const subdir of ['config', 'scripts', 'e2e']) mkdirSync(resolve(cwd, subdir));
  for (const path of [collector, 'config/public-features.mjs']) {
    copyFileSync(resolve(web, path), resolve(cwd, path));
  }
  const production = { accounts: true, research: true, tools: true, diagramGame: false, globalAxes: false };
  const enabled = { ...production, globalAxes: !sameProfiles };
  writeFileSync(resolve(cwd, 'config/features.json'), JSON.stringify({ production, test: enabled, development: enabled }));
  symlinkSync(resolve(web, 'node_modules'), resolve(cwd, 'node_modules'), 'dir');
  writeFileSync(resolve(cwd, 'playwright.config.ts'), `export default { testDir: './e2e', ${config} };`);
  for (const [file, contents] of Object.entries(specs)) {
    const path = resolve(cwd, 'e2e', file);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, `import { test } from '@playwright/test';\n${contents}`);
  }
  return { cwd, encoding: 'utf8', env: { ...process.env, STABILEO_E2E_PROFILE: 'test', E2E_PREBUILT: '0' } };
}

function collect(options, ...args) {
  return spawnSync(process.execPath, [collector, '--list', ...args], options);
}

function assertSelected(result, files) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `Switch-on E2E specs: ${files.map(file => `e2e/${file}`).sort().join(', ')}`);
}

test('collects every switch-on case reported by Playwright', knownWrong, t => {
  const files = {
    'grid-placement.spec.ts': "test('grid placement', { tag: '@switch-on' }, () => {});",
    'nested/quad-quick-edit.spec.ts': "test('quad quick edit', { tag: ['@smoke', '@switch-on'] }, () => {});",
    'shell-node-editing.spec.ts': "const details = { tag: '@switch-on' as const }; test('shell node editing', details, () => {});",
    'shell-creation.spec.ts': "test.describe('shells', { tag: '@switch-on' }, () => { test('shell creation', () => {}); });",
  };
  const options = fixture(t, {
    ...files,
    'production.spec.ts': "test('always enabled', { tag: '@switch-on-extra' }, () => {});",
  });
  const report = JSON.parse(execFileSync(process.execPath, [playwright, 'test', '--list', '--reporter=json'], options));
  const tagged = report.suites.flatMap(function taggedFiles(suite) {
    return [
      ...suite.specs.filter(spec => spec.tags.includes('switch-on')).map(spec => spec.file),
      ...(suite.suites ?? []).flatMap(taggedFiles),
    ];
  }).sort();
  assert.deepEqual(tagged, Object.keys(files).sort());
  assertSelected(collect(options), tagged);
});

test('collects title tags even when the profiles have identical switches', knownWrong, t => {
  const file = 'title-tag.spec.ts';
  assertSelected(collect(fixture(t, {
    [file]: "test('@switch-on enabled', () => {});",
  }, { sameProfiles: true })), [file]);
});

test('refuses a tagged spec when no tagged case is active even if an untagged case is switch-on', knownWrong, t => {
  const file = 'skipped.spec.ts';
  const result = collect(fixture(t, {
    [file]: `
      test.skip('disabled', { tag: '@switch-on' }, () => {});
      test('profile-only', () => {});
      test.skip(process.env.STABILEO_E2E_PROFILE === 'production');
    `,
  }));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /No active @switch-on cases were collected from: e2e\/skipped\.spec\.ts/);
});

test('refuses a tagged spec omitted from the Playwright report', knownWrong, t => {
  const result = collect(fixture(t, {
    'nested/omitted.spec.ts': "test('omitted', { 'tag': '@switch-on' }, () => {});",
    'ordinary.spec.ts': "test('always enabled', () => {});",
  }, { config: "testIgnore: '**/omitted.spec.ts'" }));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /No active @switch-on cases were collected from: e2e\/nested\/omitted\.spec\.ts/);
});

test('keeps profile-only selection and allows explicit files', t => {
  const file = 'profile-only.spec.ts';
  const options = fixture(t, {
    [file]: `
      test.skip(process.env.STABILEO_E2E_PROFILE === 'production');
      test('profile-only', () => {});
    `,
    'ordinary.spec.ts': "test('always enabled', () => {});",
  });
  assertSelected(collect(options), [file]);
  assertSelected(collect(options, 'e2e/ordinary.spec.ts'), ['ordinary.spec.ts']);
});
