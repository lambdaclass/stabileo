import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * The slabs of a level of the seven-storey example in one plan: one bar per package with its legs
 * folded onto the plan, bottom and top switched apart, the strips adding up to what the panels
 * require, and the bent-bar option laying every other span bar over both supports.
 */
test.use({ appLocale: 'es' });

test('@slow the reinforcement sheets draw the slabs of a level as one plan', async ({ pro: page }) => {
  test.setTimeout(180_000);
  await loadModel(page, 'pro-edificio-7p');
  await solveModel(page);
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId('rc-design').click();
  await expect(page.getByTestId('rc-open-slab')).toBeEnabled({ timeout: 60_000 });

  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.getByTestId('rc-open-slab').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await expect(ws.getByTestId('rc-table-slab')).toBeVisible();
  await ws.getByTestId('rc-slab-view-plan').click();
  await expect(ws.getByTestId('rc-table-slab')).toHaveCount(0);
  const level = ws.locator('.rcw-tools select');
  const second = (await level.locator('option').allTextContents())[2]!;
  await level.selectOption({ label: second });
  const fig = ws.getByTestId('rc-slab-plan-level');
  await expect(fig).toHaveAttribute('data-level', second);

  const bars = fig.getByTestId('rc-plan-bar');
  const rows = fig.getByTestId('rc-plan-schedule').locator('tbody tr');
  const base = await fig.getByTestId('rc-plan-show-base').count();
  if (base) await fig.getByTestId('rc-plan-show-base').check();
  await expect.poll(() => bars.count()).toBeGreaterThan(10);
  expect(await bars.count()).toBe(await rows.count());
  const marks = await bars.evaluateAll((g) => g.map((x) => x.getAttribute('data-mark')));
  expect(new Set(marks).size).toBe(marks.length);
  await expect(fig.locator('[data-testid="rc-plan-bar"][data-layer="top"][data-kind="support"]').first()).toBeVisible();
  await expect(fig.locator('[data-testid="rc-plan-bar"][data-layer="top"]').first()).toContainText(/Ø\d+ c\/\d+ L=\d+,\d\d/);
  expect(await fig.locator('[data-testid="rc-plan-bar"][data-layer="top"] [data-testid="rc-plan-leg"]').count()).toBeGreaterThan(0);
  await expect(fig.getByTestId('rc-plan-checks')).toHaveText(/Franjas verificadas: (\d+) de \1 /);
  await expect(fig.getByTestId('rc-plan-short')).toHaveCount(0);
  await expect(fig.getByTestId('rc-plan-cantilever')).toHaveCount(1);
  await fig.screenshot({ path: test.info().outputPath('slab-plan.png') });

  await fig.getByTestId('rc-plan-show-top').uncheck();
  await expect(fig.locator('[data-testid="rc-plan-bar"][data-layer="top"]')).toHaveCount(0);
  expect(await fig.locator('[data-testid="rc-plan-bar"][data-layer="bottom"]').count()).toBeGreaterThan(0);
  await fig.getByTestId('rc-plan-show-top').check();
  await fig.getByTestId('rc-plan-show-bottom').uncheck();
  await expect(fig.locator('[data-testid="rc-plan-bar"][data-layer="bottom"]')).toHaveCount(0);
  await fig.screenshot({ path: test.info().outputPath('slab-plan-top.png') });

  await ws.getByTestId('rc-slab-view-panels').click();
  await expect(ws.getByTestId('rc-table-slab')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTestId('rc-opt-slab-bent-bars').check();
  await page.getByTestId('rc-redesign').click();
  await expect(page.getByTestId('rc-stale')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('rc-open-slab').click();
  await ws.getByTestId('rc-slab-view-plan').click();
  await level.selectOption({ label: second });
  await expect(fig.locator('[data-testid="rc-plan-bar"][data-kind="bent"]').first()).toBeVisible();
  await expect(fig.getByTestId('rc-plan-checks')).toHaveText(/Franjas verificadas: (\d+) de \1 /);
  await expect(fig.getByTestId('rc-plan-short')).toHaveCount(0);
  await fig.screenshot({ path: test.info().outputPath('slab-plan-bent.png') });
});
