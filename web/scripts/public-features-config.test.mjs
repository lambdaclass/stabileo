import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { build, resolveConfig } from 'vite';
import committedConfig from '../config/features.json' with { type: 'json' };
import { withFeatureConfig } from './public-features-test-fixture.mjs';

const root = resolve(import.meta.dirname, '..');

test('empty legacy environment variables do not expose account UI in production', async t => {
  const keys = ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME'];
  const previous = keys.map(key => process.env[key]);
  for (const key of keys) process.env[key] = '';
  t.after(() => {
    for (const [index, key] of keys.entries()) {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    }
  });

  const entry = 'public-accounts-dictionary';
  const result = await build({
    root,
    plugins: [{
      name: entry,
      resolveId: id => id === entry ? '\0' + entry : null,
      load: id => id === '\0' + entry ? "import { en } from 'virtual:app-i18n/en'; import * as publicEntries from 'virtual:public-i18n'; console.log(en, publicEntries);" : null,
    }],
    build: { write: false, rollupOptions: { input: entry } },
    logLevel: 'silent',
  });
  const code = result.output.filter(output => output.type === 'chunk').map(output => output.code).join('\n');
  assert.ok(code.includes('disclaimer.report'));
  assert.equal(code.includes('account.name'), false, 'production must strip the account UI dictionary');
  assert.equal(code.includes('landing.navGame'), false, 'production must strip the game navigation label');
  assert.ok(code.includes('advanced.mohr'));
  assert.ok(result.output.some(output => output.type === 'chunk' && Object.hasOwn(output.modules, '\0virtual:public-i18n/hu')));
});

for (const [command, mode, expected] of [
  ['build', 'production', { accounts: false, research: true, tools: true, diagramGame: false }],
  ['serve', 'development', { accounts: true, research: true, tools: true, diagramGame: true }],
  ['serve', 'test', { accounts: true, research: true, tools: true, diagramGame: true }],
]) {
  test(`${mode} resolves the committed feature booleans`, async () => {
    const config = await resolveConfig({ root, mode, logLevel: 'silent' }, command, mode);
    assert.deepEqual(JSON.parse(config.define.__PUBLIC_FEATURES__), expected);
    if (command === 'build') {
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(JSON.parse(config.define[`__PUBLIC_FEATURES__.${key}`]), value);
      }
    }
  });
}

test('build config rejects a missing or non-boolean feature in any environment', async () => {
  for (const [environment, row] of Object.entries(committedConfig)) {
    for (const key of Object.keys(row)) {
      for (const invalid of [undefined, '', 'false', 0, null]) {
        const config = structuredClone(committedConfig);
        config[environment][key] = invalid;
        await withFeatureConfig(config, configFile => assert.rejects(
          resolveConfig({ root, configFile, logLevel: 'silent' }, 'build', 'production'),
          { message: `features.json.${environment}.${key} must be a boolean` },
        ));
      }
    }
  }
});

test('build config rejects a missing environment', async () => {
  const { test: _test, ...config } = committedConfig;
  await withFeatureConfig(config, configFile => assert.rejects(
    resolveConfig({ root, configFile, logLevel: 'silent' }, 'build', 'production'),
    { message: 'features.json.test must be an object' },
  ));
});
