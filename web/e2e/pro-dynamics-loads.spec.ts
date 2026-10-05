/**
 * PRO › dynamics and moving loads as load cases: a spectrum of the project's own, a spectral load
 * case solved into the results and the combinations, a vehicle from the catalog written as static
 * cases by position, and the generator's wind on a pressure profile.
 */
import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });
const cases = (page: Page) => page.evaluate(() => window.__stabileo.loadCases());

test.describe('@smoke PRO dynamics and moving loads as cases', () => {
  test('a user spectrum and a spectral case in the results and the combinations', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('us-add').click();
    await expect(page.getByTestId('us-table')).toBeVisible();
    await page.getByTestId('us-table').fill('0; 0,3\n0,5; 0,8\n2; 0,2');
    await page.getByTestId('us-apply').click();
    await expect(page.getByTestId('spectral-source').locator('option')).toHaveCount(2);

    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('lc-new-type').selectOption('E');
    await page.getByTestId('lc-new-name').fill('Spectrum X');
    await page.getByTestId('lc-new-add').click();
    const e = (await cases(page)).at(-1) as { id: number };
    await page.getByTestId(`lc-open-${e.id}`).click();
    await page.getByTestId('cd-spec-on').check();
    await page.getByTestId('cd-spec-source').selectOption('1');
    await page.getByTestId('cd-spec-scale').fill('1');
    await page.getByTestId('cd-spec-scale').press('Tab');
    const now = (await cases(page)).at(-1) as { spectral?: { source: { kind: string } } };
    expect(now.spectral?.source.kind).toBe('user');

    await page.evaluate(() => window.__stabileoActions.combineCases('all'));
    await page.evaluate(async () => { await window.__stabileoActions.solve(); });
    await expect.poll(async () => (await page.evaluate(() => window.__stabileo.resultIds())).cases).toContain(e.id);
  });

  test('a catalog truck written as static cases by position', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      window.__stabileoActions.selectElements([7, 5, 8]);
    });
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('adv-chip-moving').click();
    await page.getByTestId('moving-preset').selectOption({ label: 'AASHTO HL-93 tandem' });
    await expect(page.getByTestId('moving-gauge')).toHaveValue('1.8');
    const n0 = (await cases(page)).length;
    await page.getByTestId('moving-case-step').fill('2');
    await page.getByTestId('moving-cases').click();
    await expect.poll(async () => (await cases(page)).length).toBeGreaterThan(n0);
    const added = (await cases(page)).slice(n0) as Array<{ type: string; alternatives?: string }>;
    expect(added.every((c) => c.type === 'Tr' && c.alternatives === 'move:AASHTO HL-93 tandem')).toBe(true);
  });

  test('the generator’s wind on a pressure profile', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('lc-code-W').first().click();
    await page.getByTestId('al-wind-profile-on').check();
    await page.getByTestId('al-wind-profile-text').fill('0; 0,6\n10; 0,9');
    await expect(page.getByTestId('profile-chart')).toBeVisible();
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-derivation')).toContainText(/pressure profile/);
  });
});
