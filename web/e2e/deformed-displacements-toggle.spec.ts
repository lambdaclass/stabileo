/**
 * The displacements written on the deformed shape are asked for: a check beside Animate in Basic,
 * in place of "show loads" in PRO's deformed view, off by default.
 */
import { test, expect, loadModel } from './fixtures';

test.describe('@smoke displacements on the deformed shape', () => {
  test('Basic 2D: off by default beside Animate; turning it on writes them on the drawing', async ({ page }) => {
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.evaluate(() => window.__stabileoActions.solve());
    await page.getByTestId('rb-cmd-deformed').first().click();
    const check = page.getByTestId('deformed-values');
    await expect(check).not.toBeChecked();
    const animate = page.locator('label', { hasText: /Animate|Animar/ }).first();
    const [a, c] = [(await animate.boundingBox())!, (await check.boundingBox())!];
    expect(Math.abs(a.y + a.height / 2 - (c.y + c.height / 2))).toBeLessThan(8);
    expect(c.x).toBeGreaterThan(a.x);

    const canvas = page.locator('canvas:not(.axis-gizmo)').first();
    await page.waitForTimeout(300);
    const without = await canvas.screenshot();
    await check.check();
    await page.waitForTimeout(300);
    const withValues = await canvas.screenshot();
    expect(withValues.equals(without), 'the displacements are drawn once asked for').toBe(false);
    await check.uncheck();
    await page.waitForTimeout(300);
    expect((await canvas.screenshot()).equals(without), 'and gone again').toBe(true);
  });

  test('PRO: in the deformed view the check replaces "show loads", off by default', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.evaluate(() => window.__stabileoActions.solve());
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-deformed').click();
    const check = page.getByTestId('pr-show-displacements');
    await expect(check).toBeVisible();
    await expect(check).not.toBeChecked();
    await expect(page.locator('label', { hasText: /Show loads|Mostrar cargas/ })).toHaveCount(0);
  });
});
