/**
 * The command search from its ribbon button and from "/", finding what lives outside the ribbon;
 * and the split view: the plan of the working level beside the 3D view, with its levels.
 */
import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test('@smoke the search button and "/" open the command search, which reaches the Project actions', async ({ pro: page }) => {
  await loadModel(page, '3d-portal-frame');
  await page.getByTestId('pr-search').click();
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.getByTestId('palette-input').fill('exa');
  await expect(page.getByTestId('palette-item-act-examples')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('command-palette')).toHaveCount(0);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('/');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.getByTestId('palette-input').fill('exa');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('pp-gallery-close')).toBeVisible();
});

test('@smoke the split view shows the plan of the working level, and its levels set it', async ({ pro: page }) => {
  await loadModel(page, '3d-portal-frame');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-view').click();
  await page.getByTestId('view-split').check();
  const split = page.getByTestId('split-view');
  await expect(split).toBeVisible();
  await expect(split).toHaveAttribute('data-mode', 'plan');
  const levels = split.getByTestId('split-levels').getByRole('button');
  expect(await levels.count()).toBeGreaterThan(1);
  await levels.first().click();
  await expect(levels.first()).toHaveClass(/on/);
  await page.getByTestId('view-split').uncheck();
  await expect(split).toHaveCount(0);
});
