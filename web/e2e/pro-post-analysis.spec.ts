/**
 * The report after the analysis, in Diagnostics: the analysis's own checks beside the model's,
 * a line that selects what it names, and the report downloaded as CSV.
 */
import { test, expect, loadModel, solveModel } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test('@smoke after a solve, the report lists the equilibrium check and exports', async ({ pro: page }) => {
  await loadModel(page, '3d-portal-frame');
  await solveModel(page);
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-diagnostics').click();
  const post = page.getByTestId('post-report');
  await expect(post).toBeVisible();
  await expect(post.getByTestId('post-analysis')).toContainText(/[Ee]quilibri/);

  const download = page.waitForEvent('download');
  await post.getByTestId('post-export-csv').click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^post-analysis-.*\.csv$/);
  const text = await (await d.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(text.split('\n').length).toBeGreaterThan(1);
});
