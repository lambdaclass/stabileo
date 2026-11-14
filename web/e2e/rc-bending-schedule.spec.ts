import { readFileSync } from 'node:fs';
import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * The bending schedule of the reinforcement sheets on the eight-member concrete frame: one table
 * of the beams' and columns' pieces with a sketch each, the waste on the order changing the total,
 * the marks numbered over the project on asking, and the CSV and BVBS files downloaded with the
 * table's rows.
 */
test.use({ appLocale: 'es' });

test('@smoke the sheets\' bending schedule lists every piece with its sketch and downloads CSV and BVBS', async ({ pro: page }) => {
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
  expect(await rows.count()).toBeGreaterThan(4);
  await expect(view.locator('[data-testid="rc-bbs-row"][data-family="beam"]').first()).toBeVisible();
  await expect(view.locator('[data-testid="rc-bbs-row"][data-family="column"]').first()).toBeVisible();
  // Each row draws its piece, the legs dimensioned.
  const sketch = rows.first().getByTestId('rc-bbs-sketch');
  await expect(sketch.locator('path')).toHaveAttribute('d', /^M[\d.]+ [\d.]+ L/);
  expect(await sketch.locator('text').count()).toBeGreaterThan(0);
  await expect(view.getByText('Estribo').first()).toBeVisible();

  // The waste is on the order: 10 % unless set, then what is set.
  const total = view.getByTestId('rc-bbs-total');
  const kgOf = async (cell: number) => Number((await total.locator('td').nth(cell).textContent())!.replace(/\./g, '').replace(',', '.'));
  const kg = await kgOf(3);
  expect(await kgOf(4)).toBeCloseTo(kg * 1.1, 0);
  await view.getByTestId('rc-bbs-waste').fill('20');
  await view.getByTestId('rc-bbs-waste').press('Tab');
  await expect.poll(() => kgOf(4)).toBeCloseTo(kg * 1.2, 0);

  // Over the whole project the marks are numbers.
  await view.getByTestId('rc-bbs-scope').selectOption('project');
  await expect(rows.first().locator('td').nth(2)).toHaveText(/^\d+/);

  const [csv] = await Promise.all([page.waitForEvent('download'), view.getByTestId('rc-bbs-csv').click()]);
  expect(csv.suggestedFilename()).toMatch(/planilla-doblado\.csv$/);
  const text = readFileSync((await csv.path())!, 'utf8');
  const lines = text.split('\n');
  expect(lines[0]).toContain('Elemento');
  expect(lines[0]).toContain('Croquis (cm)');
  expect(lines.filter((l) => /a=\d+/.test(l)).length).toBe(await rows.count());
  expect(text).toContain('kg + 20 %');

  const [abs] = await Promise.all([page.waitForEvent('download'), view.getByTestId('rc-bbs-bvbs').click()]);
  expect(abs.suggestedFilename()).toMatch(/\.abs$/);
  const records = readFileSync((await abs.path())!, 'utf8').split('\r\n').filter(Boolean);
  expect(records.length).toBe(await rows.count());
  for (const r of records) expect(r).toMatch(/^BF2D@Hj.*@l\d+@n\d+@e[\d.]+@d\d+@g.*@s\d+@v@a@G(l\d+@w-?\d+@)+C\d+@$/);
});
