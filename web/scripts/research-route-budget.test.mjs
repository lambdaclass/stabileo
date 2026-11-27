import { localeBytes } from './route-locale-bytes.mjs';
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
    assert.deepEqual(routes[route], { bytes: 2847, localeLimits: { it: 821, nl: 823 }, reason: "#1916 Hungarian, the seventh offered language: its name and lazy loader + #2256 Chinese, the eighth offered language: its name and lazy loader + #2595 Italian, the ninth offered language: its name and lazy loader + #2613 Dutch, the tenth offered language: its name and lazy loader", modules: ["src/lib/i18n/offered.ts", "src/lib/i18n/offered.ts", "src/lib/i18n/offered.ts", "src/lib/i18n/offered.ts"] });
  }
  for (const route of ['/app/basic', '/app/education', '/app/pro']) {
    assert.deepEqual(routes[route], { bytes: 5105596, localeLimits: { it: 1337360, nl: 1321348 }, reason: "#818 original-pencil Rayleigh refinement + #1916 Hungarian, the seventh offered language: its lazily loaded app dictionary + #2256 Chinese, the eighth offered language: its lazily loaded app dictionaries + #2595 Italian, the ninth offered language: its lazily loaded app dictionaries + #2613 Dutch, the tenth offered language: its lazily loaded app dictionaries", modules: ["src/lib/engine/second-order/dense.ts", "src/lib/i18n/locales/hu.ts", "src/lib/i18n/locales/zh.ts", "src/lib/i18n/locales/it.ts", "src/lib/i18n/locales/nl.ts"] });
  }
  assert.deepEqual(routes['/en/research/'], { bytes: 362656, localeLimits: { it: 90677, nl: 89194 }, reason: "#1483 related links styled as theme chips + #1619 riser gallery card and catalogue entry, with its own lead in seven languages + #2257 masonry arch gallery card and catalogue entry + #1916 Hungarian copy of the research gallery and catalogue + #2256 Chinese copy of the research gallery and catalogue + #2595 Italian copy of the research gallery and catalogue + #2613 Dutch copy of the research gallery and catalogue", modules: ["src/components/research/RelatedLinks.svelte", "src/components/research/gayNeto2014/card.ts", "src/components/research/heyman1966/card.ts", "src/components/research/gallery-i18n.ts", "src/components/research/gallery-i18n.ts", "src/components/research/gallery-i18n.ts", "src/components/research/gallery-i18n.ts"] });
  assert.deepEqual(routes['/en/tools/'], { bytes: 227622, localeLimits: { it: 59133, nl: 57480 }, reason: "#1483 related links styled as theme chips + #447 containment messages + #1916 Hungarian copy of the free calculators + #2256 Chinese copy of the free calculators + #2595 Italian copy of the free calculators + #2613 Dutch copy of the free calculators", modules: ["src/components/research/RelatedLinks.svelte", "src/lib/engine/known-issue-message.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts"] });
  for (const route of ['/en/tools/continuous-beam/', '/en/tools/simply-supported-beam/']) {
    assert.deepEqual(routes[route], { bytes: 230306, localeLimits: { it: 59196, nl: 57540 }, reason: "#1483 related links styled as theme chips + #447 containment messages + #1916 Hungarian copy of the free calculators + the shared scalar-field viewer's plan/elevation plane and unlit category colours (calculators keep plan) + #2256 Chinese copy of the free calculators + #2595 Italian copy of the free calculators + #2613 Dutch copy of the free calculators", modules: ["src/components/research/RelatedLinks.svelte", "src/lib/engine/known-issue-message.ts", "src/components/tools/batch-i18n.ts", "src/components/viewport/scalar-field-plane.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts"] });
  }
  assert.deepEqual(routes['/en/tools/beam-frame/'], { bytes: 202245, localeLimits: { it: 71952, nl: 69721 }, reason: "#2256 Chinese copy of the free calculators + #2595 Italian copy of the free calculators + #2613 Dutch copy of the free calculators", modules: ["src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts", "src/components/tools/batch-i18n.ts"] });
  assert.deepEqual(routes['/en/tools/mohr-2d/'], { bytes: 184156, localeLimits: { it: 65369, nl: 63646 }, reason: "#2256 Chinese copy of the free calculators and the Mohr tools + #2595 Italian copy of the free calculators and the Mohr tools + #2613 Dutch copy of the free calculators and the Mohr tools", modules: ["src/components/mohr/i18n.ts", "src/components/mohr/i18n.ts", "src/components/mohr/i18n.ts"] });
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

test('the games page loader is a route boundary: the hub, the game and what only they reach leave the app footprint', () => {
  const loader = 'src/components/games/load-page.ts';
  const withGame = { ...manifest,
    'src/App.svelte': { ...manifest['src/App.svelte'], dynamicImports: [...manifest['src/App.svelte'].dynamicImports, loader] },
    [loader]: { file: 'game-loader.js', dynamicImports: ['src/components/games/GamesPage.svelte', 'src/components/diagram-game/DiagramGamePage.svelte'] },
    'src/components/games/GamesPage.svelte': { file: 'games.js', imports: ['_shared.js'] },
    'src/components/diagram-game/DiagramGamePage.svelte': { file: 'game.js', imports: ['_shared.js'] } };
  assert.ok(isLazyRouteBoundary(loader));
  const files = routeChunkFiles(withGame, appRoots);
  for (const file of ['game-loader.js', 'games.js', 'game.js']) assert.ok(!files.has(file), file);
  assert.ok(files.has('shared.js'));
});

test('shared app growth cannot spend unshipped Dutch or Italian dictionary bytes', () => {
  const main = { '/app/basic': 2000 };
  const sharedLimit = 2446888 + 128;
  const zeros = { '/app/basic': { it: 0, nl: 0 } };
  reviewRouteGrowth(main, { '/app/basic': 2000 + sharedLimit }, 'true', undefined, zeros, zeros);
  assert.throws(() => reviewRouteGrowth(main, { '/app/basic': 2001 + sharedLimit }, 'true', undefined, zeros, zeros), /research isolation/);
});

test('only shipped locale data earns its own allowance', async () => {
  const { localeBytes, publicDictionaryFootprint } = await import('./route-locale-bytes.mjs');
  const code = 'export const words={en:{name:"Bolt"},nl:{name:"Bout"},it:{name:"Bullone"}}; runSharedCode()';
  assert.deepEqual(localeBytes(code, ['/app/shared.js']), { it: Buffer.byteLength('"Bullone"'), nl: Buffer.byteLength('"Bout"') });
  const dictionary = 'const d={title:"Belasting"}; export default d;';
  assert.equal(localeBytes(dictionary, ['/app/src/lib/i18n/locales/nl.ts']).nl, Buffer.byteLength('"Belasting"'));
  const alternatives = [
    { bytes: 100, localized: { it: 0, nl: 0 } },
    { bytes: 110, localized: { it: 80, nl: 0 } },
    { bytes: 115, localized: { it: 0, nl: 85 } },
  ];
  assert.deepEqual(publicDictionaryFootprint(alternatives), { bytes: 115, shared: 100, localized: { it: 80, nl: 85 } });
  const allowances = { '/app': { bytes: 12, localeLimits: { it: 5, nl: 7 } } };
  const from = { '/app': 100 };
  const before = { '/app': { it: 10, nl: 20 } };
  const after = { '/app': { it: 15, nl: 27 } };
  assert.throws(() => reviewRouteGrowth(from, from, 'true', allowances, {}, after), /Invalid/);
  reviewRouteGrowth(from, { '/app': 240 }, 'true', allowances, before, after);
  assert.throws(() => reviewRouteGrowth(from, { '/app': 240 }, 'true', allowances, before, { '/app': { it: 15, nl: 26 } }), /research isolation/);
  assert.throws(() => reviewRouteGrowth(from, { '/app': 240 }, 'true', allowances, before, { '/app': { it: 16, nl: 26 } }), /it resource growth/);
});

test('credits only literal Italian copy in the emitted chunk', () => {
  const data = '"è"';
  const mixed = `export const labels = {en:{text:"shared"},it:{text:${data},run:()=>"logic"}};`;
  assert.equal(localeBytes(mixed, ['labels.ts']).it, Buffer.byteLength(data));
  assert.equal(localeBytes('export const obj = {it:"unrelated"}', ['other.ts']).it, 0);
  const dedicated = `export default {title:${data},values:[${data}]};`;
  assert.equal(localeBytes(dedicated, ['/app/src/lib/i18n/locales/steel/it.ts']).it, 2 * Buffer.byteLength(data));
  assert.equal(localeBytes(dedicated, ['/app/src/lib/i18n/locales/steel/it.ts', 'other.ts']).it, 0);
});

test('#2613 — a partitioned route requires both locale measurements', () => {
  assert.throws(() => reviewRouteGrowth({ '/app/basic': 0 }, { '/app/basic': 1400000 }, 'true'), /measurement/i);
});

test('#2613 — shrinking the Italian alternative cannot increase the Dutch charge', async () => {
  const { publicDictionaryFootprint } = await import('./route-locale-bytes.mjs');
  const measure = it => publicDictionaryFootprint([
    { bytes: 100, localized: { it: 0, nl: 0 } },
    { bytes: it, localized: { it, nl: 0 } },
    { bytes: 1100, localized: { it: 0, nl: 1100 } },
  ]);
  assert.equal(measure(100).bytes, 1100);
  assert.equal(measure(1000).localized.nl, measure(100).localized.nl);
});

test('#2613 — only verified translation bindings earn locale bytes', async () => {
  const { localeBytes } = await import('./route-locale-bytes.mjs');
  const code = 'const en={text:"Bolt"},it={text:"Vite"},nl={text:"Bout"};export const tables={en,it,nl}';
  const actual = localeBytes(code, ['labels.ts']);
  assert.ok(actual.it >= Buffer.byteLength('"Vite"'));
  assert.ok(actual.nl >= Buffer.byteLength('"Bout"'));
  assert.deepEqual(localeBytes('const options={nl:{text:"unrelated"}}', ['feature.ts']), { it: 0, nl: 0 });
  const shared = 'const common = { msg: "shared" }; export const dict = { en: common, nl: common };';
  assert.deepEqual(localeBytes(shared, ['feature.ts']), { it: 0, nl: 0 });
  const dedicated = 'const opts = { nl: "unrelated" }; log(opts); const words = { msg: "Bout" }; export default { ...words };';
  assert.deepEqual(localeBytes(dedicated, ['/app/src/lib/i18n/locales/nl.ts']), { it: 0, nl: Buffer.byteLength('"Bout"') });
});

test('#2613 — old route baselines apply the shared limit without locale credit', async () => {
  const { reviewRouteBaseline } = await import('./research-route-budget.mjs');
  const previous = { routes: { '/en/': 100 } };
  const allowances = { '/en/': { bytes: 23, localeLimits: { it: 10, nl: 10 } } };
  const compare = bytes => reviewRouteBaseline(previous, { '/en/': bytes }, { '/en/': { it: 0, nl: 0, shared: bytes } }, 'true', allowances);
  compare(90);
  compare(231);
  assert.throws(() => compare(232), /research isolation/);
});

test('#2613 — the emitted route fixture charges every loaded chunk at its byte limit', async () => {
  const { measureRouteFiles, localeBytes } = await import('./route-locale-bytes.mjs');
  const code = 'const en={text:"Bolt"},nl={text:"Bout"};export const words={en,nl}';
  const files = new Set(['entry.js', 'feature.js', 'entry.css', 'public-nl.js']);
  const alternatives = new Set(['public-en.js', 'public-nl.js']);
  const sizes = new Map([['entry.js', 211], ['feature.js', Buffer.byteLength(code)], ['entry.css', 19], ['public-en.js', 700], ['public-nl.js', 610]]);
  const measure = suffix => {
    const emitted = code.replace('Bout', 'Bout' + suffix);
    sizes.set('feature.js', Buffer.byteLength(emitted));
    return measureRouteFiles(files, alternatives, file => sizes.get(file), new Map([['feature.js', localeBytes(emitted, ['feature.ts'])]]));
  };
  const base = measure('');
  assert.equal(base.bytes, 930 + Buffer.byteLength(code));
  const compare = suffix => {
    const next = measure(suffix);
    reviewRouteGrowth({ fixture: base.bytes }, { fixture: next.bytes }, 'true', { fixture: { bytes: 5, localeLimits: { it: 0, nl: 5 } } }, { fixture: base.localeSizes }, { fixture: next.localeSizes });
  };
  compare('12345');
  assert.throws(() => compare('123456'), /nl resource growth/);
});

test('an existing Dutch alternative below the route maximum still has its own growth limit', async () => {
  const { measureRouteFiles } = await import('./route-locale-bytes.mjs');
  const dictionaries = new Set(['shared', 'nl']);
  const measure = n => measureRouteFiles([], dictionaries, file => file === 'nl' ? n : 1000, new Map([['nl', { it: 0, nl: n }]]));
  const baseline = { route: 1000 };
  const before = { route: measure(100).localeSizes };
  const compare = n => reviewRouteGrowth(baseline, baseline, 'true',
    { route: { bytes: 10, localeLimits: { nl: 10, it: 0 } } }, before, { route: measure(n).localeSizes });
  compare(110);
  assert.throws(() => compare(111), /nl resource growth 11 exceeds 10/);
});

test('known wrong result: #2595 — a static Italian dictionary binding is counted once', () => {
  const copy = '"città"';
  for (const map of ['{en, it}', '{en, it:it}']) {
    const source = `const en={}, it={label:${copy}}; export const a=${map}, b=${map};`;
    assert.equal(italianCopyBytes(source, ['labels.ts'], parseAst), Buffer.byteLength(copy));
  }
});

test('known wrong result: #2595 — shared bytes inside the largest public chunk retain their own budget', async () => {
  const { comparePartitions } = await import('./research-route-budget.mjs');
  const route = '/en/';
  const snapshot = (total, copy) => ({
    routes: { [route]: total }, italian: { [route]: total - 90000 },
    publicLocales: { en: { total: 90000, italian: 0 }, it: { total, italian: copy } },
  });
  const base = snapshot(100000, 40000);
  const allowances = { [route]: { bytes: 20000, italianBytes: 20000 } };
  const check = candidate => comparePartitions(base, candidate, 'true', allowances);
  check(snapshot(110000, 50000));
  assert.throws(() => check(snapshot(100000, 60001)), /Italian copy/);
  check(snapshot(100128, 40000));
  assert.throws(() => check(snapshot(100129, 40000)), /research isolation/);
  assert.throws(() => check(snapshot(110000, 40000)), /research isolation/);
});

test('known wrong result: #2595 — legacy route baselines require measuring the base revision', async () => {
  const { comparePartitions } = await import('./research-route-budget.mjs');
  assert.throws(() => comparePartitions({ routes: baseline }, { routes: baseline }), /base revision.*--update/i);

test('the app footprint counts a separate lazy import of the games registry and its thumbnail', () => {
  const registry = 'src/components/games/games.ts';
  const thumbnail = 'src/components/games/DiagramGameThumb.svelte';
  const files = routeChunkFiles({
    ...manifest,
    'src/App.svelte': { ...manifest['src/App.svelte'], dynamicImports: [registry] },
    [registry]: { file: 'registry.js', imports: [thumbnail] },
    [thumbnail]: { file: 'thumbnail.js', css: ['thumbnail.css'] },
  }, appRoots);
  for (const file of ['registry.js', 'thumbnail.js', 'thumbnail.css']) assert.ok(files.has(file), file);
});

test('the app footprint counts diagram game strings loaded separately from the games page loader', () => {
  const strings = 'src/components/diagram-game/strings.ts';
  const loader = 'src/components/games/load-page.ts';
  const files = routeChunkFiles({
    ...manifest,
    'src/App.svelte': { ...manifest['src/App.svelte'], dynamicImports: [loader, strings] },
    [loader]: { file: 'game-loader.js', dynamicImports: ['src/components/diagram-game/DiagramGamePage.svelte'] },
    'src/components/diagram-game/DiagramGamePage.svelte': { file: 'game.js', imports: [strings] },
    [strings]: { file: 'strings.js' },
  }, appRoots);
  assert.ok(files.has('strings.js'));
  assert.ok(!files.has('game-loader.js'));
  assert.ok(!files.has('game.js'));
});
