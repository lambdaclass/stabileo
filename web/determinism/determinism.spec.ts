/**
 * The WASM engine gives bit-identical results in every runtime it ships to
 * (testing/docs/TRUSTED_BASE.md, "Determinism across runtimes"): a fixed set of solves
 * and certificates (cases.mjs) runs in this browser and in Node, and every output must be
 * the same string, floats compared by bit pattern. The Node run must also meet the
 * requirements of checks.mjs (the certified cases certify, field by field), so agreement is
 * never between two failed results. checks.test.mjs shows each check fails when it should.
 * Run with `npx playwright test -c determinism/playwright.config.ts` from web/.
 */
import { test, expect } from '@playwright/test';
// @ts-expect-error plain ES modules shared with the browser page
import { runInNode, digestOf } from './node-run.mjs';
// @ts-expect-error plain ES module
import { requirementProblems, runDifferences } from './checks.mjs';

type Result = { name: string; text: string; value?: unknown };

let reference: Result[];
test.beforeAll(async () => {
  reference = await runInNode({ values: true });
});

test('the Node reference run meets the requirements', () => {
  expect(requirementProblems(reference)).toEqual([]);
});

test('engine results are bit-identical to Node', async ({ page, browserName }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __determinism?: unknown }).__determinism, null, { timeout: 280_000 });
  const run = await page.evaluate(() => (window as unknown as { __determinism: { ok: boolean; error?: string; results?: Result[] } }).__determinism);
  expect(run.ok, run.error).toBe(true);
  const results = run.results!;
  console.log(`${browserName}: ${results.length} cases, digest ${digestOf(results)} (node ${digestOf(reference)})`);
  expect(runDifferences(reference, results), `${browserName} differs from Node`).toEqual([]);
});
