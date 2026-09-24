/**
 * "Paso a paso — Mét. Flexibilidades", reached the way a student reaches it.
 *
 * The method itself is pinned by unit tests against closed forms and against
 * the stiffness method on every 2D example. What only a browser can show is
 * that the entry sits in the Advanced panel under the stiffness wizard, opens
 * its own panel, walks all nine steps without an error, and ends agreeing with
 * the stiffness method.
 */
import { test, expect } from './fixtures';

test.describe('@smoke the flexibility-method walkthrough', () => {
  test('a portal frame: nine steps, three redundants, and the stiffness method agrees', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    await page.evaluate(() => (window as never as { __stabileoActions: { loadExample(n: string): Promise<void> } })
      .__stabileoActions.loadExample('portal-frame'));

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.getByTestId('rb-cmd-advanced').click();
    /* Right under the stiffness wizard, as asked: the button before it is that one. */
    const before = await page.getByTestId('adv-fm').evaluate((el) =>
      el.closest('.adv-btn-wrap')?.previousElementSibling?.textContent ?? '');
    expect(before).toMatch(/Stiffness|Rigideces|Rigidez/);
    await page.getByTestId('adv-fm').click();
    const wizard = page.getByTestId('fm-wizard');
    await expect(wizard).toBeVisible();

    await expect(page.getByTestId('fm-gh')).toContainText('= 3');
    for (let step = 2; step <= 9; step++) {
      await page.getByTestId('fm-next').click();
      await expect(page.getByTestId('fm-step-name')).toContainText(String(step));
    }
    await expect(page.getByTestId('fm-verdict')).toBeVisible();
    await expect(page.getByTestId('fm-verdict')).not.toHaveClass(/bad/);
    expect(errors).toEqual([]);
  });

  test('each unit state and each coefficient can be opened on its own', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    await page.evaluate(() => (window as never as { __stabileoActions: { loadExample(n: string): Promise<void> } })
      .__stabileoActions.loadExample('continuous-beam'));
    await page.getByTestId('rb-cmd-advanced').click();
    await page.getByTestId('adv-fm').click();
    await expect(page.getByTestId('fm-wizard')).toBeVisible();
    await page.getByTestId('fm-dot-4').click();
    await expect(page.getByTestId('fm-unit-state')).toBeVisible();
    await page.getByTestId('fm-state-2').click();
    await page.getByTestId('fm-dot-5').click();
    await page.getByTestId('fm-coef-12').click();
    await expect(page.getByTestId('fm-delta-terms')).toBeVisible();
  });
});
