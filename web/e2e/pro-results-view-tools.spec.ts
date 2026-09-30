/**
 * PRO 9/10 from the panels: result tables read across sets and exported, statics and member
 * stresses as tables, deflection rules, shell contours and results along a line, the report's
 * figures, the view (colours, saved views, notes, quick card, units), the command palette, the
 * selection utilities, model tools and the project's data. The numbers are pinned in the unit
 * suites; this checks that each control drives them.
 */
import { test, expect, loadModel, solveModel } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

const data = (page: import('@playwright/test').Page, key: string) =>
  page.evaluate((k) => window.__stabileo.entityData('setting', k), key) as Promise<any>;

async function results(page: import('@playwright/test').Page, example = '3d-portal-frame') {
  await loadModel(page, example);
  await solveModel(page);
  await page.getByTestId('pr-stage-analyse').click();
}

test.describe('@smoke PRO results, report, view and tools', () => {
  test('tables across the load cases, by member with stations, and a statics table', async ({ pro: page }) => {
    await results(page);
    await page.getByTestId('res-tab-forces').click();
    await page.getByTestId('tm-forces-all').click();
    await page.getByTestId('tm-basis').selectOption('cases');
    await page.getByTestId('tm-stations').selectOption('5');
    await page.getByTestId('tm-by-entity').check();
    await page.getByTestId('tm-resultant').check();
    await expect(page.getByTestId('tm-all')).toContainText('M (kN·m)');
    await expect(page.getByTestId('tm-xlsx')).toBeVisible();
    await page.getByTestId('res-tab-statics').click();
    await expect(page.getByTestId('statics-check')).toBeVisible();
    await page.getByTestId('statics-full').check();
    await expect(page.getByTestId('statics-csv')).toBeVisible();
    await page.getByTestId('res-tab-memberStress').click();
    await expect(page.getByTestId('ms-table').locator('tbody tr').first()).toBeVisible();
  });

  test('a deflection rule on columns checks them', async ({ pro: page }) => {
    await results(page);
    await page.getByTestId('res-tab-deflections').click();
    await page.getByTestId('defl-limits').locator('summary').click();
    await page.getByTestId('defl-rule-add').click();
    await expect(page.getByTestId('defl-rule')).toHaveCount(1);
    const d = await data(page, 'deflectionLimits');
    expect(d.rules[0]).toMatchObject({ n: 360, direction: 'resultant' });
  });

  test('shell contours in bands, and a result along a line', async ({ pro: page }) => {
    await results(page, 'mat-foundation');
    await page.getByTestId('pr-cmd-stress').click();
    await page.getByTestId('pro-stress-shells').check();
    await expect(page.getByTestId('shell-contour-options')).toBeVisible();
    await page.getByTestId('contour-bands').selectOption('8');
    await page.getByTestId('shell-line').locator('summary').click();
    const nodes = await page.evaluate(() => { const ids = window.__stabileo.nodeIds(); return [window.__stabileo.nodePos(ids[0]!), window.__stabileo.nodePos(ids[ids.length - 1]!)]; });
    await page.getByTestId('shell-line-a').fill(`${nodes[0]!.x}; ${nodes[0]!.y}; ${nodes[0]!.z}`);
    await page.getByTestId('shell-line-b').fill(`${nodes[1]!.x}; ${nodes[1]!.y}; ${nodes[1]!.z}`);
    await expect(page.getByTestId('shell-line-chart')).toBeVisible();
  });

  test('the report takes a figure of the view, and the job from the project', async ({ pro: page }) => {
    await results(page);
    await page.getByTestId('pr-project').click();
    await page.getByTestId('project-info').locator('summary').click();
    await page.getByTestId('pi-job').fill('Nave Norte');
    await page.getByTestId('pi-job').blur();
    expect((await data(page, 'projectInfo')).job).toBe('Nave Norte');
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-report').click();
    await page.getByTestId('rpt-add-figure').click();
    await expect(page.getByTestId('rpt-figure')).toHaveCount(1);
    await expect(page.getByTestId('rpt-envelope')).toBeChecked();
  });

  test('the view: colours by section with a legend, a full saved view, notes and the quick card', async ({ pro: page }) => {
    await results(page);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-view').click();
    await page.getByTestId('view-colour-by').selectOption('bySection');
    await expect(page.getByTestId('view-colour-legend')).toBeVisible();
    await page.getByTestId('view-name').fill('Frente');
    await page.getByTestId('view-save').click();
    const views = await data(page, 'views');
    expect(views[0].display).toMatchObject({ colourBy: 'bySection' });
    await page.getByTestId('view-note-text').fill('junta');
    await page.getByTestId('view-note-at').fill('1; 0; 3');
    await page.getByTestId('view-note-add').click();
    expect((await data(page, 'notes'))[0].text).toBe('junta');
    await page.getByTestId('view-draw-constraints').check();
    await page.getByTestId('view-quick-info').check();
    await page.evaluate(() => window.__stabileoActions.selectElements([1]));
    await expect(page.getByTestId('quick-info')).toContainText('1');
    await page.getByTestId('view-unit-system').selectOption('MKS');
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('res-tab-reactions').click();
    await expect(page.locator('.pro-res-table').first()).toContainText('tf');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-view').click();
    await page.getByTestId('view-unit-system').selectOption('SI');
  });

  test('the command palette runs a ribbon command by name', async ({ pro: page }) => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await page.getByTestId('palette-input').fill('grid');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('command-palette')).toBeHidden();
    await expect(page.getByTestId('grid-bays-x')).toBeVisible();
  });

  test('selection utilities and model tools', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-select').click();
    await page.getByTestId('sel-parallel-dir').selectOption('Z');
    await page.getByTestId('sel-parallel-go').click();
    const cols = await page.evaluate(() => window.__stabileo.selection().length);
    expect(cols).toBeGreaterThan(0);
    await page.getByTestId('sel-walk').click();
    await expect(page.getByTestId('sel-walk-at')).toContainText(`1 / ${cols}`);
    await page.getByTestId('pr-cmd-edit').click();
    await expect(page.getByTestId('ep-hyg-loose')).toContainText('0');
    await page.getByTestId('ep-renumber-shells').check();
    await expect(page.getByTestId('ep-weld-tol')).toBeVisible();
  });
});
