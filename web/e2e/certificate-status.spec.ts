/**
 * The linear static certificate line in the results panel (`CertificateStatus.svelte`), in 2D
 * and in 3D, solved through the real app path (example → global solve → certificate store →
 * worker → panel).
 *
 * Issue #471: a 3D solve showed no certificate line at all, so a 3D user never learned whether
 * the result on screen was certified. Whatever the engine says — certified with a bound, or not
 * certified with a reason — the line has to be there.
 */

import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

/** The settled certificate line: certified with a bound, or not certified with a reason. */
/** The global solve the toolbar button runs, waited on until results are on screen. */
async function solve(page: Page): Promise<void> {
  await page.evaluate(() => window.__stabileoActions.solve());
  await expect.poll(() => page.evaluate(() => window.__stabileo.linearCertificate().base.status), { timeout: 60_000 })
    .not.toBe('idle');
}

async function settledCertificate(page: Page): Promise<string> {
  // The results panel: the ribbon's results commands open it.
  await page.getByTestId('rb-cmd-deformed').click();
  console.log(JSON.stringify(await page.evaluate(() => window.__stabileo.linearCertificate())));
  const line = page.getByTestId('certificate-status');
  await expect(line).toBeVisible({ timeout: 30_000 });
  await expect(line).not.toHaveText(/Certifying/, { timeout: 60_000 });
  return (await line.textContent())?.trim() ?? '';
}

const CERTIFIED = /^Certified: displacement error ≤ /;

for (const example of ['3d-portal-frame', '3d-cantilever-load']) {
  test(`3D ${example}: the results panel says whether the solve is certified`, async ({ page }) => {
    await openBasic(page);
    await loadModel(page, example);
    await solve(page);
    const text = await settledCertificate(page);
    console.log(`[${example}] ${text}`);
    expect(text.length).toBeGreaterThan(0);
  });
}

test('2D example: the results panel says whether the solve is certified', async ({ page }) => {
  await openBasic(page);
  await loadModel(page, 'simply-supported');
  await solve(page);
  const text = await settledCertificate(page);
  console.log(`[2d] ${text}`);
  expect(text).toMatch(CERTIFIED);
});
