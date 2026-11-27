import { test, expect } from './fixtures';
import { openAdvancedFunction } from './advanced-panel';
import { BUILD_FEATURES } from './build-features';

if (BUILD_FEATURES.globalAxes) test.describe('Global axes enabled', () => {


  test('@smoke Explore shows the signed load and mapped restraint options in its tabs', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('stabileo-axes', JSON.stringify({ up: '-Y', right: '+X', hand: 'right' })));
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('cantilever');
      const file = JSON.parse(window.__stabileo.serializeProject());
      file.snapshot.loads = [{ type: 'pointOnElement', data: { id: 1, elementId: 1, a: 1, p: 7, isGlobal: true } }];
      if (!window.__stabileoActions.loadProject(file)) throw Error('Cantilever reopen failed');
    });
    await openAdvancedFunction(page, 'whatif');
    await page.getByTestId('whatif-tab-loads').click();
    await expect(page.getByRole('tabpanel')).toContainText('P=-7');
    await page.getByTestId('adv-close').click();
    await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
    await openAdvancedFunction(page, 'whatif');
    await page.getByTestId('whatif-tab-supports').click();
    await expect(page.getByRole('tabpanel').locator('option[value="rollerZ"]').first()).toHaveText('Roller Y');
  });

  test('@smoke with Y chosen as up, a node written at Y = 3 is stored three metres up and the tables follow', async ({ pro: page }) => {
    const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
    await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
    const picker = page.getByTestId('axes-picker');
    await picker.getByTestId('axes-up-+Y').click();
    await expect(picker.getByTestId('axes-summary')).toContainText('−Y');
    await picker.getByTestId('axes-done').click();
    await expect(picker).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('stabileo-axes'))).toContain('"up":"+Y"');

    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    await page.getByTestId('write-node').click();
    await page.getByTestId('write-node-x').fill('2');
    await page.getByTestId('write-node-y').fill('3');
    await page.getByTestId('write-node-z').fill('0');
    await page.getByTestId('write-node-card-submit').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(1);
    const id = (await page.evaluate(() => window.__stabileo.nodeIds()))[0];
    const p = await page.evaluate((n) => window.__stabileo.nodePosition(n), id);
    expect({ x: p!.x, y: p!.y + 0, z: p!.z }).toEqual({ x: 2, y: 0, z: 3 });

    const row = page.locator('.pro-nodes-table tbody tr').first();
    await expect(row.locator('input').nth(2)).toHaveValue(/^3/);

    await page.reload();
    await page.waitForFunction(() => !!window.__stabileoActions);
    expect(await page.evaluate(() => localStorage.getItem('stabileo-axes'))).toContain('"up":"+Y"');
  });

  test('@smoke a drag that starts on the axis triad still orbits, and a click opens the picker', async ({ pro: page }) => {
    const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
    const before = await page.evaluate(() => window.__stabileo.cameraState());
    await page.mouse.move(triad.x + triad.width / 2, triad.y + triad.height / 2);
    await page.mouse.down();
    await page.mouse.move(triad.x + triad.width / 2 + 150, triad.y + triad.height / 2 - 60, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByTestId('axes-picker')).toHaveCount(0);
    const after = await page.evaluate(() => window.__stabileo.cameraState());
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  });

  test('@smoke Settings links to the axes picker', async ({ pro: page }) => {
    await page.getByTestId('pro-settings').click();
    await expect(page.getByTestId('cfg-axes-summary')).toContainText('Z');
    await page.getByTestId('cfg-axes-open').click();
    await expect(page.getByTestId('axes-picker')).toBeVisible();
    await expect(page.getByTestId('axes-toward-local')).not.toBeChecked();
    await expect(page.getByTestId('axes-diag-body')).toHaveCount(0);
    await page.getByTestId('axes-diag-toggle').click();
    const caption = page.getByTestId('axes-diag-caption');
    const before = await caption.textContent();
    await page.getByTestId('axes-toward-local').check();
    await expect(caption).not.toHaveText(before ?? '');
    await page.getByTestId('axes-toward-local').uncheck();
    await expect(caption).toHaveText(before ?? '');
  });

  test('@smoke Settings → Set… opens the picker over the app, and an axis edited there is kept', async ({ pro: page }) => {
    await page.getByTestId('pro-settings').click();
    await page.getByTestId('cfg-axes-open').click();
    const picker = page.getByTestId('axes-picker');
    await expect(picker).toBeVisible();
    const overlay = page.locator('.ax-overlay');
    await expect(overlay).toHaveCSS('position', 'fixed');
    const box = (await picker.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    await picker.getByTestId('axes-up-+Y').click();
    await expect(picker.getByTestId('axes-summary')).toContainText('−Y');
    await picker.getByTestId('axes-done').click();
    await expect(picker).toHaveCount(0);
    await expect(page.getByTestId('cfg-axes-summary')).toContainText('Y');
    expect(await page.evaluate(() => localStorage.getItem('stabileo-axes'))).toContain('"up":"+Y"');
  });
  test('@smoke changing global axes preserves a transform centre', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-transform').click();
    await page.getByTestId('tp-mode-rotate').click();
    await page.getByTestId('tp-px').fill('2');
    await page.getByTestId('tp-py').fill('3');
    await page.getByTestId('tp-pz').fill('4');
    const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
    await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
    await page.getByTestId('axes-up-+Y').click();
    await page.getByTestId('axes-done').click();
    await expect(page.getByTestId('tp-px')).toHaveValue('2');
    await expect(page.getByTestId('tp-py')).toHaveValue('4');
    await expect(page.getByTestId('tp-pz')).toHaveValue('-3');
  });

  test('@smoke an existing offset can switch coordinate frames in both directions', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      const saved = JSON.parse(window.__stabileo.serializeProject());
      saved.snapshot.elements[0][1].offset = { frame: 'local', i: { x: 0.1, y: 0.2, z: 0.3 }, j: { x: 0.1, y: 0.2, z: 0.3 } };
      window.__stabileoActions.loadProject(saved);
      window.__stabileoActions.selectElements([1]);
      window.__stabileoActions.openProTab('specifications');
    });
    await page.getByTestId('spec-section-members').click();
    const editor = page.locator('.mo');
    const frame = editor.locator('select');
    await expect(frame).toHaveValue('local');
    await frame.selectOption('global');
    await frame.press('Tab');
    await expect(frame).toHaveValue('global');
    await editor.locator('button').first().click();
    expect((await page.evaluate(() => window.__stabileo.entityData('element', 1)) as any).offset.frame).toBe('global');
    await frame.selectOption('local');
    await frame.press('Tab');
    await expect(frame).toHaveValue('local');
  });

  for (const [label, width, height] of [['phone', 390, 844], ['tablet', 768, 1024]] as const) {
    test(`@smoke the axes picker fits and the viewer remains available on ${label}`, async ({ pro: page }) => {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.__stabileoActions.openProTab('nodes'));
      const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
      expect(triad.y + triad.height).toBeLessThanOrEqual(height);
      await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
      const picker = page.getByTestId('axes-picker');
      const box = (await picker.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      await expect(picker.getByTestId('axes-done')).toBeVisible();
      for (const button of await picker.locator('.ax-opt, .ax-chip, .ax-btn').all()) {
        const target = (await button.boundingBox())!;
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      }
      await picker.getByTestId('axes-done').click();
      await expect(page.locator('canvas:not(.axis-gizmo)').first()).toBeVisible();
    });
  }

  test('@smoke known wrong result: #1986 reflected grid rises physically from a signed base', async ({ pro: page }) => {
    const openAxes = async () => {
      const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
      await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
    };
    await openAxes();
    await page.getByTestId('axes-up--Z').click();
    await page.getByTestId('axes-done').click();
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    const base = page.getByTestId('grid-panel').locator('label').filter({ hasText: 'Base' }).locator('input');
    await base.fill('2');
    await base.press('Tab');
    await page.getByTestId('grid-heights').fill('3; 4');
    await page.getByTestId('grid-generate-levels').click();
    const height = (i: number) => page.getByTestId('grid-level-N' + i).locator('input').nth(1);
    await expect(height(0)).toHaveValue(/^2(?:[.,]0+)?$/);
    await expect(height(1)).toHaveValue(/^-1(?:[.,]0+)?$/);
    await expect(height(2)).toHaveValue(/^-5(?:[.,]0+)?$/);
    await openAxes();
    await page.getByTestId('axes-up-+Z').click();
    await page.getByTestId('axes-done').click();
    await expect(height(0)).toHaveValue(/^-2(?:[.,]0+)?$/);
    await expect(height(1)).toHaveValue(/^1(?:[.,]0+)?$/);
    await expect(height(2)).toHaveValue(/^5(?:[.,]0+)?$/);
  });

  test('@smoke reflected level coordinates decrease as the storeys rise', async ({ pro: page }) => {
    const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
    await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
    await page.getByTestId('axes-up--Z').click();
    await page.getByTestId('axes-done').click();
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-heights').fill('3; 3');
    await page.getByTestId('grid-generate-levels').click();
    await expect(page.getByTestId('grid-level-N0').locator('input').nth(1)).toHaveValue(/^0/);
    await expect(page.getByTestId('grid-level-N1').locator('input').nth(1)).toHaveValue(/^-3/);
    await expect(page.getByTestId('grid-level-N2').locator('input').nth(1)).toHaveValue(/^-6/);
  });
});

if (!BUILD_FEATURES.globalAxes) test('@smoke disabled global axes retain the local axes setting and ignore a persisted custom frame', async ({ pro: page }) => {
  await page.evaluate(() => localStorage.setItem('stabileo-axes', JSON.stringify({ up: '-Y', right: '-X', hand: 'left' })));
  await page.reload();
  await page.waitForFunction(() => !!window.__stabileoActions);
  await expect(page.getByTestId('axes-open-3d')).toHaveCount(0);
  await page.getByTestId('pro-settings').click();
  await expect(page.getByTestId('cfg-axes-open')).toHaveCount(0);
  await expect(page.locator('select').filter({ has: page.locator('option[value="rightHand"]') })).toBeVisible();
});
