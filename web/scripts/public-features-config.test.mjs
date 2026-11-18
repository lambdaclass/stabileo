import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { build, resolveConfig } from 'vite';
import committedConfig from '../config/features.json' with { type: 'json' };
import { disabledFeatures, withFeatureConfig, withProductionFeatures } from './public-features-test-fixture.mjs';

const root = resolve(import.meta.dirname, '..');

test('conflicting legacy environment variables do not change production features', async t => {
  const keys = ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME'];
  const { accounts, diagramGame, research, tools } = committedConfig.production;
  const previous = keys.map(key => process.env[key]);
  for (const [index, enabled] of [accounts, research, tools, diagramGame].entries()) {
    process.env[keys[index]] = enabled ? '0' : '1';
  }
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
  assert.equal(code.includes('account.name'), accounts, 'account UI dictionary');
  assert.equal(code.includes('landing.navGame'), diagramGame, 'game navigation label');
  assert.equal(code.includes('advanced.mohr'), tools, 'Mohr tool dictionary');
  assert.equal(result.output.some(output => output.type === 'chunk' && Object.hasOwn(output.modules, '\0virtual:public-i18n/hu')), research);
});

for (const [command, mode] of [
  ['build', 'production'],
  ['serve', 'development'],
  ['serve', 'test'],
]) {
  const expected = committedConfig[mode];
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

test('known wrong result: #2286 — the copied route checker gets the committed production switches', async t => {
  const key = 'STABILEO_ROUTE_BUDGET_LEGACY';
  const previous = process.env[key];
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });

  delete process.env[key];
  const standard = await resolveConfig({ root, logLevel: 'silent' }, 'build', 'production');
  assert.equal(standard.define['import.meta.env.VITE_RESEARCH'], undefined);
  assert.equal(standard.define['import.meta.env.VITE_TOOLS'], undefined);

  process.env[key] = '1';
  for (const [research, tools] of [[true, true], [true, false], [false, true], [false, false]]) {
    const config = { ...committedConfig, production: { ...committedConfig.production, research, tools } };
    const resolved = await withFeatureConfig(config, configFile =>
      resolveConfig({ root, configFile, logLevel: 'silent' }, 'build', 'production'),
    );
    assert.deepEqual(
      [JSON.parse(resolved.define['import.meta.env.VITE_RESEARCH']), JSON.parse(resolved.define['import.meta.env.VITE_TOOLS'])],
      [String(Number(research)), String(Number(tools))],
    );
  }
});

for (const production of [
  disabledFeatures,
  committedConfig.production,
  { accounts: true, research: true, tools: true, diagramGame: true },
]) {
  test(`production browser code only receives resolved switches with ${JSON.stringify(production)}`, { skip: 'known wrong result: #2286' }, () =>
    withProductionFeatures(production, async configFile => {
      const entry = 'public-feature-consumers';
      const result = await build({
        root,
        configFile,
        plugins: [{
          name: entry,
          resolveId: id => id === entry ? '\0' + entry : null,
          load: id => id === '\0' + entry ? `
            import { publicFeatures } from '/src/lib/features';
            import { researchLocales } from '/src/lib/i18n/research-routes';
            import { SITE_NAV } from '/src/components/site/site-nav';
            import { registryLocale } from '/src/lib/provenance/registry';
            console.log(publicFeatures(), researchLocales(location.pathname), SITE_NAV, registryLocale(...globalThis.localeArguments));
          ` : null,
        }],
        build: { write: false, rollupOptions: { input: entry } },
        logLevel: 'silent',
      });
      const bundledConfig = result.output
        .filter(output => output.type === 'chunk')
        .flatMap(output => Object.entries(output.modules))
        .filter(([id, module]) => /\/config\/(?:public-features\.mjs|features\.json)$/.test(id) && module.renderedLength > 0);
      assert.deepEqual(bundledConfig.map(([id]) => id.slice(root.length)), []);
    }));
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
