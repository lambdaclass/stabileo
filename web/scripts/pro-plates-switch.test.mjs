import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { readProPlatesProfile } from './pro-plates-source.mjs';
import { readRegistryAt } from './result-changes/registry.mjs';
import { featuresForMode } from '../config/public-features.mjs';

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
