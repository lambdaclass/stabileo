/**
 * Member checks under other codes: one notice per code, rows that say why a member is out, and
 * readings the checker left incomplete that never read as a pass.
 *
 * Numbers are pinned against the codes' closed forms in `other-codes/__tests__`; this is about
 * what the panel shows and when.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

async function openPanel(page: Page) {
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-otherCodes').click();
  await expect(page.getByTestId('other-codes-panel')).toBeVisible();
}

/** The steel portal, with its section given the plate thicknesses of an IPN 300 and one combination. */
async function steelPortal(page: Page) {
  await page.evaluate(async () => {
    await window.__stabileoActions.loadExample('3d-portal-frame');
    window.__stabileoActions.updateSection(1, { shape: 'I', tw: 0.0108, tf: 0.0162 });
    window.__stabileoActions.combineCases('1.0 todos');
  });
}

test.describe('@smoke other codes', () => {
  test('is gated on solved combinations and shows the chosen code’s coverage once', async ({ pro: page }) => {
    await openPanel(page);
    await expect(page.getByTestId('other-codes-run')).toBeDisabled();
    const coverage = page.getByTestId('other-codes-coverage');
    await expect(coverage).toContainText(/AISC|F2|E3/);
    await page.getByTestId('other-code-ec2').click();
    await expect(coverage).toContainText(/6\.1|columns are left out/i);
    await expect(page.getByTestId('other-codes-coverage')).toHaveCount(1);
  });

  test('checks a steel frame under AISC 360, worst first, and selects a member from its row', async ({ pro: page }) => {
    await steelPortal(page);
    await page.evaluate(async () => { await window.__stabileoActions.solve(); });
    await openPanel(page);
    await page.getByTestId('other-codes-run').click();
    const results = page.getByTestId('other-codes-results');
    await expect(results).toBeVisible();
    await expect(page.getByTestId('other-codes-summary')).toContainText(/checked/);
    const rows = results.locator('tr.oc-row');
    expect(await rows.count()).toBeGreaterThan(0);
    // Worst first.
    const ratios = await rows.locator('td:nth-child(2)').allInnerTexts();
    const nums = ratios.map((r) => (r === '∞' ? Infinity : Number(r)));
    expect([...nums].sort((a, b) => b - a)).toEqual(nums);
    await rows.first().click();
    const first = Number(await rows.first().locator('td:nth-child(1)').innerText());
    expect(await page.evaluate(() => window.__stabileo.selection())).toEqual([first]);
  });

  test('refuses a concrete code on a steel frame, with the reason, and marks a stale run', async ({ pro: page }) => {
    await steelPortal(page);
    await page.evaluate(async () => { await window.__stabileoActions.solve(); });
    await openPanel(page);
    await page.getByTestId('other-code-aci318').click();
    await page.getByTestId('other-codes-run').click();
    await expect(page.getByTestId('other-codes-none')).toBeVisible();
    const skipped = page.getByTestId('other-codes-skipped');
    await skipped.locator('summary').click();
    await expect(skipped).toContainText(/not concrete/i);
    // A new solve replaces the results the run was made from.
    await page.evaluate(async () => { await window.__stabileoActions.solve(); });
    await expect(page.getByTestId('other-codes-stale')).toBeVisible();
  });
});
