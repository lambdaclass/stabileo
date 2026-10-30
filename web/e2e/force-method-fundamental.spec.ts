/**
 * Choosing the primary structure by hand in the force-method walkthrough: a
 * wrong set is explained and not solved, a right one is solved through all
 * nine steps and agrees with the stiffness method; the axial term switches.
 */
import { test, expect, type Page } from './fixtures';

const SHOTS = process.env.FM_SHOTS;

async function openFlexibility(page: Page, example: string) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await page.evaluate((n) => (window as never as { __stabileoActions: { loadExample(n: string): Promise<void> } })
    .__stabileoActions.loadExample(n), example);
  await page.getByTestId('rb-cmd-advanced').click();
  await page.getByTestId('adv-steps').click();
  await page.getByTestId('steps-open-fm').click();
  await expect(page.getByTestId('fm-wizard')).toBeVisible();
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

test.describe('@slow the primary structure, chosen by hand', () => {
  test('portal frame: a wrong set is refused, the right one solves and agrees with stiffness', async ({ page }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await openFlexibility(page, 'portal-frame');
    await expect(page.getByTestId('fm-gh-doc')).toContainText('GH');
    await expect(page.getByTestId('fm-gh')).toContainText('3');
    await shot(page, 'fm-step1');

    await page.getByTestId('fm-dot-2').click();
    await page.getByTestId('fm-fund-manual').click();
    await page.getByTestId('fm-rel-r:4:0').check();
    await page.getByTestId('fm-rel-r:4:1').check();
    await expect(page.getByTestId('fm-fund-count')).toContainText('2');
    await page.getByTestId('fm-fund-solve').click();
    await expect(page.getByTestId('fm-fund-error')).toBeVisible();
    await expect(page.getByTestId('fm-fund-error')).toContainText('3');
    await shot(page, 'fm-step2-error');

    await page.getByTestId('fm-spot-r:4:2').click();
    await expect(page.getByTestId('fm-rel-r:4:2')).toBeChecked();
    await page.getByTestId('fm-fund-solve').click();
    await expect(page.getByTestId('fm-fund-ok')).toBeVisible();
    await expect(page.getByTestId('fm-redundants').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('fm-redundants')).toContainText('4');
    await shot(page, 'fm-step2-chosen');

    for (let step = 3; step <= 9; step++) {
      await page.getByTestId('fm-next').click();
      await expect(page.getByTestId('fm-step-name')).toContainText(String(step));
    }
    await expect(page.getByTestId('fm-verdict')).not.toHaveClass(/bad/);
    await expect(page.getByTestId('fm-options')).toContainText(/elegiste|your choice/i);

    await page.getByTestId('fm-opt-axial').uncheck();
    await expect(page.getByTestId('fm-verdict')).toHaveClass(/fm-axial-off/);
    await page.getByTestId('fm-dot-5').click();
    await expect(page.getByTestId('fm-s5-axial-off')).toBeVisible();
    await shot(page, 'fm-step5-axial-off');
    expect(errors).toEqual([]);
  });

  test('a beam on a spring: the spring term in class format, and the spring as the redundant', async ({ page }) => {
    test.setTimeout(150_000);
    await openFlexibility(page, 'spring-support');
    await page.getByTestId('fm-dot-5').click();
    await expect(page.getByTestId('fm-spring-terms')).toBeVisible();
    await page.getByTestId('fm-dot-2').click();
    await page.getByTestId('fm-fund-manual').click();
    await page.getByTestId('fm-rel-s:2:1').check();
    await page.getByTestId('fm-fund-solve').click();
    await expect(page.getByTestId('fm-fund-ok')).toBeVisible();
    await page.getByTestId('fm-dot-5').click();
    await expect(page.getByTestId('fm-spring-terms')).toContainText('1');
    await shot(page, 'fm-step5-spring');
    await page.getByTestId('fm-dot-9').click();
    await expect(page.getByTestId('fm-verdict')).not.toHaveClass(/bad/);
  });
});

test.describe('@slow the primary structure on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the chooser fits a narrow panel', async ({ page }) => {
    test.setTimeout(150_000);
    await openFlexibility(page, 'continuous-beam');
    await page.getByTestId('fm-dot-2').click();
    await page.getByTestId('fm-fund-manual').click();
    await expect(page.getByTestId('fm-pick-sketch')).toBeVisible();
    const box = await page.getByTestId('fm-fundamental').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    await shot(page, 'fm-phone-step2');
  });
});
