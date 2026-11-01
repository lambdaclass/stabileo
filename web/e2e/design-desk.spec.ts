/**
 * The design desk on the qa-8 frame: designed in one «Design», the plan of a level by status, a
 * member opened in the inspector and locked, a redesign that keeps it, the centres by level and
 * the geometry check. The decisions are pinned in `store/__tests__/design-decisions.test.ts`.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab, leaveDesign } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('design desk', () => {
  test('@slow design everything, open a member, lock it, redesign around it', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await expect(page.getByTestId('design-desk')).toBeVisible();
    await page.getByTestId('desk-design').click();
    await expect(page.getByTestId('desk-run-options')).toBeVisible();
    if (await page.getByTestId('desk-run-resize').count()) await page.getByTestId('desk-run-resize').setChecked(false);
    await page.getByTestId('desk-run').click();
    await expect(page.getByTestId('desk-report')).toBeVisible({ timeout: 120_000 });

    const first = page.locator('[data-testid^="desk-row-"]').first();
    await first.click();
    await expect(page.getByTestId('desk-inspector')).toContainText(/·/);
    await expect(page.getByTestId('desk-decision')).toHaveText(/propos|propuesta/i);
    await page.getByTestId('desk-lock').click();
    await expect(page.getByTestId('desk-decision')).toHaveText(/locked|bloqueada/i);
    await page.getByTestId('desk-filter-locked').click();
    await expect(page.locator('[data-testid^="desk-row-"]')).toHaveCount(1);

    await page.getByTestId('desk-design').click();
    if (await page.getByTestId('desk-run-resize').count()) await page.getByTestId('desk-run-resize').setChecked(false);
    await page.getByTestId('desk-run').click();
    await expect(page.getByTestId('desk-report')).toContainText(/1 locked|1 bloqueados/);

    // The qa-8 frame repeats its levels: equalizing them reports the groups it found.
    await page.getByTestId('desk-equalize-frames').click();
    await expect(page.getByTestId('desk-frames-note')).toContainText(/\d+ (frame group|grupo)/);

    await deskTab(page, 'levels');
    await expect(page.getByTestId('desk-levels')).toBeVisible();
    await deskTab(page, 'geometry');
    await page.getByTestId('desk-check-geometry').click();
    await leaveDesign(page);
    await expect(page.getByTestId('design-desk')).toHaveCount(0);
  });

  test('@slow the frame editor: a beam line as bars along it, edited, checked and saved', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await page.getByTestId('desk-design').click();
    if (await page.getByTestId('desk-run-resize').count()) await page.getByTestId('desk-run-resize').setChecked(false);
    await page.getByTestId('desk-run').click();
    await expect(page.getByTestId('desk-report')).toBeVisible({ timeout: 120_000 });

    /*
     * The first beam in the list whose design verified. Since the design reads each member's
     * role in the lateral system (292b87f68), qa-8's beams declare none and are designed as part
     * of it: e5 and e6 then refuse (SEARCH_EXHAUSTED on the anchorage of their bottom bars, fy at
     * the column face), carry no bars, and the first beam line in the list was e5's, with no
     * bottom bar to click. The editor is under test, not the refusal, so the beam is one that has
     * bars: a row whose status is ok.
     */
    const rows = page.locator('[data-testid^="desk-row-"]').filter({ has: page.locator('.dot.st-ok') });
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click();
      if (await page.getByTestId('desk-open-frame').isVisible()) break;
    }
    await page.getByTestId('desk-open-frame').click();
    await expect(page.getByTestId('frame-editor')).toBeVisible();
    await expect(page.getByTestId('frame-state')).toHaveText(/Read from the beams|Leído de las vigas/);

    // A bottom bar: one more bar, checked at once, saved.
    const bar = page.locator('[data-testid^="frame-bar-b"]').last();
    await bar.click();
    await expect(page.getByTestId('frame-bar-panel')).toBeVisible();
    const count = page.getByTestId('frame-bar-count');
    await count.fill(String(Number(await count.inputValue()) + 1));
    await count.press('Enter');
    await expect(page.getByTestId('frame-state')).toHaveText(/Unsaved|Sin guardar/);
    await expect(page.getByTestId('frame-verdict')).toBeVisible();
    await page.getByTestId('frame-elevation').click({ position: { x: 300, y: 80 } });
    await expect(page.getByTestId('frame-point')).toBeVisible();
    await page.getByTestId('frame-worst').click();
    await expect(page.getByTestId('frame-point')).toContainText('x =');
    await page.getByTestId('frame-save').click();
    await expect(page.getByTestId('frame-state')).toHaveText(/Saved|Guardado/);
  });

  test('@slow the column editor: a stack by level, its interaction curves, its breakdown', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await page.getByTestId('desk-design').click();
    if (await page.getByTestId('desk-run-resize').count()) await page.getByTestId('desk-run-resize').setChecked(false);
    await page.getByTestId('desk-run').click();
    await expect(page.getByTestId('desk-report')).toBeVisible({ timeout: 120_000 });
    const rows = page.locator('[data-testid^="desk-row-"]');
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click();
      if (await page.getByTestId('desk-open-column').isVisible()) break;
    }
    await page.getByTestId('desk-open-column').click();
    await expect(page.getByTestId('column-editor')).toBeVisible();
    await expect(page.getByTestId('column-table').locator('tbody tr')).not.toHaveCount(0);
    await expect(page.getByTestId('column-interaction')).toBeVisible();
    await expect(page.getByTestId('column-breakdown')).toBeVisible();
    await page.getByTestId('column-equalize-all').click();
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  });

  test('@smoke the wall, slab and joist tabs open on a frame with none, and say so', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    for (const tab of ['wall', 'slab', 'joist', 'special', 'pt', 'stairs', 'elements', 'fire', 'codes', 'budget', 'collab', 'arch', 'site', 'materials', 'column', 'frame']) {
      await deskTab(page, tab);
    }
    await deskTab(page, 'wall');
    await expect(page.getByTestId('wall-editor')).toBeVisible();
    await deskTab(page, 'slab');
    await expect(page.getByTestId('slab-editor')).toBeVisible();
    await deskTab(page, 'joist');
    await expect(page.getByTestId('joist-editor')).toBeVisible();
    await deskTab(page, 'special');
    await expect(page.getByTestId('special-floors')).toContainText(/No slabs are declared|No hay losas declaradas/);
    await deskTab(page, 'pt');
    await expect(page.getByTestId('pt-editor')).toContainText(/Declare a panel post-tensioned|Declará un paño como postesado/);
    expect(errors).toEqual([]);
  });

  test('@slow a steel frame: its members checked by CIRSOC 301 and shown with their utilisation', async ({ pro: page }) => {
    await loadModel(page, '3d-nave-industrial');
    await solveModel(page);
    await openDeskStage(page);
    await page.getByTestId('desk-design').click();
    if (await page.getByTestId('desk-run-resize').count()) await page.getByTestId('desk-run-resize').setChecked(false);
    await page.getByTestId('desk-run').click();
    await expect(page.getByTestId('desk-report')).toContainText(/steel members calculated|barras de acero calculadas/, { timeout: 120_000 });
    await page.getByTestId('desk-filter-steel').click();
    const rows = page.locator('[data-testid^="desk-row-"]');
    expect(await rows.count()).toBeGreaterThan(0);
    /*
     * A checked one reads its ratio; one whose section is incomplete says so (D122). A member whose
     * check the engine refuses in part (a single angle in flexure, F.10; a brace without its end
     * connection) is held and shows no ratio, so the member taken is one that verified (`st-ok`).
     * The text filter on a ratio used to catch section names like «L 76x76x6.35» as well. A purlin
     * (UPN 160): an angle that verified shows its unloaded flexure first, which F.10 leaves out.
     */
    await rows.filter({ hasText: 'UPN160' }).filter({ has: page.locator('.dot.st-ok') }).first().click();
    // Its sheet: every limit state, and the working of one when it is opened.
    const sheet = page.getByTestId('steel-member-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('steel-sheet-row-0').locator('button').click();
    await expect(sheet.getByTestId('steel-sheet-derivation')).toContainText('φ');
    await expect(page.getByTestId('desk-status')).toContainText(/\d\.\d\d/);
    /*
     * Rows without a ratio are both the held members and the ones never checked. In this example
     * the sections the check cannot read (D122) are the facade columns' RHS 160×160×6 and the tie
     * rods; the held ones (angles in flexure, braces) come first in the list. Clicking through
     * every row without a ratio until one named D122 took 374 clicks: about 30 s here and past the
     * 60 s test timeout on CI's runner (it stopped at the 305th). The member is taken by its
     * section, as the purlin above is.
     */
    await rows.filter({ hasText: 'RHS 160×160×6' }).filter({ hasText: '—' }).first().click();
    await expect(page.getByTestId('desk-inspector'), 'an incomplete steel section names its notice').toContainText('D122');
  });

  test('@slow a steel I member: rolled or welded is declared on its section, never read off the catalogue', async ({ pro: page }) => {
    await loadModel(page, '3d-nave-industrial');
    await solveModel(page);
    await openDeskStage(page);
    await page.getByTestId('desk-design').click();
    if (await page.getByTestId('desk-run-resize').count()) await page.getByTestId('desk-run-resize').setChecked(false);
    await page.getByTestId('desk-run').click();
    await expect(page.getByTestId('desk-report')).toContainText(/steel members calculated|barras de acero calculadas/, { timeout: 120_000 });
    await page.getByTestId('desk-filter-steel').click();
    const rows = page.locator('[data-testid^="desk-row-"]');
    // A channel (the purlins, UPN 160), whose checks read the fabrication, that verified.
    await rows.filter({ hasText: 'UPN160' }).filter({ has: page.locator('.dot.st-ok') }).first().click();
    const fab = page.getByTestId('desk-steel-fabrication');
    await expect(fab).toBeVisible();
    // Undeclared: the sheet says both readings were checked.
    await expect(fab.locator('select')).toHaveValue('');
    await expect(page.getByTestId('steel-sheet-fabrication')).toContainText(/rolled η = \d\.\d\d.*welded η = \d\.\d\d|laminado η = \d\.\d\d.*soldado η = \d\.\d\d/);
    // Declared, the section is edited, solved and checked again: one reading, the declared one.
    await fab.locator('select').selectOption('welded');
    await expect(page.getByTestId('desk-inspector')).toContainText(/steel check were run again|verificación de acero/, { timeout: 60_000 });
    await expect(page.getByTestId('desk-steel-fabrication').locator('select')).toHaveValue('welded');
    await expect(page.getByTestId('steel-sheet-fabrication')).toHaveCount(0);
  });

  test('@smoke a project reopened with its bars is checked again when the desk opens on its analysis', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await page.evaluate(() => window.__stabileoActions.designAll());
    const file = await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()));
    expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), file)).toBe(true);
    await solveModel(page);
    await openDeskStage(page);
    await expect(page.locator('[data-testid^="desk-row-"]').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('desk-filter-ok')).not.toHaveText(/ 0$/);
  });
});

