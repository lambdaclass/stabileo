/**
 * The Design tab says what to do and shows its output where it is looked at (QA of 19-oct: «in
 * Design it is not clear what to do, how to see the drawings, how to export»):
 *  - «?» opens the four steps, each with what it produces, its state and a way to go there;
 *  - the Document step opens on the drawings, laid out on arrival from the model alone (no
 *    document is built, so nothing is issued by looking), with a jump per kind of drawing and an
 *    export of the sheet on screen;
 *  - the listings have a place of their own and need no detailing.
 */
import { test, expect, designAll, loadModel, openDeskStage, designPlace } from './fixtures';

test.use({ viewport: { width: 1400, height: 900 } });

test.describe('@slow design, guided', () => {
  test('the steps explained, the drawings on arrival, the listings without detailing', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openDeskStage(page);

    // The guide: four steps, what each makes, and a way there.
    await page.getByTestId('desk-guide-toggle').click();
    const guide = page.getByTestId('desk-guide');
    await expect(guide).toBeVisible();
    for (const s of ['prepare', 'size', 'detail', 'document']) await expect(page.getByTestId(`desk-guide-${s}`)).toBeVisible();
    await expect(page.getByTestId('desk-guide-document')).toContainText(/planos|drawings/i);
    await page.getByTestId('desk-guide-go-document').click();
    await expect(guide).toHaveCount(0);

    // The Document step opens on the drawings, laid out from the model without building a document.
    await expect(page.getByTestId('desk-rail-sheets')).toHaveClass(/on/);
    await expect(page.getByTestId('sheets-count')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('sheets-setup')).not.toHaveAttribute('open', '');
    const jumps = page.getByTestId('sheets-jump').locator('button');
    expect(await jumps.count()).toBeGreaterThan(1);
    await jumps.nth(1).click();
    await expect(jumps.nth(1)).toHaveClass(/on/);
    const [one] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sheets-one-pdf').click()]);
    expect(one.suggestedFilename()).toMatch(/\.pdf$/);

    // The listings, with no detailing: the project's data and its checks.
    await designPlace(page, 'listings');
    const panel = page.getByTestId('listings-panel');
    await expect(panel).toBeVisible();
    const [html] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('listing-checks-html').click()]);
    expect(html.suggestedFilename()).toMatch(/\.html$/);

    // Looking was not issuing: no document was built (the design run detailed the frame, so the
    // stage shows its assemblies, and says no document exists yet).
    await designPlace(page, 'documents');
    await expect(page.getByTestId('doc-none')).toBeVisible();
    await expect(page.getByTestId('documents-go-sheets')).toBeVisible();
  });
});
