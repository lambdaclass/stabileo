/**
 * The project's analysis rules, in the loads panel: self-weight as a load of a case, how
 * combinations are formed, and a distributed load's axes.
 *
 * Every change is made on the visible control and read back from the model, because the rule
 * lives on the model: a panel that showed a factor the solve did not use would pass a test that
 * only looked at the panel.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { test, expect, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

const FIXTURE = new URL(
  '../src/lib/export/__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url).pathname;

async function openLoads(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await expect(page.getByTestId('analysis-rules')).toBeVisible();
}

const rules = (page: Page) => page.evaluate(() => window.__stabileo.analysisSettings());

test.describe('PRO analysis rules', () => {
  test.describe.configure({ timeout: 120_000 });

  test('self-weight is a row of its own, and its factor is the model\'s', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openLoads(page);
    // The example states its rule, so the older checkbox row is gone.
    await expect(page.locator('.sw-row')).toHaveCount(0);
    await expect(page.getByTestId('sw-row')).toHaveCount(1);
    expect((await rules(page))?.selfWeight).toEqual([{ caseId: 1, direction: 'Z', factor: -1 }]);

    await page.getByTestId('sw-factor').fill('-1.1');
    await page.getByTestId('sw-factor').press('Tab');
    await expect.poll(async () => (await rules(page))?.selfWeight?.[0]?.factor).toBe(-1.1);

    await page.getByTestId('sw-add').click();
    await expect(page.getByTestId('sw-row')).toHaveCount(2);
    await expect.poll(async () => (await rules(page))?.selfWeight?.length).toBe(2);
  });

  test('the combination method and P-Delta per combination are written to the model', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openLoads(page);
    await expect(page.getByTestId('combo-solve-each')).toBeChecked();
    await page.getByTestId('combo-superpose').check();
    await expect.poll(async () => (await rules(page))?.combinationMethod).toBe('superpose');
    await page.getByTestId('per-combination').selectOption('pdelta');
    await expect.poll(async () => (await rules(page))?.perCombination).toBe('pdelta');
    await page.getByTestId('combo-solve-each').check();
    await expect.poll(async () => (await rules(page))?.combinationMethod).toBeUndefined();
  });

  test('a distributed load takes its axes from the table', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openLoads(page);
    const first = page.locator('.pro-loads-table tbody tr').first();
    await first.locator('select.inp-cell').selectOption('projected');
    await expect.poll(async () =>
      (await page.evaluate(() => window.__stabileo.distributedLoads3D()))[0]?.frame).toBe('projected');
    await expect(page.getByTestId('dl-frame')).toHaveCount(0);
  });

  test('an older project is given its self-weight rule once, and says so', async ({ pro: page }, info) => {
    // The committed project without its rule: what a file saved before the rule existed holds.
    const project = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    delete project.snapshot.analysis;
    const older = info.outputPath('older-project.ded.json');
    writeFileSync(older, JSON.stringify(project));

    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-open-file').setInputFiles(older);
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBe(8);

    await expect.poll(async () => (await rules(page))?.selfWeight)
      .toEqual([{ caseId: 1, direction: 'Z', factor: -1 }]);
    await expect(page.locator('[class*=toast]').filter({ hasText: /Dead Load/ }).first()).toBeVisible();
    const version = await page.evaluate(() => window.__stabileo.modelVersion());
    // Once: a later change does not migrate again or repeat the notice.
    await openLoads(page);
    await expect(page.getByTestId('sw-row')).toHaveCount(1);
    expect(await page.evaluate(() => window.__stabileo.modelVersion())).toBe(version);
  });

  test('the results say what the active set did, and only when there is one', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    await expect(page.getByTestId('nonlinear-report'), 'a linear model has nothing to report').toHaveCount(0);

    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-elements').click();
    await page.evaluate(() => (window.__stabileoActions as unknown as { selectElements(ids: number[]): void }).selectElements([7]));
    await page.getByTestId('mb-behaviour').selectOption('tensionOnly');
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    await expect(page.getByTestId('nonlinear-report')).toBeVisible();
    await expect(page.getByTestId('nonlinear-report')).toContainText(/Settled in \d+ iterations/);
  });
});
