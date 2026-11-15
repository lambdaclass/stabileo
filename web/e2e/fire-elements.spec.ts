/**
 * Fire resistance and the particular elements in the design desk, on a concrete frame: a rating
 * and a fire table stated, the members checked against it and one opened; no coupling beam found. The arithmetic is pinned in the engine tests under
 * `engine/design/{fire,special,masonry,connections}` and in `store/__tests__/special-elements.test.ts`.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow fire and particular elements', () => {
  test('a fire rating checked against the project table; the particular elements', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);

    await deskTab(page, 'fire');
    const fire = page.getByTestId('fire-editor');
    await expect(fire).toContainText(/Choose the required rating|Elegí la resistencia requerida/);
    await fire.getByTestId('fire-rating').selectOption('60');
    await fire.getByTestId('fire-concrete').locator('summary').click();
    await fire.getByTestId('fire-bmin').fill('200');
    await fire.getByTestId('fire-amin').fill('30');
    await fire.getByTestId('fire-row-add').click();
    const rows = fire.getByTestId('fire-results').locator('tbody tr');
    await expect(rows).not.toHaveCount(0);
    await rows.first().click();
    await expect(page.getByTestId('member-rows-sheet')).toContainText('R60');
    expect(/\bsatisfies\b|\bcumple\b|verified|verificad/i.test(await fire.innerText())).toBe(false);

    await deskTab(page, 'elements');
    const el = page.getByTestId('elements-editor');
    await el.getByTestId('sel-coupling').locator('summary').click();
    await expect(el.getByTestId('sel-coupling')).toContainText(/No beam joins two walls|No hay vigas que unan dos tabiques/);
    expect(errors).toEqual([]);
  });
});
