/**
 * Joint typologies on the industrial shed: a typology proposed and sized at every steel joint,
 * the list with each one's state, a joint opened with its checks and its drawing, the same parts
 * in the 3D view, plates made equal across joints alike, and no claim of approval anywhere.
 */
import { test, expect, PRO_URL, loadModel, solveModel, openDeskStage, deskTab, designPlace } from './fixtures';

test.describe('@slow joint typologies', () => {
  test('proposed everywhere, opened, drawn and equalized', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(PRO_URL);
    await loadModel(page, '3d-nave-industrial');
    await solveModel(page);
    await designPlace(page, 'connections');
    const overview = page.getByTestId('joints-overview');
    await expect(overview).toBeVisible();
    await overview.getByTestId('joints-propose-all').click();
    await expect(overview.getByTestId('joints-note')).toContainText(/\d/);
    await expect(overview.getByTestId('joints-table').locator('tr').first()).toBeVisible();

    // A joint opened: its typology, the checks with clauses, the drawing.
    await overview.getByTestId('joints-table').locator('tr').first().locator('button').click();
    const panel = page.getByTestId('joint-typology');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('joint-typ-kind')).not.toHaveValue('');
    await expect(panel.getByTestId('joint-typ-checks')).toBeVisible();
    await expect(panel.getByTestId('joint-typ-drawing')).toBeVisible();
    const text = await panel.innerText();
    expect(/\bverified\b|verificad[oa]s?\b/i.test(text)).toBe(false);

    // Sizing in place, and the plates made equal across joints alike.
    await panel.getByTestId('joint-typ-size').click();
    await expect(panel.getByTestId('joint-typ-note')).toBeVisible();
    await overview.getByTestId('joints-equalize').click();
    await expect(overview.getByTestId('joints-note')).toContainText(/\d/);
    // The same joints in the design desk.
    await openDeskStage(page);
    await deskTab(page, 'joint');
    await expect(page.getByTestId('desk-joints').getByTestId('joints-table')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
