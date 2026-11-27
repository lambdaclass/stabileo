import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

function routeFixture(t) {
  const cli = fileURLToPath(new URL('./check-research-route-size.mjs', import.meta.url));
  const root = mkdtempSync(join(dirname(cli), '.route-meter-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, text) => {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const baseline = join(root, 'baseline.json');
  const run = (...args) => spawnSync(process.execPath, [cli, '--baseline', baseline, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, RESEARCH_ISOLATION: 'true', GITHUB_STEP_SUMMARY: '' },
  });
  write('index.html', '<script type="module" src="/src/index.js"></script>');
  write('src/index.js', 'globalThis.loadApp = () => import("./App.js")');
  write('src/App.js', 'globalThis.labels = () => import("./labels.js")');
  const dictionary = suffix => write('src/labels.js',
    'const en = { name: "bolt" }, nl = { name: "bout' + suffix + '" }; globalThis.tables = { en, nl };');
  const pages = ['src/components/tools/load-page.ts', 'src/components/research/load-page.ts',
    'src/components/tools/ToolViewer.svelte', 'src/components/tools/MainBatchTool.svelte'];
  for (const page of pages) write(page, 'globalThis.page = ' + JSON.stringify(page));
  write('vite.config.mjs', 'export default ' + JSON.stringify({
    define: { '__PUBLIC_FEATURES__.research': 'false', '__PUBLIC_FEATURES__.tools': 'false' },
    build: { minify: false, rollupOptions: { input: ['index.html', ...pages] } },
  }));
  return { write, run, dictionary, baseline, root };
}

test('The route CLI measures a loaded dictionary and rejects one byte past its isolated limit', t => {
  const { run, dictionary, baseline } = routeFixture(t);
  dictionary('');
  const update = run('--update');
  assert.equal(update.status, 0, update.stderr);
  const original = JSON.parse(readFileSync(baseline, 'utf8'));
  assert.equal(original.localized['/app/basic'].nl, Buffer.byteLength('"bout"'));
  assert.equal(original.localized['/en/'].nl, 0);
  writeFileSync(baseline, JSON.stringify({ routes: original.routes }));
  const legacy = run();
  assert.equal(legacy.status, 0, legacy.stderr);
  writeFileSync(baseline, JSON.stringify(original));
  const limit = 1321348;
  const loaded = original.localized['/app/basic'].nl;
  dictionary('x'.repeat(limit - loaded));
  const boundary = run();
  assert.equal(boundary.status, 0, boundary.stderr);
  dictionary('x'.repeat(limit - loaded + 1));
  const over = run();
  assert.equal(over.status, 1, over.stderr);
  assert.match(over.stderr, /nl resource size 1321349 exceeds 1321348/);
});

test.skip('known wrong result: #2613 — only an individually lazy public dictionary is an alternative', t => {
  const { root, write, run } = routeFixture(t);
  const config = readFileSync(join(root, 'vite.config.mjs'), 'utf8').replace('export default ', '');
  write('vite.config.mjs', `const config = ${config};
    config.plugins = [{
      name: 'public-locale-fixture',
      resolveId(id) { if (id.startsWith('virtual:public-i18n/')) return '\0' + id; },
      load(id) { if (id.startsWith('\0virtual:public-i18n/')) return 'export default {title:' + JSON.stringify(id.slice(-2)) + '}'; }
    }];
    export default config;`.replaceAll('\0', '\\0'));
  write('src/labels.js', 'export default {}');
  const imports = "globalThis.app = () => import('./App.js');";
  const cases = [
    ["globalThis.nl = () => import('virtual:public-i18n/nl'); globalThis.it = () => import('virtual:public-i18n/it');", true],
    ["import nl from 'virtual:public-i18n/nl'; globalThis.nl = nl;", false],
    ["globalThis.pair = () => import('./pair.js');", false],
  ];
  write('src/pair.js', "export {default as it} from 'virtual:public-i18n/it'; export {default as nl} from 'virtual:public-i18n/nl';");
  for (const [entry, exclusive] of cases) {
    write('src/index.js', imports + entry);
    const result = run('--update');
    assert.equal(result.status, exclusive ? 0 : 1, result.stderr || entry);
    if (!exclusive) assert.match(result.stderr, /dedicated lazy public dictionary/);
  }
});
