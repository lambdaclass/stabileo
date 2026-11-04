export const RESEARCH_ISOLATION_BYTES = 128;

export function routeGrowth(baseline, measured) {
  if (JSON.stringify(Object.keys(baseline).sort()) !== JSON.stringify(Object.keys(measured).sort())) throw new Error('route baseline coverage differs');
  return Object.entries(measured).map(([route, bytes]) => {
    if (!Number.isFinite(baseline[route]) || !Number.isFinite(bytes)) throw new Error(`${route} has no finite measurement`);
    return { route, before: baseline[route], after: bytes, growth: bytes - baseline[route] };
  });
}

export function checkResearchIsolation(rows) {
  const grown = rows.filter((r) => r.growth > RESEARCH_ISOLATION_BYTES);
  if (grown.length) {
    throw new Error(grown.map((r) => `${r.route} grew: ${r.before} -> ${r.after} bytes (${RESEARCH_ISOLATION_BYTES} byte tolerance, research isolation: the change touches research code shipped to the browser)`).join('\n'));
  }
}

export function reviewRouteGrowth(baseline, measured, isolation = process.env.RESEARCH_ISOLATION) {
  const rows = routeGrowth(baseline, measured);
  if (isolation !== 'false') checkResearchIsolation(rows);
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

export function isLazyRouteBoundary(key) {
  return /components\/research\//.test(key) || /components\/tools\//.test(key) || key === BLOG_ROUTE_BOUNDARY;
}

export function routeChunkFiles(manifest, roots, check = () => {}) {
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
    if (lazy) for (const dep of chunk.dynamicImports ?? []) if (!isLazyRouteBoundary(dep)) visit(dep, true);
  }
  for (const [key, lazy] of roots) visit(key, lazy);
  return files;
}
