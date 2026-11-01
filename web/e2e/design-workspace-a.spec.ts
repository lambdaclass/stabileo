/**
 * Interface A of the Design stage: one workspace, its four steps at the top and its places in the
 * rail, with the viewer on screen.
 *
 * Each test walks one entry the way a person does (press, see what it opens) and states what
 * replaced the classic screens: the concrete workflow, the steel profiles and connections, the
 * design data and the check under other codes are places of the desk; «Size…» is one command
 * with its scope and its one rule for the members edited by hand; the 3-D reinforcement is one
 * view reached from every entry under one name; «Other code» is one entry with two modes.
 */
import { test, expect, loadModel, solveModel, designAll, openDeskStage, designPlace, deskTab, ribbonCmd, MORE_TOOLS } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

async function steelPortal(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.__stabileoActions.loadExample('3d-portal-frame');
    const a = window.__stabileoActions as unknown as { updateSection(id: number, d: unknown): void; combineCases(n: string): void };
    a.updateSection(1, { shape: 'I', tw: 0.0108, tf: 0.0162 });
    a.combineCases('1.0 todos');
  });
  await solveModel(page);
}

/** The box of an element, or null. */
const box = (page: Page, testid: string) => page.getByTestId(testid).boundingBox();

test.describe('@smoke design is one workspace', () => {
  test('entering Design shows the desk with its four steps, and no classic view or ribbon groups', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await page.getByTestId('pr-stage-model').click();
    await openDeskStage(page);
    for (const s of ['prepare', 'size', 'detail', 'document']) {
      await expect(page.getByTestId(`desk-step-${s}`)).toBeVisible();
      await expect(page.getByTestId(`desk-step-${s}`)).toHaveAttribute('data-state', /complete|current|pending|blocked|optional/);
    }
    // One place to work: the ribbon draws no design groups over it, and there is no way out to a classic screen.
    await expect(page.locator('.pr-groups')).toHaveCount(0);
    await expect(page.getByTestId('desk-classic')).toHaveCount(0);
    await expect(page.getByTestId('pro-panel')).toBeHidden();
    // The viewer stays on screen.
    const viewer = await page.locator('.main-area').first().boundingBox();
    expect(viewer!.height).toBeGreaterThan(200);
  });

  test('each step lists its places, and each place opens in the desk beside the viewer', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    const places: Array<[Parameters<typeof designPlace>[1], string]> = [
      ['prepare', 'desk-prepare'], ['designData', 'design-data-panel'], ['plan', 'desk-plan'],
      ['list', 'pro-design-tab'], ['steel', 'pro-steel-workflow'], ['connections', 'conn-experimental-banner'],
      ['codes', 'desk-other-codes'], ['detailing', 'desk-detailing'], ['documents', 'desk-canvas'],
    ];
    for (const [place, testid] of places) {
      await designPlace(page, place);
      await expect(page.getByTestId('design-desk').getByTestId(testid).first(), place).toBeVisible();
      // Still the Design stage, still the desk.
      await expect(page.getByTestId('pr-stage-design')).toHaveClass(/active/);
    }
    // Design data shows the project's regulations with it.
    await designPlace(page, 'designData');
    await expect(page.getByTestId('project-regulations')).toBeVisible();
  });

  test('the top bar shows the actions of the step in hand', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await designPlace(page, 'plan');
    const actions = page.getByTestId('desk-step-actions');
    await expect(actions).toHaveAttribute('data-step', 'size');
    await expect(actions.getByTestId('desk-design')).toBeVisible();
    // The next step's command is there too, once: detailing follows sizing.
    await expect(actions.getByTestId('cmd-generate-detailing')).toHaveCount(1);
    await page.getByTestId('desk-step-detail').click();
    await expect(actions).toHaveAttribute('data-step', 'detail');
    await expect(actions.getByTestId('cmd-generate-detailing')).toBeVisible();
    await expect(actions.getByTestId('desk-design')).toHaveCount(0);
  });

  test('a model change marks the designed members out of date and says why', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[0]!;
    await page.evaluate((e) => {
      const sec = (window.__stabileo as unknown as { entityData(k: string, id: number): { sectionId: number } }).entityData('element', e).sectionId;
      (window.__stabileoActions as unknown as { updateSection(id: number, d: unknown): void }).updateSection(sec, { b: 0.45 });
    }, id);
    await openDeskStage(page);
    await expect(page.getByTestId('desk-out-of-date')).toContainText(/out of date: the model changed/);
    await expect(page.getByTestId('desk-step-size')).toHaveAttribute('title', /out of date/);
    await expect(page.getByTestId(`desk-row-${id}`)).toBeVisible();
  });
});

test.describe('@smoke one «Size…»', () => {
  test('the list toolbar opens the same dialog, scoped to the selection', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await designPlace(page, 'list');
    const first = page.locator('[data-testid^="design-row-"]').first();
    const id = Number((await first.getAttribute('data-testid'))!.replace('design-row-', ''));
    await page.evaluate((x) => (window.__stabileoActions as unknown as { selectElements(i: number[]): void }).selectElements(x), [id]);
    await page.getByTestId('cmd-autodesign').click();
    const dialog = page.getByTestId('desk-run-options');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('desk-run-scope-selection')).toBeChecked();
    // The same command as the top bar's: same dialog, same name.
    await page.getByTestId('desk-run-cancel').click();
    await page.getByTestId('desk-design').click();
    await expect(page.getByTestId('desk-run-scope-all')).toBeChecked();
    await expect(page.getByTestId('desk-design')).toHaveText(await page.getByTestId('cmd-autodesign').innerText().then((t) => t.replace(/\s*\(\d+\)$/, '')));
  });

  test('a member edited by hand is kept unless the person chooses to replace it, and replacing asks again', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    // Edit one beam's bars by hand, in its frame editor, and save.
    await openDeskStage(page);
    const rows = page.locator('[data-testid^="desk-row-"]').filter({ has: page.locator('.dot.st-ok') });
    await expect(rows.first()).toBeVisible({ timeout: 45_000 });
    for (let i = 0; i < await rows.count(); i++) {
      await rows.nth(i).click();
      if (await page.getByTestId('desk-open-frame').isVisible()) break;
    }
    await page.getByTestId('desk-open-frame').click();
    await page.locator('[data-testid^="frame-bar-b"]').last().click();
    const count = page.getByTestId('frame-bar-count');
    await count.fill(String(Number(await count.inputValue()) + 1));
    await count.press('Enter');
    await page.getByTestId('frame-save').click();
    await expect(page.getByTestId('desk-decision')).toHaveText(/edited|editad/i);
    const id = Number(await page.getByTestId('desk-inspector').locator('h4[data-member-id]').getAttribute('data-member-id'));
    const before = await page.evaluate((e) => JSON.stringify(window.__stabileo.reinforcement(e)), id);
    await openDeskStage(page);
    await page.getByTestId('desk-step-size').click();
    await page.getByTestId('desk-design').click();
    await expect(page.getByTestId('desk-keep-edited')).toBeChecked();
    await page.getByTestId('desk-overwrite-edited').check();
    if (await page.getByTestId('desk-run-resize').count()) await page.getByTestId('desk-run-resize').setChecked(false);
    await page.getByTestId('desk-run').click();
    // Asked once more, naming how many; nothing ran yet.
    await expect(page.getByTestId('desk-run-confirm')).toBeVisible();
    expect(await page.evaluate((e) => JSON.stringify(window.__stabileo.reinforcement(e)), id)).toBe(before);
    await page.getByTestId('desk-run-cancel').click();
    await expect(page.getByTestId('desk-run-options')).toBeHidden();
  });
});

test.describe('@smoke one 3-D reinforcement view', () => {
  test('the rail, the piece sheet and the list toolbar open the same view, under the same name', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await designPlace(page, 'detailing');
    const gen = page.getByTestId('cmd-generate-detailing');
    await expect(gen).toBeEnabled({ timeout: 45_000 });
    await gen.click();
    await expect.poll(() => page.evaluate(() => (window.__stabileo as unknown as { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 45_000 }).toBeGreaterThan(0);
    const name = (await page.getByTestId('desk-rail-3d').innerText()).trim();
    for (const open of [
      async () => { await page.getByTestId('desk-step-detail').click(); await page.getByTestId('desk-rail-3d').click(); },
      async () => { await page.locator('[data-testid^="desk-row-"]').first().click(); await page.getByTestId('desk-open-3d').click(); },
      async () => { await designPlace(page, 'list'); await page.getByTestId('cmd-open-3d').click(); },
    ]) {
      await open();
      await expect(page.getByTestId('rebar-workspace')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('rebar-workspace')).toBeHidden();
      await expect(page.getByTestId('design-desk')).toBeVisible();
    }
    await expect(page.getByTestId('desk-open-3d')).toHaveText(name);
    await expect(page.getByTestId('cmd-open-3d')).toContainText(name);
  });
});

test.describe('@smoke steel inside sizing, and one «Other code»', () => {
  test('profiles and connections are places of the Size step, with their tools', async ({ pro: page }) => {
    await steelPortal(page);
    await designPlace(page, 'steel');
    await expect(page.getByTestId('pro-steel-workflow')).toBeVisible();
    await expect(page.getByTestId('desk-step-actions')).toHaveAttribute('data-step', 'size');
    await designPlace(page, 'connections');
    await expect(page.locator('.conn-joint-row').first()).toBeVisible();
  });

  test('«Other code» has two modes, each saying what it does and what it keeps', async ({ pro: page }) => {
    await steelPortal(page);
    await designPlace(page, 'codes');
    await expect(page.getByTestId('codes-mode-verify-keeps')).toContainText(/Not saved with the project/);
    await expect(page.getByTestId('codes-mode-memoria-keeps')).toContainText(/Saved with the project/);
    await page.getByTestId('codes-mode-verify').click();
    await expect(page.getByTestId('other-codes-panel')).toBeVisible();
    await page.getByTestId('other-codes-run').click();
    await expect(page.getByTestId('other-codes-results')).toBeVisible();
    await page.getByTestId('codes-mode-memoria').click();
    await expect(page.getByTestId('other-codes-panel')).toHaveCount(0);
    // Back to the check: the run is still there.
    await page.getByTestId('codes-mode-verify').click();
    await expect(page.getByTestId('other-codes-results')).toBeVisible();
  });
});

test.describe('@smoke stairs from a flight', () => {
  test('the stairs editor builds the flight in the model and designs it as the same stair', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    const quads = await page.evaluate(() => window.__stabileo.quadIds().length);
    await openDeskStage(page);
    await deskTab(page, 'stairs');
    const ed = page.getByTestId('stairs-editor');
    await ed.getByTestId('desk-stair-steps').fill('12');
    await ed.getByTestId('stair-from-model').locator('summary').click();
    await ed.getByTestId('stair-n0').fill('1');
    await ed.getByTestId('stair-n1').fill('2');
    await ed.getByTestId('stair-generate').click();
    await expect(ed.getByTestId('stair-success')).toBeVisible();
    expect(await page.evaluate(() => window.__stabileo.quadIds().length)).toBe(quads + 12);
    await expect(ed.locator('[data-testid^="stair-row-"]')).toHaveCount(1);
    await expect(ed.getByTestId('stair-analysis')).toContainText(/12/);
  });
});

test.describe('@smoke the model ribbon and the screen', () => {
  test('the model ribbon keeps the building and design tools behind «More tools»', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    for (const id of MORE_TOOLS) await expect(page.getByTestId(`pr-cmd-${id}`)).toHaveCount(0);
    await page.getByTestId('pr-more-moreTools').click();
    for (const id of MORE_TOOLS) await expect(page.getByTestId(`pr-cmd-${id}`)).toBeVisible();
    await ribbonCmd(page, 'building');
    await expect(page.getByTestId('pr-more-moreTools')).toHaveClass(/active/);
  });

  test('a toast stands clear of the viewer legend', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openDeskStage(page);
    await solveModel(page);
    const toast = page.locator('.toast').first();
    await expect(toast).toBeVisible();
    const legend = page.locator('.diagram-legend').first();
    if (await legend.count() && await legend.isVisible()) {
      const a = (await toast.boundingBox())!, b = (await legend.boundingBox())!;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, 'the toast covers the legend').toBe(false);
    }
  });

  test('a short window (560 px) keeps room for the viewer, and the rail scrolls as one', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await page.setViewportSize({ width: 1280, height: 560 });
    await openDeskStage(page);
    const viewer = await page.locator('.main-area').first().boundingBox();
    expect(viewer!.height, 'the viewer keeps a usable height').toBeGreaterThanOrEqual(130);
    const head = await box(page, 'desk-process');
    expect(head!.height, 'the steps take one line').toBeLessThan(48);
    const rows = page.locator('[data-testid^="desk-row-"]');
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows.last()).toBeInViewport();
  });
});

test.describe('@smoke design on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the desk is one column: steps, places, canvas and the piece sheet, as wide as the screen', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await expect(page.getByTestId('design-desk')).toBeVisible();
    const canvas = await box(page, 'desk-canvas');
    expect(canvas!.width).toBeGreaterThan(350);
    const rail = await box(page, 'desk-rail');
    expect(rail!.width).toBeGreaterThan(350);
    // Every place is still reachable from the rail row.
    await page.getByTestId('desk-rail-list').click();
    await expect(page.getByTestId('pro-design-tab')).toBeVisible();
    // And the phone has its own way out.
    await page.getByTestId('desk-close').click();
    await expect(page.getByTestId('design-desk')).toBeHidden();
  });
});
