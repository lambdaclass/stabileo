import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * The shell contour, on the model it exists for.
 *
 * A raft's whole result is its bending field, and the contour opened on von
 * Mises — which for a slab in bending is ≈ 0. The plate came out one flat
 * colour under a notice saying the component was negligible, and the reader
 * had to already know which of nine components a raft is about in order to
 * find the map that was there all along. "Shell results do not work" is a
 * reasonable thing to conclude from that.
 */
test.describe('@smoke PRO — the shell contour opens on something worth looking at', () => {
  test('a raft opens on a component that varies, not on one that is ≈ 0', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await solveModel(page);

    await page.getByTestId('pr-stage-analyse').click();
    /* Stress is one command now: the "Colour maps" group is gone, because a
       colour map is a way of DRAWING a quantity rather than a quantity. */
    await page.getByTestId('pr-cmd-stress').click();
    await page.getByTestId('pro-stress-members').uncheck();

    /* First, not second: in stress mode the variable dropdown is gone —
       the command already said which variable. */
    const component = page.locator('select.pro-viz-sel').first();
    await expect(component).toBeVisible();

    /*
     * Asserted through the OPTION LABEL, which is where the application states
     * its own verdict: the selector appends "— ≈0" to a component it has
     * measured as negligible for this result set. So this reads the app's
     * judgement rather than hard-coding which component a raft ought to show,
     * which would be a second opinion that could drift from the first.
     */
    const chosen = await component.inputValue();
    const label = await component.locator(`option[value="${chosen}"]`).textContent();
    expect(label, `opened on ${chosen}`).not.toContain('≈0');

    // And the legend is showing a real range, not a degenerate one.
    const legend = page.locator('.shell-legend');
    await expect(legend).toBeVisible();
    await expect(legend).not.toHaveClass(/shell-legend-empty/);
  });

  test('a component chosen by hand is never overridden', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    /* Stress is one command now: the "Colour maps" group is gone, because a
       colour map is a way of DRAWING a quantity rather than a quantity. */
    await page.getByTestId('pr-cmd-stress').click();
    await page.getByTestId('pro-stress-members').uncheck();

    /* First, not second: in stress mode the variable dropdown is gone —
       the command already said which variable. */
    const component = page.locator('select.pro-viz-sel').first();
    await component.selectOption('vonMises');
    /* Negligible here, and that is the reader's business: they asked for it,
       possibly to confirm exactly that it is negligible. */
    await page.waitForTimeout(300);
    await expect(component).toHaveValue('vonMises');
  });
});

test.describe('@smoke PRO — the shells\' faces and criteria', () => {
  test('a raft lists its faces\' Von Mises and Tresca, and exports every column', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('res-tab-shells').click();
    const faces = page.getByTestId('shell-faces');
    await expect(faces).toBeVisible();
    // A slab in bending: its faces carry what its membrane does not.
    await expect(faces.locator('tbody tr').first()).toBeVisible();
    const wait = page.waitForEvent('download');
    await page.getByTestId('shell-faces-csv').click();
    const dl = await wait;
    expect(dl.suggestedFilename()).toBe('shells.csv');
    const text = (await import('node:fs')).readFileSync((await dl.path())!, 'utf8');
    const header = text.split('\n')[0]!;
    for (const col of ['topVonMises [kN/m²]', 'bottomTresca [kN/m²]', 'SZZ [kN/m²]', 'MXX [kN·m/m]']) expect(header).toContain(col);
  });
});

