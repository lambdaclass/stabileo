/**
 * Batch and copy: a frame copied onto a different one with a preview of what does not fit,
 * the member batch's new fields (skin, support region, bottom ends, cover and section), and the
 * batch of a family that is not a member. The rules are pinned in the unit tests (`frame-copy`,
 * `family-batch`, `rebar-batch`, `design-data`).
 */
import { test, expect, loadModel, solveModel, computeDemands, openDeskStage, deskTab } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow frame copy', () => {
  test('a frame copied onto a different one: preview by member, then applied', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await page.getByTestId('desk-design').click();
    if (await page.getByTestId('desk-run-resize').count()) await page.getByTestId('desk-run-resize').setChecked(false);
    await page.getByTestId('desk-run').click();
    await expect(page.getByTestId('desk-report')).toBeVisible({ timeout: 120_000 });
    const rows = page.locator('[data-testid^="desk-row-"]').filter({ has: page.locator('.dot.st-ok') });
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click();
      if (await page.getByTestId('frame-copy').isVisible()) break;
    }
    const panel = page.getByTestId('frame-copy');
    await expect(panel).toBeVisible();
    // qa-8 has one level: the copy goes to another of its lines (the floor copy is pinned in
    // `store/__tests__/frame-copy.test.ts` on a two-level frame).
    const targets = page.getByTestId('frame-copy-target').locator('option');
    expect(await targets.count()).toBeGreaterThan(1);
    await page.getByTestId('frame-copy-target').selectOption({ index: 1 });
    const preview = page.getByTestId('frame-copy-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('[data-testid^="frame-copy-row-"]')).not.toHaveCount(0);
    // Every row says what happens to its member.
    const statuses = await preview.locator('[data-testid^="frame-copy-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
    expect(statuses.every((s) => ['copy', 'length', 'section', 'noSource'].includes(s ?? ''))).toBe(true);
    if (statuses.includes('copy')) {
      await page.getByTestId('frame-copy-apply').click();
      await expect(panel).toContainText(/copied|copiado/i);
    }
  });
});

test.describe('@slow batch, more fields and families', () => {
  test('the member batch sets the skin and the support region, previewed and applied', async ({ pro: page }) => {
    const ids = await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await computeDemands(page);
    await page.evaluate(() => window.__stabileoActions.designAll());
    await expect.poll(() => page.evaluate(() => window.__stabileo.runCounts()?.verified ?? 0)).toBeGreaterThan(0);
    const beams = await page.evaluate((list) => list.filter((id) => window.__stabileo.rebarSummary(id).startsWith('b')), ids);
    for (const id of beams.slice(0, 2)) await page.getByTestId(`row-checkbox-${id}`).check();
    await page.getByTestId('batch-open').click();
    await expect(page.getByTestId('batch-dialog')).toBeVisible();
    await page.getByTestId('batch-region').fill('30');
    await page.getByTestId('batch-skin-mode').selectOption('set');
    await expect(page.getByTestId('batch-skin-dia')).toBeVisible();
    await expect(page.getByTestId('batch-preview')).toContainText(/support region|30 %/);
    // The pieces block: a cover for the two beams, applied apart from the bars.
    await page.getByTestId('batch-cover').fill('3');
    await page.getByTestId('batch-pieces-apply').click();
    await expect(page.getByTestId('batch-pieces-note')).toContainText('2');
  });

  test('a family batch opens on its editor and lists its items', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    for (const tab of ['wall', 'slab', 'stairs'] as const) {
      await deskTab(page, tab);
      const fam = tab === 'stairs' ? 'stair' : tab;
      const box = page.getByTestId(`family-batch-${fam}`);
      await expect(box).toBeAttached();
      await box.locator('summary').click();
      await expect(box.getByTestId('family-batch-all')).toBeVisible();
    }
  });
});
