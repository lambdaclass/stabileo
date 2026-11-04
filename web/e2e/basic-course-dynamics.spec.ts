/**
 * Structural dynamics in the Dynamic panel: a single degree of freedom system
 * taken from the model under a harmonic force, the modal decomposition of a
 * two-storey frame opened as an explained document, and the members cut into
 * four segments with consistent mass, matching the engine.
 */
import { test, expect, type Page } from './fixtures';

async function boot(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
}
async function runDynamic(page: Page) {
  if (!(await page.getByTestId('adv-steps').isVisible())) await page.getByTestId('rb-cmd-advanced').click();
  await page.getByRole('button', { name: /^(Dynamic|Dinámico|Dinâmico)$/ }).first().click();
  await expect(page.getByTestId('dynamics-course')).toBeVisible();
}

test.describe('@slow structural dynamics in Basic', () => {
  test('1 DOF harmonic, modal decomposition and n = 4 with consistent mass', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('dynamics-shear-building'));
    await runDynamic(page);

    await page.getByTestId('dyn-sdof-toggle').click();
    await expect(page.getByTestId('dyn-sdof-props')).toContainText('rad/s');
    await page.getByTestId('dyn-sdof-F0').fill('20');
    await page.getByTestId('dyn-sdof-F0').press('Enter');
    await expect(page.getByTestId('dyn-sdof-harm')).toContainText('β');
    await page.getByTestId('dyn-sdof').screenshot({ path: 'test-results/course-dynamics-sdof.png' });
    await page.getByTestId('dyn-sdof-open').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    await page.getByTestId('steps-tab').nth(4).click();
    await expect(page.getByTestId('step-plot').first()).toBeVisible();
    await page.getByTestId('steps-back').click();
    await page.getByTestId('steps-catalog-back').click();

    await runDynamicIfClosed(page);
    await page.getByTestId('dyn-mdof-toggle').click();
    await page.getByTestId('dyn-mdof-shear').click();
    await expect(page.getByTestId('dyn-mdof-modes')).toBeVisible();
    await page.getByTestId('dyn-mdof-open').click();
    const doc = page.getByTestId('steps-doc');
    await expect(doc).toBeVisible();
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    const n = await page.getByTestId('steps-tab').count();
    expect(n).toBeGreaterThan(9);
    for (let k = 0; k < n; k++) await page.getByTestId('steps-next').click();
    await expect(doc.locator('.sb-compare').or(doc.locator('.sb-table')).first()).toBeVisible();
    await doc.screenshot({ path: 'test-results/course-dynamics-mdof-doc.png' });
    await page.getByTestId('steps-back').click();
    await page.getByTestId('steps-catalog-back').click();

    await runDynamicIfClosed(page);
    await page.getByTestId('dyn-mass-toggle').click();
    await page.getByTestId('dyn-mass-n').fill('4');
    await page.getByTestId('dyn-mass-n').press('Enter');
    await page.getByTestId('dyn-mass-model').selectOption('consistent');
    const row = page.getByTestId('dyn-mass-table').locator('tbody tr').first();
    await expect(row.locator('td')).toHaveCount(3);
    const [mine, engine] = await row.locator('td').evaluateAll((tds) => [tds[1].textContent, tds[2].textContent]);
    expect(mine).toBe(engine);
    await page.getByTestId('dyn-mass').screenshot({ path: 'test-results/course-dynamics-mass.png' });
    expect(errors).toEqual([]);
  });
});

async function runDynamicIfClosed(page: Page) {
  if (await page.getByTestId('dynamics-course').isVisible()) return;
  await runDynamic(page);
}
