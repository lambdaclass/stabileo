#!/usr/bin/env node
// Production health check (.github/workflows/production-health.yml, #720).
//
//   node scripts/production-health.mjs https://stabileo.com [https://staging.stabileo.com ...]
//
// For each site: the landing, a blog page and the backend's health endpoint answer; then, in
// headless Chromium, /app/basic mounts the application, the engine's WASM is served as
// application/wasm and instantiates, and the deployed engine solves a reference model to its
// closed-form result. The production bundle carries no test hooks (main.ts), so the model is
// solved by importing the very engine module the page loaded (same URL, same bytes) and calling
// its public solve_2d: what the deployed site would compute for a user.
//
// Writes one JSON line per site to $HEALTH_RESULTS (if set) and to stdout; exits 1 if any site
// failed. Playwright is the version pinned in web/package.json, resolved from
// $PLAYWRIGHT_PREFIX (a directory with node_modules/playwright) or from web/.

import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const prefix = resolve(process.env.PLAYWRIGHT_PREFIX || join(import.meta.dirname, '..', 'web'));
const { chromium } = createRequire(join(prefix, 'package.json'))('playwright');

const TIMEOUT = 60_000;

// Cantilever, L = 4 m, E = 200 000 MPa, I = 1e-4 m^4, tip load P = 50 kN (engine/tests/fixtures/
// cantilever-input.json). Closed form: tip deflection P L^3 / (3 E I) = 0.053333 m, tip rotation
// P L^2 / (2 E I) = 0.02 rad, support reaction P = 50 kN and moment P L = 200 kN m.
const MODEL = {
  nodes: { 1: { id: 1, x: 0, y: 0 }, 2: { id: 2, x: 4, y: 0 } },
  materials: { 1: { id: 1, e: 200000, nu: 0.3 } },
  sections: { 1: { id: 1, a: 0.01, iz: 0.0001 } },
  elements: {
    1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
  },
  supports: { 1: { id: 1, nodeId: 1, type: 'fixed' } },
  loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -50, mz: 0 } }],
};
const P = 50, L = 4, EI = 200000 * 1000 * 1e-4;
const EXPECTED = { tipDeflection: (P * L ** 3) / (3 * EI), tipRotation: (P * L ** 2) / (2 * EI), reaction: P, moment: P * L };
const REL_TOL = 1e-9;

async function fetchCheck(url, { type, contains }) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
  const ct = res.headers.get('content-type') || '';
  if (res.status !== 200) throw new Error(`${url}: HTTP ${res.status}`);
  if (type && !ct.startsWith(type)) throw new Error(`${url}: content-type ${ct}, expected ${type}`);
  const body = await res.text();
  if (contains && !contains.test(body)) throw new Error(`${url}: body does not match ${contains}`);
  return `${url}: 200 ${ct}, ${body.length} bytes`;
}

function close(name, got, want) {
  if (typeof got !== 'number' || !Number.isFinite(got)) throw new Error(`${name}: got ${got}, expected ${want}`);
  const rel = Math.abs(Math.abs(got) - want) / want;
  if (rel > REL_TOL) throw new Error(`${name}: |got| ${Math.abs(got)}, expected ${want} (rel ${rel.toExponential(2)} > ${REL_TOL})`);
  return `${name} ${Math.abs(got)} (closed form ${want})`;
}

async function appCheck(browser, base) {
  const page = await browser.newPage();
  const errors = [];
  const wasm = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('response', (r) => {
    if (/\.wasm(\?|$)/.test(r.url())) wasm.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] || '' });
  });
  const notes = [];
  try {
    const res = await page.goto(`${base}/app/basic`, { waitUntil: 'networkidle', timeout: TIMEOUT });
    if (!res || res.status() !== 200) throw new Error(`${base}/app/basic: HTTP ${res?.status()}`);
    // The application's toolbar, not the landing (which the SPA fallback would also serve).
    await page.getByRole('button', { name: 'Solve', exact: true }).first().waitFor({ timeout: TIMEOUT });
    notes.push(`${base}/app/basic: application mounted`);

    if (wasm.length === 0) throw new Error('the application loaded no .wasm file');
    for (const w of wasm) {
      if (w.status !== 200) throw new Error(`${w.url}: HTTP ${w.status}`);
      // application/wasm is what WebAssembly.instantiateStreaming requires.
      if (!w.type.startsWith('application/wasm')) throw new Error(`${w.url}: content-type '${w.type}', expected application/wasm`);
      notes.push(`${w.url}: 200 ${w.type}`);
    }

    const out = await page.evaluate(async (model) => {
      const glue = performance.getEntriesByType('resource').map((e) => e.name)
        .find((n) => /\/dedaliano_engine[^/]*\.js(\?|$)/.test(n));
      if (!glue) return { error: 'the page did not load the engine module (dedaliano_engine*.js)' };
      const engine = await import(glue);
      await engine.default();
      try {
        return { glue, result: JSON.parse(JSON.stringify(engine.solve_2d(model))) };
      } catch (e) {
        return { glue, error: `solve_2d threw: ${e?.message || e}` };
      }
    }, MODEL);
    if (out.error) throw new Error(out.error);
    notes.push(`engine ${out.glue} instantiated`);

    const r = out.result;
    const tip = r.displacements?.find((d) => d.nodeId === 2);
    const sup = r.reactions?.find((d) => d.nodeId === 1);
    if (!tip || !sup) throw new Error(`reference model: no tip displacement or support reaction in ${JSON.stringify(r).slice(0, 300)}`);
    // The 2D vertical axis is uz/ry/rz/my today and was uy/rz/ry/mz before: accept either.
    notes.push(close('tip deflection [m]', tip.uz ?? tip.uy, EXPECTED.tipDeflection));
    notes.push(close('tip rotation [rad]', tip.ry ?? tip.rz, EXPECTED.tipRotation));
    notes.push(close('support reaction [kN]', sup.rz ?? sup.ry, EXPECTED.reaction));
    notes.push(close('support moment [kN m]', sup.my ?? sup.mz, EXPECTED.moment));
    if (errors.length) throw new Error(errors.join('; '));
    return notes;
  } finally {
    await page.close();
  }
}

async function checkSite(browser, base) {
  base = base.replace(/\/+$/, '');
  const checks = [
    ['landing', () => fetchCheck(`${base}/`, { type: 'text/html', contains: /Stabileo/ })],
    ['blog', () => fetchCheck(`${base}/en/blog/`, { type: 'text/html', contains: /<title>[^<]*Blog/ })],
    ['backend health', () => fetchCheck(`${base}/api/v1/health`, { type: 'application/json' })],
    ['app, WASM and reference solve', () => appCheck(browser, base)],
  ];
  const results = [];
  for (const [name, run] of checks) {
    try {
      const detail = await run();
      results.push({ name, ok: true, detail: [].concat(detail) });
    } catch (e) {
      results.push({ name, ok: false, detail: [String(e?.message || e)] });
    }
  }
  return { site: base, ok: results.every((r) => r.ok), checks: results };
}

const sites = process.argv.slice(2);
if (sites.length === 0) {
  console.error('usage: production-health.mjs URL [URL ...]');
  process.exit(2);
}
const browser = await chromium.launch();
let failed = false;
try {
  for (const site of sites) {
    const report = await checkSite(browser, site);
    failed ||= !report.ok;
    for (const c of report.checks) {
      console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${report.site} ${c.name}`);
      for (const d of c.detail) console.log(`       ${d}`);
    }
    if (process.env.HEALTH_RESULTS) appendFileSync(process.env.HEALTH_RESULTS, `${JSON.stringify(report)}\n`);
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
