/**
 * The Design tab says what to do and shows its output where it is looked at (QA of 19-oct: «in
 * Design it is not clear what to do, how to see the drawings, how to export»):
 *  - «?» opens the three steps, each with what it produces, its state and a way to go there;
 *  - the Document step opens on the drawings, laid out on arrival from the model alone, with a
 *    jump per kind of drawing and an export of the sheet on screen.
 */
import { test, expect, designAll, loadModel, openDeskStage } from './fixtures';

test.use({ viewport: { width: 1400, height: 900 } });

test.describe('@slow design, guided', () => {
  test('the steps explained, the drawings on arrival', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openDeskStage(page);

    // The guide: three steps, what each makes, and a way there.
    await page.getByTestId('desk-guide-toggle').click();
    const guide = page.getByTestId('desk-guide');
    await expect(guide).toBeVisible();
    for (const s of ['prepare', 'size', 'document']) await expect(page.getByTestId(`desk-guide-${s}`)).toBeVisible();
    await expect(page.getByTestId('desk-guide-document')).toContainText(/planos|drawings/i);
    await page.getByTestId('desk-guide-go-document').click();
    await expect(guide).toHaveCount(0);

    // The Document step opens on the drawings, laid out from the model.
    await expect(page.getByTestId('desk-rail-sheets')).toHaveClass(/on/);
    await expect(page.getByTestId('sheets-count')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('sheets-setup')).not.toHaveAttribute('open', '');
    const jumps = page.getByTestId('sheets-jump').locator('button');
    expect(await jumps.count()).toBeGreaterThan(1);
    await jumps.nth(1).click();
    await expect(jumps.nth(1)).toHaveClass(/on/);
    const [one] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sheets-one-pdf').click()]);
    expect(one.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
