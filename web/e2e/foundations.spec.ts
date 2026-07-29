/**
 * PR18 — the visible foundations workflow.
 *
 * Deliberately NOT written like `floor-design.spec.ts`, which fabricates a
 * `DetailingAssembly` as a JSON literal and injects it through `seedDetailing`. That proves
 * PR17's assembly UI renders a value of that shape; it proves nothing about PR18 producing
 * one, and an injected store is not acceptance evidence.
 *
 * Everything below goes through controls a user can reach: the fixture arrives by the normal
 * example path, the solve is the toolbar's own solve, and every footing and soil value is
 * typed into the real input. The only assertion is on what the production run produced.
 */

import { test, expect, loadModel, solveModel, computeDemands } from './fixtures';
import type { Page } from '@playwright/test';

const QA = 'rc-design-qa-8';

/** Open the RC Design tab and expand the slabs/walls/foundations disclosure. */
async function openFloorFamilies(page: Page) {
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
  const disclosure = page.getByTestId('floor-families-disclosure');
  await expect(disclosure).toBeVisible();
  // `details` opens by clicking its summary — the same gesture a user makes.
  await disclosure.locator('summary').first().click();
  await expect(page.getByTestId('floor-families')).toBeVisible();
}

async function openFoundations(page: Page) {
  await openFloorFamilies(page);
  await page.getByTestId('floor-family-foundations').click();
  await expect(page.getByTestId('foundations-panel')).toBeVisible();
}

/** Add a footing on the first supported node offered by the real select. */
async function addFooting(page: Page): Promise<void> {
  const select = page.getByTestId('footing-add-node');
  await expect(select).toBeVisible();
  const first = await select.locator('option:not([value=""])').first().getAttribute('value');
  expect(first, 'the fixture must offer a supported node').not.toBeNull();
  await select.selectOption(first!);
  await expect(page.getByTestId('footing-editor')).toBeVisible();
}

/**
 * Point the footing at its column and its stratum through the editor's own dropdowns.
 *
 * Both are explicit rather than relying on the creation-time default: a footing created
 * before any stratum exists correctly gets `soilProfileId: null`, and the realistic fix is
 * the one a user performs — choosing it in the panel.
 */
async function attachColumnAndSoil(page: Page) {
  const column = page.getByTestId('footing-column');
  const firstColumn = await column.locator('option:not([value=""])').first().getAttribute('value');
  expect(firstColumn, 'the supported node must have a column on it').not.toBeNull();
  await column.selectOption(firstColumn!);

  const soil = page.getByTestId('footing-soil');
  const firstSoil = await soil.locator('option:not([value=""])').first().getAttribute('value');
  expect(firstSoil, 'a stratum must exist to found on').not.toBeNull();
  await soil.selectOption(firstSoil!);
}

/** Type a complete, valid footing geometry through the real inputs. */
async function dimensionFooting(page: Page) {
  for (const [id, value] of [
    ['footing-B', '2.0'], ['footing-L', '2.0'], ['footing-thickness', '0.5'],
    ['footing-cover', '0.05'], ['footing-elevation', '-1.2'],
  ] as const) {
    const input = page.getByTestId(id);
    await input.fill(value);
    await input.blur();
  }
}

/** Add a stratum and state its allowable bearing pressure. */
async function addStatedSoil(page: Page, kPa = '250') {
  await page.getByTestId('soil-add').click();
  const bearing = page.locator('[data-testid^="soil-"][data-testid$="-bearing"]').first();
  await expect(bearing).toBeVisible();
  await bearing.fill(kPa);
  await bearing.blur();
}

test.describe('@smoke foundations — the visible workflow', () => {
  test('F-A the foundations editor is reachable from RC Design', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);

    // The point of the panel: before it existed, `checkFooting` had no reachable caller.
    await expect(page.getByTestId('footing-empty')).toBeVisible();
    await expect(page.getByTestId('soil-empty')).toBeVisible();
  });

  test('F-B a new footing is INCOMPLETE and says exactly why', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);
    await addFooting(page);

    // B and L start at zero on purpose. A plausible default would silently pass a bearing
    // check nobody performed.
    await expect(page.getByTestId('footing-1-incomplete')).toBeVisible();
    const issues = page.getByTestId('footing-issues');
    await expect(issues).toBeVisible();
    await expect(issues).toContainText('B');
  });

  test('F-C a stratum states no bearing pressure until the engineer gives one', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);
    await page.getByTestId('soil-add').click();

    const issues = page.locator('[data-testid^="soil-"][data-testid$="-issues"]').first();
    await expect(issues).toBeVisible();
    // No regulation supplies this value, so nothing may be prefilled.
    await expect(issues).toContainText('bearing');
  });

  test('F-D a complete footing is verified by the production run', async ({ pro: page }) => {
    await loadModel(page, QA);
    await solveModel(page);
    await computeDemands(page);
    await openFoundations(page);
    // Ground first, then the footing: that is the order the data depends on, and a footing
    // created before any stratum exists correctly has none.
    await addStatedSoil(page);
    await addFooting(page);
    await dimensionFooting(page);
    await attachColumnAndSoil(page);

    // The command, not a hook.
    await page.getByTestId('floor-design-run').click();

    const summary = page.getByTestId('floor-foundations-summary');
    await expect(summary).toBeVisible();
    // "1 of 1 footing(s) verified" — asserted exactly. A bare '1' would also match
    // "0 of 1", which is how the first version of this test passed while verifying nothing.
    await expect(summary).toContainText('1 of 1');
    await expect(page.getByTestId('floor-footings-not-verified')).toHaveCount(0);
  });

  test('F-E a footing with no stated soil is reported NOT verified, with the reason', async ({ pro: page }) => {
    await loadModel(page, QA);
    await solveModel(page);
    await computeDemands(page);
    await openFoundations(page);
    await addFooting(page);
    await dimensionFooting(page);
    // No stratum added at all — the gate must refuse rather than assume a pressure.
    await page.getByTestId('floor-design-run').click();

    const notVerified = page.getByTestId('floor-footings-not-verified');
    await expect(notVerified).toBeVisible();
    await expect(notVerified).toContainText('soil');
    // And the count is visible on the closed summary too.
    await expect(page.getByTestId('floor-not-verified-count')).toBeVisible();
  });

  test('F-F assumptions are recorded and shown apart from problems', async ({ pro: page }) => {
    await loadModel(page, QA);
    await solveModel(page);
    await computeDemands(page);
    await openFoundations(page);
    await addStatedSoil(page);
    await addFooting(page);
    await dimensionFooting(page);
    await attachColumnAndSoil(page);
    await page.getByTestId('floor-design-run').click();

    // An assumption is not a problem: listing it among the problems would train the reader
    // to dismiss it, so it has its own section.
    const assumptions = page.getByTestId('floor-footing-assumptions');
    await expect(assumptions).toBeVisible();
    await assumptions.locator('summary').click();
    await expect(assumptions).toContainText('service');
  });

  /*
   * Persistence is deliberately NOT asserted here. There is no snapshot/restore test hook,
   * and adding one only to observe it would be testing the hook. The seam every persistence
   * path shares — `snapshot()`/`restore()` — is covered by 14 unit tests in
   * `footing-persistence.test.ts`, including the .ded JSON round trip and the URL share,
   * which is stronger and non-flaky.
   */

  test('F-G the panel offers no second regulation selector', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);

    // Project Regulations is the ONE seismic/concrete code source. The floor panel displays
    // the resolved code and must not offer a way to change it.
    const code = page.getByTestId('floor-design-code');
    await expect(code).toBeVisible();
    await expect(code.locator('select')).toHaveCount(0);
  });
});
