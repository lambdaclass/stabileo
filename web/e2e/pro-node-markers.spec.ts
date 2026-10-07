import { test, expect, loadModel } from './fixtures';
import { pickGenerator, placeButton } from './generator-helpers';

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * PRO draws its nodes a fixed size on screen, as Basic does: dots while looking, small balls while
 * something aims at a node. A sphere sized in metres grew with every node nearer the camera than
 * the orbit's target and covered the members. And the right panel keeps its scrollbars on screen,
 * as Basic's does, switchable under Settings.
 */
const style = (page: import('@playwright/test').Page) => page.evaluate(() => window.__stabileo.nodeMarkerStyle());

test.describe('@smoke PRO nodes on screen and the panel scrollbars', () => {
  test('dots to look, balls to aim (a generator\'s ghost), and the reader\'s choice', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-select').click();
    await expect.poll(() => style(page)).toBe('points');

    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-generators').click();
    await pickGenerator(page, 'truss');
    await placeButton(page).click();
    await expect.poll(() => style(page)).toBe('spheres');
    await page.keyboard.press('Escape');
    await expect.poll(() => style(page)).toBe('points');

    await page.getByTestId('pro-settings').click();
    await page.getByTestId('cfg-node-style').selectOption('spheres');
    await expect.poll(() => style(page)).toBe('spheres');
  });

  test('the right panel keeps its scrollbars, and they switch off', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    const panel = page.getByTestId('pro-panel');
    await expect(panel).toHaveClass(/st-panel-scrollbars/);
    await page.getByTestId('pro-settings').click();
    await page.getByTestId('cfg-panel-scrollbars').uncheck();
    await expect(panel).not.toHaveClass(/st-panel-scrollbars/);
  });
});
