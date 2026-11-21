import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, resolveConfig } from 'vite';
import { proPlatesSource, readProPlatesProfile } from './pro-plates-source.mjs';
import { readRegistry, readRegistryAt } from './result-changes/registry.mjs';
import { readProfileResultChanges } from './result-change-metadata.mjs';
import { featuresForMode } from '../config/public-features.mjs';
import { withProductionFeatures } from './public-features-test-fixture.mjs';

test('#1928 production keeps unified PRO plates disabled', () => {
  assert.equal(featuresForMode('production').proPlatesUnified, false);
  assert.equal(featuresForMode('test').proPlatesUnified, true);
  assert.equal(featuresForMode('production').proRcSheets, false);
  assert.equal(featuresForMode('development').proRcSheets, false);
});

const root = fileURLToPath(new URL('../', import.meta.url));
const base = JSON.parse(readFileSync(new URL('../config/pro-plates-off.json', import.meta.url))).base;
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

test('disabled source profile is byte-identical to main for every changed app module and the engine is identical', () => {
  const off = readProPlatesProfile(false);
  const on = readProPlatesProfile(true);
  const paths = git('diff', '--name-status', '--no-renames', '-z', base, '--', 'src').split('\0');
  for (let i = 0; i + 1 < paths.length; i += 2) {
    const [status, repoPath] = paths.slice(i, i + 2);
    const path = repoPath.slice('web/'.length);
    if (path.includes('/__tests__/')) continue;
    if (status === 'A') assert.equal(off.unavailable.has(path), true, path);
    else assert.equal(off.overrides.get(path), git('show', `${base}:${repoPath}`), path);
  }
  assert.equal(git('diff', '--name-only', base, '--', '../engine'), '');
  assert.equal(on.overrides.size + on.unavailable.size, 0);
});

test('production with unified plates off uses the shared portable project codec', async () => {
  const config = await resolveConfig({ root }, 'build', 'production');
  const loader = config.plugins.find(plugin => plugin.name === 'pro-plates-source');
  const resolveSource = proPlatesSource(() => false);
  const context = {
    addWatchFile() {},
    error(message) { throw new Error(message); },
  };
  loader.buildStart.call(context);
  for (const path of ['src/lib/store/file.ts', 'src/lib/store/ded-design-refusals.ts']) {
    const absolute = resolve(root, path);
    const current = readFileSync(absolute, 'utf8');
    const active = loader.load.call(context, absolute) ?? current;
    assert.equal(active === current, true, path);
    assert.equal(resolveSource.read(absolute) === current, true, path);
  }
});

test('production source access uses the pinned main modules', { skip: 'known wrong result: #2365' }, () => {
  const off = proPlatesSource(() => false);
  const on = proPlatesSource(() => true);
  const paths = ['src/components/pro/ProMesher.svelte', 'src/lib/store/file.ts'];
  for (const path of paths) {
    const absolute = resolve(root, path);
    assert.equal(off.read(absolute) === git('show', `${base}:web/${path}`), true, path);
    assert.equal(on.read(absolute), readFileSync(absolute, 'utf8'), path);
  }
  const codec = resolve(root, 'src/lib/store/ded-design-refusals.ts');
  assert.throws(() => off.read(codec), /Unified PRO plates are disabled/);
  assert.equal(on.read(codec), readFileSync(codec, 'utf8'));
});

test('production keeps the complete pinned results registry #2365', () => {
  assert.deepEqual(readProfileResultChanges(false), readRegistryAt(base));
});

test('the unified profile keeps its checkout results registry #2365', () => {
  assert.deepEqual(readProfileResultChanges(true), readRegistry());
});

test('disabled builds load the main solver and results version and the validated mesher', async () => {
  const entry = fileURLToPath(new URL('../.pro-plates-off-fixture.mjs', import.meta.url));
  const result = await build({
    root,
    logLevel: 'silent',
    plugins: [{
      name: entry,
      resolveId: id => id === entry ? '\0' + entry : null,
      load: id => id === '\0' + entry ? `
        import analysis from '/src/lib/engine/live-calc.ts?raw';
        import metadata from 'virtual:result-change-metadata';
        import mesher from '/src/components/pro/ProMesher.svelte?raw';
        export default [analysis, metadata.currentResultsVersion, mesher];
      ` : null,
    }],
    build: { write: false, lib: { entry, formats: ['es'] } },
  });
  const chunk = (Array.isArray(result) ? result[0] : result).output.find(output => output.type === 'chunk');
  const { default: [source, version, mesher] } = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
  assert.equal(source, git('show', `${base}:web/src/lib/engine/live-calc.ts`));
  assert.equal(version, readRegistryAt(base).currentResultsVersion);
  assert.equal(mesher, readFileSync(new URL('../src/components/pro/ProMesher.svelte', import.meta.url), 'utf8'));
});

test('mesher translations are lazy in the unified profile and keep main’s dictionaries in production', async () => {
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
          const previous = git('show', `${base}:web/src/lib/i18n/locales/${locale}.ts`);
          const lines = text => text.split('\n').filter(line => /^\s*['"]mesher\./.test(line));
          assert.deepEqual(lines(load('app-i18n/' + locale)), lines(previous), locale);
        }
      }
    });
  }
});
