import { readFileSync } from 'node:fs';

const productBudgets = JSON.parse(readFileSync(new URL('./product-route-growth-budgets.json', import.meta.url), 'utf8'));

export function compareRouteSizes(baseline, measured, researchIsolation = process.env.RESEARCH_ISOLATION !== 'false') {
  if (JSON.stringify(Object.keys(baseline).sort()) !== JSON.stringify(Object.keys(measured).sort())) throw new Error('route baseline coverage differs');
  for (const [route, bytes] of Object.entries(measured)) {
    const productBudget = productBudgets[route];
    if (!Number.isFinite(productBudget) || productBudget < 0) throw new Error(`missing or invalid product budget for ${route}`);
    const tolerance = researchIsolation ? Math.min(128, productBudget) : productBudget;
    if (!Number.isFinite(baseline[route]) || !Number.isFinite(bytes) || bytes > baseline[route] + tolerance) {
      throw new Error(`${route} grew: ${baseline[route]} -> ${bytes} bytes (${tolerance} byte tolerance)`);
    }
  }
}

// Product features have a separately reviewed growth allowance. This never changes
// the research isolation comparator's fixed 128-byte tolerance above.
export function compareProductRouteSizes(baseline, measured, budget) {
  const allowance = budget.max_growth_bytes;
  if (!Number.isSafeInteger(allowance) || allowance < 0) throw new Error('invalid product growth budget');
  if (JSON.stringify(Object.keys(baseline).sort()) !== JSON.stringify(Object.keys(measured).sort())) throw new Error('route baseline coverage differs');
  for (const [route, bytes] of Object.entries(measured)) {
    if (!Number.isFinite(baseline[route]) || !Number.isFinite(bytes) || bytes > baseline[route] + allowance) {
      throw new Error(`${route} grew: ${baseline[route]} -> ${bytes} bytes (product growth budget ${allowance})`);
    }
  }
}
