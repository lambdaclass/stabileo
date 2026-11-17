/**
 * The frame and column editors as the person edits bar by bar: the elevation's diagrams (the
 * envelope or one combination, the law shifted by d, on the beam or below it, the stirrups' Av/s
 * by shear, torsion or both), a cross-section placed with a click, a web opening placed and
 * checked, a bar added hooked, saved; and a column's lap set for its group with the code's value
 * beside it. The rules behind each are pinned in the unit tests (`line-edit-outputs`,
 * `beam-line-shifted`, `line-openings`, `line-hangers`, `column-shape-lap`).
 */
import { test, expect, loadModel, solveModel, openDeskStage } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

async function designed(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await solveModel(page);
  await openDeskStage(page);
  await page.getByTestId('desk-design').click();
  await page.getByTestId('desk-run-resize').setChecked(false);
  await page.getByTestId('desk-run').click();
  await expect(page.getByTestId('desk-report')).toBeVisible({ timeout: 120_000 }); // slow-ok: Shared helper waits for the live concrete design report before opening a verified frame; smoke still has a 45 s total budget.
}

/** The first verified beam whose line can be opened, opened in the frame editor. */
async function openFrame(page: Page) {
  const rows = page.locator('[data-testid^="desk-row-"]').filter({ has: page.locator('.dot.st-ok') });
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    await rows.nth(i).click();
    if (await page.getByTestId('desk-open-frame').isVisible()) break;
  }
  await page.getByTestId('desk-open-frame').click();
  await expect(page.getByTestId('frame-editor')).toBeVisible();
}

test.describe('@smoke frame editor, bar by bar', () => {
  test('diagrams, a placed section, a web opening and a hooked bar, saved', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await designed(page);
    await openFrame(page);

    // The moment diagram, shifted by d, then one combination's, then on the beam.
    await expect(page.getByTestId('frame-law')).toHaveAttribute('data-on', 'below');
    await page.getByTestId('frame-view-shift').check();
    await expect(page.getByTestId('frame-law-shifted')).toHaveCount(1);
    const combos = page.getByTestId('frame-view-combo').locator('option');
    expect(await combos.count()).toBeGreaterThan(1);
    await page.getByTestId('frame-view-combo').selectOption({ index: 1 });
    await expect(page.getByTestId('frame-law-shifted')).toHaveCount(1);
    await page.getByTestId('frame-view-law').selectOption('beam');
    await expect(page.getByTestId('frame-law')).toHaveAttribute('data-on', 'beam');
    // The stirrups' band, by shear alone.
    await page.getByTestId('frame-view-transverse').selectOption('shear');
    await expect(page.getByTestId('frame-transverse')).toHaveAttribute('data-mode', 'shear');

    // A section placed with a click on the elevation.
    await page.getByTestId('frame-cut-place').click();
    await page.getByTestId('frame-elevation').click({ position: { x: 300, y: 80 } });
    await expect(page.getByTestId('frame-cut-A')).toHaveCount(1);
    await expect(page.getByTestId('frame-cuts')).toContainText(/A–A/);

    // A web opening placed at 1 m, drawn and checked.
    await page.getByTestId('frame-opening-x').fill('1');
    await page.getByTestId('frame-opening-add').click();
    await expect(page.locator('[data-testid^="frame-opening-op"]')).toHaveCount(1);
    await expect(page.locator('[data-testid^="frame-hole-op"]')).toHaveCount(1);

    // A bottom bar added, hooked at its start.
    await page.getByTestId('frame-add-end-start').selectOption('hook');
    const before = await page.locator('[data-testid^="frame-bar-b"]').count();
    await page.getByTestId('frame-add-bar-go').click();
    await expect(page.locator('[data-testid^="frame-bar-b"]')).toHaveCount(before + 1);

    await page.getByTestId('frame-save').click();
    await expect(page.getByTestId('frame-state')).toHaveText(/Saved|Guardado/);
    // The section and the opening are still there once saved.
    await expect(page.getByTestId('frame-cut-A')).toHaveCount(1);
    await expect(page.locator('[data-testid^="frame-hole-op"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});

test.describe('@slow column editor, group lap and shape', () => {
  test('a lap set for the group, with the code value beside it, and back', async ({ pro: page }) => {
    await designed(page);
    const rows = page.locator('[data-testid^="desk-row-"]');
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click();
      if (await page.getByTestId('desk-open-column').isVisible()) break;
    }
    await page.getByTestId('desk-open-column').click();
    await expect(page.getByTestId('column-editor')).toBeVisible();
    const laps = page.getByTestId('column-laps');
    await expect(laps).toContainText(/ℓd/);
    await expect(laps).toContainText(/25\.5\.2/);
    await page.getByTestId('column-lap-input').fill('1.6');
    await page.getByTestId('column-lap-apply').click();
    await expect(page.getByTestId('column-lap-reset')).toBeVisible();
    await expect(page.getByTestId('column-lap-input')).toHaveValue('1.6');
    // Shorter than the code's: laid as set, and said.
    await page.getByTestId('column-lap-input').fill('0.2');
    await page.getByTestId('column-lap-apply').click();
    await expect(laps).toContainText(/norma|code/);
    await page.getByTestId('column-lap-reset').click();
    await expect(page.getByTestId('column-lap-reset')).toHaveCount(0);
    // The shape panel offers the circle.
    await page.getByTestId('column-shape-kind').selectOption('circle');
    await expect(page.getByTestId('column-shape-d')).toBeVisible();
  });
});
