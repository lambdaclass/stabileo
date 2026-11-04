import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compareRouteSizes, routeChunkFiles, BLOG_ROUTE_BOUNDARY } from './research-route-budget.mjs';

test('unchanged routes and small build noise pass', () => {
  compareRouteSizes({ '/en/': 1000, '/app/basic': 2000 }, { '/en/': 1000, '/app/basic': 2128 }, true);
});
test('real landing or app growth fails', () => {
  for (const route of ['/en/', '/app/basic']) {
    const baseline = { '/en/': 1000, '/app/basic': 2000 };
    assert.throws(() => compareRouteSizes(baseline, { ...baseline, [route]: baseline[route] + 129 }, true), /grew/);
  }
});
test('missing and non-finite measurements fail', () => {
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, {}), /coverage/);
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, { '/en/': NaN }), /grew/);
});

const shippedBudgets = JSON.parse(readFileSync(new URL('./product-route-growth-budgets.json', import.meta.url), 'utf8'));
test('the landing routes have a 128 byte budget and the app routes the one-time course and blog acceptance', () => {
  assert.deepEqual(shippedBudgets, {
    '/en/': 128, '/es/': 128, '/pt/': 128,
    '/app/basic': 1226112, '/app/education': 1226112, '/app/pro': 1226112,
  });
});
for (const [route, budget] of Object.entries(shippedBudgets)) {
  test(`${route} product growth passes at the budget and fails one byte over`, () => {
    compareRouteSizes({ [route]: 1000 }, { [route]: 1000 + budget }, false);
    assert.throws(() => compareRouteSizes({ [route]: 1000 }, { [route]: 1001 + budget }, false),
      new RegExp(`${budget} byte tolerance, product budget from web/scripts/product-route-growth-budgets\\.json`));
    compareRouteSizes({ [route]: 1000 }, { [route]: 1128 }, true);
    assert.throws(() => compareRouteSizes({ [route]: 1000 }, { [route]: 1129 }, true), /128 byte tolerance, research isolation/);
  });
}

test('isolation caps a larger product budget at 128 bytes; product mode uses the budget', () => {
  const budgets = { '/en/': 512 };
  compareRouteSizes({ '/en/': 1000 }, { '/en/': 1512 }, false, budgets);
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, { '/en/': 1513 }, false, budgets), /512 byte tolerance, product budget/);
  compareRouteSizes({ '/en/': 1000 }, { '/en/': 1128 }, true, budgets);
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, { '/en/': 1129 }, true, budgets), /128 byte tolerance, research isolation/);
});
test('environment selects product budgets only when isolation is explicitly false', () => {
  for (const [mode, growth, status] of [
    ['false', 512, 0], ['false', 513, 1],
    ['true', 128, 0], ['true', 129, 1],
    [undefined, 129, 1], ['', 129, 1],
  ]) {
    const env = { ...process.env };
    delete env.RESEARCH_ISOLATION;
    if (mode !== undefined) env.RESEARCH_ISOLATION = mode;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { compareRouteSizes } from ${JSON.stringify(new URL('./research-route-budget.mjs', import.meta.url).href)};
      compareRouteSizes({ '/en/': 1000 }, { '/en/': ${1000 + growth} }, undefined, { '/en/': 512 });
    `], { env, encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
    if (status) assert.match(result.stderr, mode === 'false' ? /product budget/ : /research isolation/);
  }
});

const manifest = {
  'index.html': { file: 'index.html', dynamicImports: [BLOG_ROUTE_BOUNDARY, 'src/load-app.ts'] },
  'src/load-app.ts': { file: 'load-app.js', dynamicImports: ['src/App.svelte'] },
  'src/App.svelte': { file: 'App.js', imports: ['_shared.js'], dynamicImports: [BLOG_ROUTE_BOUNDARY, 'src/components/paper/PaperPage.svelte', 'src/components/research/load-page.ts'] },
  [BLOG_ROUTE_BOUNDARY]: { file: 'BlogPage.js', imports: ['_shared.js', '_blog-only.js'], css: ['BlogPage.css'] },
  '_shared.js': { file: 'shared.js' },
  '_blog-only.js': { file: 'blog-only.js' },
  'src/components/paper/PaperPage.svelte': { file: 'PaperPage.js' },
  'src/components/research/load-page.ts': { file: 'research.js' },
};
const appRoots = [['index.html', false], ['src/App.svelte', true], ['src/load-app.ts', true]];

test('the blog route boundary and what only it reaches leave the app footprint', () => {
  const files = routeChunkFiles(manifest, appRoots);
  for (const file of ['BlogPage.js', 'BlogPage.css', 'blog-only.js', 'research.js']) assert.ok(!files.has(file), file);
});
test('a chunk the blog shares with App and an ordinary lazy chunk still count', () => {
  const files = routeChunkFiles(manifest, appRoots);
  for (const file of ['App.js', 'shared.js', 'PaperPage.js', 'load-app.js']) assert.ok(files.has(file), file);
});
test('only the named blog entry is a boundary, not every blog module', () => {
  const lazyBlogPart = { ...manifest, 'src/App.svelte': { ...manifest['src/App.svelte'], dynamicImports: ['src/components/blog/ChangelogView.svelte'] },
    'src/components/blog/ChangelogView.svelte': { file: 'ChangelogView.js' } };
  assert.ok(routeChunkFiles(lazyBlogPart, appRoots).has('ChangelogView.js'));
});
test('the landing footprint takes no lazy chunk', () => {
  assert.deepEqual([...routeChunkFiles(manifest, [['index.html', false]])], ['index.html']);
});
