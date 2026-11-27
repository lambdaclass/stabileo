import { existsSync, readFileSync } from 'node:fs';
import { measuredLocales } from './route-locale-bytes.mjs';

export const RESEARCH_ISOLATION_BYTES = 128;

export function routeGrowth(baseline, measured) {
  if (JSON.stringify(Object.keys(baseline).sort()) !== JSON.stringify(Object.keys(measured).sort())) throw new Error('route baseline coverage differs');
  return Object.entries(measured).map(([route, bytes]) => {
    if (!Number.isFinite(baseline[route]) || !Number.isFinite(bytes)) throw new Error(`${route} has no finite measurement`);
    return { route, before: baseline[route], after: bytes, growth: bytes - baseline[route] };
  });
}

export function routeAllowances(text, exists) {
  const { routes } = JSON.parse(text);
  return Object.fromEntries(Object.entries(routes).map(([route, entry]) => {
    const list = Array.isArray(entry) ? entry : [entry];
    for (const a of list) {
      if ((a?.locale !== undefined && !measuredLocales.includes(a.locale)) || !Number.isInteger(a?.bytes) || a.bytes <= 0 || typeof a.reason !== 'string' || !a.reason.trim() || typeof a.module !== 'string' || !exists(a.module)) {
        throw new Error(`invalid route allowance for ${route}: bytes, reason and an existing module are required`);
      }
    }
    if (!list.length) throw new Error(`invalid route allowance for ${route}: bytes, reason and an existing module are required`);
    const localeLimits = Object.fromEntries(measuredLocales.map(locale => [
      locale, list.filter(a => a.locale === locale).reduce((total, a) => total + a.bytes, 0),
    ]));
    return [route, { ...(list.some(a => a.locale) ? { localeLimits } : {}), bytes: list.reduce((n, a) => n + a.bytes, 0), reason: list.map((a) => a.reason).join(' + '), modules: list.map((a) => a.module) }];
  }));
}

function shippedAllowances() {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  return routeAllowances(read('./research-route-allowances.json'), (module) => existsSync(new URL(`../${module}`, import.meta.url)));
}

export function checkResearchIsolation(rows, allowances = {}, beforeLocales, afterLocales) {
  const measured = beforeLocales !== undefined || afterLocales !== undefined;
  const limit = (route) => RESEARCH_ISOLATION_BYTES + (allowances[route]?.bytes ?? 0);
  const grown = rows.filter((r) => r.growth > limit(r.route));
  if (grown.length) {
    throw new Error(grown.map((r) => `${r.route} grew: ${r.before} -> ${r.after} bytes (${limit(r.route)} byte tolerance${allowances[r.route] ? `, with ${allowances[r.route].bytes} allowed for ${allowances[r.route].reason}` : ''}, research isolation: the change touches research code shipped to the browser)`).join('\n'));
  }
  for (const row of rows) {
    const allowance = allowances[row.route];
    if (!allowance?.localeLimits) continue;
    let sharedBefore = row.before;
    let sharedAfter = row.after;
    let sharedLimit = allowance.bytes;
    for (const [locale, limit] of Object.entries(allowance.localeLimits)) {
      const before = measured ? beforeLocales?.[row.route]?.[locale] : 0;
      const after = measured ? afterLocales?.[row.route]?.[locale] : 0;
      if (![before, after].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error(`Invalid ${row.route} ${locale} resource measurement`);
      if (after - before > limit) throw new Error(`${row.route} ${locale} resource growth ${after - before} exceeds ${limit} bytes`);
      sharedBefore -= before;
      sharedAfter -= after;
      sharedLimit -= limit;
    }
    if (sharedBefore < 0 || sharedAfter < 0) throw new Error(`Locale data exceeds total bytes for ${row.route}`);
    if (sharedAfter - sharedBefore > sharedLimit + RESEARCH_ISOLATION_BYTES) {
      throw new Error(`${row.route} shared bytes grew: ${sharedBefore} -> ${sharedAfter} (research isolation limit ${sharedLimit + RESEARCH_ISOLATION_BYTES})`);
    }
  }
}

export function reviewRouteGrowth(baseline, measured, isolation = process.env.RESEARCH_ISOLATION, allowances = shippedAllowances(), beforeLocales, afterLocales) {
  const rows = routeGrowth(baseline, measured);
  if (isolation !== 'false') checkResearchIsolation(rows, allowances, beforeLocales, afterLocales);
  return rows;
}

export function overCeilings(measured, ceilings) {
  return Object.entries(measured).map(([route, bytes]) => {
    const ceiling = ceilings[route];
    if (!Number.isFinite(ceiling) || ceiling <= 0) throw new Error(`missing or invalid ceiling for ${route}`);
    return { route, bytes, ceiling };
  }).filter((r) => r.bytes > r.ceiling);
}

export function growthTable(rows) {
  const lines = ['| Route | main | this change | growth |', '|---|---:|---:|---:|'];
  for (const r of rows) lines.push(`| ${r.route} | ${r.before} | ${r.after} | ${r.growth > 0 ? '+' : ''}${r.growth} |`);
  return lines.join('\n');
}

export const BLOG_ROUTE_BOUNDARY = 'src/components/blog/BlogPage.svelte';
export const COURSE_ROUTE_BOUNDARY = 'src/lib/course/course-route.ts';

export function isLazyRouteBoundary(key) {
  return /components\/research\//.test(key) || /components\/(tools|examples|diagram-game)\//.test(key) || key === BLOG_ROUTE_BOUNDARY || key === COURSE_ROUTE_BOUNDARY;
}

export function isBlogPostsChunk(moduleIds) {
  return moduleIds.some((id) => id.endsWith('/src/lib/blog/index.ts')) && moduleIds.every((id) => id.includes('/src/lib/blog/'));
}

export function routeChunkFiles(manifest, roots, check = () => {}, isBoundary = isLazyRouteBoundary) {
  const files = new Set(['index.html']);
  const seen = new Set();
  function visit(key, lazy) {
    const visitKey = `${key}:${lazy}`;
    if (seen.has(visitKey)) return;
    seen.add(visitKey);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`missing manifest entry ${key}`);
    check(key, chunk);
    files.add(chunk.file);
    for (const file of [...(chunk.css ?? []), ...(chunk.assets ?? [])]) files.add(file);
    for (const dep of chunk.imports ?? []) visit(dep, lazy);
    if (lazy) for (const dep of chunk.dynamicImports ?? []) if (!isBoundary(dep)) visit(dep, true);
  }
  for (const [key, lazy] of roots) visit(key, lazy);
  return files;
}
