import { readFileSync } from 'node:fs';
import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * The bending schedule of the reinforcement sheets on the eight-member concrete frame: unified,
 * by family, level, diameter and element, every view adding up to the same total, with a sketch
 * per bar, the waste on the order changing the total, the marks numbered over the project on
 * asking, the CSV following the view and BVBS one record per mark, and a bar or an element
 * opening its sheet.
 */
test.use({ appLocale: 'es' });

test('@smoke the sheets\' bending schedule switches views, downloads CSV and BVBS, and opens an element from a bar', async ({ pro: page }) => {
  await loadModel(page, 'rc-design-qa-8');
  await solveModel(page);
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-sheets-panel')).toBeVisible();
  await page.getByTestId('rc-design').click();
  await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 30_000 }); // slow-ok: the sheets design every member and combination before the families open
  await page.getByTestId('rc-open-beam').click();

  const ws = page.getByTestId('rc-sheets-workspace');
  await ws.getByTestId('rc-tab-schedule').click();
  const view = ws.getByTestId('rc-schedule-view');
  await expect(view).toBeVisible();
  const rows = view.getByTestId('rc-bbs-row');
  const num = (s: string | null) => Number(s!.replace(/\./g, '').replace(',', '.'));
  const total = view.getByTestId('rc-bbs-total');
  const kgOf = async (cell: number) => num(await total.locator('td').nth(cell).textContent());
  const grandKg = async () => num(await view.getByTestId('rc-bbs-grand').locator('td').nth(5).textContent());

  // Unified by default: each equal bar once, the elements it is placed in listed beside it.
  await expect(view).toHaveAttribute('data-view', 'unified');
  await expect(view.getByTestId('rc-bbs-view-unified')).toHaveAttribute('aria-selected', 'true');
  const unifiedRows = await rows.count();
  expect(unifiedRows).toBeGreaterThan(2);
  await expect(view.locator('[data-testid="rc-bbs-use"][data-family="beam"]').first()).toBeVisible();
  await expect(view.locator('[data-testid="rc-bbs-use"][data-family="column"]').first()).toBeVisible();
  // Each row draws its piece, the legs dimensioned.
  const sketch = rows.first().getByTestId('rc-bbs-sketch');
  await expect(sketch.locator('path')).toHaveAttribute('d', /^M[\d.]+ [\d.]+ L/);
  expect(await sketch.locator('text').count()).toBeGreaterThan(0);
  await expect(view.getByText('Estribo').first()).toBeVisible();
  const kg = await kgOf(3);
  expect(await grandKg()).toBeCloseTo(kg, 0);

  // By family, level and diameter: folding sections, every one adding up to the same total.
  await view.getByTestId('rc-bbs-view-family').click();
  await expect(view).toHaveAttribute('data-view', 'family');
  const heads = view.getByTestId('rc-bbs-group-head');
  expect(await heads.count()).toBe(2);
  expect(await grandKg()).toBeCloseTo(kg, 0);
  const familyRows = await rows.count();
  const firstGroupRows = await view.getByTestId('rc-bbs-group').first().getByTestId('rc-bbs-row').count();
  await expect(heads.first().getByTestId('rc-bbs-fold')).toHaveAccessibleName('Bars of this group');
  await heads.first().getByTestId('rc-bbs-fold').click();
  await expect(rows).toHaveCount(familyRows - firstGroupRows);
  await view.getByTestId('rc-bbs-unfold-all').click();
  await expect(rows).toHaveCount(familyRows);
  await view.getByTestId('rc-bbs-view-level').click();
  expect(await heads.count()).toBeGreaterThan(0);
  expect(await grandKg()).toBeCloseTo(kg, 0);
  await view.getByTestId('rc-bbs-view-diameter').click();
  await expect(heads).toHaveCount(await view.getByTestId('rc-bbs-by-dia').locator('tbody tr').count() - 1);
  expect(await grandKg()).toBeCloseTo(kg, 0);

  // By element: equal elements gathered, as before.
  await view.getByTestId('rc-bbs-view-element').click();
  expect(await rows.count()).toBeGreaterThan(4);
  await expect(view.locator('[data-testid="rc-bbs-row"][data-family="beam"]').first()).toBeVisible();
  await expect(view.locator('[data-testid="rc-bbs-row"][data-family="column"]').first()).toBeVisible();
  expect(await grandKg()).toBeCloseTo(kg, 0);

  // The waste is on the order: 10 % unless set, then what is set.
  expect(await kgOf(4)).toBeCloseTo(kg * 1.1, 0);
  await view.getByTestId('rc-bbs-waste').fill('20');
  await view.getByTestId('rc-bbs-waste').press('Tab');
  await expect.poll(() => kgOf(4)).toBeCloseTo(kg * 1.2, 0);

  // Over the whole project the marks are numbers.
  await view.getByTestId('rc-bbs-scope').selectOption('project');
  await expect(rows.first().locator('td').first()).toHaveText(/^\d+/);
  const elementRows = await rows.count();

  const [csv] = await Promise.all([page.waitForEvent('download'), view.getByTestId('rc-bbs-csv').click()]);
  expect(csv.suggestedFilename()).toMatch(/planilla-doblado\.csv$/);
  const text = readFileSync((await csv.path())!, 'utf8');
  const lines = text.split('\n');
  expect(lines[0]).toContain('Elemento');
  expect(lines[0]).toContain('Croquis (cm)');
  expect(lines.filter((l) => /a=\d+/.test(l)).length).toBe(elementRows);
  expect(text).toContain('kg + 20 %');

  const [abs] = await Promise.all([page.waitForEvent('download'), view.getByTestId('rc-bbs-bvbs').click()]);
  expect(abs.suggestedFilename()).toMatch(/\.abs$/);
  const records = readFileSync((await abs.path())!, 'utf8').split('\r\n').filter(Boolean);
  expect(records.length).toBe(elementRows);
  for (const r of records) expect(r).toMatch(/^BF2D@Hj.*@l\d+@n\d+@e[\d.]+@d\d+@g.*@s\d+@v@a@G(l\d+@w-?\d+@)+C\d+@$/);

  // The CSV follows the view; BVBS stays one record per mark of each element group.
  await view.getByTestId('rc-bbs-view-unified').click();
  await expect(rows).toHaveCount(unifiedRows);
  const [csvU] = await Promise.all([page.waitForEvent('download'), view.getByTestId('rc-bbs-csv').click()]);
  const linesU = readFileSync((await csvU.path())!, 'utf8').split('\n');
  expect(linesU[0]).toContain('Elementos');
  expect(linesU.filter((l) => /a=\d+/.test(l)).length).toBe(unifiedRows);

  // A bar mark opens its beam's sheet with the bar picked out in the elevation.
  await view.getByTestId('rc-bbs-view-element').click();
  const beamGroup = view.locator('[data-testid="rc-bbs-group"]').filter({ has: page.locator('[data-family="beam"]') }).first();
  await beamGroup.getByTestId('rc-bbs-mark').first().click();
  await expect(ws.getByTestId('rc-tab-beam')).toHaveAttribute('aria-selected', 'true');
  await expect(ws.locator('[data-testid="rc-row"].open')).toHaveCount(1);
  await expect(ws.locator('[data-testid="rc-line-bar"].hl')).toHaveCount(1);
  await expect(ws.getByTestId('rc-line-mark-hl').first()).toBeVisible();

  // The view is remembered; an element listed beside a bar opens its own sheet.
  await ws.getByTestId('rc-tab-schedule').click();
  await expect(view).toHaveAttribute('data-view', 'element');
  await view.getByTestId('rc-bbs-view-unified').click();
  await view.locator('[data-testid="rc-bbs-use"][data-family="column"]').first().click();
  await expect(ws.getByTestId('rc-tab-column')).toHaveAttribute('aria-selected', 'true');
  await expect(ws.locator('[data-testid="rc-row"].open')).toBeVisible();
  await ws.getByTestId('rc-tab-schedule').click();
  await expect(view).toHaveAttribute('data-view', 'unified');
});
