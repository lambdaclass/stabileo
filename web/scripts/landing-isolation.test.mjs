import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { build } from 'vite';
import { chromium, expect } from '@playwright/test';
import { disabledFeatures, withProductionFeatures } from './public-features-test-fixture.mjs';

async function landingBuild(features) {
  const run = async configFile => {
    const result = await build({
      root: resolve(import.meta.dirname, '..'),
      configFile,
      plugins: [{
        name: 'landing-isolation-fixture',
        enforce: 'pre',
        resolveId(id) {
          if (/components\/(research|tools|examples|games)\/load-page$/.test(id) || /components\/(blog\/BlogPage|paper\/PaperPage)\.svelte$/.test(id)) return '\0landing-other-page';
          if (id === './App.svelte') return '\0landing-app';
        },
        load(id) {
          if (id === '\0landing-other-page') return 'export default {}; export const loadResearchPage = () => null, loadToolsPage = () => null, loadExamplesPage = () => null, loadGamesPage = () => null;';
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
    return { output, manifest, modules, directLazyModules, emittedModules: [...chunks.values()].flatMap(chunk => Object.keys(chunk.modules)) };
  };
  return features ? withProductionFeatures(features, run) : run();
}

let switchesOffBuild;
function switchesOffLanding() {
  return switchesOffBuild ??= landingBuild(disabledFeatures);
}

test('accounts-off landing excludes account modules and retains its shared page chunk', async () => {
  const { manifest, modules } = await switchesOffLanding();
  assert.deepEqual(modules.filter(id => /\/lib\/tracking\//.test(id)), []);
  assert.equal(manifest['src/components/register/RegisterPage.svelte'], undefined);
  assert.equal(manifest['src/components/LandingPage.svelte'], undefined);
  assert.ok(Object.entries(manifest).some(([key, item]) => key.startsWith('_LandingPage-') && item.name === 'LandingPage'));
});

test('accounts-on build keeps registration available and consent outside the static landing closure', async () => {
  const { manifest, modules } = await landingBuild({ ...disabledFeatures, accounts: true });
  assert.ok(manifest['src/components/register/RegisterPage.svelte']);
  assert.deepEqual(modules.filter(id => /\/lib\/tracking\//.test(id)), []);
});

test('committed production config includes registration', async () => {
  const { manifest, modules } = await landingBuild();
  assert.ok(manifest['src/components/register/RegisterPage.svelte']);
  assert.deepEqual(modules.filter(id => /\/lib\/tracking\//.test(id)), []);
});


test('switches-off landing has no publication or redirect policy in its static closure', async () => {
  const { modules } = await switchesOffLanding();
  assert.deepEqual(modules.filter(id => /\/lib\/(i18n\/(published|research-routes)|blog\/base-locales|legacy-routes|public-surface)\.ts$/.test(id)), []);
});

test('switches-off build emits no Hungarian public dictionary', async () => {
  const { emittedModules, directLazyModules } = await switchesOffLanding();
  assert.deepEqual(emittedModules.filter(id => id === '\0virtual:public-i18n/hu'), []);
  assert.deepEqual(directLazyModules.filter(id => /\/i18n\/locales\/browser\//.test(id)), []);
});

test('research-on landing keeps publication policy and the Hungarian public dictionary', async () => {
  const { modules, emittedModules } = await landingBuild({ ...disabledFeatures, research: true });
  assert.ok(modules.some(id => id.endsWith('/lib/i18n/published.ts')));
  assert.ok(emittedModules.includes('\0virtual:public-i18n/hu'));
});

test('the examples worker builds without browser dictionaries', async () => {
  const root = resolve(import.meta.dirname, '..');
  await build({
    configFile: false,
    root,
    logLevel: 'error',
    plugins: [{
      name: 'examples-worker-engine-stub',
      resolveId(id) {
        if (id.endsWith('dedaliano_engine_bg.wasm?url')) return '\0worker-wasm';
        if (id.endsWith('dedaliano_engine.js')) return '\0worker-engine';
      },
      load(id) {
        if (id === '\0worker-wasm') return 'export default "data:application/wasm;base64,AGFzbQEAAAA="';
        if (id === '\0worker-engine') return 'export function initSync() {}';
      },
    }],
    build: {
      target: 'esnext',
      write: false,
      lib: { entry: resolve(root, 'src/components/examples/run.worker.ts'), formats: ['es'], fileName: 'worker' },
    },
  });
});

test('public navigation fetches only the dictionary of the selected landing language', async t => {
  const { output } = await landingBuild();
  const files = new Map(output.map(item => [item.fileName, item]));
  const dictionaries = new Map(output.filter(item => item.type === 'chunk' && item.facadeModuleId?.startsWith('\0virtual:public-i18n/'))
    .map(chunk => [chunk.fileName, chunk.facadeModuleId.split('/').at(-1)]));
  const headings = {
    en: 'Structural analysis you can check.',
    it: 'Analisi strutturale che puoi verificare.',
    nl: 'Constructieberekening die je kunt controleren.',
  };
  const browser = await chromium.launch();
  t.after(() => browser.close());
  for (const start of Object.keys(headings)) {
    const page = await browser.newPage({ locale: start === 'nl' ? 'it-IT' : 'nl-NL' });
    const requests = [];
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://landing.test') return route.abort();
      const path = url.pathname.slice(1);
      const item = files.get(route.request().isNavigationRequest() ? 'index.html' : path);
      if (!item) return route.fulfill({ status: 404 });
      if (dictionaries.has(path)) requests.push(dictionaries.get(path));
      if (item.type === 'chunk') return route.fulfill({ contentType: 'text/javascript', body: item.code });
      return route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : 'text/html', body: item.source });
    });
    await page.goto(`http://landing.test/${start}/`);
    const expected = start === 'en' ? [] : [start];
    await expect(page.locator('#app .landing h1')).toHaveText(headings[start]);
    assert.deepEqual(requests, expected);
    for (const next of start === 'it' ? ['nl', 'it'] : ['it', 'nl']) {
      await page.getByTestId('nav-lang-button').click();
      await page.getByTestId('nav-lang-list').locator(`[data-value="${next}"]`).click();
      await expect(page).toHaveURL(`http://landing.test/${next}/`);
      await expect(page.locator('#app .landing h1')).toHaveText(headings[next]);
      if (!expected.includes(next)) expected.push(next);
      assert.deepEqual(requests, expected);
    }
    await page.close();
  }
});
