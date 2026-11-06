/**
 * Categories in the PRO view: hidden, halftone or shown, named in the viewport while something is
 * hidden, and remembered by a named view with its style.
 */
import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

const data = (page: import('@playwright/test').Page, key: string) =>
  page.evaluate((k) => window.__stabileo.entityData('setting', k), key) as Promise<any>;

test('@smoke a category hidden, one in halftone, and a named view that keeps them', async ({ pro: page }) => {
  await loadModel(page, '3d-portal-frame');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-view').click();

  await page.getByTestId('view-cat-loads-hidden').click();
  await expect(page.getByTestId('hidden-categories-chip')).toBeVisible();
  await page.getByTestId('view-cat-members-halftone').click();
  await expect(page.getByTestId('view-cat-members-halftone')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('view-style').selectOption('sections');

  await page.getByTestId('view-name').fill('Contexto');
  await page.getByTestId('view-save').click();
  const views = await data(page, 'views');
  expect(views[0].display).toMatchObject({ categories: { loads: 'hidden', members: 'halftone' }, style: 'sections' });

  await page.getByTestId('hidden-categories-show-all').click();
  await expect(page.getByTestId('hidden-categories-chip')).toHaveCount(0);
  await expect(page.getByTestId('view-cat-members-visible')).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('view-go').click();
  await expect(page.getByTestId('view-cat-members-halftone')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('view-cat-loads-hidden')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('view-style')).toHaveValue('sections');
});
