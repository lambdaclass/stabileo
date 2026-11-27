import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checkResearchIsolation, routeAllowances, growthTable, overCeilings, reviewRouteGrowth, routeChunkFiles, routeGrowth, BLOG_ROUTE_BOUNDARY, COURSE_ROUTE_BOUNDARY, isBlogPostsChunk, isLazyRouteBoundary } from './research-route-budget.mjs';

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
      reviewRouteGrowth({ '/de/': 1000 }, { '/de/': ${1000 + growth} });
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
  assert.equal(parse([entry, { ...entry, bytes: 100 }])['/en/tools/'].bytes, 700);
  assert.throws(() => parse([]), /invalid route allowance/);
  assert.throws(() => parse([entry, { ...entry, reason: '' }]), /invalid route allowance/);
});
test('the shipped allowances are the #1483 related links on research and tools, the #1619 riser card and #2257 masonry arch card on research, the #447 containment messages on tools, the viewer plane on the two calculators, #818 Rayleigh refinement on the app, #1916 Hungarian, #2256 Chinese, #2595 Italian and #2613 Dutch on the measured routes', () => {
  const routes = routeAllowances(readFileSync(new URL('./research-route-allowances.json', import.meta.url), 'utf8'), () => true);
  assert.deepEqual(Object.keys(routes).sort(), ['/app/basic', '/app/education', '/app/pro', '/en/', '/en/research/', '/en/tools/', '/en/tools/beam-frame/', '/en/tools/continuous-beam/', '/en/tools/mohr-2d/', '/en/tools/simply-supported-beam/', '/es/', '/pt/']);
  for (const route of ['/en/', '/es/', '/pt/']) {
    assert.deepEqual(routes[route], { bytes: 2926, localeLimits: { it: 900, nl: 823 }, reason: "#1916 Hungarian, the seventh offered language: its name and lazy loader + #2256 Chinese, the eighth offered language: its name and lazy loader + #2595 Italian, the ninth offered language: its name and lazy loader + #2613 Dutch, the tenth offered language: its name and lazy loader", modules: ["src/lib/i18n/offered.ts", "src/lib/i18n/offered.ts", "src/lib/i18n/offered.ts", "src/lib/i18n/offered.ts"] });
  }
  for (const route of ['/app/basic', '/app/education', '/app/pro']) {
    assert.deepEqual(routes[route], { bytes: 5108236, localeLimits: { it: 1340000, nl: 1321348 }, reason: "#818 original-pencil Rayleigh refinement + #1916 Hungarian, the seventh offered language: its lazily loaded app dictionary + #2256 Chinese, the eighth offered language: its lazily loaded app dictionaries + #2595 Italian, the ninth offered language: its lazily loaded app dictionaries + #2613 Dutch, the tenth offered language: its lazily loaded app dictionaries", modules: ["src/lib/engine/second-order/dense.ts", "src/lib/i18n/locales/hu.ts", "src/lib/i18n/locales/zh.ts", "src/lib/i18n/locales/it.ts", "src/lib/i18n/locales/nl.ts"] });
  }
  assert.deepEqual(routes['/en/research/'], { bytes: 363979, localeLimits: { it: 92000, nl: 89194 }, reason: "#1483 related links styled as theme chips + #1619 riser gallery card and catalogue entry, with its own lead in seven languages + #2257 masonry arch gallery card and catalogue entry + #1916 Hungarian copy of the research gallery and catalogue + #2256 Chinese copy of the research gallery and catalogue + #2595 Italian copy of the research gallery and catalogue + #2613 Dutch copy of the research gallery and catalogue", modules: ["src/components/research/RelatedLinks.svelte", "src/components/research/gayNeto2014/card.ts", "src/components/research/heyman1966/card.ts", "src/components/research/gallery-i18n.ts", "src/components/research/gallery-i18n.ts", "src/components/research/gallery-i18n.ts", "src/components/research/gallery-i18n.ts"] });
  assert.deepEqual(routes['/en/tools/'], { bytes: 228489, localeLimits: { it: 60000, nl: 57480 }, reason: "#1483 related links styled as theme chips + #447 containment messages + #1916 Hungarian copy of the free calculators + #2256 Chinese copy of the free calculators + #2595 Italian copy of the free calculators + #2613 Dutch copy of the free calculators", modules: ["src/components/research/RelatedLinks.svelte", "src/lib/engine/known-issue-message.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts"] });
  for (const route of ['/en/tools/continuous-beam/', '/en/tools/simply-supported-beam/']) {
    assert.deepEqual(routes[route], { bytes: 231110, localeLimits: { it: 60000, nl: 57540 }, reason: "#1483 related links styled as theme chips + #447 containment messages + #1916 Hungarian copy of the free calculators + the shared scalar-field viewer's plan/elevation plane and unlit category colours (calculators keep plan) + #2256 Chinese copy of the free calculators + #2595 Italian copy of the free calculators + #2613 Dutch copy of the free calculators", modules: ["src/components/research/RelatedLinks.svelte", "src/lib/engine/known-issue-message.ts", "src/components/tools/batch-i18n.ts", "src/components/viewport/scalar-field-plane.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts"] });
  }
  assert.deepEqual(routes['/en/tools/beam-frame/'], { bytes: 203293, localeLimits: { it: 73000, nl: 69721 }, reason: "#2256 Chinese copy of the free calculators + #2595 Italian copy of the free calculators + #2613 Dutch copy of the free calculators", modules: ["src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts"] });
  assert.deepEqual(routes['/en/tools/mohr-2d/'], { bytes: 185287, localeLimits: { it: 66500, nl: 63646 }, reason: "#2256 Chinese copy of the free calculators and the Mohr tools + #2595 Italian copy of the free calculators and the Mohr tools + #2613 Dutch copy of the free calculators and the Mohr tools", modules: ["src/components/mohr/i18n.ts", "src/components/mohr/i18n.ts", "src/components/mohr/i18n.ts"] });
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
  assert.deepEqual(Object.keys(routes).sort(), ['/app/basic', '/app/education', '/app/pro', '/en/', '/en/research/', '/en/tools/', '/en/tools/beam-frame/', '/en/tools/continuous-beam/', '/en/tools/mohr-2d/', '/en/tools/simply-supported-beam/', '/es/', '/pt/']);
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
test('the posts chunk the landing teaser loads lazily leaves the app footprint; imported statically it counts', () => {
  const posts = { ...manifest, 'index.html': { ...manifest['index.html'], dynamicImports: [...manifest['index.html'].dynamicImports, '_posts.js'] },
    'src/App.svelte': { ...manifest['src/App.svelte'], imports: ['_shared.js', 'index.html'] }, '_posts.js': { file: 'posts.js' } };
  const boundary = (key) => isLazyRouteBoundary(key) || key === '_posts.js';
  assert.ok(routeChunkFiles(posts, appRoots).has('posts.js'));
  assert.ok(!routeChunkFiles(posts, appRoots, () => {}, boundary).has('posts.js'));
  const staticPosts = { ...posts, 'src/App.svelte': { ...posts['src/App.svelte'], imports: ['_shared.js', 'index.html', '_posts.js'] } };
  assert.ok(routeChunkFiles(staticPosts, appRoots, () => {}, boundary).has('posts.js'));
});
test('only a chunk of nothing but the blog posts and their index is the posts boundary', () => {
  assert.ok(isBlogPostsChunk(['/w/src/lib/blog/index.ts', '/w/src/lib/blog/posts/a.ts', '/w/src/lib/blog/translations/de/a.ts']));
  assert.ok(!isBlogPostsChunk(['/w/src/lib/blog/posts/a.ts']));
  assert.ok(!isBlogPostsChunk(['/w/src/lib/blog/index.ts', '/w/src/lib/store/model.svelte.ts']));
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

test('the diagram game page loader is a route boundary: the game and what only it reaches leave the app footprint', () => {
  const loader = 'src/components/diagram-game/load-page.ts';
  const withGame = { ...manifest,
    'src/App.svelte': { ...manifest['src/App.svelte'], dynamicImports: [...manifest['src/App.svelte'].dynamicImports, loader] },
    [loader]: { file: 'game-loader.js', dynamicImports: ['src/components/diagram-game/DiagramGamePage.svelte'] },
    'src/components/diagram-game/DiagramGamePage.svelte': { file: 'game.js', imports: ['_shared.js'] } };
  assert.ok(isLazyRouteBoundary(loader));
  const files = routeChunkFiles(withGame, appRoots);
  for (const file of ['game-loader.js', 'game.js']) assert.ok(!files.has(file), file);
  assert.ok(files.has('shared.js'));
});

test('shared app growth cannot spend unshipped Dutch or Italian dictionary bytes', () => {
  const main = { '/app/basic': 2000 };
  const sharedLimit = 2446888 + 128;
  reviewRouteGrowth(main, { '/app/basic': 2000 + sharedLimit }, 'true');
  assert.throws(() => reviewRouteGrowth(main, { '/app/basic': 2001 + sharedLimit }, 'true'), /research isolation/);
});

test('only shipped locale data earns its own allowance', async () => {
  const { localeBytes, publicDictionaryFootprint } = await import('./route-locale-bytes.mjs');
  const code = 'export const words={en:{name:"Bolt"},nl:{name:"Bout"},it:{name:"Bullone"}}; runSharedCode()';
  assert.deepEqual(localeBytes(code, ['/app/shared.js']), { it: Buffer.byteLength('it:{name:"Bullone"}'), nl: Buffer.byteLength('nl:{name:"Bout"}') });
  const dictionary = 'const d={title:"Belasting"}; export default d;';
  assert.equal(localeBytes(dictionary, ['/app/src/lib/i18n/locales/nl.ts']).nl, Buffer.byteLength('title:"Belasting"'));
  const alternatives = [
    { bytes: 100, localized: { it: 0, nl: 0 } },
    { bytes: 110, localized: { it: 80, nl: 0 } },
    { bytes: 115, localized: { it: 0, nl: 85 } },
  ];
  assert.deepEqual(publicDictionaryFootprint(alternatives), { bytes: 115, localized: { it: 10, nl: 5 } });
  const allowances = { '/app': { bytes: 12, localeLimits: { it: 5, nl: 7 } } };
  const from = { '/app': 100 };
  const before = { '/app': { it: 10, nl: 20 } };
  const after = { '/app': { it: 15, nl: 27 } };
  assert.throws(() => reviewRouteGrowth(from, from, 'true', allowances, {}, after), /Invalid/);
  reviewRouteGrowth(from, { '/app': 240 }, 'true', allowances, before, after);
  assert.throws(() => reviewRouteGrowth(from, { '/app': 240 }, 'true', allowances, before, { '/app': { it: 15, nl: 26 } }), /research isolation/);
  assert.throws(() => reviewRouteGrowth(from, { '/app': 240 }, 'true', allowances, before, { '/app': { it: 16, nl: 26 } }), /it resource growth/);
});
