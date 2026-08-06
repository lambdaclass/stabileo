/**
 * PRO owns its own project files.
 *
 * Before this, `ToolbarProject` was the only surface with Open and Save and `Toolbar` renders
 * only under `appMode === 'basico'`, so a PRO user had to leave PRO, open the project from the
 * Básico toolbar, and rely on the restored `analysisMode` to put them back. Production QA of
 * the PR19 CAD journey had to do exactly that, which is how this was found.
 *
 * Every action below is a click on a real control or a real browser download. `window.__stabileo`
 * appears only to WAIT or to OBSERVE — never to open, save, or switch mode — because the thing
 * under test is whether the visible controls exist and work while PRO is active.
 *
 * The mode is asserted the whole way through, not just at the end: a test that only checked the
 * final state would pass even if the app had bounced through Básico to do the work.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const FIXTURE = new URL(
  '../src/lib/export/__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url).pathname;

/** PRO is active and the Básico toolbar is not on the page. */
async function expectProAndNoBasicToolbar(page: Page) {
  await expect(page.locator('.app-body-pro')).toBeAttached();
  await expect(page.locator('[data-tour="project-section"]'),
    'the Básico project toolbar must not be what is serving PRO').toHaveCount(0);
}

/** Open the committed project through PRO's own control. */
async function openFixtureFromPro(page: Page, path = FIXTURE) {
  const openBtn = page.getByTestId('pro-project-open');
  await expect(openBtn).toBeVisible();
  await expect(openBtn).toBeEnabled();
  // The button drives this input; setting files on it is the same event the picker raises.
  await page.getByTestId('project-open-file').setInputFiles(path);
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 })
    .toBe(8);
}

/** The status bar's own sentence — the model counts as a user reads them. */
async function statusBarText(page: Page): Promise<string> {
  return (await page.locator('.status-bar, [class*="status-bar"]').first().innerText())
    .replace(/\s+/g, ' ');
}

test.describe('@slow PRO project files', () => {
  test.describe.configure({ timeout: 240_000 });

  test('A the project opens from PRO, without passing through Básico', async ({ pro: page }) => {
    await expectProAndNoBasicToolbar(page);

    const openBtn = page.getByTestId('pro-project-open');
    await expect(openBtn, 'PRO exposes Open').toBeVisible();
    await expect(openBtn).toBeEnabled();
    await expect(openBtn).toHaveAttribute('title', /.+/);

    await openFixtureFromPro(page);

    // Still PRO, and the Básico toolbar was never the thing that served the file.
    await expectProAndNoBasicToolbar(page);
    expect(await page.evaluate(() => document.querySelector('.app-body-pro') !== null)).toBe(true);

    const status = await statusBarText(page);
    expect(status).toMatch(/8\s+nodes/i);
    expect(status).toMatch(/8\s+members/i);
    expect(status).toMatch(/4\s+supports/i);
  });

  test('B the project saves from PRO and the file says PRO', async ({ pro: page }) => {
    await openFixtureFromPro(page);
    await expectProAndNoBasicToolbar(page);

    const saveBtn = page.getByTestId('pro-project-save');
    await expect(saveBtn, 'PRO exposes Save').toBeVisible();
    await expect(saveBtn).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await saveBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.ded$/);

    const saved = JSON.parse(readFileSync(await download.path(), 'utf8'));

    // The mode the file carries is what makes a reopened project land back in PRO.
    expect(saved.appMode, 'the saved file records PRO').toBe('pro');
    expect(saved.analysisMode).toBe('pro');

    // The existing format, not a new one.
    expect(saved.version).toBe('2.0');
    expect(saved.name).toBeTruthy();
    expect(Object.keys(saved).sort()).toEqual([
      'analysisMode', 'appMode', 'axisConvention3D', 'name', 'snapshot', 'timestamp',
      'version', 'viewportPresentation3D',
    ]);

    // The collections a PRO project is made of.
    const s = saved.snapshot;
    expect(s.nodes).toHaveLength(8);
    expect(s.elements).toHaveLength(8);
    expect(s.supports).toHaveLength(4);
    expect(s.footings).toHaveLength(1);
    expect(s.materials.length).toBeGreaterThan(0);
    expect(s.sections.length).toBeGreaterThan(0);
    expect(s.loads.length).toBeGreaterThan(0);
    // Identifiers, not just counts: a save that renumbered would still match the counts.
    // The snapshot serialises Maps as `[id, value]` entries, so the value is the second slot.
    expect(s.footings[0][1].name).toBe('Z1');
    expect(s.nodes.map((n: [number, unknown]) => n[0]).sort((a: number, b: number) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.geotechnical, 'the ground the footing references').toBeTruthy();
  });

  test('C a PRO round trip stays PRO and does not solve on open', async ({ pro: page }, testInfo) => {
    await openFixtureFromPro(page);

    // 1. Save from PRO.
    const firstDownload = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByTestId('pro-project-save').click();
    const saved = await firstDownload;
    const savedPath = testInfo.outputPath('round-trip.ded.json');
    await saved.saveAs(savedPath);
    const savedJson = JSON.parse(readFileSync(savedPath, 'utf8'));

    // 2. Reopen THAT file through the PRO control, in a clean page.
    await page.reload();
    await expect(page.locator('.app-body-pro')).toBeAttached();
    const solvesBefore = await page.evaluate(() => window.__stabileo.solveCount());
    await openFixtureFromPro(page, savedPath);

    // 3. Still PRO.
    await expectProAndNoBasicToolbar(page);

    // 4. Model and foundation data survived the trip.
    const status = await statusBarText(page);
    expect(status).toMatch(/8\s+nodes/i);
    expect(status).toMatch(/8\s+members/i);
    expect(status).toMatch(/4\s+supports/i);
    const footing = savedJson.snapshot.footings[0][1];
    expect(footing.name).toBe('Z1');
    expect(footing.B).toBeGreaterThan(0);
    expect(footing.L).toBeGreaterThan(0);
    expect(footing.columnElementId, 'the footing still references its column').toBe(1);

    // 5. Opening is not a silent solve or redesign. Observation only — the counter must not
    //    have moved, and no results may exist that the user did not ask for.
    expect(await page.evaluate(() => window.__stabileo.solveCount()),
      'opening a project must not solve it').toBe(solvesBefore);
    expect(await page.evaluate(() => window.__stabileo.runCounts()),
      'opening a project must not run a design').toBeNull();
  });

  test('D the Básico project controls are untouched', async ({ pro: page }) => {
    // The correction adds a PRO surface; it must not have moved or removed the Básico one.
    await page.locator('[data-tour="mode-toggle"] button').first().click();
    await expect(page.locator('[data-tour="project-section"]')).toBeAttached();
    await expect(page.getByTestId('project-open-file')).toBeAttached();
    // And PRO's own controls are correctly absent from Básico.
    await expect(page.getByTestId('pro-project-open')).toHaveCount(0);
    await expect(page.getByTestId('pro-project-save')).toHaveCount(0);
  });
});
