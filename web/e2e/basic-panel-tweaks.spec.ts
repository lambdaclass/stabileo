import { test, expect } from './fixtures';
import gerber from '../src/lib/templates/fixtures/gerber-beam.json' with { type: 'json' };

/**
 * Small things from using Basic: the project name can be emptied while it is typed, the armed
 * influence-line tool reads as a filled label, the deformed shape's slider stops where the model
 * would leave the screen, and how P-Δ is calculated sits under its result.
 */
test.describe('@smoke Basic panel tweaks', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  });

  test('the project name can be emptied while typing and falls back only on leaving it', async ({ page }) => {
    const name = page.locator('.tab.active input.tab-name');
    await name.click();
    await name.press('ControlOrMeta+a');
    await name.press('Backspace');
    await expect(name).toHaveValue('');
    await name.pressSequentially('Puente');
    await expect(name).toHaveValue('Puente');
    await name.press('ControlOrMeta+a');
    await name.press('Backspace');
    await name.blur();
    await expect(name).not.toHaveValue('');
  });

  test('the armed influence-line tool is a filled label', async ({ page }) => {
    await page.evaluate(() => window.__stabileoActions.loadExample('gerber-beam'));
    await page.getByTestId('rb-cmd-advanced').click();
    await page.locator('button.adv-btn', { hasText: /^Influence line$/ }).click();
    const label = page.getByTestId('tool-mode-influence');
    await expect(label).toBeVisible();
    const look = await label.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color };
    });
    expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(look.color).toBe('rgb(255, 255, 255)');
  });

  test('the deformed slider stops where the largest movement reaches a quarter of the structure', async ({ page }) => {
    const heavy = { ...gerber, loads: gerber.loads.map((l) => ({ ...l, data: { ...l.data, qI: -2000, qJ: -2000 } })) };
    await page.evaluate((m) => window.__stabileoActions.loadModelData(m), heavy as unknown as Record<string, unknown>);
    await page.evaluate(() => window.__stabileoActions.solve());
    await page.getByTestId('rb-cmd-deformed').click();
    const slider = page.getByTestId('deformed-scale').first();
    await expect(slider).toBeVisible();
    const max = Number(await slider.getAttribute('max'));
    expect(max).toBeGreaterThanOrEqual(1);
    expect(max).toBeLessThan(1000);
    await slider.evaluate((el: HTMLInputElement) => { el.value = '1000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(Number(await slider.inputValue())).toBe(max);
    await expect(slider.locator('xpath=following-sibling::span[1]')).toHaveText(`${max}×`);
  });

  test('how P-Δ is calculated is folded under its result, not loose in the list', async ({ page }) => {
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-second-order'));
    await page.getByTestId('rb-cmd-advanced').click();
    await expect(page.getByTestId('adv-group-buckling')).toBeVisible();
    await expect(page.getByTestId('so-options')).toHaveCount(0);
    await page.locator('button.adv-btn', { hasText: 'P-Δ' }).click();
    await expect(page.getByTestId('pdelta-result')).toBeVisible();
    const options = page.getByTestId('so-options');
    await expect(options).toBeVisible();
    await page.getByTestId('so-options-toggle').click();
    await page.getByTestId('so-n-2').click();
    await expect(options).toHaveAttribute('open', '');
    await expect(page.getByTestId('so-n-2')).toHaveAttribute('aria-pressed', 'true');
  });
});
