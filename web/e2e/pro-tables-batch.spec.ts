import { test, expect, loadModel } from './fixtures';

/*
 * The members and shells tables as views of the model's selection, with group editing over a
 * selection of more than one; and Specifications' parts in order, each saying what it edits and
 * how to choose what to edit before anything is selected.
 */
test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@smoke PRO tables follow the selection, and edit it in a group', () => {
  test('members: selected in the model, lit in the table, edited together', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.evaluate(() => window.__stabileoActions.selectElements([5, 6]));
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-elements').click();
    await expect(page.locator('.pro-elems-table tr.selected')).toHaveCount(2);
    await expect(page.locator('.pro-paste-hint')).toHaveCount(0);
    const bar = page.getByTestId('elems-batch');
    await expect(bar).toBeVisible();
    const sec = await page.evaluate(() => [...window.__stabileo.entityData('setting', 'sections') as Array<[number, unknown]>].map(([id]) => id));
    const target = String(sec.at(-1));
    await bar.getByTestId('batch-section').selectOption(target);
    for (const id of [5, 6]) {
      await expect.poll(() => page.evaluate((i) => (window.__stabileo.entityData('element', i) as { sectionId: number }).sectionId, id)).toBe(Number(target));
    }
    // A row click with Shift adds to the selection.
    await page.locator('.pro-elems-table tr[data-elem="7"] td.col-id').click({ modifiers: ['Shift'] });
    await expect(page.locator('.pro-elems-table tr.selected')).toHaveCount(3);
  });

  test('shells: a row click selects it in the model, and two get material and thickness together', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();
    await page.locator('tr[data-shell="q1"] td.id-cell').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.selection())).toBeTruthy();
    await page.locator('tr[data-shell="q2"] td.id-cell').click({ modifiers: ['Shift'] });
    await expect(page.locator('tr.selected[data-shell]')).toHaveCount(2);
    // A Shift-click selects rows, not the text of the inputs between them.
    expect(await page.evaluate(() => String(window.getSelection() ?? ''))).toBe('');
    await expect(page.getByTestId('shell-open-spec')).toHaveCount(0);
    const bar = page.getByTestId('shells-batch');
    await bar.getByTestId('batch-shell-thickness').fill('0.42');
    await bar.getByTestId('batch-shell-thickness').press('Tab');
    await expect.poll(() => page.evaluate(() => (window.__stabileo.entityData('setting', 'quads') as Array<[number, { thickness: number }]>)
      .filter(([id]) => id === 1 || id === 2).map(([, q]) => q.thickness))).toEqual([0.42, 0.42]);
    await expect(page.getByTestId('shell-spec-q1')).toBeVisible();
    // The bar opens Specifications › Surfaces on the two of them.
    await bar.getByTestId('batch-shell-spec').click();
    await expect(page.getByTestId('spec-surfaces')).toContainText('2');
  });
});

test.describe('@smoke Specifications: parts in order, and how to start', () => {
  test('members, joints, surfaces, supports, analysis, and the summary apart', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-specifications').click();
    const order = await page.locator('.spec-nav [data-testid^="spec-section-"]').evaluateAll((n) => n.map((x) => x.getAttribute('data-testid')));
    expect(order).toEqual(['spec-section-members', 'spec-section-links', 'spec-section-surfaces', 'spec-section-supports', 'spec-section-analysis', 'spec-section-list']);
    // Nothing selected: what is edited here, and the two ways to choose.
    const empty = page.getByTestId('spec-empty-elements');
    await expect(empty).toContainText(/axial/i);
    await page.getByTestId('spec-type-elements').fill('1-2');
    await page.getByTestId('spec-type-elements').press('Enter');
    await expect(page.getByTestId('spec-members')).toBeVisible();
    await page.getByTestId('spec-section-supports').click();
    await page.getByTestId('spec-pick-supports').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.viewportPick().selectMode)).toBe('supports');
  });
});
