/**
 * The seismic tab of the design desk, on qa-8 with its lateral case read as an earthquake: the
 * roles in plan, a role fixed by hand and returned, the checks of capacity design, the hoops and
 * ties they ask for written, and the inertia factors written onto the members.
 */
import { test, expect, loadModel, solveModel, designAll, openDeskStage, deskTab } from './fixtures';

test.describe('the seismic tab of the design desk', () => {
  test('roles, checks, detailing and inertia factors', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-seismic');
    await solveModel(page);
    await designAll(page);
    await openDeskStage(page);
    await deskTab(page, 'seismic');
    const ed = page.getByTestId('seismic-editor');
    await expect(ed).toBeVisible();
    await expect(ed.getByTestId('seismic-none')).toHaveCount(0);

    // The beams of the top level, by role; one fixed by hand and returned.
    // A plane frame in plan is one line: its beams have no height, so they are clicked by force.
    const beams = ed.locator('[data-testid^="seismic-beam-"]');
    expect(await beams.count()).toBeGreaterThan(0);
    await beams.first().click({ force: true });
    await expect(ed.getByTestId('seismic-roles-reset')).toBeVisible();
    await ed.getByTestId('seismic-roles-reset').click();
    await expect(ed.getByTestId('seismic-roles-reset')).toHaveCount(0);

    // The checks, and what they ask for written onto the bars.
    await ed.getByTestId('seismic-run').click();
    await expect(ed.getByTestId('seismic-summary')).toBeVisible();
    const apply = ed.getByTestId('seismic-apply');
    if (await apply.isEnabled()) {
      await apply.click();
      await expect(ed.getByTestId('seismic-note')).toBeVisible();
    }

    // Inertia factors on the members.
    await ed.getByTestId('seismic-apply-inertia').click();
    await expect(ed.getByTestId('seismic-note')).toContainText('8');
    expect(errors).toEqual([]);
  });
});
