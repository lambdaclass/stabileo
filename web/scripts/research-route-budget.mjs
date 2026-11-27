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
    const italianBytes = list.filter(a => a.locale === 'it').reduce((sum, a) => sum + a.bytes, 0);
    return [route, { ...(italianBytes ? { italianBytes } : {}), bytes: list.reduce((n, a) => n + a.bytes, 0), reason: list.map((a) => a.reason).join(' + '), modules: list.map((a) => a.module) }];
  }));
}

function shippedAllowances() {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  return routeAllowances(read('./research-route-allowances.json'), (module) => existsSync(new URL(`../${module}`, import.meta.url)));
}

export function checkResearchIsolation(rows, allowances = {}) {
  const problems = [];
  for (const row of rows) {
    const allowance = allowances[row.route];
    const totalLimit = RESEARCH_ISOLATION_BYTES + (allowance?.bytes ?? 0);
    const italianLimit = allowance?.italianBytes ?? 0;
    if (italianLimit && !Number.isFinite(row.italianGrowth)) throw new Error(`${row.route} missing Italian byte measurement`);
    const otherGrowth = row.growth - (row.italianGrowth ?? 0);
    if (row.growth > totalLimit || (italianLimit && (row.italianGrowth > italianLimit || otherGrowth > totalLimit - italianLimit))) {
      problems.push(`${row.route} grew: ${row.before} -> ${row.after} bytes (${totalLimit} byte tolerance${allowance ? `, with ${allowance.bytes} allowed for ${allowance.reason}` : ''}, research isolation: ${otherGrowth} bytes outside Italian copy, ${totalLimit - italianLimit} allowed; Italian growth ${row.italianGrowth ?? 0}, ${italianLimit} allowed)`);
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
}

export function reviewRouteGrowth(baseline, measured, isolation = process.env.RESEARCH_ISOLATION, allowances = shippedAllowances(), italianGrowth = {}) {
  const rows = routeGrowth(baseline, measured);
  if (isolation !== 'false') checkResearchIsolation(rows.map(row => ({ ...row, italianGrowth: italianGrowth[row.route] })), allowances);
  return rows;
}

export function comparePartitions(base, candidate, isolation = process.env.RESEARCH_ISOLATION, allowances = shippedAllowances()) {
  if (!base.italian || !base.publicLocales) {
    throw new Error("Measure the base revision with this meter and --update before comparing the candidate.");
  }
  const copyGrowth = Object.fromEntries(routeGrowth(base.italian, candidate.italian).map(row => [row.route, row.growth]));
  const rows = reviewRouteGrowth(base.routes, candidate.routes, isolation, allowances, copyGrowth);
  if (isolation === 'false') return rows;

  function maxima(locales) {
    const chunks = Object.values(locales);
    return {
      total: Math.max(0, ...chunks.map(chunk => chunk.total)),
      other: Math.max(0, ...chunks.map(chunk => chunk.total - chunk.italian)),
    };
  }
  const before = maxima(base.publicLocales);
  const after = maxima(candidate.publicLocales);
  for (const [locale, chunk] of Object.entries(candidate.publicLocales)) {
    const previous = base.publicLocales[locale];
    const beforeOther = previous ? previous.total - previous.italian : before.other;
    const publicOtherGrowth = chunk.total - chunk.italian - beforeOther;
    const marginalCopy = previous ? chunk.italian - previous.italian
      : Math.min(chunk.italian, Math.max(0, chunk.total - before.total));
    for (const row of rows) {
      const restOtherGrowth = row.growth - copyGrowth[row.route] - (after.other - before.other);
      const italianLimit = allowances[row.route]?.italianBytes ?? 0;
      const restCopyGrowth = copyGrowth[row.route] - ((after.total - after.other) - (before.total - before.other));
      if (italianLimit && restCopyGrowth + marginalCopy > italianLimit) {
        throw new Error(`${row.route}: research isolation: ${locale} Italian copy exceeds ${italianLimit} bytes`);
      }
      const limit = RESEARCH_ISOLATION_BYTES + (allowances[row.route]?.bytes ?? 0) - (allowances[row.route]?.italianBytes ?? 0);
      if (restOtherGrowth + publicOtherGrowth > limit) {
        throw new Error(`${row.route}: research isolation: ${locale} grew ${restOtherGrowth + publicOtherGrowth} bytes outside Italian copy, ${limit} allowed`);
      }
    }
  }
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
const GAMES_ROUTE_BOUNDARY = 'src/components/games/load-page.ts';

export function isLazyRouteBoundary(key) {
  return /components\/research\//.test(key)
    || /components\/(tools|examples)\//.test(key)
    || key === BLOG_ROUTE_BOUNDARY
    || key === COURSE_ROUTE_BOUNDARY
    || key === GAMES_ROUTE_BOUNDARY;
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
