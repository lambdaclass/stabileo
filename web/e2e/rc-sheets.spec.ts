import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * Reinforcement by sheets on the seven-storey concrete example: solved, its physical members
 * recognised (walls meshed by a second solve), every family has rows and the beams and columns their
 * sections, the core's ground-floor walls are failed for resting on one node, a continuous beam's run
 * adopted short fails and says why, going back to the proposal makes it verify again, and a span
 * opens into its checks by combination.
 */
test.use({ appLocale: 'es' });

test('@slow the reinforcement sheets design beams, columns, slabs and walls of a solved building', async ({ pro: page }) => {
  test.setTimeout(180_000);
  await loadModel(page, 'pro-edificio-7p');
  await page.evaluate(() => window.__stabileoActions.setMeshBeforeAnalysis(false));
  // Two combinations by the same name, as a file of one's own beside the generated ones can hold: each keeps its row.
  await page.evaluate(() => {
    const a = window.__stabileoActions as unknown as { combineCases(n: string): void };
    a.combineCases('1.0 todos'); a.combineCases('1.0 todos');
  });
  await solveModel(page);

  await page.getByTestId('pr-stage-analyse').click();
  // The panel says what it is building before the rows hold the page: recorded as it shows, for it can come and go between two looks.
  await page.evaluate(() => {
    const w = window as unknown as { building: string[] };
    w.building = [];
    new MutationObserver(() => { const b = document.querySelector('[data-testid="rc-building"]'); if (b) w.building.push(b.textContent ?? ''); }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-sheets-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { building: string[] }).building.some((x) => x.includes('combinaciones')))).toBe(true);
  // The physical elements are already read; the walls, one element a storey, are meshed for the sheets.
  await expect(page.getByTestId('rc-recognize')).toHaveCount(0);
  await page.getByTestId('rc-mesh-walls').click();
  await expect(page.getByTestId('rc-mesh-walls')).toHaveCount(0, { timeout: 120_000 });

  await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByTestId('rc-open-column')).toBeEnabled();
  await expect(page.getByTestId('rc-open-slab')).toBeEnabled();
  await expect(page.getByTestId('rc-open-wall')).toBeEnabled();
  await expect(page.getByTestId('rc-panel-code').getByTestId('rc-code-select')).toHaveValue('cirsoc201-2025');
  await expect(page.getByTestId('rc-scope-note')).toHaveText(/buena parte sigue en desarrollo: revisá los resultados/);

  await page.getByTestId('rc-open-beam').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await expect(ws).toBeVisible();
  // The close button stays at the top right of the header however its controls wrap, and the table scrolls inside with the panels' scrollbars.
  for (const width of [1440, 1100, 900]) {
    await page.setViewportSize({ width, height: 900 });
    const head = (await ws.locator('.rcw-head').boundingBox())!, close = (await ws.getByTestId('rc-close').boundingBox())!;
    expect(close.y - head.y).toBeLessThan(14);
    // Everything on one row: the header no taller than its tallest control.
    expect(head.height, `header at ${width} px`).toBeLessThan(52);
    for (const tab of ['beam', 'column', 'slab', 'wall', 'punching']) await expect(ws.getByTestId(`rc-tab-${tab}`)).toBeInViewport();
    expect(head.x + head.width - (close.x + close.width)).toBeLessThan(16);
  }
  await expect(ws).toHaveClass(/st-panel-scrollbars/);
  expect(await ws.locator('.rcw-body').evaluate((b) => b.scrollWidth > b.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(ws.getByTestId('rc-code').getByTestId('rc-code-select')).toHaveValue('cirsoc201-2025');
  const first = ws.getByTestId('rc-row').first();
  await expect(first).toContainText('Verifica');

  await first.click();
  await expect(ws.getByTestId('rc-line-svg')).toBeVisible();
  // The bars' marks of the schedule stand on the elevation and beside each section, and go away together.
  await expect(ws.getByTestId('rc-line-marks')).toContainText('A');
  await expect(ws.getByTestId('rc-section-marks').first()).toContainText('A');
  await ws.getByTestId('rc-marks-toggle').uncheck();
  await expect(ws.getByTestId('rc-line-marks')).toHaveCount(0);
  await expect(ws.getByTestId('rc-section-marks')).toHaveCount(0);
  await ws.getByTestId('rc-marks-toggle').check();
  await expect(ws.getByTestId('rc-schedule')).toBeVisible();
  await expect(ws.getByTestId('rc-section').first()).toContainText('V1-1 · i');
  await expect(ws.getByTestId('rc-section').first().locator('circle').first()).toBeVisible();
  const editor = ws.getByTestId('rc-line-editor');
  await editor.getByRole('spinbutton', { name: 'Cantidad' }).first().fill('2');
  await editor.getByRole('combobox', { name: 'Diámetro' }).first().selectOption('10');
  await expect(ws.getByTestId('rc-row').first()).toContainText('No verifica');
  await expect(ws.getByTestId('rc-checks').first()).toContainText('✗');

  await editor.getByRole('button', { name: 'Volver a la propuesta' }).click();
  await expect(ws.getByTestId('rc-row').first()).not.toContainText('No verifica');

  await ws.getByTestId('rc-span-toggle').first().click();
  await ws.locator('summary', { hasText: 'Por combinación' }).first().click();
  await expect(ws.getByTestId('rc-combos').first()).toBeVisible();
  await expect(ws.getByTestId('rc-combos').first().locator('tr', { hasText: '1.0 todos' })).toHaveCount(2);

  await ws.getByTestId('rc-tab-column').click();
  await expect(ws.getByTestId('rc-table-column')).toBeVisible();
  await ws.getByTestId('rc-row').first().click();
  await expect(ws.getByTestId('rc-section')).toHaveCount(1);
  await expect(ws.getByTestId('rc-section').locator('circle').first()).toBeVisible();
  // The storey in elevation: one tie each spacing from half a spacing above the floor, through the joint above.
  const elev = ws.getByTestId('rc-column-elevation');
  await expect(elev).toBeVisible();
  expect(await elev.getByTestId('rc-elev-tie').count()).toBeGreaterThan(15);
  await expect(elev.getByTestId('rc-elev-zone')).toHaveCount(2);
  await expect(elev).toContainText('§25.7.2.1');
  await expect(elev.getByTestId('rc-elev-note')).toContainText('Una sola separación');
  await ws.getByTestId('rc-tab-slab').click();
  await expect(ws.getByTestId('rc-table-slab')).toBeVisible();
  // A slab's four layers, each switched off and on by itself.
  await ws.getByTestId('rc-row').first().click();
  const slabFig = ws.getByTestId('rc-slab-layers');
  for (const f of ['bottomX', 'bottomY', 'topX', 'topY']) {
    const present = await slabFig.getByTestId(`rc-slab-layer-${f}`).isEnabled();
    await expect(slabFig.getByTestId(`rc-slab-plan-${f}`)).toHaveCount(present ? 1 : 0);
  }
  await slabFig.getByTestId('rc-slab-layer-bottomY').uncheck();
  await expect(slabFig.getByTestId('rc-slab-plan-bottomY')).toHaveCount(0);
  await expect(slabFig.getByTestId('rc-slab-plan-bottomX')).toHaveCount(1);
  await slabFig.getByTestId('rc-slab-layer-bottomY').check();
  await expect(slabFig.getByTestId('rc-slab-plan-bottomY')).toHaveCount(1);
  await ws.getByTestId('rc-tab-wall').click();
  await expect(ws.getByTestId('rc-table-wall')).toBeVisible();
  // The example's core stands on the corner column alone: its ground-floor walls rest on one node each.
  const ground = ws.getByTestId('rc-row').filter({ hasText: 'N0' });
  await expect(ground).toHaveCount(3);
  await expect(ground.first()).toContainText('No verifica');
  await ground.first().click();
  await expect(ws.getByTestId('rc-checks').first()).toContainText('La base del tabique apoya en toda su longitud');
  await expect(ws.getByTestId('rc-row').filter({ hasText: 'N1' }).first()).toContainText('Verifica');
  // A wall's bars: the verticals and the horizontals, the U-bars that close its edges, each kind switched by itself.
  await ws.getByTestId('rc-row').filter({ hasText: 'N1' }).first().click();
  const wallFig = ws.getByTestId('rc-wall-detail');
  await expect(wallFig).toBeVisible();
  await expect(wallFig.getByTestId('rc-wall-plan-ends').locator('path')).toHaveCount(2);
  await expect(wallFig).toContainText(/Horquillas en los bordes|Una sola cortina: las horizontales terminan con gancho/);
  await expect(wallFig.getByTestId('rc-wall-note').last()).toContainText('Tabique ordinario (capítulo 11)');
  await wallFig.getByTestId('rc-wall-layer-vertical').uncheck();
  await expect(wallFig.getByTestId('rc-wall-elev-vertical')).toHaveCount(0);
  await expect(wallFig.getByTestId('rc-wall-elev-horizontal')).toHaveCount(1);

  // The code is switched from the sheets themselves: every family is designed again to it, and the choice is the project's.
  const picker = ws.getByTestId('rc-code').getByTestId('rc-code-select');
  for (const [code, clause] of [['en1992-1-1', '9.2.1.3, 6.1'], ['bs-en1992-1-1', '9.2.1.3, 6.1'], ['ts500-2000', '7.1, 7.3'], ['aci318-19', '§9.7.3, §22.2']] as const) {
    await picker.selectOption(code);
    await ws.getByTestId('rc-tab-beam').click();
    await expect(ws.getByTestId('rc-row').first()).toBeVisible();
    await ws.getByTestId('rc-row').first().click();
    await expect(ws.getByTestId('rc-checks').first()).toContainText(clause);
    await ws.getByTestId('rc-tab-column').click();
    await expect(ws.getByTestId('rc-row').first()).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rc-panel-code').getByTestId('rc-code-select')).toHaveValue('aci318-19');

  // The project's denser column ends, the design's own setting, drawn in the elevation.
  await page.getByTestId('rc-opt-end-zones').check();
  await page.getByTestId('rc-open-column').click();
  await ws.getByTestId('rc-row').first().click();
  await expect(ws.locator('[data-testid="rc-elev-zone"][data-kind="end"]')).toHaveCount(2);
  await expect(ws.getByTestId('rc-elev-note')).toContainText('el proyecto lo pide');
});
