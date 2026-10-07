/**
 * PRO › Loads: a case made of others, a reference case left out of the results, notional cases
 * from a gravity case, and a combination by SRSS.
 */
import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

const cases = (page: Page) => page.evaluate(() => window.__stabileo.loadCases());

test.describe('@smoke PRO cases and combinations', () => {
  test.beforeEach(async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
  });

  test('a composite case, a reference case out of the results, notional cases', async ({ pro: page }) => {
    const first = (await cases(page))[0] as { id: number; name: string };
    await page.getByTestId('lc-new-type').selectOption('');
    await page.getByTestId('lc-new-name').fill('Composite');
    await page.getByTestId('lc-new-add').click();
    const comp = (await cases(page)).at(-1) as { id: number };
    await page.getByTestId(`lc-open-${comp.id}`).click();
    await page.getByTestId('cd-inc-add').click();
    await page.getByTestId('cd-inc-factor-0').fill('1,5');
    await page.getByTestId('cd-inc-factor-0').press('Tab');
    await expect(page.getByTestId(`lc-composite-${comp.id}`)).toContainText('⊕ 1');
    let now = (await cases(page)).at(-1) as { includes?: Array<{ caseId: number; factor: number }> };
    expect(now.includes?.[0]).toMatchObject({ factor: 1.5 });

    // The first case as a reference: solved for what takes it in, and not listed.
    await page.getByTestId(`lc-open-${comp.id}`).click();
    await page.getByTestId(`lc-open-${first.id}`).click();
    await page.getByTestId('cd-reference').check();
    await expect(page.getByTestId(`lc-ref-${first.id}`)).toBeVisible();
    await page.evaluate(async () => { await window.__stabileoActions.solve(); });
    await expect.poll(async () => (await page.evaluate(() => window.__stabileo.resultIds())).cases.length).toBeGreaterThan(0);
    const ids = await page.evaluate(() => window.__stabileo.resultIds());
    expect(ids.cases).not.toContain(first.id);
    expect(ids.cases).toContain(comp.id);

    // Notional cases from the first case, in the four directions.
    const n0 = (await cases(page)).length;
    await page.getByTestId('lc-notional').locator('summary').click();
    await page.getByTestId(`lc-not-src-${first.id}`).check();
    await page.getByTestId('lc-not-add').click();
    now = (await cases(page)) as never;
    const all = await cases(page);
    expect(all.length).toBe(n0 + 4);
    expect(all.slice(-4).map((c) => (c as { notional: { dir: string } }).notional.dir)).toEqual(['+X', '-X', '+Y', '-Y']);
  });

  test('a combination by SRSS says so', async ({ pro: page }) => {
    await page.getByTestId('load-tab-combos').click();
    const row = page.getByTestId('combo-row').first();
    await row.getByTestId('combo-toggle').click();
    await row.getByTestId('combo-method').selectOption('srss');
    await expect(row.getByTestId('combo-method-tag')).toHaveText('SRSS');
  });
});
