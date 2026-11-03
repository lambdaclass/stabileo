/**
 * Plate results beyond the stresses at the mid-surface: a membrane force per unit width, a stress
 * on a face, averaged per physical plate, principal moments with their directions and the extremes
 * written on the model, and the value read under the pointer.
 */
import { test, expect, loadModel, solveModel } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test('@smoke a raft read as forces, faces, principal directions and extremes', async ({ pro: page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loadModel(page, 'mat-foundation');
  await solveModel(page);
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-stress').click();
  await page.getByTestId('pro-stress-shells').check();
  const options = page.getByTestId('shell-contour-options');
  await expect(options).toBeVisible();

  await page.getByTestId('shell-component').selectOption('nx');
  await expect(page.getByTestId('contour-face')).toHaveCount(0);
  await page.getByTestId('shell-component').selectOption('sigmaXx');
  await page.getByTestId('contour-face').selectOption('top');
  await page.getByTestId('contour-within').selectOption('physical');

  await page.getByTestId('shell-component').selectOption('mmax');
  await page.getByTestId('contour-directions').check();
  await page.getByTestId('contour-values').check();
  await expect(options).toBeVisible();
  expect(errors).toEqual([]);
});
