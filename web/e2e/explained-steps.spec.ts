/**
 * "Explained step by step", as a student meets it: one entry in Advanced, a
 * catalog of methods by group, each saying what it does and what the
 * structure must be, and an example that opens straight into the method.
 * Every method's document is walked to its last step without an error, and
 * each one ends comparing itself with the matrix solve.
 */
import { test, expect, type Page } from './fixtures';

async function boot(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
}
async function openCatalog(page: Page) {
  await page.getByTestId('rb-cmd-advanced').click();
  await page.getByTestId('adv-steps').click();
  await expect(page.getByTestId('steps-catalog')).toBeVisible();
}

test.describe('@smoke explained step by step', () => {
  test('the catalog: groups in order, help, requirements, and why a method is not available', async ({ page }) => {
    await boot(page);
    await openCatalog(page);
    const groups = await page.locator('[data-testid^=steps-group-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(groups).toEqual([
      'steps-group-stiffness', 'steps-group-flexibility', 'steps-group-continuous',
      'steps-group-frames', 'steps-group-trusses', 'steps-group-deformation',
    ]);
    const first = page.getByTestId('steps-method-dsm');
    await expect(first).toContainText(/must be|debe ser|deve ser/);
    await page.getByTestId('steps-help-dsm').click();
    await expect(first.locator('.sc-helptext')).toBeVisible();
    // Nothing drawn yet: not available, and it says why.
    await expect(page.getByTestId('steps-open-dsm')).toBeDisabled();
    await expect(first).toContainText(/draw one|dibujá una|desenhe uma/);
  });

  test('every method opens from its example and walks to the end, comparing with the matrix method', async ({ page }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await openCatalog(page);
    const ids = await page.locator('[data-testid^=steps-method-]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')!.replace('steps-method-', '')));
    const documented = ids.filter((id) => id !== 'dsm' && id !== 'fm');
    expect(documented.length).toBeGreaterThan(0);
    for (const id of documented) {
      await test.step(id, async () => {
        await page.getByTestId(`steps-example-${id}`).click();
        const doc = page.getByTestId('steps-doc');
        await expect(doc).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('steps-error')).toHaveCount(0);
        const n = await page.getByTestId('steps-tab').count();
        expect(n).toBeGreaterThan(1);
        let compared = false;
        for (let k = 0; k < n; k++) {
          await page.getByTestId('steps-next').click();
          if (await doc.locator('.sb-compare').count()) compared = true;
        }
        await expect(page.getByTestId('steps-next')).toBeDisabled();
        expect(compared, `${id} compares with the matrix method`).toBe(true);
        await page.getByTestId('steps-back').click();
        await expect(page.getByTestId('steps-catalog')).toBeVisible();
      });
    }
    expect(errors).toEqual([]);
  });

  test('the stiffness method from its example: classification and fixed-end actions', async ({ page }) => {
    await boot(page);
    await openCatalog(page);
    await page.getByTestId('steps-example-dsm').click();
    await expect(page.locator('.wizard')).toBeVisible();
    await expect(page.locator('.wizard .katex').filter({ hasText: /GH\s*=\s*3/ }).first()).toBeVisible();
  });

  test('an assumption can be switched: Castigliano without the axial term', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await openCatalog(page);
    await page.getByTestId('steps-example-castigliano').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    const box = page.getByTestId('steps-opt-axial');
    await expect(box).toBeChecked();
    await page.getByTestId('steps-opt-help-axial').click();
    await expect(page.locator('.sd-opt-text')).toBeVisible();
    // The document is rebuilt on the step the reader was on.
    await page.getByTestId('steps-tab').nth(1).click();
    await box.uncheck();
    await expect(box).not.toBeChecked();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    await expect(page.getByTestId('steps-tab').nth(1)).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });
});
