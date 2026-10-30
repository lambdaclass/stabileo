/**
 * The displacement method as a student meets it: from the catalog's example,
 * the kinematic count (GIC), switching the axial assumption and walking to
 * the comparison with the matrix method; and the stiffness wizard with its
 * members held axially rigid.
 */
import { test, expect, type Page } from './fixtures';

const SHOTS = process.env.KIN_SHOTS;

async function openCatalog(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  await page.getByTestId('rb-cmd-advanced').click();
  await page.getByTestId('adv-steps').click();
  await expect(page.getByTestId('steps-catalog')).toBeVisible();
}

test.describe('@slow displacement method (kinematic unknowns)', () => {
  test('GIC, the axial switch, every state to the comparison; then the wizard with rigid members', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await openCatalog(page);
    await page.getByTestId('steps-example-displacement').click();
    const doc = page.getByTestId('steps-doc');
    await expect(doc).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('steps-error')).toHaveCount(0);

    await page.getByTestId('steps-tab').nth(0).click();
    await expect(doc.locator('.katex').filter({ hasText: /GIC\s*=\s*3/ }).first()).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/displacement-gic.png` });

    const axial = page.getByTestId('steps-opt-axial');
    await expect(axial).not.toBeChecked();
    await axial.check();
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    await expect(doc.locator('.katex').filter({ hasText: /GIC\s*=\s*6/ }).first()).toBeVisible();

    const n = await page.getByTestId('steps-tab').count();
    let compared = false;
    for (let k = 1; k < n; k++) {
      await page.getByTestId('steps-next').click();
      if (await doc.locator('.sb-compare').count()) compared = true;
    }
    await expect(page.getByTestId('steps-next')).toBeDisabled();
    expect(compared).toBe(true);

    await page.getByTestId('steps-back').click();
    await page.getByTestId('steps-example-dsm').click();
    await expect(page.locator('.wizard')).toBeVisible();
    await expect(page.locator('.wizard .katex').filter({ hasText: /GIC\s*=\s*6/ }).first()).toBeVisible();
    await page.getByTestId('dsm-opt-rigid').check();
    await expect(page.locator('.wizard .katex').filter({ hasText: /GIC\s*=\s*3/ }).first()).toBeVisible();
    await page.getByTestId('dsm-dot-6').click();
    await expect(page.getByTestId('dsm-rigid-6')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/dsm-rigid.png` });
    await page.getByTestId('dsm-dot-8').click();
    await expect(page.getByTestId('dsm-rigid-8')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
