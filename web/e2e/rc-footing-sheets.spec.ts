import { BUILD_FEATURES } from './build-features';
import { test, expect, loadModel, ribbonCmd, solveModel } from './fixtures';
import type { Page } from '@playwright/test';
if (BUILD_FEATURES.proRcSheets) {

  /**
   * Footings in the reinforcement sheets, on a solved four-column frame: the soil stated in the
   * foundations editor, one footing modelled there, then the Footings family sizes one footing per
   * column base, checks it, draws its plan and section, puts its bars in the bending schedule, and
   * writes a proposed footing back to the model.
   */
  test.use({ appLocale: 'es' });

  async function openFoundations(page: Page) {
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'foundations');
    await expect(page.getByTestId('foundation-model-panel')).toBeVisible();
    const editor = page.locator('details.fd-editor');
    if (await editor.getAttribute('open') === null) await editor.locator('> summary').click();
    await expect(page.getByTestId('foundations-panel')).toBeVisible();
  }

  test('@smoke the footing sheets size, check and draw a footing under every column base', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openFoundations(page);
    await page.getByTestId('soil-add').click();
    const bearing = page.getByTestId('soil-1-bearing');
    await bearing.fill('200');
    await bearing.blur();
    const select = page.getByTestId('footing-add-node');
    await select.selectOption((await select.locator('option:not([value=""])').first().getAttribute('value'))!);
    await expect(page.getByTestId('footing-to-sheets')).toContainText('planillas de armado');
    await solveModel(page);

    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-rcSheets').click();
    await page.getByTestId('rc-design').click();
    await expect(page.getByTestId('rc-building')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId('rc-open-footing')).toBeEnabled();
    await page.getByTestId('rc-open-footing').click();
    const ws = page.getByTestId('rc-sheets-workspace');
    await expect(ws.getByTestId('rc-table-footing')).toBeVisible();
    const rows = ws.getByTestId('rc-row');
    await expect(rows).toHaveCount(4);
    for (let i = 0; i < 4; i++) await expect(rows.nth(i)).toContainText(/Verifica|Holgada/);
    const first = rows.first();
    await expect(first).toContainText(/\d+×\d+×\d+/);
    await expect(first).toContainText(/Ø\d+ c\/\d+/);

    await first.click();
    await expect(ws.getByTestId('rc-footing-figure')).toBeVisible();
    await expect(ws.getByTestId('rc-footing-plan')).toBeVisible();
    await expect(ws.getByTestId('rc-footing-section')).toBeVisible();
    const barsX = await ws.getByTestId('rc-footing-bar-x').count();
    expect(barsX).toBeGreaterThan(3);
    await expect(ws.getByTestId('rc-footing-dowel')).toHaveCount(2);
    const checks = ws.getByTestId('rc-checks');
    for (const line of ['Tensión en el suelo', 'Punzonado a d/2', 'Corte en una dirección', 'Anclaje de las esperas']) await expect(checks).toContainText(line);
    await expect(ws.getByTestId('rc-steps')).toContainText('Tensión en el suelo (servicio)');

    await ws.getByTestId('rc-footing-adopt').click();
    await expect(first.getByTestId('rc-edited-tag')).toHaveCount(0);
    const h = ws.getByTestId('rc-footing-h');
    await h.fill('20');
    await h.blur();
    await expect(first).toContainText('No verifica');
    await expect(first.getByTestId('rc-edited-tag')).toBeVisible();

    await ws.getByTestId('rc-tab-schedule').click();
    await expect(ws).toContainText('Inferior según X');
    await expect(ws).toContainText('Barra de espera');

    await ws.getByTestId('rc-tab-footing').click();
    await rows.first().click();
    await ws.getByTestId('rc-footing-to-model').click();
    await expect(ws.getByTestId('rc-stale')).toBeVisible();
    await ws.getByTestId('rc-close').click();
    await openFoundations(page);
    await expect(page.getByTestId('footing-count')).toHaveText('2');
  });

  test('@smoke a property line declared in the design data makes an edge footing with its strap beam', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-rcSheets').click();
    const dd = page.getByTestId('rc-design-data');
    if (!(await dd.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByTestId('rc-dd-edit').click();
    const card = dd.getByTestId('design-options-foundations');
    if (!(await card.evaluate((d) => (d as HTMLDetailsElement).open))) await card.locator('> summary').click();
    await card.getByTestId('design-data-property-line-minX').check();
    await expect(card.getByTestId('design-options-foundations-summary')).toContainText('Medianeras −X');

    await page.getByTestId('rc-design').click();
    await expect(page.getByTestId('rc-building')).toHaveCount(0, { timeout: 20_000 });
    await page.getByTestId('rc-open-footing').click();
    const ws = page.getByTestId('rc-sheets-workspace');
    const edge = ws.getByTestId('rc-row').filter({ has: page.locator('[data-kind="edge"]') });
    await expect(edge).toHaveCount(2);
    await expect(edge.first()).toContainText('Medianera');
    await expect(edge.first()).toContainText('centradora');
    await expect(ws.getByTestId('rc-row').filter({ has: page.locator('[data-kind="centred"]') })).toHaveCount(2);
    for (const r of await ws.getByTestId('rc-row').all()) await expect(r).not.toContainText('No verifica');

    await edge.first().click();
    await expect(ws.getByTestId('rc-footing-line')).toHaveCount(1);
    await expect(ws.getByTestId('rc-footing-strap')).toHaveCount(1);
    await expect(ws.getByTestId('rc-footing-strap-bars')).toContainText('Ø');
    await expect(ws.getByTestId('rc-footing-strap-line')).toBeVisible();
    await expect(ws.getByTestId('rc-footing-balance')).toHaveValue('strap');
    const steps = ws.getByTestId('rc-steps');
    for (const s of ['Medianera y equilibrio', 'Corte de la viga', 'Reacción bajo la base', 'Alivio de la base vecina']) await expect(steps).toContainText(s);
  });
}
