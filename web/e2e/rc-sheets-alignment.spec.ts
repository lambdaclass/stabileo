import { test, expect, loadModel, solveModel } from './fixtures';
import type { Locator } from '@playwright/test';

/**
 * The reinforcement sheets' tables put each numeric header over its values: the header and every
 * value of a numeric column end at the same right edge, in a row's checks and in the family table.
 */
test.use({ appLocale: 'es' });

/** For each column index, the largest distance between the right edge of the header's text and of a value's, px. */
async function misalignment(table: Locator, columns: number[]): Promise<number[]> {
  return table.evaluate((t, cols) => {
    const textRight = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; };
    const head = [...t.querySelectorAll(':scope > thead > tr > th')];
    const body = [...t.querySelectorAll(':scope > tbody > tr')].map((tr) => [...tr.children]);
    return cols.map((i) => {
      const h = textRight(head[i]!);
      const cells = body.map((r) => r[i]).filter((c): c is Element => !!c && (c.textContent ?? '').trim() !== '' && !c.hasAttribute('colspan'));
      return cells.length ? Math.max(...cells.map((c) => Math.abs(textRight(c) - h))) : Number.NaN;
    });
  }, columns);
}

test('@smoke a check table and a family table align each numeric header with its values', async ({ pro: page }) => {
  await loadModel(page, 'rc-design-qa-8');
  await solveModel(page);
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await page.getByTestId('rc-design').click();
  await expect(page.getByTestId('rc-building')).toHaveCount(0, { timeout: 30_000 });
  await page.getByTestId('rc-open-vertical').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  const table = ws.getByTestId('rc-table-vertical');
  await expect(table).toBeVisible();

  const family = await misalignment(table, [4, 7, 10]);
  for (const [k, d] of family.entries()) expect(d, `family column ${k}`).toBeLessThanOrEqual(2);

  await ws.getByTestId('rc-row').first().click();
  const checks = ws.getByTestId('rc-checks').first();
  await expect(checks).toBeVisible();
  const gaps = await misalignment(checks, [2, 3, 4]);
  expect(gaps.every((d) => Number.isFinite(d))).toBe(true);
  for (const [k, d] of gaps.entries()) expect(d, ['demand', 'capacity', 'ratio'][k]).toBeLessThanOrEqual(2);
});
