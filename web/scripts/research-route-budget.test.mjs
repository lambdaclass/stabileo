import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checkResearchIsolation, routeAllowances, growthTable, overCeilings, reviewRouteGrowth, routeChunkFiles, routeGrowth, BLOG_ROUTE_BOUNDARY, COURSE_ROUTE_BOUNDARY } from './research-route-budget.mjs';

const baseline = { '/en/': 1000, '/app/basic': 2000 };

test('product growth of any size is reported, never refused', () => {
  const rows = routeGrowth(baseline, { '/en/': 1000, '/app/basic': 90000 });
  assert.deepEqual(rows, [{ route: '/en/', before: 1000, after: 1000, growth: 0 }, { route: '/app/basic', before: 2000, after: 90000, growth: 88000 }]);
  assert.match(growthTable(rows), /\| \/app\/basic \| 2000 \| 90000 \| \+88000 \|/);
});
test('a change touching research may grow a route by 128 bytes and no more', () => {
  for (const route of Object.keys(baseline)) {
    checkResearchIsolation(routeGrowth(baseline, { ...baseline, [route]: baseline[route] + 128 }));
    assert.throws(() => checkResearchIsolation(routeGrowth(baseline, { ...baseline, [route]: baseline[route] + 129 })), /128 byte tolerance, research isolation/);
  }
});
test('RESEARCH_ISOLATION enforces 128 bytes unless it is exactly false', () => {
  for (const [mode, growth, status] of [
    ['false', 90000, 0], ['true', 128, 0], ['true', 129, 1], [undefined, 129, 1], ['', 129, 1],
  ]) {
    const env = { ...process.env };
    delete env.RESEARCH_ISOLATION;
    if (mode !== undefined) env.RESEARCH_ISOLATION = mode;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { reviewRouteGrowth } from ${JSON.stringify(new URL('./research-route-budget.mjs', import.meta.url).href)};
      reviewRouteGrowth({ '/en/': 1000 }, { '/en/': ${1000 + growth} });
    `], { env, encoding: 'utf8' });
    assert.equal(result.status, status, `${mode} ${growth}: ${result.stderr}`);
    if (status) assert.match(result.stderr, /research isolation/);
  }
  assert.equal(reviewRouteGrowth({ '/en/': 1000 }, { '/en/': 5000 }, 'false')[0].growth, 4000);
});
test('a recorded allowance widens only its own route, and an unlisted route still fails at 129 bytes', () => {
  const allowances = { '/en/': { bytes: 600, reason: 'r', module: 'm' } };
  checkResearchIsolation(routeGrowth(baseline, { ...baseline, '/en/': 1000 + 728 }), allowances);
  assert.throws(() => checkResearchIsolation(routeGrowth(baseline, { ...baseline, '/en/': 1000 + 729 }), allowances), /728 byte tolerance, with 600 allowed for r/);
  assert.throws(() => checkResearchIsolation(routeGrowth(baseline, { ...baseline, '/app/basic': 2000 + 129 }), allowances), /\/app\/basic grew: 2000 -> 2129 bytes \(128 byte tolerance, research/);
});
test('allowances need bytes, a reason and an existing module', () => {
  const entry = { bytes: 600, reason: '#447 containment messages', module: 'src/x.ts' };
  const parse = (e, exists = () => true) => routeAllowances(JSON.stringify({ routes: { '/en/tools/': e } }), exists);
  assert.equal(parse(entry)['/en/tools/'].bytes, 600);
  for (const bad of [{ ...entry, bytes: 0 }, { ...entry, bytes: 1.5 }, { ...entry, reason: ' ' }, { ...entry, module: undefined }]) assert.throws(() => parse(bad), /invalid route allowance/);
  assert.throws(() => parse(entry, () => false), /invalid route allowance/);
});
test('the shipped allowances are only the research and tools routes, for the #1483 related links', () => {
  const { routes } = JSON.parse(readFileSync(new URL('./research-route-allowances.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(routes).sort(), ['/en/research/', '/en/tools/', '/en/tools/continuous-beam/', '/en/tools/simply-supported-beam/']);
  for (const a of Object.values(routes)) assert.deepEqual(a, { bytes: 700, reason: '#1483 related links styled as theme chips', module: 'src/components/research/RelatedLinks.svelte' });
});
test('missing and non-finite measurements fail', () => {
  assert.throws(() => routeGrowth({ '/en/': 1000 }, {}), /coverage/);
  assert.throws(() => routeGrowth({ '/en/': 1000 }, { '/en/': NaN }), /finite/);
});
test('a route over its absolute ceiling is named; at the ceiling it is not', () => {
  assert.deepEqual(overCeilings({ '/en/': 100, '/app/pro': 200 }, { '/en/': 100, '/app/pro': 199 }), [{ route: '/app/pro', bytes: 200, ceiling: 199 }]);
  assert.throws(() => overCeilings({ '/en/': 100 }, {}), /missing or invalid ceiling/);
});
test('the shipped ceilings cover every measured route', () => {
  const { routes } = JSON.parse(readFileSync(new URL('./route-size-ceilings.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(routes).sort(), ['/app/basic', '/app/education', '/app/pro', '/en/', '/en/research/', '/en/tools/', '/en/tools/continuous-beam/', '/en/tools/simply-supported-beam/', '/es/', '/pt/']);
  for (const bytes of Object.values(routes)) assert.ok(Number.isInteger(bytes) && bytes > 0);
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

test('the course route boundary and what only it reaches leave the app footprint; what App shares with it stays', () => {
  const withCourse = { ...manifest,
    'src/App.svelte': { ...manifest['src/App.svelte'], dynamicImports: [...manifest['src/App.svelte'].dynamicImports, COURSE_ROUTE_BOUNDARY] },
    [COURSE_ROUTE_BOUNDARY]: { file: 'course-route.js', imports: ['_shared.js', '_course-only.js'], dynamicImports: ['src/lib/course/locale-de.ts'] },
    '_course-only.js': { file: 'course-only.js' },
    'src/lib/course/locale-de.ts': { file: 'course-de.js' } };
  const files = routeChunkFiles(withCourse, appRoots);
  for (const file of ['course-route.js', 'course-only.js', 'course-de.js']) assert.ok(!files.has(file), file);
  assert.ok(files.has('shared.js'));
});
