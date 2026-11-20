import { test, expect, loadModel, solveModel } from './fixtures';
import { setDesignOption } from './design-options';

/**
 * Reinforcement by sheets on the seven-storey concrete example: solved, its physical members
 * recognised (walls meshed by a second solve), every family has rows and the beams and columns their
 * sections, the core's ground-floor walls fail for resting on one node until one click holds their bases and designs again, a continuous beam's run
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
  // Opening the sheets designs nothing: they wait for the button.
  await expect(page.getByTestId('rc-design')).toBeVisible();
  await expect(page.getByTestId('rc-open-beam')).toHaveCount(0);
  // The physical elements are already read; the walls, one element a storey, are meshed for the sheets.
  await expect(page.getByTestId('rc-recognize')).toHaveCount(0);
  await page.getByTestId('rc-mesh-walls').click();
  await expect(page.getByTestId('rc-mesh-walls')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 120_000 });
  await page.getByTestId('rc-design').click();
  // It says what it is designing, with a bar of members done, before the rows hold the page.
  await expect.poll(() => page.evaluate(() => (window as unknown as { building: string[] }).building.some((x) => x.includes('combinaciones')))).toBe(true);

  await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByTestId('rc-open-vertical')).toBeEnabled();
  await expect(page.getByTestId('rc-open-slab')).toBeEnabled();
  await expect(page.getByTestId('rc-panel-code').getByTestId('rc-code-select')).toHaveValue('cirsoc201-2025');
  await expect(page.getByTestId('rc-code-desc')).toContainText('CIRSOC 201-2025');

  await page.getByTestId('rc-open-beam').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await expect(ws).toBeVisible();
  // The close button stays at the top right of the header however its controls wrap, and the table scrolls inside with the panels' scrollbars.
  for (const width of [1920, 1600, 1440, 1280, 1100, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => ws.getByTestId('rc-head').evaluate((h) => h.scrollWidth - h.clientWidth), { message: `header overflow at ${width} px` }).toBeLessThanOrEqual(0);
    const head = (await ws.locator('.rcw-head').boundingBox())!, close = (await ws.getByTestId('rc-close').boundingBox())!;
    expect(close.x + close.width, `close inside the window at ${width} px`).toBeLessThanOrEqual(width);
    await expect(ws.getByTestId('rc-plans-export')).toBeInViewport({ ratio: 1 });
    expect(close.y - head.y).toBeLessThan(14);
    // Everything on one row: the header no taller than its tallest control.
    expect(head.height, `header at ${width} px`).toBeLessThan(52);
    for (const tab of ['beam', 'vertical', 'slab', 'punching']) await expect(ws.getByTestId(`rc-tab-${tab}`)).toBeInViewport();
    expect(head.x + head.width - (close.x + close.width)).toBeLessThan(16);
  }
  await expect(ws).toHaveClass(/st-panel-scrollbars/);
  expect(await ws.locator('.rcw-body').evaluate((b) => getComputedStyle(b).overflowX)).toMatch(/auto|scroll/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(ws.getByTestId('rc-code').getByTestId('rc-code-select')).toHaveValue('cirsoc201-2025');
  const first = ws.getByTestId('rc-row').first();
  await expect(first).toContainText(/Verifica|Holgada/);
  await expect(first).not.toContainText('No verifica');
  const generous = ws.locator('tr.st-warn .stc').first();
  if (await generous.count()) {
    const [colour, warn] = await generous.evaluate((el) => {
      const probe = el.appendChild(document.createElement('span'));
      probe.style.color = 'var(--st-warn)';
      const w = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(el).color, w];
    });
    expect(colour, 'a generous row is not painted as a warning').not.toBe(warn);
  }

  await first.click();
  await expect(ws.getByTestId('rc-line-svg')).toBeVisible();
  // The bars drawn apart and the schedule's marks on them and beside each section go away together.
  await expect(ws.getByTestId('rc-line-marks')).toContainText('A');
  await expect(ws.getByTestId('rc-section-marks').first()).toContainText('A');
  await expect(ws.getByTestId('rc-track').first()).toBeVisible();
  await ws.getByTestId('rc-marks-toggle').uncheck();
  await expect(ws.getByTestId('rc-line-marks')).toHaveCount(0);
  await expect(ws.getByTestId('rc-section-marks')).toHaveCount(0);
  await expect(ws.getByTestId('rc-track')).toHaveCount(0);
  await ws.getByTestId('rc-marks-toggle').check();
  await expect(ws.getByTestId('rc-line-envelope')).toBeVisible();
  await expect(ws.getByTestId('rc-env-phivn')).toHaveAttribute('d', /^(M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+ ?)+$/);
  await expect(ws.getByTestId('rc-env-mu-scale')).toHaveText(/^\d+ kN·m$/);
  await expect(ws.getByTestId('rc-env-vu-scale')).toHaveText(/^\d+ kN$/);
  await ws.getByTestId('rc-envelope-toggle').uncheck();
  await expect(ws.getByTestId('rc-line-envelope')).toHaveCount(0);
  await ws.getByTestId('rc-envelope-toggle').check();
  await expect(ws.getByTestId('rc-line-cut').first()).toHaveText('1');
  await expect(ws.getByTestId('rc-section').first()).toContainText('1–1');
  await ws.getByTestId('rc-cuts-toggle').uncheck();
  await expect(ws.getByTestId('rc-line-cuts')).toHaveCount(0);
  await ws.getByTestId('rc-cuts-toggle').check();
  await expect(ws.getByTestId('rc-schedule')).toBeVisible();
  await expect(ws.getByTestId('rc-section').first()).toContainText('V1-1 · i');
  await expect(ws.getByTestId('rc-section').first().locator('circle').first()).toBeVisible();
  const proposedStatus = (await first.locator('td.stc').textContent())!.trim();
  expect(proposedStatus).toMatch(/^(Verifica|Holgada)$/);
  const editor = ws.getByTestId('rc-line-editor');
  await editor.getByRole('spinbutton', { name: 'Cantidad' }).first().fill('2');
  await editor.getByRole('combobox', { name: 'Diámetro' }).first().selectOption('10');
  await expect(ws.getByTestId('rc-row').first()).toContainText('No verifica');
  const short = ws.getByTestId('rc-span-toggle').filter({ hasText: 'No verifica' }).first();
  const shortSpan = (await short.locator('strong').textContent())!;
  await short.click();
  await expect(ws.getByTestId('rc-checks').filter({ hasText: '✗' }).first()).toBeVisible();
  await short.click();

  await editor.getByRole('button', { name: 'Volver a la propuesta' }).click();
  await expect(ws.getByTestId('rc-row').first().locator('td.stc')).toHaveText(proposedStatus);
  const named = page.getByTestId('rc-span-toggle').filter({ has: page.locator('strong', { hasText: new RegExp(`^${shortSpan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
  const restored = ws.locator('.rcd-span').filter({ has: named }).first();
  const restoredToggle = restored.getByTestId('rc-span-toggle');
  await expect(restoredToggle).toContainText(/Verifica|Holgada/);
  await expect(restoredToggle).not.toContainText('No verifica');
  await restoredToggle.click();
  const restoredChecks = restored.getByTestId('rc-checks');
  await expect(restoredChecks.locator('td.st').first()).toHaveText('✓');
  await expect(restoredChecks.locator('td.st', { hasText: '✗' })).toHaveCount(0);
  await expect(ws.getByTestId('rc-checks').first().locator('td.st', { hasText: '✗' })).toHaveCount(0);
  await restoredToggle.click();

  await ws.getByTestId('rc-span-toggle').first().click();
  await ws.locator('summary', { hasText: 'Por combinación' }).first().click();
  await expect(ws.getByTestId('rc-combos').first()).toBeVisible();
  await expect(ws.getByTestId('rc-combos').first().locator('tr', { hasText: '1.0 todos' })).toHaveCount(2);

  await ws.getByTestId('rc-tab-vertical').click();
  await expect(ws.getByTestId('rc-table-vertical')).toBeVisible();
  await ws.getByTestId('rc-row').first().click();
  await expect(ws.getByTestId('rc-checks').first()).toContainText('Tabla 20.5.1.3.1');
  await expect(ws.getByTestId('rc-checks').first()).toContainText('§10.3.1');
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
  await ws.getByTestId('rc-tab-vertical').click();
  await expect(ws.getByTestId('rc-table-vertical')).toBeVisible();
  // The fixture as tests load it, without the card's correction, stands its core on the corner column alone.
  const walls = ws.locator('[data-testid="rc-row"][data-family="wall"]');
  const ground = walls.filter({ hasText: 'N0' });
  await expect(ground).toHaveCount(3);
  await expect(ground.first()).toContainText(/No verifica|Sin armado posible/);
  await ground.first().click();
  await expect(ws.getByTestId('rc-checks').first()).toContainText('La base del tabique apoya en toda su longitud');
  await expect(ws.getByTestId('rc-resize-hint')).toHaveCount(0);
  // One click holds the three bases, solves again and designs again, with the window kept open.
  await ws.getByTestId('rc-wall-hold-base').click();
  await expect(walls.filter({ hasText: 'N0' })).toHaveCount(3, { timeout: 120_000 });
  await expect(ws.getByTestId('rc-wall-hold-base')).toHaveCount(0);
  await expect(ws.getByTestId('rc-wall-base-unheld')).toHaveCount(0);
  await expect(ws.getByTestId('rc-solve-design')).toHaveCount(0);
  await expect(walls.filter({ hasText: 'N0' }).filter({ hasText: 'No verifica' })).toHaveCount(0);
  await expect(walls.filter({ hasText: 'N1' }).first()).toContainText('Verifica');
  // A wall's bars: the verticals and the horizontals, the U-bars that close its edges, each kind switched by itself.
  await walls.filter({ hasText: 'N1' }).first().click();
  const wallFig = ws.getByTestId('rc-wall-detail');
  await expect(wallFig).toBeVisible();
  await expect(wallFig.getByTestId('rc-wall-plan').getByTestId('rc-wall-plan-ends').locator('path')).toHaveCount(2);
  await expect(wallFig).toContainText(/Horquillas en los bordes|Una sola cortina: las horizontales terminan con gancho/);
  await expect(wallFig.getByTestId('rc-wall-note').filter({ hasText: 'Tabique ordinario (capítulo 11)' })).toHaveCount(1);
  await expect(wallFig.getByTestId('rc-wall-plan-column-tag').first()).toHaveText('C1 40×40');
  await wallFig.getByTestId('rc-wall-layer-vertical').uncheck();
  await expect(wallFig.getByTestId('rc-wall-elev-vertical')).toHaveCount(0);
  await expect(wallFig.getByTestId('rc-wall-elev-horizontal')).toHaveCount(1);

  // The code is switched from the sheets themselves: every family is designed again to it at once; the choice is the project's.
  const picker = ws.getByTestId('rc-code').getByTestId('rc-code-select');
  for (const [code, clause] of [['en1992-1-1', '9.2.1.3, 6.1'], ['bs-en1992-1-1', '9.2.1.3, 6.1'], ['ts500-2000', '7.1, 7.3'], ['aci318-19', '§9.7.3, §22.2']] as const) {
    await picker.selectOption(code);
    await expect(ws.getByTestId('rc-progress')).toHaveCount(0, { timeout: 60_000 });
    await expect(ws.getByTestId('rc-stale')).toHaveCount(0);
    await ws.getByTestId('rc-tab-beam').click();
    await expect(ws.getByTestId('rc-row').first()).toBeVisible();
    await ws.getByTestId('rc-row').first().click();
    await expect(ws.getByTestId('rc-checks').first()).toContainText(clause);
    await ws.getByTestId('rc-tab-vertical').click();
    await expect(ws.getByTestId('rc-row').first()).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rc-panel-code').getByTestId('rc-code-select')).toHaveValue('aci318-19');

  // Exact reinforcement: every line either bends bars up or says why it cannot, span by span.
  await setDesignOption(page, 'bentBars');
  await page.getByTestId('rc-redesign').click();
  await expect(page.getByTestId('rc-stale')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('rc-open-beam').click();
  for (const text of await ws.getByTestId('rc-line-spans').allTextContents()) expect(text).toMatch(/lev\./);
  const v4 = ws.getByTestId('rc-row').filter({ has: page.locator('td.nm', { hasText: /^V4\D*$/ }) }).first();
  await v4.click();
  if (await v4.getByTestId('rc-line-no-bent').count()) {
    await expect(ws.getByTestId('rc-line-bent-note').first()).toBeVisible();
    for (const reason of await ws.getByTestId('rc-line-bent-note').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-reason')))) expect(['noSagging', 'noHogging', 'short']).toContain(reason);
  } else await expect(ws.getByTestId('rc-bent-bar').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // The project's denser column ends, the design's own setting, drawn in the elevation.
  await setDesignOption(page, 'endZones');
  await page.getByTestId('rc-redesign').click();
  await expect(page.getByTestId('rc-stale')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('rc-open-vertical').click();
  await ws.getByTestId('rc-row').first().click();
  await expect(ws.locator('[data-testid="rc-elev-zone"][data-kind="end"]')).toHaveCount(2);
  await expect(ws.getByTestId('rc-elev-note')).toContainText('el proyecto lo pide');

  // From a row to its element: the window closes, the storey's members are selected and the Members tab is open, to change their section there.
  await expect(ws.getByTestId('rc-resize')).toBeVisible();
  await expect(ws.getByTestId('rc-resize-searching')).toHaveCount(0, { timeout: 20_000 });
  await ws.getByTestId('rc-goto-members').click();
  await expect(ws).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__stabileo.selection().length)).toBeGreaterThan(0);
  await expect(page.getByTestId('pro-panel-title')).toHaveText('Barras');
});
