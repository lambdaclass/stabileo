import { existsSync, readFileSync } from 'node:fs';

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
      if (!Number.isInteger(a?.bytes) || a.bytes <= 0 || typeof a.reason !== 'string' || !a.reason.trim() || typeof a.module !== 'string' || !exists(a.module)) {
        throw new Error(`invalid route allowance for ${route}: bytes, reason and an existing module are required`);
      }
    }
    if (!list.length) throw new Error(`invalid route allowance for ${route}: bytes, reason and an existing module are required`);
    return [route, { bytes: list.reduce((n, a) => n + a.bytes, 0), reason: list.map((a) => a.reason).join(' + '), modules: list.map((a) => a.module) }];
  }));
}

function shippedAllowances() {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  return routeAllowances(read('./research-route-allowances.json'), (module) => existsSync(new URL(`../${module}`, import.meta.url)));
}

export function checkResearchIsolation(rows, allowances = {}) {
  const limit = (route) => RESEARCH_ISOLATION_BYTES + (allowances[route]?.bytes ?? 0);
  const grown = rows.filter((r) => r.growth > limit(r.route));
  if (grown.length) {
    throw new Error(grown.map((r) => `${r.route} grew: ${r.before} -> ${r.after} bytes (${limit(r.route)} byte tolerance${allowances[r.route] ? `, with ${allowances[r.route].bytes} allowed for ${allowances[r.route].reason}` : ''}, research isolation: the change touches research code shipped to the browser)`).join('\n'));
  }
}

export function reviewRouteGrowth(baseline, measured, isolation = process.env.RESEARCH_ISOLATION, allowances = shippedAllowances()) {
  const rows = routeGrowth(baseline, measured);
  if (isolation !== 'false') checkResearchIsolation(rows, allowances);
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
  return /components\/research\//.test(key) || /components\/(tools|examples)\//.test(key) || key === BLOG_ROUTE_BOUNDARY || key === COURSE_ROUTE_BOUNDARY;
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
