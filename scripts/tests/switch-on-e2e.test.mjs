import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { featuresForMode } from '../../web/config/public-features.mjs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../../web/', import.meta.url));
const collector = 'scripts/run-switch-on-e2e.mjs';
const playwright = 'node_modules/@playwright/test/cli.js';
const expectedSpecsFile = 'config/switch-on-e2e-specs.json';

function fixture(t, specs, { config = '', sameProfiles = false, expectedSpecs = [] } = {}) {
  const cwd = mkdtempSync(fileURLToPath(new URL('.switch-on-collector-', import.meta.url)));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const subdir of ['config', 'scripts', 'e2e']) mkdirSync(resolve(cwd, subdir));
  for (const path of [collector, 'config/public-features.mjs']) {
    copyFileSync(resolve(web, path), resolve(cwd, path));
  }
  const production = featuresForMode('production');
  const enabled = { ...production, globalAxes: sameProfiles ? production.globalAxes : !production.globalAxes };
  writeFileSync(resolve(cwd, 'config/features.json'), JSON.stringify({ production, test: enabled, development: enabled }));
  writeFileSync(resolve(cwd, expectedSpecsFile), JSON.stringify(expectedSpecs));
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

test('collects every switch-on case reported by Playwright', t => {
  const files = {
    'grid-placement.spec.ts': "test('grid placement', { tag: '@switch-on' }, () => {});",
    'nested/quad-quick-edit.spec.ts': "test('quad quick edit', { tag: ['@smoke', '@switch-on'] }, () => {});",
    'shell-node-editing.spec.ts': "const details = { tag: '@switch-on' as const }; test('shell node editing', details, () => {});",
    'shell-creation.spec.ts': "test.describe('shells', { tag: '@switch-on' }, () => { test('shell creation', () => {}); });",
  };
  const options = fixture(t, {
    ...files,
    'production.spec.ts': "test('always enabled', { tag: '@switch-on-extra' }, () => {});",
  }, { expectedSpecs: Object.keys(files) });
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

test('collects title tags even when the profiles have identical switches', t => {
  const file = 'title-tag.spec.ts';
  assertSelected(collect(fixture(t, {
    [file]: "test('@switch-on enabled', () => {});",
  }, { sameProfiles: true, expectedSpecs: [file] })), [file]);
});

for (const [profile, sameProfiles] of [['test', false], ['production', false], ['production', true]]) {
  test(`refuses an unregistered spec tagged only in the ${profile} profile (${sameProfiles ? 'identical' : 'different'} switches)`, t => {
    const file = 'unregistered.spec.ts';
    const result = collect(fixture(t, {
      [file]: `
        if (process.env.STABILEO_E2E_PROFILE === '${profile}') {
          test('unregistered case', { tag: '@switch-on' }, () => {});
        }
      `,
      'ordinary.spec.ts': "test('always enabled', () => {});",
    }, { sameProfiles }));
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Unregistered @switch-on specs \(add to config\/switch-on-e2e-specs\.json\): e2e\/unregistered\.spec\.ts/);
  });
}

test('refuses a tagged spec when no tagged case is active even if an untagged case is switch-on', t => {
  const file = 'skipped.spec.ts';
  const result = collect(fixture(t, {
    [file]: `
      test.skip('disabled', { tag: '@switch-on' }, () => {});
      test('profile-only', () => {});
      test.skip(process.env.STABILEO_E2E_PROFILE === 'production');
    `,
  }, { expectedSpecs: [file] }));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /No active @switch-on cases were collected from: e2e\/skipped\.spec\.ts/);
});

test('refuses a tagged spec omitted from the Playwright report', t => {
  const file = 'nested/omitted.spec.ts';
  const result = collect(fixture(t, {
    [file]: "test('omitted', { 'tag': '@switch-on' }, () => {});",
    'ordinary.spec.ts': "test('always enabled', () => {});",
  }, { config: "testIgnore: '**/omitted.spec.ts'", expectedSpecs: [file] }));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /No active @switch-on cases were collected from: e2e\/nested\/omitted\.spec\.ts/);
});

test('ignores switch-on text in an ordinary assertion', t => {
  const file = 'tagged.spec.ts';
  const options = fixture(t, {
    [file]: "test('switch-on case', { tag: '@switch-on' }, () => {});",
    'ordinary.spec.ts': `
      import { expect } from '@playwright/test';
      test('displays the label', () => {
        const label = '@switch-on';
        expect(label).toBe('@switch-on');
      });
    `,
  }, { expectedSpecs: [file] });
  assertSelected(collect(options), [file]);
});

test('requires a declared spec with an imported tag to contribute an active case', t => {
  const file = 'imported-tag.spec.ts';
  const specs = {
    [file]: `
      import { SWITCH_ON_TAG } from './tags';
      test('switch-on case', { tag: SWITCH_ON_TAG }, () => {});
    `,
    'tags.ts': "export const SWITCH_ON_TAG = '@switch-on';",
    'ordinary.spec.ts': "test('always enabled', () => {});",
  };
  const expectedSpecs = [file];
  assertSelected(collect(fixture(t, specs, { expectedSpecs })), [file]);

  const result = collect(fixture(t, specs, {
    config: "testIgnore: '**/imported-tag.spec.ts'",
    expectedSpecs,
  }));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /No active @switch-on cases were collected from: e2e\/imported-tag\.spec\.ts/);
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
