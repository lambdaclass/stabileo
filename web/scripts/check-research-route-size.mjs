/** Build and measure each route's dependency footprint. Run from web/ with one of:
 * --baseline <file> --update   write the measurement as a baseline;
 * --baseline <file>            report growth against it (blocks only research isolation, RESEARCH_ISOLATION);
 * --ceiling <file> [--report <file>]  fail when a route is over its absolute ceiling.
 * Landing: entry's static closure plus the landing page's. /app/*: that closure plus App's static and lazy product
 * dependencies. Modes share an entry, so receive the same conservative byte budget.
 * /en/research/ and /en/tools/: the landing's closure plus the page loader's static closure and
 * its page chunk; per-page details (load-detail) are excluded, so every paper's code stays out.
 * A tool page adds its own detail chunk's static closure (never the solver, which is lazy).
 * Every route counts the largest per-language public dictionary chunk, which it loads lazily: a reader loads one.
 */
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
const researchChunks = new Set();
const toolsChunks = new Set();
const blogPostsChunks = new Set();
const publicLocaleChunks = new Set();
try {
  // A deterministic engine stub makes this gate independent of locally built WASM. It measures
  // web dependency isolation, not the engine binary, which has its own build/validation gates.
  await build({
    plugins: [{ name: 'route-size-engine-stub', enforce: 'pre', resolveId(id) {
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
        if (output.type === 'chunk' && isBlogPostsChunk(Object.keys(output.modules))) blogPostsChunks.add(output.fileName);
        if (output.type === 'chunk' && Object.keys(output.modules).some((id) => id.includes('/components/tools/'))) toolsChunks.add(output.fileName);
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
      if (toolsChunks.has(chunk.file)) throw new Error(`product statically imports tools: ${key}`);
      if (researchChunks.has(chunk.file)) throw new Error(`product statically imports research: ${key}`);
    }, (key) => isLazyRouteBoundary(key) || blogPostsChunks.has(manifest[key]?.file));
    if (feature) {
      const pageLoader = `src/components/${feature}/load-page.ts`;
      if (!manifest[pageLoader]) throw new Error(`missing manifest entry ${pageLoader}`);
      const featureRoots = [pageLoader, ...(manifest[pageLoader].dynamicImports ?? []).filter((dep) => !/load-detail\.ts$/.test(dep))];
      if (detail && manifest[`src/components/${feature}/${detail}`]) featureRoots.push(`src/components/${feature}/${detail}`);
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
    return rest.reduce((total, file) => total + size(file), 0) + Math.max(0, ...[...publicLocaleChunks].map(size));
  }
  const landing = footprint(false), app = footprint(true);
  const measured = { '/en/': landing, '/es/': landing, '/pt/': landing,
    '/app/basic': app, '/app/education': app, '/app/pro': app,
    '/en/research/': footprint(false, 'research'), '/en/tools/': footprint(false, 'tools'),
    '/en/tools/simply-supported-beam/': footprint(false, 'tools', 'ToolViewer.svelte'),
    '/en/tools/continuous-beam/': footprint(false, 'tools', 'BatchTool.svelte') };
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
    writeFileSync(baselinePath, JSON.stringify({ routes: measured }, null, 2) + '\n');
    console.log(`Updated ${baselinePath}.`);
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).routes;
    const table = growthTable(routeGrowth(baseline, measured));
    console.log(table);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Route size against main\n\n${table}\n`);
    for (const r of routeGrowth(baseline, measured)) if (r.growth > 0) console.log(`::notice title=Route size::${r.route} grew by ${r.growth} bytes against main`);
    reviewRouteGrowth(baseline, measured);
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
