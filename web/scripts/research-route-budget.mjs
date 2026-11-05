import { readFileSync } from 'node:fs';

const productBudgets = JSON.parse(readFileSync(new URL('./product-route-growth-budgets.json', import.meta.url), 'utf8'));

export function compareRouteSizes(baseline, measured, researchIsolation = process.env.RESEARCH_ISOLATION !== 'false', budgets = productBudgets) {
  if (JSON.stringify(Object.keys(baseline).sort()) !== JSON.stringify(Object.keys(measured).sort())) throw new Error('route baseline coverage differs');
  for (const [route, bytes] of Object.entries(measured)) {
    const productBudget = budgets[route];
    if (!Number.isFinite(productBudget) || productBudget < 0) throw new Error(`missing or invalid product budget for ${route}`);
    const tolerance = researchIsolation ? Math.min(128, productBudget) : productBudget;
    if (!Number.isFinite(baseline[route]) || !Number.isFinite(bytes) || bytes > baseline[route] + tolerance) {
      const mode = researchIsolation
        ? 'research isolation: the change touches research code shipped to the browser'
        : 'product budget from web/scripts/product-route-growth-budgets.json';
      throw new Error(`${route} grew: ${baseline[route]} -> ${bytes} bytes (${tolerance} byte tolerance, ${mode})`);
    }
  }
}


export const BLOG_ROUTE_BOUNDARY = 'src/components/blog/BlogPage.svelte';
export const COURSE_ROUTE_BOUNDARY = 'src/lib/course/course-route.ts';

export function isLazyRouteBoundary(key) {
  return /components\/research\//.test(key) || /components\/tools\//.test(key) || key === BLOG_ROUTE_BOUNDARY || key === COURSE_ROUTE_BOUNDARY;
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
