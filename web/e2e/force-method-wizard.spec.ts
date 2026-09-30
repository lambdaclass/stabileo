/**
 * The flexibility-method walkthrough, reached the way a student reaches it:
 * Advanced, "Explained step by step", then the method.
 *
 * The method itself is pinned by unit tests against closed forms and against
 * the stiffness method on every 2D example. What only a browser can show is
 * that the entry sits in the Advanced panel under the stiffness wizard, opens
 * its own panel, walks all nine steps without an error, and ends agreeing with
 * the stiffness method.
 */
import { test, expect, type Page } from './fixtures';

/** Open a method from the "Explained step by step" catalog in the Advanced panel. */
async function openMethod(page: Page, id: 'dsm' | 'fm') {
  await page.getByTestId('rb-cmd-advanced').click();
  await page.getByTestId('adv-steps').click();
  await page.getByTestId(`steps-open-${id}`).click();
}

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
    await page.getByTestId('adv-steps').click();
    /* Listed right after the stiffness method, as its own group. */
    const groups = await page.locator('[data-testid^=steps-group-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(groups.slice(0, 2)).toEqual(['steps-group-stiffness', 'steps-group-flexibility']);
    await page.getByTestId('steps-open-fm').click();
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
    await openMethod(page, 'fm');
    await expect(page.getByTestId('fm-wizard')).toBeVisible();
    await page.getByTestId('fm-dot-4').click();
    await expect(page.getByTestId('fm-unit-state')).toBeVisible();
    await page.getByTestId('fm-state-2').click();
    await page.getByTestId('fm-dot-5').click();
    await page.getByTestId('fm-coef-12').click();
    await expect(page.getByTestId('fm-delta-terms')).toBeVisible();
  });
});

async function loadExample(page: import('@playwright/test').Page, name: string) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await page.evaluate((n) => (window as never as { __stabileoActions: { loadExample(n: string): Promise<void> } })
    .__stabileoActions.loadExample(n), name);
}

test.describe('@smoke both walkthroughs: back, matrix view, isostatic, 3D', () => {
  test('an isostatic beam walks all nine steps, and says why each is empty', async ({ page }) => {
    test.setTimeout(120_000);
    await loadExample(page, 'simply-supported');
    await openMethod(page, 'fm');
    await expect(page.getByTestId('fm-gh')).toContainText('= 0');
    for (let step = 2; step <= 9; step++) {
      await page.getByTestId('fm-next').click();
      await expect(page.getByTestId('fm-step-name')).toContainText(String(step));
    }
    await expect(page.getByTestId('fm-verdict')).toBeVisible();
  });

  test('"Back" returns to the catalog it was opened from, from either wizard', async ({ page }) => {
    test.setTimeout(120_000);
    await loadExample(page, 'continuous-beam');
    await openMethod(page, 'fm');
    await expect(page.getByTestId('fm-wizard')).toBeVisible();
    await page.getByTestId('fm-back').click();
    await expect(page.getByTestId('steps-catalog')).toBeVisible();
    await page.getByTestId('steps-open-dsm').click();
    await page.getByTestId('dsm-back').click();
    await expect(page.getByTestId('steps-catalog')).toBeVisible();
  });

  test('"View matrix" in both: the reduced stiffness flow, and a clickable [δ]', async ({ page }) => {
    test.setTimeout(120_000);
    await loadExample(page, 'portal-frame');
    await openMethod(page, 'dsm');
    await page.getByTestId('dsm-view-matrix').click();
    await expect(page.getByTestId('dsm-explorer-solve')).toBeVisible();
    await expect(page.getByTestId('dsm-explorer-fu')).toBeVisible();
    await page.getByTestId('dsm-back').click();
    await page.getByTestId('steps-open-fm').click();
    await page.getByTestId('fm-view-matrix').click();
    await expect(page.getByTestId('fm-matrix-view')).toBeVisible();
    await page.getByTestId('fm-cell-1-2').click();
    await expect(page.getByTestId('fm-mx-terms')).toContainText('δ₁₂');
    await expect(page.getByTestId('fm-mx-mi')).toBeVisible();
  });

  test('a space frame: the flexibility walkthrough in 3D, with its diagram picker', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    await page.getByTestId('rb-cmd-dim').click();
    await page.evaluate(() => (window as never as { __stabileoActions: { loadExample(n: string): Promise<void> } })
      .__stabileoActions.loadExample('3d-portal-frame'));
    await openMethod(page, 'fm');
    await expect(page.getByTestId('fm-gh')).toContainText('= 24');
    await page.getByTestId('fm-dot-4').click();
    await page.getByTestId('fm-diagram-my').click();
    await expect(page.getByTestId('fm-unit-state')).toBeVisible();
    await page.getByTestId('fm-dot-9').click();
    await expect(page.getByTestId('fm-verdict')).not.toHaveClass(/bad/);
  });

  test('a model the walkthroughs cannot show is refused with its reason', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    await page.getByTestId('rb-cmd-dim').click();
    await page.evaluate(() => (window as never as { __stabileoActions: { loadExample(n: string): Promise<void> } })
      .__stabileoActions.loadExample('mat-foundation'));
    await openMethod(page, 'dsm');
    await expect(page.locator('.wizard')).toHaveCount(0);
    await expect(page.getByText(/shell|cáscara/i).first()).toBeVisible();
  });
});
