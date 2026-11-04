import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { multiPlanDxf } from '../src/lib/cad/__tests__/dxf-fixture';

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * A DXF with the plans of three floors drawn side by side, 30 m apart: the wizard finds them,
 * gives each its floors, lays each on the one below by its columns, and the building comes out
 * stacked over one footprint, with the plan of every floor written in the model's provenance.
 */
async function openWizard(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('stabileo-import-dxf')));
  await page.getByTestId('cad-file').setInputFiles({ name: 'plantas.dxf', mimeType: 'application/dxf', buffer: Buffer.from(multiPlanDxf()) });
}

const nodes = (page: Page) => page.evaluate(() => window.__stabileo.nodeIds().map((id) => window.__stabileo.nodePosition(id)!));

test('@smoke floor plans drawn side by side come out stacked, a floor table says which plan each floor takes', async ({ pro: page }) => {
  await openWizard(page);
  await page.getByTestId('cad-plans').locator('summary').click();
  await page.getByTestId('cad-detect-plans').click();
  await expect(page.getByTestId('cad-plan-row')).toHaveCount(3);
  const align = page.getByTestId('cad-plan-align');
  await expect(align.nth(1)).toContainText('6');
  await expect(align.nth(2)).toContainText('4');
  await expect(page.getByTestId('cad-plan-ref-x').nth(1)).toHaveValue('30');
  await page.screenshot({ path: test.info().outputPath('cad-plans.png') });

  await page.getByTestId('cad-next').click();
  await page.getByTestId('cad-next').click();

  // A fourth floor: no plan yet, flagged; the second plan is the typical floor (2-3), the third the roof.
  const stories = page.getByTestId('cad-stories');
  await expect(stories.getByTestId('cad-story-row')).toHaveCount(3);
  await stories.getByTestId('cad-stories-n').fill('4');
  await stories.getByTestId('cad-stories-n').press('Tab');
  await expect(stories.getByTestId('cad-story-row')).toHaveCount(4);
  await expect(stories.getByTestId('cad-stories-gaps')).toContainText('4');
  // Rows go top floor first: floor 4, 3, 2, 1.
  const plan = stories.getByTestId('cad-story-plan');
  await plan.nth(0).selectOption({ index: 2 });
  await plan.nth(1).selectOption({ index: 1 });
  await expect(stories.getByTestId('cad-stories-gaps')).toHaveCount(0);
  await stories.getByTestId('cad-story-height').nth(0).fill('2.5');
  await page.screenshot({ path: test.info().outputPath('cad-stories.png') });

  await page.getByTestId('cad-generate').click();
  await expect(page.locator('.assumption-line').filter({ hasText: /Plan(ta)? B/ }).first()).toBeVisible();
  await page.getByTestId('cad-apply').click();

  const pts = await nodes(page);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  expect(Math.min(...xs)).toBeGreaterThan(-0.05);
  expect(Math.max(...xs)).toBeLessThan(10.05);
  expect(Math.max(...ys)).toBeLessThan(4.05);
  const levels = [...new Set(pts.map((p) => Math.round(p.z * 100) / 100))].sort((a, b) => a - b);
  expect(levels).toEqual([0, 3, 6, 9, 11.5]);
  // Floor 3 is the typical plan (two bays), the roof the one-bay plan.
  expect(Math.max(...pts.filter((p) => Math.abs(p.z - 9) < 1e-6).map((p) => p.x))).toBeGreaterThan(9.95);
  expect(Math.max(...pts.filter((p) => Math.abs(p.z - 11.5) < 1e-6).map((p) => p.x))).toBeLessThan(5.05);
});

test('@smoke a single plan says it is repeated on every floor, and the plans can be found from there', async ({ pro: page }) => {
  await openWizard(page);
  await page.getByTestId('cad-next').click();
  await page.getByTestId('cad-next').click();
  const stories = page.getByTestId('cad-stories');
  await expect(stories.getByTestId('cad-stories-mode')).toContainText(/1/);
  await expect(stories.getByTestId('cad-story-plan')).toHaveCount(0);
  await stories.getByTestId('cad-stories-detect').click();
  await expect(stories.getByTestId('cad-story-plan')).toHaveCount(3);
  await expect(stories.getByTestId('cad-stories-mode')).toContainText('3');
});

test('@smoke the wizard leaves the model alone until Apply, and Apply is one undo step', async ({ pro: page }) => {
  const census = () => page.evaluate(() => window.__stabileo.modelCensus());
  const empty = await census();
  await openWizard(page);
  await page.getByTestId('cad-plans').locator('summary').click();
  await page.getByTestId('cad-detect-plans').click();
  await page.getByTestId('cad-next').click();
  await page.getByTestId('cad-next').click();
  await page.getByTestId('cad-generate').click();
  // Cancel at the draft: nothing came in.
  await page.getByRole('button', { name: /^(Cancel|Cancelar)$/ }).click();
  expect(await census()).toEqual(empty);

  await openWizard(page);
  await page.getByTestId('cad-plans').locator('summary').click();
  await page.getByTestId('cad-detect-plans').click();
  await page.getByTestId('cad-next').click();
  await page.getByTestId('cad-next').click();
  await page.getByTestId('cad-generate').click();
  await page.getByTestId('cad-apply').click();
  expect((await census()).nodes).toBeGreaterThan(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(census).toEqual(empty);
});
