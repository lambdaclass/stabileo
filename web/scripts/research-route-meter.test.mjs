import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('The route CLI measures a loaded dictionary and rejects one byte past its isolated limit', t => {
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
  dictionary('x'.repeat(limit));
  const boundary = run();
  assert.equal(boundary.status, 0, boundary.stderr);
  dictionary('x'.repeat(limit + 1));
  const over = run();
  assert.equal(over.status, 1, over.stderr);
  assert.match(over.stderr, /nl resource growth 1321349 exceeds 1321348/);
});
