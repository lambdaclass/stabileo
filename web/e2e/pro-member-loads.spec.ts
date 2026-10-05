/**
 * PRO › Loads: a load written by kind and target, its table, the case totals, and the operations
 * on loads and cases.
 */
import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

async function openLoads(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('write-load').click();
  await expect(page.getByTestId('write-load-form')).toBeVisible();
}
const loads = (page: Page) => page.evaluate(() => window.__stabileo.allLoads());

test.describe('@smoke PRO member loads', () => {
  test('a distributed load reads «1,5», an empty J is the I value and a zero in J is a zero', async ({ pro: page }) => {
    const ids = await loadModel(page, 'rc-design-qa-8');
    await openLoads(page);
    const before = (await loads(page)).length;
    await page.getByTestId('wl-kind-distributed').click();
    await page.getByTestId('wl-qzi').fill('-1,5');
    await page.getByTestId('load-target-by').selectOption('ids');
    await page.getByTestId('load-target-ids').fill(String(ids[0]));
    await expect(page.getByTestId('load-target-count')).toContainText('1');
    await page.getByTestId('wl-add').click();
    await expect(page.getByTestId('wl-done')).toBeVisible();
    let all = await loads(page);
    expect(all.length).toBe(before + 1);
    expect(all[all.length - 1]!.data).toMatchObject({ qZI: -1.5, qZJ: -1.5 });
    await page.getByTestId('wl-qzj').fill('0');
    await page.getByTestId('wl-a').fill('0,5');
    await page.getByTestId('wl-add').click();
    all = await loads(page);
    expect(all[all.length - 1]!.data).toMatchObject({ qZI: -1.5, qZJ: 0, a: 0.5 });
    // The table shows the stretch.
    await expect(page.getByTestId('lt-dist-a').last()).toHaveValue('0.5');
  });

  test('a concentrated moment inside a member, and the case totals before solving', async ({ pro: page }) => {
    const ids = await loadModel(page, 'rc-design-qa-8');
    await openLoads(page);
    await page.getByTestId('wl-kind-point').click();
    await page.getByTestId('wl-pmy').fill('12');
    await page.getByTestId('wl-pz').fill('-10');
    await page.getByTestId('wl-pa').fill('1');
    await page.getByTestId('load-target-by').selectOption('ids');
    await page.getByTestId('load-target-ids').fill(String(ids[0]));
    await page.getByTestId('wl-add').click();
    const all = await loads(page);
    expect(all[all.length - 1]).toMatchObject({ type: 'pointOnElement3d', data: { a: 1, pz: -10, my: 12 } });
    await expect(page.getByTestId('lt-point-row').last()).toBeVisible();
    await expect(page.getByTestId('lt-totals')).toContainText('ΣFz');
  });

  test('a case is duplicated with its loads, and deleting one asks first', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openLoads(page);
    const n0 = await page.locator('[data-testid="lc-row"]').count();
    await page.locator('[data-testid^="lc-dup-"]').first().click();
    await expect(page.locator('[data-testid="lc-row"]')).toHaveCount(n0 + 1);
    await page.locator('[data-testid^="lc-del-"]').last().click();
    await expect(page.locator('[data-testid^="lc-confirm-"]').first()).toBeVisible();
    await page.getByTestId('lc-confirm-yes').click();
    await expect(page.locator('[data-testid="lc-row"]')).toHaveCount(n0);
  });

  test('loads picked in the table are copied to another case times a factor', async ({ pro: page }) => {
    const ids = await loadModel(page, 'rc-design-qa-8');
    await openLoads(page);
    await page.getByTestId('wl-kind-nodal').click();
    await page.getByTestId('wl-fz').fill('-20');
    await page.getByTestId('load-target-by').selectOption('ids');
    void ids;
    const nodes = await page.evaluate(() => window.__stabileo.nodeIds());
    await page.getByTestId('load-target-ids').fill(String(nodes[0]));
    await page.getByTestId('wl-add').click();
    const before = await loads(page);
    const mine = before[before.length - 1]!;
    // The row of the load just written: the last of the nodal table.
    await page.getByTestId('load-tables').locator('table:not([data-testid="lt-sw"])').first().locator('tbody tr').last().locator('td.col-id').click();
    await expect(page.getByTestId('lt-ops')).toBeVisible();
    await page.getByTestId('lt-ops-factor').fill('1,5');
    await page.getByTestId('lt-ops-copy').click();
    const after = await loads(page);
    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1]!.data).toMatchObject({ fz: -30 });
    expect(after[after.length - 1]!.data.caseId).not.toBe(mine.data.caseId);
  });
});
