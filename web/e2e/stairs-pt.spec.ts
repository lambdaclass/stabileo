/**
 * Stairs in the design desk: on a concrete frame, a stair stated in the form (its live load from
 * Tabla 4.1 of CIRSOC 101), designed with its rows and its bars, its reactions put on two beams.
 * The arithmetic is pinned in `engine/design/slabs/__tests__/stairs-post-tensioned.test.ts` and
 * `store/__tests__/stairs-pt.test.ts`.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow stairs', () => {
  test('a stair designed and its reactions applied', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'stairs');
    const ed = page.getByTestId('stairs-editor');
    await expect(ed).toBeVisible();
    await ed.getByTestId('stair-save').click();
    await expect(ed.getByTestId('stair-note')).toContainText(/Missing data|Faltan datos/);
    await ed.getByTestId('stair-name').fill('E1');
    await ed.getByTestId('desk-stair-steps').fill('10');
    await ed.getByTestId('desk-stair-waist').fill('0.18');
    await ed.getByTestId('stair-finishes').fill('1');
    await expect(ed.getByTestId('stair-live')).toHaveValue('5');
    await ed.getByTestId('stair-save').click();
    await expect(ed.locator('[data-testid^="stair-row-"]')).toHaveCount(1);
    await expect(ed.getByTestId('stair-summary')).toBeVisible();
    await expect(page.getByTestId('member-rows-sheet')).toContainText('7.3.1.1');
    await expect(ed.getByTestId('stair-bars').locator('tbody tr')).toHaveCount(4);
    await ed.getByTestId('stair-reactions').locator('summary').click();
    const beam = ed.getByTestId('stair-foot-beam');
    await beam.selectOption(await beam.locator('option').nth(1).getAttribute('value') ?? '');
    await ed.getByTestId('stair-apply').click();
    await expect(ed.getByTestId('stair-note')).toContainText(/2 (loads applied|cargas aplicadas)/);
    expect(/\bsatisfies\b|\bcumple\b|verified|verificad/i.test(await ed.innerText())).toBe(false);

    expect(errors).toEqual([]);
  });
});
