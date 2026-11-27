/** Build and measure each route's dependency footprint. Run from web/ with one of:
 * --baseline <file> --update   write the measurement as a baseline;
 * --baseline <file>            report growth against it (blocks only research isolation, RESEARCH_ISOLATION);
 * --ceiling <file> [--report <file>]  fail when a route is over its absolute ceiling.
 * Landing: entry's static closure plus the landing page's. /app/*: that closure plus App's static and lazy product
 * dependencies. Modes share an entry, so receive the same conservative byte budget.
 * /en/research/ and /en/tools/: the landing's closure plus the page loader's static closure and
 * its page chunk; per-page details (load-detail) are excluded, so every paper's code stays out.
 * Every route counts the largest per-language public dictionary chunk, which it loads lazily: a reader loads one.
 */
import { localeBytes, measuredLocales, publicDictionaryFootprint } from './route-locale-bytes.mjs';
import { build } from 'vite';
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { growthTable, isBlogPostsChunk, isLazyRouteBoundary, overCeilings, reviewRouteGrowth, routeChunkFiles, routeGrowth } from './research-route-budget.mjs';

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const baselinePath = arg('--baseline');
const ceilingPath = arg('--ceiling');
if (!baselinePath === !ceilingPath) throw new Error('give exactly one of --baseline <file> or --ceiling <file>');
const outDir = mkdtempSync(join(tmpdir(), 'research-route-size-'));
process.env.GITHUB_SHA = '000000000000';
delete process.env.VITE_E2E;
delete process.env.VITE_APP_TYPE;
const featureSwitches = {};
const researchChunks = new Set();
const toolsChunks = new Set();
const blogPostsChunks = new Set();
const publicLocaleChunks = new Set();
const chunkLocaleBytes = new Map();
const localized = {};
try {
  // A deterministic engine stub makes this gate independent of locally built WASM. It measures
  // web dependency isolation, not the engine binary, which has its own build/validation gates.
  await build({
    plugins: [{ name: 'route-size-engine-stub', enforce: 'pre', configResolved(config) {
      for (const feature of ['research', 'tools']) {
        featureSwitches[feature] = JSON.parse(config.define[`__PUBLIC_FEATURES__.${feature}`]);
      }
    }, resolveId(id) {
      if (id.includes('dedaliano_engine_bg.wasm')) return '\0route-size-wasm';
      if (id.includes('wasm/dedaliano_engine') && id.endsWith('.js')) return '\0route-size-engine';
    }, transform(code, id) {
      if (id.endsWith('/lib/engine/wasm-solver.ts')) {
        return code.replaceAll("new URL('../wasm/dedaliano_engine_bg.wasm', import.meta.url)", "new URL('data:application/wasm;base64,AGFzbQEAAAA=')");
      }
    }, load(id) {
      if (id === '\0route-size-wasm') return 'export default "data:application/wasm;base64,AGFzbQEAAAA=";';
      if (id === '\0route-size-engine') return 'export function initSync() {} export function solve_3d() { return "{}"; }';
    }, generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && baselinePath) {
          chunkLocaleBytes.set(output.fileName, localeBytes(output.code, Object.keys(output.modules)));
        }
        if (output.type === 'chunk' && isBlogPostsChunk(Object.keys(output.modules))) blogPostsChunks.add(output.fileName);
        if (output.type === 'chunk' && Object.keys(output.modules).some((id) => id.includes('/components/tools/') || id.includes('/components/examples/') || id.includes('/components/diagram-game/'))) toolsChunks.add(output.fileName);
        if (output.type === 'chunk' && Object.keys(output.modules).some((id) => id.startsWith('\0virtual:public-i18n/'))) publicLocaleChunks.add(output.fileName);
        if (output.type === 'chunk' && Object.keys(output.modules).some((id) => id.includes('/components/research/') || /\/research\/.*\.json$/.test(id))) {
          researchChunks.add(output.fileName);
        }
      }
    } }],
    build: { outDir, emptyOutDir: true, manifest: true }, logLevel: 'error',
  });
  const manifest = JSON.parse(readFileSync(join(outDir, '.vite/manifest.json'), 'utf8'));
  const appEntry = Object.keys(manifest).find((key) => manifest[key].name === 'App');
  if (!appEntry) throw new Error('missing App entry');
  function footprint(app, feature = null, detail = null) {
    const loader = Object.keys(manifest).find(key => manifest[key].name === 'load-app');
    const roots = [['index.html', false]];
    if (!feature && manifest['src/components/LandingPage.svelte']) roots.push(['src/components/LandingPage.svelte', false]);
    if (app) roots.push([appEntry, true], ...(loader ? [[loader, true]] : []));
    const files = routeChunkFiles(manifest, roots, (key, chunk) => {
      if (toolsChunks.has(chunk.file)) throw new Error(`product statically imports tools, examples or the diagram game: ${key}`);
      if (researchChunks.has(chunk.file)) throw new Error(`product statically imports research: ${key}`);
    }, (key) => isLazyRouteBoundary(key) || blogPostsChunks.has(manifest[key]?.file));
    if (feature) {
      const pageLoader = `src/components/${feature}/load-page.ts`;
      if (!manifest[pageLoader]) throw new Error(`missing manifest entry ${pageLoader}`);
      const featureRoots = [pageLoader, ...(manifest[pageLoader].dynamicImports ?? []).filter((dep) => !/load-(?:main-)?detail\.ts$/.test(dep))];
      if (detail) {
        const name = detail.replace(/\.svelte$/, '');
        const key = manifest[`src/components/${feature}/${detail}`] ? `src/components/${feature}/${detail}` : Object.keys(manifest).find((k) => manifest[k].name === name && manifest[k].src === undefined);
        if (!key) throw new Error(`missing manifest entry for ${detail}`);
        featureRoots.push(key);
      }
      for (const file of routeChunkFiles(manifest, featureRoots.map((key) => [key, false]))) files.add(file);
    }
    // Public fonts/images and emitted workers referenced by the selected bundles also count.
    // Iterating a Set visits newly added assets, so CSS reached through HTML is covered too.
    for (const file of files) {
      if (!/\.(?:js|css|html)$/.test(file)) continue;
      for (const match of readFileSync(join(outDir, file), 'utf8').matchAll(/["'(](\/[^"'()\s]+)["')]/g)) {
        const relative = match[1].slice(1).split('?')[0];
        if (!relative.includes('..') && existsSync(join(outDir, relative)) && statSync(join(outDir, relative)).isFile()) files.add(relative);
      }
    }
    const size = (file) => statSync(join(outDir, file)).size;
    const rest = [...files].filter((file) => !publicLocaleChunks.has(file));
    const publicDictionary = publicDictionaryFootprint([...publicLocaleChunks].map(file => ({
      bytes: size(file), localized: chunkLocaleBytes.get(file) ?? { it: 0, nl: 0 },
    })));
    const localeSizes = Object.fromEntries(measuredLocales.map(locale => [
      locale, rest.reduce((sum, file) => sum + (chunkLocaleBytes.get(file)?.[locale] ?? 0), publicDictionary.localized[locale]),
    ]));
    return { bytes: rest.reduce((total, file) => total + size(file), publicDictionary.bytes), localeSizes };
  }
  const landing = footprint(false), app = footprint(true);
  const footprints = { '/en/': landing, '/es/': landing, '/pt/': landing,
    '/app/basic': app, '/app/education': app, '/app/pro': app };
  const featureRoutes = {
    research: { '/en/research/': { published: null, expanded: null } },
    tools: {
      '/en/tools/': { published: null, expanded: null },
      '/en/tools/simply-supported-beam/': { published: 'ToolViewer.svelte', expanded: 'CalculatorTool.svelte' },
      '/en/tools/continuous-beam/': { published: 'MainBatchTool.svelte', expanded: 'BatchTool.svelte' },
      '/en/tools/beam-frame/': { expanded: 'ModelTool.svelte' },
      '/en/tools/mohr-2d/': { expanded: 'MohrTool.svelte' },
    },
  };
  for (const [feature, routes] of Object.entries(featureRoutes)) {
    const expanded = featureSwitches[feature];
    for (const [route, details] of Object.entries(routes)) {
      const detail = expanded ? details.expanded : details.published;
      if (detail === undefined) console.log(`${route}: skipped (${feature}=false)`);
      else footprints[route] = footprint(false, feature, detail);
    }
  }
  const measured = Object.fromEntries(Object.entries(footprints).map(([route, data]) => [route, data.bytes]));
  for (const [route, data] of Object.entries(footprints)) localized[route] = data.localeSizes;
  for (const [route, bytes] of Object.entries(measured)) console.log(`${route}: ${bytes} bytes`);
  if (ceilingPath) {
    const over = overCeilings(measured, JSON.parse(readFileSync(ceilingPath, 'utf8')).routes);
    const report = arg('--report');
    if (report) {
      writeFileSync(report, over.length
        ? ['| Route | bytes | ceiling |', '|---|---:|---:|', ...over.map((r) => `| ${r.route} | ${r.bytes} | ${r.ceiling} |`)].join('\n') + '\n'
        : '');
    }
    for (const r of over) console.log(`${r.route} is over its ceiling: ${r.bytes} > ${r.ceiling} bytes`);
    if (over.length) process.exitCode = 1;
  } else if (process.argv.includes('--update')) {
    writeFileSync(baselinePath, JSON.stringify({ routes: measured, localized }, null, 2) + '\n');
    console.log(`Updated ${baselinePath}.`);
  } else {
    const { routes: baseline, localized: previous } = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (!previous) throw new Error('Regenerate the route baseline with locale byte measurements');
    const table = growthTable(routeGrowth(baseline, measured));
    console.log(table);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Route size against main\n\n${table}\n`);
    for (const r of routeGrowth(baseline, measured)) if (r.growth > 0) console.log(`::notice title=Route size::${r.route} grew by ${r.growth} bytes against main`);
    reviewRouteGrowth(baseline, measured, process.env.RESEARCH_ISOLATION, undefined, previous, localized);
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
