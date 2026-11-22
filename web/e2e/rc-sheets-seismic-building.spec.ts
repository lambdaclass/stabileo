import { BUILD_FEATURES } from './build-features';
import type { Page } from '@playwright/test';
import { test, expect, loadModel, solveModel } from './fixtures';
import { setDesignOption } from './design-options';
if (BUILD_FEATURES.proRcSheets) {

  /**
   * The seven-storey concrete building solved as the app solves it and designed by the sheets with
   * chapter 18: opened from its gallery card no row fails, the core's walls standing on the base the
   * card holds, and a column states its hoops against Ash and hx; loaded as tests load it, without the
   * card's correction, the core's ground-floor walls fail, for resting on a node, until one click holds
   * their bases. The balconies are 15 cm thick for a 1.85 m projection: under Table 7.3.1.1's ℓ/10
   * their long-term deflection is calculated, and the bottom mesh at the root, read as compression
   * steel (§24.2.4.1.2), brings it within ℓ/240.
   */
  test.use({ appLocale: 'en' });

  /** No slab fails, the balconies' deflection among them. */
  async function slabsHold(page: Page): Promise<void> {
    await expect(page.getByTestId('rc-open-slab')).toContainText(/\b0 failing/);
    await page.getByTestId('rc-open-slab').click();
    const ws = page.getByTestId('rc-sheets-workspace');
    await ws.getByTestId('rc-tab-slab').click();
    await expect(ws.getByTestId('rc-row').first()).toBeVisible();
    await expect(ws.getByTestId('rc-row').filter({ hasText: 'Fails' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }

  async function designSeismic(page: Page): Promise<void> {
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-rcSheets').click();
    await expect(page.getByTestId('rc-sheets-panel')).toBeVisible();
    const mesh = page.getByTestId('rc-mesh-walls');
    if (await mesh.count()) {
      await mesh.click();
      await expect(mesh).toHaveCount(0, { timeout: 120_000 });
    }
    await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 120_000 });
    await page.getByTestId('rc-design').click();
    await expect(page.getByTestId('rc-open-vertical')).toBeEnabled({ timeout: 120_000 }); // slow-ok: the sheets design every member and combination before the families open
    await setDesignOption(page, 'seismic');
    const redesign = page.getByTestId('rc-redesign');
    if (await redesign.count()) await redesign.click();
    await expect(page.getByTestId('rc-redesign')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('rc-building')).toHaveCount(0, { timeout: 180_000 }); // slow-ok: chapter 18 designs every column against the joints' beams again
    await expect(page.getByTestId('rc-open-vertical')).toBeEnabled();
  }

  test('@slow the gallery\'s seven-storey building designs with the seismic provisions and no row fails', async ({ pro: page }) => {
    test.setTimeout(300_000);
    await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 60_000 }).toBe(true);
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    await page.getByTestId('pp-gallery').locator('[data-example="pro-edificio-7p"] .pp-ex').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBeGreaterThan(0);
    await solveModel(page);

    await designSeismic(page);

    for (const f of ['beam', 'vertical']) {
      const open = page.getByTestId(`rc-open-${f}`);
      if (!(await open.isEnabled())) continue;
      await expect(open, `${f} rows`).toContainText(/\b0 failing/);
    }
    await slabsHold(page);

    await page.getByTestId('rc-open-vertical').click();
    const ws = page.getByTestId('rc-sheets-workspace');
    await ws.getByTestId('rc-tab-vertical').click();
    await expect(ws.getByTestId('rc-row').filter({ hasText: 'Fails' })).toHaveCount(0);
    await expect(ws.getByTestId('rc-pier-row').filter({ hasText: 'Fails' })).toHaveCount(0);
    await ws.locator('[data-testid="rc-row"][data-family="column"]').first().click();
    const checks = ws.getByTestId('rc-checks').first();
    await expect(checks).toContainText('§18.7.5.4');
    await expect(checks).toContainText('§18.7.5.2');
  });

  test('@slow the seven-storey building as tests load it fails at its unheld core walls, and not once they are held', async ({ pro: page }) => {
    test.setTimeout(300_000);
    await loadModel(page, 'pro-edificio-7p');
    await solveModel(page);
    await designSeismic(page);
    await expect(page.getByTestId('rc-open-beam'), 'beam rows').toContainText(/\b0 failing/);
    await expect(page.getByTestId('rc-open-vertical')).toContainText(/\b3 failing/);
    await slabsHold(page);

    await page.getByTestId('rc-open-vertical').click();
    const ws = page.getByTestId('rc-sheets-workspace');
    await ws.getByTestId('rc-tab-vertical').click();
    const ground = ws.locator('[data-testid="rc-row"][data-family="wall"].st-fail').filter({ hasText: 'N0' });
    await expect(ground).toHaveCount(3);
    await ground.first().click();
    await ws.getByTestId('rc-wall-hold-base').click();
    await expect(ws.getByTestId('rc-wall-hold-base')).toHaveCount(0, { timeout: 180_000 });
    for (const [f, n] of [['beam', 0], ['vertical', 0], ['slab', 0]] as const) {
      await ws.getByTestId(`rc-tab-${f}`).click();
      await expect(ws.getByTestId('rc-row').first()).toBeVisible({ timeout: 180_000 });
      await expect(ws.getByTestId('rc-row').filter({ hasText: 'Fails' }), `${f} rows`).toHaveCount(n, { timeout: 60_000 });
    }
  });
}
