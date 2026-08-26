/**
 * PRO owns its own project files.
 *
 * Before PR19, `ToolbarProject` was the only surface with Open and Save and `Toolbar` rendered
 * only under `appMode === 'basico'`, so a PRO user had to leave PRO, open the project from the
 * Básico toolbar, and rely on the restored `analysisMode` to put them back. Production QA of the
 * PR19 CAD journey had to do exactly that, which is how this was found.
 *
 * ── Retargeted for PR20's shell ────────────────────────────────────
 *
 * The requirement is unchanged; the controls moved, and this file used to fail on all four tests
 * because it was still reaching for the ones PR19 added:
 *
 * | PR19 (`ProProjectFileActions` on the `pro-bar`) | PR20 (the ribbon and its Project view) |
 * |---|---|
 * | `pro-project-open` | `pr-project` → the panel's `pp-open` |
 * | `pro-project-save` | `pr-save` on the ribbon, and `pp-save` in the panel — both `saveProject` |
 * | `project-open-file` | `pp-open-file` |
 *
 * The file input needs a different id from the other two in the application because it is the one
 * that CAN be mounted beside another: `ProPanel` renders the mobile action row and the active tab
 * as siblings, so on a phone with the Project tab open, `ProProjectFileActions` and
 * `ProProjectTab` are both on the page. `ProProjectTab` states that where the id is declared.
 *
 * Básico's controls moved too — its desktop toolbar is gone and `ToolbarProject` now renders
 * inside the Project panel the ribbon's `hdr-project` opens — so D asserts them where they are
 * now rather than where they were.
 *
 * Every action below is a click on a real control or a real browser download. `window.__stabileo`
 * appears only to WAIT or to OBSERVE — never to open, save, or switch mode — because the thing
 * under test is whether the visible controls exist and work while PRO is active.
 */

import { readFileSync } from 'node:fs';
import { test, expect, openBasicProjectPanel } from './fixtures';
import type { Page } from '@playwright/test';

const FIXTURE = new URL(
  '../src/lib/export/__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url).pathname;

/** PRO is active and the Básico toolbar is not on the page. */
async function expectProAndNoBasicToolbar(page: Page) {
  await expect(page.locator('.app-body-pro')).toBeAttached();
  await expect(page.locator('[data-tour="project-section"]'),
    'the Básico project panel must not be what is serving PRO').toHaveCount(0);
}

/** The ribbon's Project view — where PRO keeps Open, Save and the autosave status. */
async function openProjectView(page: Page) {
  await page.getByTestId('pr-project').click();
  await expect(page.getByTestId('pro-project-tab')).toBeVisible();
}

/** Open the committed project through PRO's own control. */
async function openFixtureFromPro(page: Page, path = FIXTURE) {
  await openProjectView(page);
  const openBtn = page.getByTestId('pp-open');
  await expect(openBtn).toBeVisible();
  await expect(openBtn).toBeEnabled();
  // The button drives this input; setting files on it is the same event the picker raises.
  await page.getByTestId('pp-open-file').setInputFiles(path);
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

    await openProjectView(page);
    const openBtn = page.getByTestId('pp-open');
    await expect(openBtn, 'PRO exposes Open').toBeVisible();
    await expect(openBtn).toBeEnabled();
    await expect(openBtn).toHaveAttribute('title', /.+/);

    await openFixtureFromPro(page);

    // Still PRO, and the Básico surface was never the thing that served the file.
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

    const saveBtn = page.getByTestId('pp-save');
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

    // 1. Save from PRO — from the RIBBON's own button this time, which is the other control
    //    bound to `saveProject` and the one a user reaches without opening the panel.
    const firstDownload = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByTestId('pr-save').click();
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
    /**
     * Where Básico keeps them NOW.
     *
     * PR20 replaced Básico's left toolbar with a ribbon and a panel: `ToolbarProject` is the same
     * component with the same controls, rendered inside the panel that `hdr-project` opens. This
     * test asserts the same property it always did — the PRO surface is an ADDITION, and Básico
     * still has its own — against the shell Básico actually has.
     */
    await page.locator('[data-tour="mode-toggle"] button').first().click();
    // Básico is the ribbon on desktop and its project controls live in a panel, so the
    // claim "untouched" has to be checked where they actually are. Opening the panel is
    // part of the assertion, not setup for it: if the ribbon had lost the button, the
    // helper's click would fail and that is exactly the regression the test is named for.
    await openBasicProjectPanel(page);
    await expect(page.getByTestId('basic-panel')).toHaveAttribute('data-panel', 'project');
    await expect(page.locator('[data-tour="project-section"]')).toBeAttached();
    await expect(page.getByTestId('project-open-file')).toBeAttached();

    // And PRO's own controls are correctly absent from Básico.
    await expect(page.getByTestId('pp-open')).toHaveCount(0);
    await expect(page.getByTestId('pp-save')).toHaveCount(0);
    await expect(page.getByTestId('pp-open-file')).toHaveCount(0);
  });
});
