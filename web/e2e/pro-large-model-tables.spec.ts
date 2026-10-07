import { test, expect } from './fixtures';
import { largeBuilding } from './large-model';

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * PRO's tables on a large model: 1,638 nodes, 4,245 members, 1,200 slab faces and 5,130 loads.
 *
 * Opening the members tab built 25,000 options (a material and a section select in every row,
 * each with the whole list) and 93,000 elements in one go, and the loads tab 98,000: most of a
 * second each, and as long again for the browser to lay them out. Now the rows come in batches
 * (`progressive-rows.svelte.ts`) and a row's selects hold their list only while open
 * (`LazySelect`). Counted, not timed: in CI WebGL runs on the CPU and times are not the user's.
 */
const opened = (page: import('@playwright/test').Page, tab: string) => page.evaluate(async (tab) => {
  window.__stabileoActions.openProTab(tab);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const panel = document.querySelector('[data-testid="pro-panel"]')!;
  return { rows: panel.querySelectorAll('tbody tr').length, options: panel.querySelectorAll('option').length };
}, tab);

test.describe('@smoke PRO tables on a large model', () => {
  test.beforeEach(async ({ pro: page }) => {
    test.setTimeout(240_000);
    await page.evaluate((j) => window.__stabileoActions.loadModelData(j), largeBuilding());
    await expect.poll(() => page.evaluate(() => window.__stabileo.modelCensus().elements)).toBe(4245);
  });

  test('members, loads, plates and nodes open on their first rows, with a closed list per select', async ({ pro: page }) => {
    for (const tab of ['elements', 'loads', 'shells', 'nodes']) {
      await page.evaluate(() => window.__stabileoActions.openProTab('project'));
      const r = await opened(page, tab);
      expect(r.rows, `${tab}: the first batch, not every row`).toBeLessThan(200);
      expect(r.options, `${tab}: one option per closed select`).toBeLessThan(400);
    }
    // The rest follows, and every member gets its row.
    await page.evaluate(() => window.__stabileoActions.openProTab('elements'));
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('[data-testid="pro-panel"] tr[data-elem]').length), { timeout: 60_000 }).toBe(4245);
  });

  test('a member selected in the model far down the list is drawn and brought into view at once', async ({ pro: page }) => {
    await page.evaluate(() => window.__stabileoActions.openProTab('elements'));
    await page.evaluate(() => window.__stabileoActions.selectElements([4200]));
    const row = page.locator('tr[data-elem="4200"]');
    await expect(row).toBeInViewport({ timeout: 5_000 });
    await expect(row).toHaveClass(/selected/);
  });

  test('a row\'s select opens on its full list', async ({ pro: page }) => {
    await page.evaluate(() => window.__stabileoActions.openProTab('elements'));
    const sel = page.locator('tr[data-elem="1"] td.col-sec select');
    await expect(sel.locator('option')).toHaveCount(1);
    await sel.focus();
    const sections = await page.evaluate(() => window.__stabileo.modelCensus().sections);
    await expect(sel.locator('option')).toHaveCount(sections);
    await sel.selectOption({ label: 'IPE 400' });
    await expect.poll(() => page.evaluate(() => {
      const sid = (window.__stabileo.entityData('element', 1) as { sectionId: number }).sectionId;
      return (window.__stabileo.entityData('section', sid) as { name: string }).name;
    })).toBe('IPE 400');
  });
});
