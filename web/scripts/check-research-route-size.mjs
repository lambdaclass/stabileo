/** Build and compare each route's dependency footprint. Run from web/ with --baseline <file> and optional --update.
 * Landing: entry's static closure. /app/*: that closure plus App's static and lazy product
 * dependencies. Modes share an entry, so receive the same conservative byte budget.
 */
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareRouteSizes } from './research-route-budget.mjs';

const baselinePath = process.argv[process.argv.indexOf('--baseline') + 1];
if (!process.argv.includes('--baseline') || !baselinePath) throw new Error('--baseline <file> is required');
const outDir = mkdtempSync(join(tmpdir(), 'research-route-size-'));
process.env.GITHUB_SHA = '000000000000';
delete process.env.VITE_E2E;
delete process.env.VITE_APP_TYPE;
const researchChunks = new Set();
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
        if (output.type === 'chunk' && Object.keys(output.modules).some((id) => id.includes('/components/research/'))) {
          researchChunks.add(output.fileName);
        }
      }
    } }],
    build: { outDir, emptyOutDir: true, manifest: true }, logLevel: 'error',
  });
  const manifest = JSON.parse(readFileSync(join(outDir, '.vite/manifest.json'), 'utf8'));
  const appEntry = Object.keys(manifest).find((key) => manifest[key].name === 'App');
  if (!appEntry) throw new Error('missing App entry');
  function footprint(app) {
    const files = new Set(['index.html']);
    const seen = new Set();
    function visit(key, lazy = false) {
      const visitKey = `${key}:${lazy}`;
      if (seen.has(visitKey)) return;
      seen.add(visitKey);
      const chunk = manifest[key];
      if (!chunk) throw new Error(`missing manifest entry ${key}`);
      if (researchChunks.has(chunk.file)) throw new Error(`product statically imports research: ${key}`);
      files.add(chunk.file);
      for (const file of [...(chunk.css ?? []), ...(chunk.assets ?? [])]) files.add(file);
      for (const dep of chunk.imports ?? []) visit(dep, lazy);
      if (lazy) for (const dep of chunk.dynamicImports ?? []) {
        // Explicit lazy route boundaries are not product dependencies.
        if (!/components\/research\//.test(dep)) visit(dep, true);
      }
    }
    visit('index.html');
    if (app) visit(appEntry, true);
    // Public fonts/images and emitted workers referenced by the selected bundles also count.
    // Iterating a Set visits newly added assets, so CSS reached through HTML is covered too.
    for (const file of files) {
      if (!/\.(?:js|css|html)$/.test(file)) continue;
      for (const match of readFileSync(join(outDir, file), 'utf8').matchAll(/["'(](\/[^"'()\s]+)["')]/g)) {
        const relative = match[1].slice(1).split('?')[0];
        if (!relative.includes('..') && existsSync(join(outDir, relative)) && statSync(join(outDir, relative)).isFile()) files.add(relative);
      }
    }
    return [...files].reduce((total, file) => total + statSync(join(outDir, file)).size, 0);
  }
  const landing = footprint(false), app = footprint(true);
  const measured = { '/en/': landing, '/es/': landing, '/pt/': landing,
    '/app/basic': app, '/app/education': app, '/app/pro': app };
  for (const [route, bytes] of Object.entries(measured)) console.log(`${route}: ${bytes} bytes`);
  if (process.argv.includes('--update')) {
    writeFileSync(baselinePath, JSON.stringify({ tolerance_bytes: 128, routes: measured }, null, 2) + '\n');
    console.log(`Updated ${baselinePath}; review every increase before accepting it.`);
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    compareRouteSizes(baseline.routes, measured);
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
