/**
 * The sheets' newer outputs on a concrete frame: a stair stated in the desk barred in the sheets,
 * its section drawn, scheduled and ordered by level, and a column's fixed point chosen.
 * The arithmetic is pinned in `rc-sheets/__tests__/stair-row.switch-on.test.ts`,
 * `schedule/__tests__/order.switch-on.test.ts` and `__tests__/fixed-points.switch-on.test.ts`.
 */
import { BUILD_FEATURES } from './build-features';
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

if (BUILD_FEATURES.proRcSheets && BUILD_FEATURES.proPlatesUnified) {
  test('@smoke a stair of the desk is barred in the sheets, drawn, scheduled and ordered by level; a column takes a fixed point', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'stairs');
    const ed = page.getByTestId('stairs-editor');
    await ed.getByTestId('stair-name').fill('E1');
    await ed.getByTestId('desk-stair-steps').fill('10');
    await ed.getByTestId('desk-stair-waist').fill('0.18');
    await ed.getByTestId('stair-finishes').fill('1');
    await ed.getByTestId('stair-save').click();
    await expect(ed.locator('[data-testid^="stair-row-"]')).toHaveCount(1);
    if (await page.getByTestId('desk-close').isVisible()) await page.getByTestId('desk-close').click();

    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-rcSheets').click();
    await page.getByTestId('rc-design').click();
    await expect(page.getByTestId('rc-building')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('rc-open-stair')).toBeEnabled();
    await page.getByTestId('rc-open-stair').click();
    const ws = page.getByTestId('rc-sheets-workspace');
    const rows = ws.getByTestId('rc-table-stair').getByTestId('rc-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('E1');
    await rows.first().click();
    await expect(ws.getByTestId('rc-stair-figure')).toBeVisible();
    expect(await ws.getByTestId('rc-stair-bar').count()).toBeGreaterThanOrEqual(3);
    await expect(ws.locator('[data-testid="rc-stair-bar"][data-role="landing"]')).toHaveCount(1);
    await ws.getByTestId('rc-stair-adopt').click();
    await expect(ws.getByTestId('rc-stair-adopt')).toHaveCount(0);

    await ws.getByTestId('rc-tab-schedule').click();
    await expect(ws.getByTestId('rc-bbs-table')).toContainText(/Escalera|Stair/);
    await ws.getByTestId('rc-bbs-order').click();
    await expect(ws.getByTestId('rc-order-table')).toBeVisible();
    await expect(ws.getByTestId('rc-order-total')).toBeVisible();
    expect(await ws.getByTestId('rc-order-level').count()).toBeGreaterThanOrEqual(1);
    await expect(ws.getByTestId('rc-order-families')).toContainText(/Escaleras|Stairs/);

    await ws.getByTestId('rc-tab-vertical').click();
    await ws.getByTestId('rc-row').first().click();
    const fixed = ws.getByTestId('rc-fixed-point-select');
    await expect(fixed).toHaveValue('c');
    await fixed.selectOption('px');
    await expect(fixed).toHaveValue('px');
  });
}
