/**
 * The design desk's footing editor, on the committed footing project: its checks, the soil
 * pressure read at a point, sizing in full, the reinforcement fixed by hand and checked, and a
 * footing turned in plan still designed.
 */
import { test, expect, solveModel, openDeskStage, deskTab } from './fixtures';
import { openCommittedProject } from './footing-project';

test.describe('the footing editor in the design desk', () => {
  test('checks, pressure, sizing and fixed bars', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openCommittedProject(page);
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'footing');
    const ed = page.getByTestId('footing-desk-editor');
    await expect(ed).toBeVisible();
    await expect(ed.getByTestId('fdn-checks')).toBeVisible();
    await expect(ed.getByTestId('fdn-checks').locator('tr')).toHaveCount(6);

    // The pressure, read where the pointer rests.
    const map = ed.getByTestId('footing-pressure-map').locator('svg');
    await map.scrollIntoViewIfNeeded();
    // Quiet once drawn: nothing in the editor keeps re-rendering.
    const mutations = await page.evaluate(() => new Promise<number>((done) => {
      let n = 0;
      const o = new MutationObserver((l) => { n += l.length; });
      o.observe(document.querySelector('[data-testid="footing-desk-editor"]')!, { subtree: true, childList: true, attributes: true, characterData: true });
      setTimeout(() => { o.disconnect(); done(n); }, 1500);
    }));
    expect(mutations).toBe(0);
    await map.hover({ position: { x: 60, y: 40 } });
    await expect(ed.getByTestId('footing-pressure-probe')).toContainText('kPa');
    await expect(ed.getByTestId('footing-pressure-probe')).toContainText('q(');

    // Full sizing reaches a size where every check holds.
    await ed.getByTestId('fdn-size-full').click();
    await expect(ed.getByTestId('fdn-size-note')).toBeVisible();
    await expect(ed.getByTestId('fdn-checks').locator('tr.bad')).toHaveCount(0);

    // A layer fixed by hand: the reinforcement locks and the check reads the bars given.
    const firstSpacing = ed.getByTestId('fdn-mats').locator('tbody tr').first().locator('input');
    await firstSpacing.fill('0.45');
    await firstSpacing.dispatchEvent('change');
    await expect(ed.getByTestId('fdn-lock-rebar')).toBeChecked();
    await expect(ed.getByTestId('fdn-unfix')).toBeVisible();
    await ed.getByTestId('fdn-unfix').click();
    await expect(ed.getByTestId('fdn-lock-rebar')).not.toBeChecked();

    // Turned in plan, it is still designed.
    await ed.getByTestId('footing-rotation').fill('30');
    await expect(ed.getByTestId('fdn-checks')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
