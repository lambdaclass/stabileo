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
        for (const key of ['rcSheets.cmd', 'rcSheets.plans.fileName', 'rcSheets.fixed.kind.c']) {
          assert.equal(code.includes(JSON.stringify(key)) || code.includes(`'${key}'`), enabled, locale + ' ' + key);
        }
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

test('generator option and plate form labels follow the editors while saved load derivations remain readable', async () => {
  for (const plates of [false, true]) {
    for (const sheets of [false, true]) {
      await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates, proRcSheets: sheets }, async configFile => {
        const config = await resolveConfig({ root, configFile }, 'build', 'production');
        const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
        for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
          const code = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
          const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
          const entries = module[locale];
          for (const key of ['loads.asce7.period.other', 'loads.asce7.system.steelSMF', 'loads.ec.exposure.normal', 'loads.ec.period.other', 'loads.ec.terrain.II', 'loads.tr.system.A11', 'drawBar.circle', 'plates.circle.center', 'plates.shape.summary', 'plates.shapeProblem.tooDeep']) {
            assert.equal(Object.hasOwn(entries, key), plates, locale + ' ' + key);
          }
          if (!plates) assert.ok(entries['plates.sideThrough'], locale);
          assert.ok(entries['plates.outlineNodes'], locale);
          assert.ok(entries['loads.ec.snow.duoAsMono'], locale);
        }
      });
    }
  }
});

test('the saved load message catalog is independent of Turkish generator forms', async () => {
  for (const enabled of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: enabled }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
        const code = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
        const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
        const entries = module[locale];
        for (const key of ['loads.tr.seismic.periodHint', 'loads.tr.snow.title', 'loads.tr.seismic.bks1']) {
          assert.equal(Object.hasOwn(entries, key), enabled, locale + ' ' + key);
        }
        for (const key of ['loads.ec.live.localQk', 'loads.ec.occ.A_floor', 'loads.asce7.snow.assumption.ce', 'loads.tr.live.reduction.fewFloors']) {
          assert.ok(entries[key], locale + ' ' + key);
        }
      }
    });
  }
});

test('placement uses the sheet labels only in the setting-out drawer and preserves the viewport tool', async () => {
  for (const plates of [false, true]) {
    for (const sheets of [false, true]) {
      await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates, proRcSheets: sheets }, async configFile => {
        const config = await resolveConfig({ root, configFile }, 'build', 'production');
        const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
        const code = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/en');
        const { en } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
        assert.ok(en['placement.anchor']);
        assert.ok(en['placement.place']);
        assert.equal(Object.hasOwn(en, 'spec.section.placement'), sheets);
        assert.equal(Object.hasOwn(en, 'rcSheets.placement.ref.slabTop'), sheets);
        assert.equal(Object.hasOwn(en, 'rcSheets.placement.stackOf'), sheets);
        assert.equal(Object.hasOwn(en, 'placement.ref.slabTop'), false);
        assert.equal(Object.hasOwn(en, 'quickEdit.meshPlate'), plates);
        assert.equal(Object.hasOwn(en, 'combos.rules.seedCode'), plates);
        assert.equal(Object.hasOwn(en, 'combos.rules.noneCode'), plates);
      });
    }
  }
});

test('the raw shell writer only includes circular creation and mesh adoption for unified plates', async () => {
  for (const enabled of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: enabled }, async configFile => {
      const entry = resolve(root, 'src/components/pro/ProShellTab.svelte');
      const result = await build({
        root, configFile, logLevel: 'silent',
        build: { write: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: (_id, from) => from === entry } },
      });
      const chunk = (Array.isArray(result) ? result[0] : result).output.find(output => output.type === 'chunk');
      const bindings = Object.values(chunk.importedBindings).flat();
      assert.ok(bindings.includes('addShellOnCorners'));
      assert.ok(bindings.includes('createPlate'));
      assert.equal(bindings.includes('createCircularPlate'), enabled);
      assert.equal(bindings.includes('platesFromShells'), enabled);
      assert.equal(chunk.code.includes('plate-circle-center'), enabled);
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

test('report and IFC entry modules call reinforcement sheet readers only in the sheet build', async () => {
  for (const enabled of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proRcSheets: enabled }, async configFile => {
      for (const name of ['memoria-inputs', 'ifc-export']) {
        const entry = resolve(root, 'src/lib/store', name + '.ts');
        const result = await build({
          root, configFile, logLevel: 'silent',
          build: {
            write: false, lib: { entry, formats: ['es'] },
            rollupOptions: { external: (id, importer) => importer === entry && !id.startsWith('\0') },
          },
        });
        const chunk = (Array.isArray(result) ? result[0] : result).output.find(output => output.type === 'chunk');
        const readers = Object.entries(chunk.importedBindings)
          .filter(([id, names]) => id.includes('rc-sheets') && names.length > 0)
          .map(([id]) => id);
        assert.equal(readers.length > 0, enabled, name + ' links ' + readers.join(', '));
      }
    });
  }
});

test('the specifications route links the placement drawer only with sheets', async () => {
  for (const plates of [false, true]) {
    for (const sheets of [false, true]) {
      await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates, proRcSheets: sheets }, async configFile => {
        const entry = resolve(root, 'src/components/pro/spec/ProSpecificationsTab.svelte');
        const result = await build({
          root, configFile, logLevel: 'silent',
          build: { write: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: (_id, from) => from === entry } },
        });
        const chunk = (Array.isArray(result) ? result[0] : result).output.find(output => output.type === 'chunk');
        const components = Object.keys(chunk.importedBindings);
        assert.equal(components.some(path => path.split('/').at(-1) === 'SpecPlacement.svelte'), sheets);
        assert.ok(components.some(path => path.split('/').at(-1) === 'SpecSurfaces.svelte'));
        assert.ok(components.some(path => path.split('/').at(-1) === 'SpecList.svelte'));
      });
    }
  }
});

test('the saved-placement notice reads metadata without linking sheet geometry', async () => {
  const result = await build({
    root, configFile: resolve(root, 'vite.config.ts'), mode: 'production', logLevel: 'silent',
    build: { write: false, lib: { entry: resolve(root, 'src/lib/model/ignored-adoption.ts'), formats: ['es'] } },
  });
  const chunk = (Array.isArray(result) ? result[0] : result).output.find(output => output.type === 'chunk');
  const modules = Object.keys(chunk.modules).map(path => path.replaceAll('\\', '/'));
  assert.deepEqual(modules.filter(path => path.endsWith('/model/placement.ts') || path.includes('/rc-sheets/')), []);
  const { inactivePlacementRules } = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
  assert.equal(inactivePlacementRules({ placement: { reference: 'slabTop' } }), true);
  assert.equal(inactivePlacementRules({ rcSheets: { fixedPoints: { column: 'px' } } }), true);
  assert.equal(inactivePlacementRules({ placement: { reference: 'unknown' } }), false);
  assert.equal(inactivePlacementRules({}), false);
});

test('known wrong result: #1928 every published gallery label belongs to an available example or action', async () => {
  for (const enabled of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: enabled }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
        const source = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
        const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
        const catalog = module[locale];
        for (const key of ['pro.examples.loading.draw', 'ex.pro-rc-lift-core.look', 'ex.pro-steel-building-slabs.generatedDesc', 'pro.examples.groupRcBuildings', 'pro.stats.plates']) {
          assert.equal(Object.hasOwn(catalog, key), enabled, locale + ' ' + key);
        }
        for (const key of ['ex.pro-steel-building-slabs', 'ex.pro-steel-building-slabs.desc', 'pro.examples.groupBuildings', 'pro.stats.shells']) assert.ok(catalog[key], locale + ' ' + key);
      }
    });
  }
});

test('known wrong result: #1928 the board controls ship only with the unified notices', async () => {
  for (const enabled of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: enabled }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
        const source = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
        const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
        const catalog = module[locale];
        for (const key of ['notices.kind.withheld', 'notices.hideKind', 'notices.restoreHidden', 'containment.restore', 'containment.toDiagnostics']) {
          assert.equal(Object.hasOwn(catalog, key), enabled, locale + ' ' + key);
        }
        for (const key of ['containment.more', 'containment.less', 'knownIssue.NUM-INVARIANCE']) {
          assert.ok(catalog[key], locale + ' ' + key);
        }
      }
    });
  }
});

test('known wrong result: #1928 concrete and design option text follows the controls in each shipped locale', async () => {
  for (const [plates, sheets] of [[false, false], [true, false], [false, true], [true, true]]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates, proRcSheets: sheets }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
        const source = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
        const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
        const catalog = module[locale];
        for (const key of ['designData.seismic.rules', 'designData.deflectionMonths', 'designData.foundingElevation', 'designData.concreteKeep', 'designData.slabBaseNone']) assert.equal(Object.hasOwn(catalog, key), sheets, locale + ' ' + key);
        for (const key of ['designData.executionControl', 'designData.slabBars']) assert.equal(Object.hasOwn(catalog, key), plates, locale + ' ' + key);
        for (const key of ['designData.assign', 'designData.slabBase', 'designData.concreteHint']) assert.ok(catalog[key], locale + ' ' + key);
      }
    });
  }
});

test('known wrong result: #1928 load family choices follow the generator while saved authority names are readable', async () => {
  for (const enabled of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: enabled }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
        const source = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
        const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
        const catalog = module[locale];
        for (const key of ['autoLoad.family', 'autoLoad.familyHint', 'autoLoad.familyName.us', 'autoLoad.noFamilySeismic']) assert.equal(Object.hasOwn(catalog, key), enabled, locale + ' ' + key);
        for (const key of ['regulations.name.en1990', 'regulations.name.asce7', 'regulations.name.en1990Uk', 'regulations.name.tbdy2018']) assert.ok(catalog[key], locale + ' ' + key);
      }
    });
  }
});

test('known wrong result: #1928 mesh progress and board actions enter the root module only in the unified profile', async () => {
  for (const enabled of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: enabled }, async configFile => {
      const entry = resolve(root, 'src/App.svelte');
      const result = await build({ root, configFile, logLevel: 'silent', build: {
        write: false, lib: { entry, formats: ['es'] },
        rollupOptions: { external: (id, from) => {
          if (!from || id.includes('?svelte&type=style')) return false;
          if (from === entry) return !id.endsWith('/ProgressToasts.svelte');
          return from.endsWith('/ProgressToasts.svelte');
        } },
      } });
      const output = (Array.isArray(result) ? result[0] : result).output;
      const chunk = output.find(item => item.type === 'chunk');
      assert.equal(Object.keys(chunk.importedBindings).some(id => id.includes('MeshProgressCard')), enabled);
      assert.equal(Object.keys(chunk.importedBindings).some(id => id.includes('ModelNoticeBoard')), enabled);
      assert.equal(Object.keys(chunk.importedBindings).some(id => id.includes('AdoptedReinforcementNotice')), true);
      if (!enabled) {
        assert.equal(chunk.code.includes('recheck-banner-rerun'), false);
        for (const file of output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'))) assert.equal(String(file.source).includes('.notice-actions'), false);
      }
    });
  }
});

test('known wrong result: #1928 published CIRSOC tables and load modules exclude draft authorities', async () => {
  for (const path of ['cirsoc101/live-loads', 'families/occupancy-tables', 'families/index']) {
    const entry = resolve(root, 'src/lib/codes/' + path + '.ts');
    const result = await build({
      root, logLevel: 'silent',
      build: { write: false, lib: { entry, formats: ['es'] } },
    });
    const chunk = (Array.isArray(result) ? result[0] : result).output.find(output => output.type === 'chunk');
    const inactive = Object.entries(chunk.modules).filter(([id, mod]) => mod.renderedLength > 0
      && /\/lib\/(?:code-profiles|codes\/(?:eurocode|asce7|turkey))\//.test(id));
    assert.deepEqual(inactive.map(([id]) => id), [], path);
  }
});

test('known wrong result: #1928 the level-centre table and its labels belong to the unified results picker', async () => {
  for (const plates of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates }, async configFile => {
      const entry = resolve(root, 'src/components/pro/ProResultsTab.svelte');
      const result = await build({ root, configFile, logLevel: 'silent', build: {
        write: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: (_id, from) => from === entry },
      } });
      const chunk = (Array.isArray(result) ? result[0] : result).output.find(output => output.type === 'chunk');
      assert.equal(chunk.imports.some(id => id.includes('ProLevelCentresTable')), plates);
      assert.equal(chunk.code.includes('centres.title'), plates);
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
        const text = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
        const module = await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
        for (const key of ['centres.title', 'centres.hint', 'centres.level', 'centres.weight', 'centres.none', 'pro.elementQualityTitle']) {
          assert.equal(Object.hasOwn(module[locale], key), plates, locale + ' ' + key);
        }
        assert.ok(module[locale]['pro.diagnosticsTitle']);
      }
    });
  }
});

test('published mesh previews have their released quality and total captions', async () => {
  for (const plates of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
        const text = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
        const module = await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
        for (const key of ['qualityCell', 'planTotal', 'meshSummary']) assert.equal(Object.hasOwn(module[locale], 'plates.' + key), !plates, locale + ' ' + key);
        for (const key of ['state.stale', 'summary.warn', 'filterKind', 'scopePlates', 'meshHeading', 'qualityGood', 'qualityPoor', 'qualityHint', 'planTotalOnly', 'localLoadsWarnOne', 'keptNodesNoteOne', 'firstSide', 'drawingLabel', 'remeshNoteOne', 'remeshNoteSome', 'remeshNoteAll']) {
          assert.equal(Object.hasOwn(module[locale], 'plates.' + key), plates, locale + ' ' + key);
        }
      }
    });
  }
});

test('reading member reinforcement does not link disabled sheet designers', async () => {
  for (const sheets of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proRcSheets: sheets }, async configFile => {
      const entry = resolve(root, 'src/lib/store/rc-sheets-reinforcement.ts');
      const result = await build({ root, configFile, logLevel: 'silent', build: {
        write: false, lib: { entry, formats: ['es'] }, rollupOptions: {
          external: (id, from) => !!from && /(?:^\w|\/(?:rc-sheets(?:-view)?\.svelte|model\.svelte|results\.svelte|design-data|physical|i18n|format|demands|features)$)/.test(id),
        },
      } });
      const chunks = (Array.isArray(result) ? result[0] : result).output.filter(output => output.type === 'chunk');
      const imported = chunks.flatMap(chunk => chunk.imports);
      for (const name of ['rc-sheets.svelte', 'rc-sheets-view.svelte']) {
        assert.equal(imported.some(id => id.endsWith(name)), sheets, name);
      }
    });
  }
});

test('the released document builders do not load the reinforcement sheet implementations', async () => {
  for (const sheets of [false, true]) {
    await withProductionFeatures({ ...featuresForMode('production'), proRcSheets: sheets }, async configFile => {
      for (const name of ['memoria-inputs', 'ifc-export']) {
        const entry = resolve(root, 'src/lib/store/' + name + '.ts');
        const result = await build({ root, configFile, logLevel: 'silent', build: {
          write: false, lib: { entry, formats: ['es'] }, rollupOptions: {
            external: (id, from) => !!from && !id.includes('rc-sheets-documents'),
          },
        } });
        const chunks = (Array.isArray(result) ? result[0] : result).output.filter(item => item.type === 'chunk');
        const imports = chunks.flatMap(item => item.imports);
        for (const dependency of ['rc-sheets-schedule', 'rc-sheets-readers/memoria']) {
          assert.equal(imports.some(id => id.includes(dependency)), sheets, name + ' loads ' + dependency);
        }
      }
    });
  }
});

test('recovery, footing and sheet-report captions follow their controls', async () => {
  for (const [plates, sheets] of [[false, false], [true, false], [false, true]]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates, proRcSheets: sheets }, async configFile => {
      const config = await resolveConfig({ root, configFile }, 'build', 'production');
      const dictionary = config.plugins.find(plugin => plugin.name === 'public-i18n');
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'hu']) {
        const text = dictionary.load.call({ addWatchFile() {} }, '\0virtual:app-i18n/' + locale);
        const loaded = await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
        const has = key => Object.hasOwn(loaded[locale], key);
        assert.equal(has('file.workspaceNoticeClose'), plates);
        for (const key of ['footing.ui.inSheets', 'footing.ui.openSheets', 'memo.rc.line', 'memo.rc.notAdopted', 'memo.rc.supportTop']) {
          assert.equal(has(key), sheets, locale + ' ' + key);
        }
        assert.ok(has('file.workspaceSaveToFile'));
      }
    });
  }
});

test('known wrong result: #1928 the published viewport imports only the available plate toolbar', async () => {
  for (const [plates, sheets] of [[false, false], [false, true], [true, false], [true, true]]) {
    await withProductionFeatures({ ...featuresForMode('production'), proPlatesUnified: plates, proRcSheets: sheets }, async configFile => {
      const entry = resolve(root, 'src/components/Viewport3D.svelte');
      const result = await build({ root, configFile, logLevel: 'silent', build: {
        write: false, lib: { entry, formats: ['es'] },
        rollupOptions: { external: (id, from) => from === entry && !id.includes('?svelte&type=style') },
      } });
      const chunk = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk');
      assert.equal(chunk.imports.some(id => id.includes('PlateSelectionCard')), plates);
    });
  }
});
