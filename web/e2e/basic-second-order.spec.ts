import { test, expect } from './fixtures';
import { openAdvancedFunction } from './advanced-panel';

const SHOTS = process.env.SO_SHOTS;

test.describe('@slow second order and buckling in Basic', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-second-order'));
    await page.getByTestId('rb-cmd-advanced').click();
  });

  for (const space of [false, true]) test('a tension-only bar returns from buckling without opening a mode in ' + (space ? '3D' : '2D'), async ({ page }) => {
    await page.evaluate(async space => {
      await window.__stabileoActions.loadExample('cantilever');
      const file = JSON.parse(window.__stabileo.serializeProject());
      file.analysisMode = space ? '3d' : '2d';
      const [, bar] = file.snapshot.elements[0];
      file.snapshot.supports[0][1].type = space ? 'fixed3d' : 'fixed';
      file.snapshot.loads = [{ type: space ? 'nodal3d' : 'nodal', data: {
        id: 1, nodeId: bar.nodeJ, fx: 10, fy: 0, fz: 0, mx: 0, my: 0, mz: 0,
      } }];
      if (!window.__stabileoActions.loadProject(file)) throw Error('Cantilever reopen failed');
    }, space);
    await openAdvancedFunction(page, 'buckling');
    await expect(page.getByText('No member is in compression under these loads: there is no buckling to compute.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('adv-launcher')).toBeVisible();
    await expect(page.getByTestId('adv-running')).toHaveCount(0);
    await expect(page.getByTestId('buckling-how')).toHaveCount(0);
  });

  test('recovers from a refused thermal teaching solve by switching back to the engine', async ({ page }) => {
    const opened = await page.evaluate(() => {
      const file = JSON.parse(window.__stabileo.serializeProject());
      const elementId = file.snapshot.elements[0][0];
      file.snapshot.loads.push({ type: 'thermal', data: { id: file.snapshot.nextId.load++, elementId, dtUniform: 1, dtGradient: 0 } });
      return window.__stabileoActions.loadProject(file);
    });
    expect(opened).toBe(true);
    await openAdvancedFunction(page, 'pdelta');
    await page.getByTestId('so-options-toggle').click();
    const method = page.getByTestId('so-method');
    await method.selectOption('phi');
    await expect(page.getByTestId('pdelta-result')).toHaveCount(0);
    await expect(method).toBeVisible();
    await method.selectOption('consistent');
    await expect(page.getByTestId('pdelta-result')).toBeVisible();
  });

  test('P-Δ with φ and 4 elements per member, its step by step, and buckling with 4 elements', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await openAdvancedFunction(page, 'pdelta');
    await page.getByTestId('so-options-toggle').click();
    await page.getByTestId('so-method').selectOption('phi');
    await page.getByTestId('so-n-4').click();
    await expect(page.getByTestId('pdelta-result')).toContainText(/B₂ = 1\.\d{3}/);
    await expect(page.getByTestId('pdelta-b2-line')).toContainText('λ₁');
    await page.getByTestId('pdelta-iterations').locator('summary').click();
    await expect(page.getByTestId('pdelta-iterations').locator('tbody tr').first()).toBeVisible();
    await page.getByTestId('pdelta-compare').locator('summary').click();
    await expect(page.getByTestId('pdelta-compare').locator('tbody tr')).toHaveCount(4);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/pdelta-panel.png` });

    await page.getByTestId('adv-related-steps').locator('summary').click();
    await page.getByTestId('adv-related-so-pdelta-phi').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/steps-doc.png` });
    await page.getByTestId('steps-back').click();

    await page.getByTestId('so-options-toggle').click();
    await page.getByTestId('so-method').selectOption('consistent');
    await expect(page.getByTestId('pdelta-compare')).toHaveCount(0);
    await openAdvancedFunction(page, 'buckling');
    await expect(page.locator('.adv-result-info').filter({ hasText: /λcr = \d/ })).toBeVisible();
    await expect(page.getByTestId('buckling-how')).toContainText('4');
    await expect(page.getByTestId('buckling-n1-warning')).toHaveCount(0);
    await page.getByTestId('buckling-keff').locator('summary').click();
    await expect(page.getByTestId('buckling-keff').locator('tbody tr')).toHaveCount(3);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/buckling-panel.png` });
    expect(errors).toEqual([]);
  });
});
