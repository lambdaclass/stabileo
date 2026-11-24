/**
 * The PRO gallery opens on its concrete buildings, and one of them loads with the wind the load
 * generator writes from the settings it brings; the generator opens on those settings, the
 * earthquake left for the reader to add. The catalogue and the loads are pinned in
 * `data/__tests__/pro-examples-gallery.switch-on.test.ts`.
 */
import { BUILD_FEATURES } from './build-features';
import { test, expect, alSection } from './fixtures';

if (BUILD_FEATURES.proPlatesUnified) {
  test('@smoke the gallery opens on the concrete buildings and one loads with the generator\'s wind, its dialog on its settings', async ({ pro: page }) => {
    test.setTimeout(180_000);
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    const gallery = page.getByTestId('pp-gallery');
    await expect(gallery.locator('.pg-group').first()).toHaveText('Reinforced concrete buildings');
    await expect(gallery.locator('.pg-group').nth(1)).toHaveText('Steel buildings');
    const ids = await gallery.locator('.pg-card').evaluateAll((cards) => cards.slice(0, 5).map((c) => c.getAttribute('data-example')));
    expect(ids).toEqual(['pro-rc-house', 'pro-rc-four-storey', 'pro-rc-steel-columns', 'pro-rc-lift-core', 'pro-rc-party-wall']);

    await gallery.locator('[data-example="pro-rc-party-wall"] .pp-ex').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 90_000 }).toBe(609);
    const cases = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(cases.filter((n) => /^Wind \+Y/.test(n)).length).toBeGreaterThan(0);
    expect(cases.some((n) => /Wind [+−-]X/.test(n))).toBe(false);
    expect(cases.some((n) => /seismic|earthquake/i.test(n))).toBe(false);

    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('pro-auto-loads-btn').click();
    await expect(page.getByTestId('dead-picker')).toBeVisible();
    await alSection(page, 'live');
    await expect(page.getByTestId('al-occupancy')).toHaveValue('vivienda');
    await alSection(page, 'roof');
    await expect(page.getByTestId('al-roof')).not.toBeChecked();
    await alSection(page, 'wind');
    await expect(page.getByTestId('al-enable-wind')).toBeChecked();
    await expect(page.getByTestId('al-nav-wind')).not.toHaveClass(/\boff\b/);
    await expect(page.getByTestId('al-nav-seismic')).toHaveClass(/\boff\b/);
  });
}
