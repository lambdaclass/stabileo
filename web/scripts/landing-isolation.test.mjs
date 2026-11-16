import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { build } from 'vite';

async function landingBuild(accounts, research = '0', envDir, defaults = false) {
  const keys = ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME', 'VITE_E2E', 'VITE_APP_TYPE', 'GITHUB_SHA'];
  const previous = keys.map(key => process.env[key]);
  Object.assign(process.env, { VITE_ACCOUNTS: accounts, VITE_RESEARCH: research, VITE_TOOLS: '0', VITE_DIAGRAM_GAME: '0', VITE_E2E: '0', VITE_APP_TYPE: '', GITHUB_SHA: '000000000000' });
  if (accounts === undefined) delete process.env.VITE_ACCOUNTS;
  if (research === null) delete process.env.VITE_RESEARCH;
  if (defaults) for (const key of keys.filter(key => key.startsWith('VITE_'))) delete process.env[key];
  try {
    const result = await build({
      root: resolve(import.meta.dirname, '..'),
      envDir,
      plugins: [{
        name: 'landing-isolation-fixture',
        enforce: 'pre',
        resolveId(id) {
          if (/components\/(research|tools|examples|diagram-game)\/load-page$/.test(id) || /components\/(blog\/BlogPage|paper\/PaperPage)\.svelte$/.test(id)) return '\0landing-other-page';
          if (id === './App.svelte') return '\0landing-app';
        },
        load(id) {
          if (id === '\0landing-other-page') return 'export default {}; export const loadResearchPage = () => null, loadToolsPage = () => null, loadExamplesPage = () => null, loadDiagramGamePage = () => null;';
          if (id === '\0landing-app') return `import Landing from ${JSON.stringify(resolve(import.meta.dirname, '../src/components/LandingPage.svelte'))}; export default function App() { return Landing; }`;
        },
      }],
      build: { write: false, manifest: true },
      logLevel: 'silent',
    });
    const output = result.output;
    const manifest = JSON.parse(output.find(item => item.fileName === '.vite/manifest.json').source);
    const chunks = new Map(output.filter(item => item.type === 'chunk').map(item => [item.fileName, item]));
    const seen = new Set();
    function visit(file) {
      if (seen.has(file)) return;
      seen.add(file);
      for (const dependency of chunks.get(file)?.imports ?? []) visit(dependency);
    }
    visit(manifest['index.html'].file);
    const landing = [...chunks.values()].find(item => Object.keys(item.modules).some(id => id.endsWith('/src/components/LandingPage.svelte')));
    assert.ok(landing);
    visit(landing.fileName);
    const modules = [...seen].flatMap(file => Object.keys(chunks.get(file)?.modules ?? {}));
    const directLazyModules = [...seen].flatMap(file => chunks.get(file)?.dynamicImports ?? []).flatMap(file => Object.keys(chunks.get(file)?.modules ?? {}));
    return { manifest, modules, directLazyModules, emittedModules: [...chunks.values()].flatMap(chunk => Object.keys(chunk.modules)) };
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
}

test('accounts-off landing excludes account modules and retains its shared page chunk', async () => {
  const { manifest, modules } = await landingBuild('0');
  assert.deepEqual(modules.filter(id => /\/lib\/tracking\//.test(id)), []);
  assert.equal(manifest['src/components/register/RegisterPage.svelte'], undefined);
  assert.equal(manifest['src/components/LandingPage.svelte'], undefined);
  assert.ok(Object.entries(manifest).some(([key, item]) => key.startsWith('_LandingPage-') && item.name === 'LandingPage'));
});

test('accounts-on build keeps registration available and consent outside the static landing closure', async () => {
  const { manifest, modules } = await landingBuild('1');
  assert.ok(manifest['src/components/register/RegisterPage.svelte']);
  assert.deepEqual(modules.filter(id => /\/lib\/tracking\//.test(id)), []);
});

test('an unspecified production accounts switch excludes registration', async () => {
  const { manifest, modules } = await landingBuild(undefined);
  assert.equal(manifest['src/components/register/RegisterPage.svelte'], undefined);
  assert.deepEqual(modules.filter(id => /\/lib\/tracking\//.test(id)), []);
});


test('switches-off landing has no publication or redirect policy in its static closure', async () => {
  const { modules } = await landingBuild('0');
  assert.deepEqual(modules.filter(id => /\/lib\/(i18n\/(published|research-routes)|blog\/base-locales|legacy-routes|public-surface)\.ts$/.test(id)), []);
});

test('switches-off build emits no Hungarian public dictionary', async () => {
  const { emittedModules, directLazyModules } = await landingBuild('0');
  assert.deepEqual(emittedModules.filter(id => id === '\0virtual:public-i18n/hu'), []);
  assert.deepEqual(directLazyModules.filter(id => /\/i18n\/locales\/browser\//.test(id)), []);
});

test('research-on landing keeps publication policy and the Hungarian public dictionary', async () => {
  const { modules, emittedModules } = await landingBuild('0', '1');
  assert.ok(modules.some(id => id.endsWith('/lib/i18n/published.ts')));
  assert.ok(emittedModules.includes('\0virtual:public-i18n/hu'));
});

test('Vite environment files gate the locale dictionaries and compiled public markup together', async () => {
  const envDir = mkdtempSync(resolve(import.meta.dirname, '.public-policy-env-'));
  try {
    writeFileSync(resolve(envDir, '.env.production'), 'VITE_RESEARCH=1\n');
    const { emittedModules, modules } = await landingBuild('0', null, envDir);
    assert.ok(emittedModules.includes('\0virtual:public-i18n/hu'));
    assert.ok(modules.some(id => id.endsWith('/lib/i18n/published.ts')));
  } finally {
    rmSync(envDir, { recursive: true, force: true });
  }
});

test('CI default build excludes optional public policy and registration', async () => {
  const { manifest, modules, emittedModules } = await landingBuild(undefined, undefined, undefined, true);
  assert.deepEqual(modules.filter(id => /\/lib\/(legacy-routes|public-feature-policy)\.ts$/.test(id)), []);
  assert.equal(manifest['src/components/register/RegisterPage.svelte'], undefined);
  assert.deepEqual(emittedModules.filter(id => id === '\0virtual:public-i18n/hu'), []);
});
