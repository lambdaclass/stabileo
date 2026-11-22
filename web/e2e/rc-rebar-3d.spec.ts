import { BUILD_FEATURES } from './build-features';
import { test, expect, loadModel, solveModel } from './fixtures';
if (BUILD_FEATURES.proRcSheets) {

  test.use({ appLocale: 'es' });

  test('@slow the sheets\' bars in 3D: every element, one row\'s from the workspace, and off again', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await loadModel(page, 'pro-edificio-7p');
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-rcSheets').click();
    await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 120_000 });
    await page.getByTestId('rc-design').click();
    await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 60_000 });

    const ids = await page.evaluate(() => window.__stabileo.elementIds().slice(0, 3));
    await page.evaluate((x) => window.__stabileoActions.selectElements(x), ids);
    const undos = await page.evaluate(() => window.__stabileo.undoCount());
    const solo = page.locator('.viewport3d-wrapper[data-scene-solo]');
    await expect(solo).toHaveCount(0);

    const panel = page.getByTestId('rc-rebar-3d');
    await panel.getByTestId('rc-rebar-3d-toggle').click();
    await expect(panel.getByTestId('rc-rebar-3d-toggle')).toHaveAttribute('aria-pressed', 'true');
    const count = async () => Number((await panel.getByTestId('rc-rebar-3d-count').textContent())!.replace(/\D/g, ''));
    await expect.poll(count).toBeGreaterThan(10_000);
    const everything = await count();
    await expect(solo).toHaveCount(1);
    const ghost = panel.getByTestId('rc-rebar-3d-ghost');
    await expect(ghost).toBeChecked();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('stabileo-camera-view', { detail: 'iso' })));
    await page.screenshot({ path: test.info().outputPath('rebar-3d-ghost-on.png') });
    const box = (await page.locator('.viewport3d-wrapper').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await page.evaluate(() => window.__stabileo.selection())).toEqual([...ids].sort((a, b) => a - b));
    await ghost.uncheck();
    await page.screenshot({ path: test.info().outputPath('rebar-3d-ghost-off.png') });
    await panel.getByTestId('rc-rebar-3d-toggle').click();
    await expect(panel.getByTestId('rc-rebar-3d-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(solo).toHaveCount(0);
    expect(await page.evaluate(() => window.__stabileo.selection())).toEqual([...ids].sort((a, b) => a - b));
    expect(await page.evaluate(() => window.__stabileo.undoCount())).toBe(undos);
    await panel.getByTestId('rc-rebar-3d-toggle').click();
    await expect(panel.getByTestId('rc-rebar-3d-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(ghost).not.toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('stabileo-rc-rebar-3d-ghost'))).toBe('0');
    await ghost.check();
    await panel.getByTestId('rc-rebar-3d-slab').uncheck();
    await expect.poll(count).toBeLessThan(everything);
    await panel.getByTestId('rc-rebar-3d-slab').check();

    await page.getByTestId('rc-open-beam').click();
    const ws = page.getByTestId('rc-sheets-workspace');
    const row = ws.getByTestId('rc-row').first();
    const name = (await row.locator('td.nm').evaluate((td) => td.firstChild?.textContent ?? '')).trim();
    await row.click();
    await ws.getByTestId('rc-view-3d').click();
    await expect(ws).toHaveCount(0);
    await expect(panel.getByTestId('rc-rebar-3d-row')).toContainText(name);
    await expect.poll(count).toBeLessThan(everything);
    await expect.poll(count).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath('rebar-3d-row.png') });

    await panel.getByTestId('rc-rebar-3d-all').click();
    await expect.poll(count).toBe(everything);
    await panel.getByTestId('rc-rebar-3d-toggle').click();
    await expect(panel.getByTestId('rc-rebar-3d-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(panel.getByTestId('rc-rebar-3d-count')).toHaveCount(0);
    await expect(solo).toHaveCount(0);
  });
}
