/**
 * The other materials in the design desk: on the industrial shed, a steel column made composite
 * (encased in reinforced concrete), checked by AISC 360-10 Chapter I, listed with its family and
 * opened in the inspector with its rows. The checkers are pinned in
 * `engine/design/materials/__tests__/materials.test.ts` and `store/__tests__/material-check.test.ts`.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow other materials', () => {
  test('a steel column made composite, checked, listed and opened', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, '3d-nave-industrial');
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'materials');
    const ed = page.getByTestId('materials-editor');
    await expect(ed).toBeVisible();
    await ed.getByTestId('mat-composite').locator('summary').click();
    const sel = ed.getByTestId('mat-composite-member');
    const first = await sel.locator('option').nth(1).getAttribute('value');
    await sel.selectOption(first!);
    await ed.getByTestId('mat-composite-kind').selectOption('encased');
    await ed.getByTestId('mat-composite-save').click();
    await ed.getByTestId('mat-run').click();
    await expect(ed.getByTestId('mat-note')).toContainText(/1 (members calculated|miembros calculados)/);
    const row = ed.getByTestId(`mat-row-${first}`);
    await expect(row).toContainText(/composite|mixto/);
    await expect(row).toContainText('aisc-360');
    await row.click();
    await expect(page.getByTestId('member-rows-sheet')).toBeVisible();
    await expect(page.getByTestId('member-rows-sheet')).toContainText(/AISC|Chapter I|capítulo I/);
    // No claim of satisfying a code anywhere in the tab.
    expect(/\bsatisfies\b|\bcumple\b|verified|verificad/i.test(await ed.innerText())).toBe(false);
    expect(errors).toEqual([]);
  });
});
