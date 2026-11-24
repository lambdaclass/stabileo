import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { build, resolveConfig } from 'vite';
import { disabledFeatures, withProductionFeatures } from './public-features-test-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const keys = ['VITE_APP_TYPE', 'VITE_E2E'];

async function environment(flags, run) {
  const previous = keys.map(key => process.env[key]);
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, flags);
  try {
    return await run();
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
}

for (const value of [false, true]) {
  test(`production dictionaries follow resolved switches=${value}`, () => withProductionFeatures(
    Object.fromEntries(Object.keys(disabledFeatures).map(key => [key, value])),
    async configFile => {
      const result = await build({
        root,
        configFile,
        plugins: [{
          name: 'dictionary-switch-fixture',
          resolveId: id => id === 'dictionary-switch-fixture' ? '\0dictionary-switch-fixture' : null,
          load: id => id === '\0dictionary-switch-fixture' ? `import { en } from 'virtual:app-i18n/en'; import * as publicEntries from 'virtual:public-i18n'; console.log(en, publicEntries);` : null,
        }],
        build: { write: false, rollupOptions: { input: 'dictionary-switch-fixture' } },
        logLevel: 'silent',
      });
      const code = result.output.filter(output => output.type === 'chunk').map(output => output.code).join('\n');
      for (const key of ['account.name', 'legal.termsLink', 'usage.share', 'disclaimer.body', 'advanced.mohr', 'landing.navGame']) {
        assert.equal(code.includes(JSON.stringify(key)), value, key);
      }
      for (const key of ['disclaimer.report', 'advanced.pdelta']) assert.ok(code.includes(JSON.stringify(key)), key);
      assert.equal(code.includes('admin.metrics.'), false);
      const modules = result.output.filter(output => output.type === 'chunk').flatMap(output => Object.keys(output.modules));
      assert.equal(modules.includes('\0virtual:public-i18n/hu'), value);
    },
  ));
}

test('admin dictionaries retain user, privacy and project labels independently of public account switches', () => environment({ VITE_APP_TYPE: 'admin' }, async () => {
  const config = await resolveConfig({ root, logLevel: 'silent' }, 'build', 'production');
  const plugin = config.plugins.find(plugin => plugin.name === 'public-i18n');
  const load = typeof plugin.load === 'function' ? plugin.load : plugin.load.handler;
  const code = ['\0virtual:app-i18n/en', '\0virtual:public-i18n/en'].map(id => load.call({ addWatchFile() {} }, id)).join('\n');
  for (const key of ['admin.metrics.lede', 'account.name', 'legal.termsLink', 'usage.whatIsSent', 'cloud.modeBasic']) assert.ok(code.includes(JSON.stringify(key)) || code.includes(`'${key}'`), key);
}));

for (const [research, tools] of [[false, false], [true, true], [true, false], [false, true]]) {
  test(`known wrong result: #2099 — research and tools dictionaries follow research=${research}, tools=${tools}`, () => withProductionFeatures(
    { ...disabledFeatures, research, tools },
    async configFile => {
      const result = await build({
        root,
        configFile,
        plugins: [{
          name: 'route-dictionaries-fixture',
          resolveId: id => id === 'route-dictionaries-fixture' ? '\0route-dictionaries-fixture' : null,
          load: id => id === '\0route-dictionaries-fixture' ? `
            const dictionaries = import.meta.glob('/src/components/research/**/*.ts', { eager: true });
            import { toolTranslations } from '/src/components/tools/translations';
            import { batchTranslations } from '/src/components/tools/batch-i18n';
            console.log(dictionaries, toolTranslations, batchTranslations);
          `.replace("'/src/components/research/**/*.ts'", JSON.stringify([
            '/src/components/research/gallery-i18n.ts',
            '/src/components/research/catalogue-summaries.ts',
            '/src/components/research/related-names.ts',
            '/src/components/research/biggins2026/strings.ts',
            '/src/components/research/andreassen2011/i18n.ts',
            '/src/components/research/newmark1959/i18n.ts',
            '/src/components/research/cqc1981/strings.ts',
            '/src/components/research/plastic-collapse/i18n.ts',
            '/src/components/research/navier1823/strings.ts',
            '/src/components/research/lee1968/i18n.ts',
            '/src/components/research/dadeppo1975/i18n.ts',
            '/src/components/research/riksCrisfield/article.ts',
            '/src/components/research/mattiasson1981/i18n.ts',
            '/src/components/research/fairclough2026/translations.ts',
            '/src/components/research/english-only-cards.ts',
          ])) : null,
        }],
        build: { write: false, rollupOptions: { input: 'route-dictionaries-fixture' } },
        logLevel: 'silent',
      });
      const chunks = result.output.filter(output => output.type === 'chunk');
      const code = chunks.map(output => output.code).join('\n');
      assert.equal(/[, {]hu:/.test(code), research, 'Hungarian research dictionaries');
      assert.equal(code.includes('Free structural engineering tools: beams, frames, columns, slabs and towers'), tools, 'tools expansion metadata');
      assert.equal(code.includes('Free structural engineering calculators: beams, columns, frames and trusses'), !tools, 'published calculators metadata');
      assert.ok(code.includes('galleryLead'));
      assert.ok(code.includes('Deflection'));
    },
  ));
}
