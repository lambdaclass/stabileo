import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, resolveConfig } from 'vite';
import { readRegistry, readRegistryAt } from './result-changes/registry.mjs';
import { featuresForMode } from '../config/public-features.mjs';
import { withProductionFeatures } from './public-features-test-fixture.mjs';

test('#1928 production keeps unified PRO plates disabled', () => {
  assert.equal(featuresForMode('production').proPlatesUnified, false);
  assert.equal(featuresForMode('test').proPlatesUnified, true);
  assert.equal(featuresForMode('production').proRcSheets, false);
  assert.equal(featuresForMode('development').proRcSheets, false);
});

const root = fileURLToPath(new URL('../', import.meta.url));
test('mesher translations are lazy in the unified profile and use the checkout dictionaries in production', async () => {
  const production = featuresForMode('production');
  const locales = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu'];
  for (const enabled of [true, false]) {
    await withProductionFeatures({ ...production, proPlatesUnified: enabled }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      const load = id => dictionary.load.call({ addWatchFile() {} }, '\0virtual:' + id);
      const app = load('app-i18n');
      const mesher = load('mesher-i18n');
      if (enabled) {
        assert.equal(/['"]mesher\./.test(app), false, 'the unified app dictionary includes mesher keys');
        assert.doesNotMatch(load('public-i18n'), /['"]mesher\./);
        const { default: translations } = await import('data:text/javascript;base64,' + Buffer.from(mesher).toString('base64'));
        assert.deepEqual(Object.keys(translations), locales);
        for (const locale of locales) {
          for (const key of ['mesher.summary', 'mesher.summaryStructured']) {
            assert.match(translations[locale][key], /\{cells\}.*\{points\}/, locale);
          }
          assert.ok(translations[locale]['mesher.failed'], locale);
        }
      } else {
        assert.equal(mesher, null);
        for (const locale of locales) {
          const previous = readFileSync(resolve(root, `src/lib/i18n/locales/${locale}.ts`), 'utf8');
          const lines = text => text.split('\n').filter(line => /^\s*['"]mesher\./.test(line));
          assert.deepEqual(lines(load('app-i18n/' + locale)), lines(previous), locale);
        }
      }
    });
  }
});

test('both plate profiles build the checked-out solver, mesher, file reader and registry', async () => {
  const entry = fileURLToPath(new URL('../.pro-plates-off-fixture.mjs', import.meta.url));
  for (const enabled of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: enabled }, async configFile => {
      const result = await build({
        configFile,
        root,
        logLevel: 'silent',
        plugins: [{
          name: entry,
          resolveId: id => id === entry ? '\0' + entry : null,
          load: id => id === '\0' + entry ? `
            import analysis from '/src/lib/engine/live-calc.ts?raw';
            import metadata from 'virtual:result-change-metadata';
            import mesher from '/src/components/pro/ProMesher.svelte?raw';
            import file from '/src/lib/store/file.ts?raw';
            export default [analysis, metadata.currentResultsVersion, mesher, file];
          ` : null,
        }],
        build: { write: false, lib: { entry, formats: ['es'] } },
      });
      const chunk = (Array.isArray(result) ? result[0] : result).output.find(output => output.type === 'chunk');
      const { default: [source, version, mesher, file] } = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
      assert.equal(source, readFileSync(resolve(root, 'src/lib/engine/live-calc.ts'), 'utf8'));
      assert.equal(version, readRegistry().currentResultsVersion);
      assert.equal(mesher, readFileSync(resolve(root, 'src/components/pro/ProMesher.svelte'), 'utf8'));
      assert.equal(file, readFileSync(resolve(root, 'src/lib/store/file.ts'), 'utf8'));
    });
  }
});

test('both profiles retain the published landing versions through #2472', () => {
  const published = readRegistryAt('f237e68a5932fd485445162fe5ebeddf9ac167df');
  const current = new Map(readRegistry().changes.map(change => [change.id, change.resultsVersion]));
  for (const change of published.changes) {
    assert.equal(current.get(change.id), change.resultsVersion, change.id);
  }
});

test('the application publishes sheet commands and reports only when sheets are available', async () => {
  for (const enabled of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proRcSheets: enabled }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
        const code = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
        for (const key of ['rcSheets.cmd', 'rcSheets.plans.fileName']) {
          assert.equal(code.includes(JSON.stringify(key)) || code.includes(`'${key}'`), enabled, locale + ' ' + key);
        }
        assert.match(code, /['"]rcSheets\.fixed\.kind\.c['"]/, locale);
      }
    });
  }
});

test('load and reinforcement editors publish their own labels independently', async () => {
  for (const [plates, sheets] of [[false, false], [true, false], [false, true], [true, true]]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates, proRcSheets: sheets }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      const code = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/en');
      const { en } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
      for (const key of ['loads.asce7.ui.windSite', 'loads.ec.ui.altitude']) assert.equal(Object.hasOwn(en, key), plates, key);
      for (const key of ['designData.criteria.defaults', 'designData.crit.wallMeshSpacing.hint', 'designData.flange.all', 'designData.opt.none', 'designData.alt.raiseFc', 'designData.deflectionSupports.none']) {
        assert.equal(Object.hasOwn(en, key), sheets, key);
      }
      assert.ok(en['designData.columnEndZones']);
    });
  }
});

test('the EC2 member resistance reads placed reinforcement and draft profiles only in their builds', async () => {
  for (const [plates, sheets] of [[false, false], [true, false], [false, true], [true, true]]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates, proRcSheets: sheets }, async configFile => {
      const entry = resolve(root, 'ec2-column-profile.mjs');
      const source = "export { sectionResistance, momentAt, ec2ColumnSolve } from '/src/lib/engine/design/eurocode/ec2-column.ts'; export { ec2Material, EC2_RECOMMENDED, EC2_UK } from '/src/lib/engine/design/eurocode/ec2-params.ts';";
      const result = await build({
        root, configFile, logLevel: 'silent',
        plugins: [{
          name: 'ec2-column-profile',
          resolveId: id => id === entry ? '\0' + entry : null,
          load: id => id === '\0' + entry ? source : null,
        }],
        build: { write: false, lib: { entry, formats: ['es'] } },
      });
      const chunk = (Array.isArray(result) ? result[0] : result).output.find(output => output.type === 'chunk');
      const { sectionResistance, momentAt, ec2ColumnSolve, ec2Material, EC2_RECOMMENDED, EC2_UK } = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
      const section = { b: 0.4, h: 0.4, d2: 0.055, as: 0.002 };
      const concrete = { ...section, as: 0 };
      const emptyLayout = { ...section, bars: [] };
      const params = EC2_RECOMMENDED;
      const material = ec2Material(30, 500, params);
      const expected = sheets ? concrete : section;
      for (const depth of [section.d2, section.h, 1000 * section.h]) {
        assert.deepEqual(sectionResistance(depth, emptyLayout, material, params.es), sectionResistance(depth, expected, material, params.es));
      }
      const limit = sectionResistance(1000 * section.h, concrete, material, params.es).n;
      for (const axial of [limit - 1, limit, limit + 1]) {
        assert.equal(momentAt(axial, emptyLayout, material, params.es), momentAt(axial, expected, material, params.es));
      }
      const plane = { b: section.b, h: section.h, as: section.as, l0: 2.5, phiEf: 2 };
      const input = { planes: [plane], cover: 0.035, linkDia: 10, barDia: 20, fck: 30, fyk: 500, params, braced: true, demands: [{ N: 1500, planes: [{ M: 100 }] }], provided: { asTotal: section.as, d2: section.d2 } };
      const solvePlane = extra => ec2ColumnSolve({ ...input, planes: [{ ...plane, ...extra }] }).governing.planes[0].MRd;
      assert.equal(solvePlane({ bars: [] }), solvePlane({ as: expected.as }));
      assert.ok(solvePlane({}) > solvePlane({ as: 0 }));
      assert.equal(EC2_UK.xuLimitLow !== params.xuLimitLow, plates);
      assert.equal(Object.entries(chunk.modules).some(([id, mod]) => id.endsWith('/code-profiles/registry.ts') && mod.renderedLength > 0), plates);
    });
  }
});
