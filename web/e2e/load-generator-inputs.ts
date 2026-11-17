import type { Page } from '@playwright/test';
import { alSection, expect } from './fixtures';

export async function dwellingFloorLoads(page: Page): Promise<void> {
  const active = page.locator('[data-testid^="al-nav-"][aria-current="page"]');
  await expect(active).toHaveCount(1);
  const section = (await active.getAttribute('data-testid'))!;
  await alSection(page, 'live');
  await page.getByTestId('al-occupancy').selectOption('vivienda');
  await alSection(page, 'roof');
  await page.getByTestId('al-roof').uncheck();
  await page.getByTestId(section).click();
}

export async function expectLoadGenerationRefusal(page: Page, reason: RegExp): Promise<void> {
  const snapshot = () => page.evaluate(() => {
    const s = JSON.parse(window.__stabileo.serializeProject()).snapshot;
    return { loads: s.loads, cases: s.loadCases, combinations: s.combinations, loadBasis: s.designData?.loadBasis };
  });
  const before = await snapshot();
  expect(before.loads.length).toBeGreaterThan(0);
  expect(before.cases.length).toBeGreaterThan(0);
  expect(before.combinations.length).toBeGreaterThan(0);
  await page.getByTestId('al-preview-btn').click();
  await expect(page.getByTestId('al-blocked')).toBeVisible();
  await expect(page.getByTestId('al-preview')).toContainText(reason);
  await expect(page.getByTestId('al-preview')).not.toContainText(/loadPlan\.blocked\./);
  await expect(page.getByTestId('al-apply')).toBeDisabled();
  await expect(page.getByTestId('al-delta')).toHaveCount(0);
  expect(await snapshot()).toEqual(before);
  await page.getByTestId('al-back').click();
  expect(await snapshot()).toEqual(before);
}
