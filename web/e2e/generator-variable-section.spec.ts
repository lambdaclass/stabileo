/**
 * A solid-web beam of variable section from the beam generator, and the same option in the shed:
 * one switch, two section rows (supports and mid-span), and members that land in the model as
 * variable-section members.
 */
import { test, expect, PRO_URL } from './fixtures';
import { insertGenerated, pickGenerator } from './generator-helpers';
import type { Page } from '@playwright/test';

async function openGenerators(page: Page, id: string): Promise<void> {
  await page.goto(PRO_URL);
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-generators').click();
  await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
  await pickGenerator(page, id);
}

test.describe('@smoke generators: solid-web members of variable section', () => {
  test('the beam generator offers it, with a section at the supports and one at mid-span', async ({ page }) => {
    await openGenerators(page, 'truss');
    await page.getByTestId('gen-truss-kind').selectOption('rolledPortal');
    // Shown only for a solid-web beam.
    await expect(page.getByTestId('gen-panels')).toHaveCount(0);
    await page.getByTestId('gen-variable-rafter').check();

    await expect(page.getByTestId('gen-profile-rafter')).toHaveCount(0);
    const start = page.getByTestId('gen-profile-trigger-rafter-start');
    const end = page.getByTestId('gen-profile-trigger-rafter-end');
    // A welded I from the rafter's profile, twice as deep at mid-span.
    await expect(start).toContainText('I 200x100');
    await expect(end).toContainText('I 400x100');
    await expect(page.getByTestId('gen-profile-problems')).toHaveCount(0);

    // The row's modal offers the catalogue and the templates, and no drawing.
    await end.click();
    await expect(page.getByTestId('pro-section-modal')).toBeVisible();
    await expect(page.getByTestId('section-division-build')).toBeVisible();
    await expect(page.getByTestId('build-mode-draw')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await insertGenerated(page);
    for (const id of [1, 2]) {
      const e = await page.evaluate((i) => window.__stabileo.entityData('element', i), id) as { variableSection?: { sectionJ: number } };
      expect(e.variableSection, `member ${id}`).toBeTruthy();
    }
  });

  test('the shed has the beam generator\'s fields, and its solid columns take a variable section', async ({ page }) => {
    await openGenerators(page, 'shed');
    // The beam generator's options are the shed roof's options.
    await page.getByTestId('gen-truss-kind').selectOption('trapezoidal');
    await expect(page.getByTestId('gen-web-pattern')).toBeVisible();
    await page.getByTestId('gen-truss-kind').selectOption('rolledPortal');
    await expect(page.getByTestId('gen-variable-rafter')).toBeVisible();
    // The latticed column's lacing is there too.
    await expect(page.getByTestId('gen-lacing')).toBeVisible();

    await page.getByTestId('gen-column-kind').selectOption('solid');
    await page.getByTestId('gen-variable-columns').check();
    await expect(page.getByTestId('gen-profile-trigger-column-start')).toBeVisible();
    await expect(page.getByTestId('gen-profile-trigger-column-end')).toBeVisible();
    await expect(page.getByTestId('gen-profile-problems')).toHaveCount(0);
  });
});
