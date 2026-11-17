/**
 * The seismic place of the design desk, on qa-8 with its lateral case read as an earthquake: the
 * roles in plan, a role fixed by hand and returned, the overstrength the reinforcement sheets read,
 * and the inertia factors written onto the members.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';

test.describe('the seismic place of the design desk', () => {
  test('roles, overstrength and inertia factors', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-seismic');
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'seismic');
    const ed = page.getByTestId('seismic-editor');
    await expect(ed).toBeVisible();
    await expect(ed.getByTestId('seismic-none')).toHaveCount(0);

    // A plane frame in plan is one line: its beams have no height, so they are clicked by force.
    const beams = ed.locator('[data-testid^="seismic-beam-"]');
    expect(await beams.count()).toBeGreaterThan(0);
    await beams.first().click({ force: true });
    await expect(ed.getByTestId('seismic-roles-reset')).toBeVisible();
    await ed.getByTestId('seismic-roles-reset').click();
    await expect(ed.getByTestId('seismic-roles-reset')).toHaveCount(0);

    const overstrength = ed.getByTestId('seismic-overstrength');
    await overstrength.fill('1.4');
    await overstrength.dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => window.__stabileo.serializeProject())).toContain('"overstrength":1.4');

    await ed.getByTestId('seismic-apply-inertia').click();
    await expect(ed.getByTestId('seismic-note')).toContainText('8');
    expect(errors).toEqual([]);
  });
});
