/**
 * Explore ("What if…?") keeps what is on screen, reports a mechanism, and
 * leaves the model and live calc as it found them.
 *
 * Every slider move used to land the canvas on the deformed shape; picking a
 * diagram in the ribbon took the panel off screen; and changing a support
 * into a mechanism silently kept the last good diagram.
 */
import { test, expect } from './fixtures';
import { openAdvancedFunction } from './advanced-panel';

test.describe('@slow explore', () => {
  test('a slider keeps the diagram, a mechanism is said, closing restores', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { try { localStorage.setItem('liveCalc', 'false'); } catch { /* private mode */ } });
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.evaluate(() => window.__stabileoActions.solve());
    await page.getByTestId('rb-cmd-momentY').click();
    const diagram = () => page.evaluate(() => window.__stabileo.diagramType());
    await expect.poll(diagram).toBe('moment');

    await openAdvancedFunction(page, 'whatif');
    const panel = page.getByTestId('whatif-panel');
    await expect(panel).toBeVisible();

    await page.evaluate(() => window.__stabileoActions.setReactionView(true));
    const toggle = panel.getByTestId('whatif-show-results');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    expect(await page.evaluate(() => window.__stabileoActions.reactionsShown())).toBe(false);
    await toggle.click();
    expect(await page.evaluate(() => window.__stabileoActions.reactionsShown())).toBe(true);
    expect(await diagram()).toBe('none');
    await page.getByTestId('whatif-diagram-moment').click();
    const version = await page.evaluate(() => window.__stabileo.modelVersion());
    await panel.locator('input.wif-range').first().evaluate((el: HTMLInputElement) => {
      el.value = '2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__stabileo.modelVersion())).toBeGreaterThan(version);
    await expect.poll(() => page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(true);
    await expect.poll(diagram).toBe('moment');

    // The answer beside the question: twice the first load, and the peak moment says it grew.
    await expect(panel.getByTestId('whatif-resp-moment')).toContainText('▲');

    // The members painted by their moment, from the panel.
    await page.getByTestId('whatif-paint-moment').click();
    await expect.poll(diagram).toBe('colorMap');
    await page.getByTestId('whatif-diagram-moment').click();

    // A load carried to another node, and a node moved: each re-solves the model in place.
    const nodeSelect = panel.locator('[data-testid^=whatif-load-node-]').first();
    const current = await nodeSelect.inputValue();
    const other = await nodeSelect.locator('option[value^="n:"]').evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
    const before = await page.evaluate(() => window.__stabileo.modelVersion());
    const target = other.find(v => v !== current)!;
    expect(target).toBeDefined();
    const index = Number((await nodeSelect.getAttribute('data-testid'))!.split('-').at(-1));
    await nodeSelect.selectOption(target);
    await expect.poll(() => page.evaluate(i => (window.__stabileo.entityData('setting', 'loads') as { data: { nodeId: number } }[])[i].data.nodeId, index)).toBe(Number(target.slice(2)));
    const fresh = await page.evaluate(() => window.__stabileo.freshMaxMoment());
    expect(fresh).not.toBeNull();
    await expect.poll(() => page.evaluate(() => {
      const f = window.__stabileo.screenFrame();
      return f.drawn && !f.held && f.diagram === 'moment' ? f.maxMoment : null;
    })).toBeCloseTo(fresh!, 9);
    await expect.poll(() => page.evaluate(() => window.__stabileo.modelVersion())).toBeGreaterThan(before);
    await page.getByTestId('whatif-tab-nodes').click();
    await panel.locator('[data-testid^=whatif-node-] .wif-item-head').nth(1).click();
    const moved = await page.evaluate(() => window.__stabileo.modelVersion());
    await panel.locator('input[data-testid^=whatif-node-]').first().evaluate((el: HTMLInputElement) => {
      el.value = String(Number(el.max) / 2);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__stabileo.modelVersion())).toBeGreaterThan(moved);
    await expect.poll(() => page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(true);
    await page.getByTestId('whatif-tab-loads').click();

    // The nodal load carried onto a member, then slid along it; loads drawn while they are edited.
    await expect(page.getByTestId('whatif-show-loads')).toHaveAttribute('aria-pressed', 'true');
    const member = await nodeSelect.locator('option[value^="m:"]').first().getAttribute('value');
    await nodeSelect.selectOption(member!);
    const along = panel.locator('input[data-testid$=-along]').first();
    await expect(along).toBeVisible();
    const slid = await page.evaluate(() => window.__stabileo.modelVersion());
    await along.evaluate((el: HTMLInputElement) => {
      el.value = String(Number(el.min) + (Number(el.max) - Number(el.min)) * 0.3);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__stabileo.modelVersion())).toBeGreaterThan(slid);
    await expect.poll(() => page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(true);

    // Results off shows the structure and its loads alone; on again brings the diagram back.
    await page.getByTestId('whatif-show-results').click();
    await expect.poll(diagram).toBe('none');
    await page.getByTestId('whatif-show-results').click();
    await expect.poll(diagram).toBe('moment');
    await page.getByTestId('whatif-show-loads').click();
    await expect(page.getByTestId('whatif-show-loads')).toHaveAttribute('aria-pressed', 'false');

    // The panel's own result row, and the ribbon, both leave the panel in view.
    await page.getByTestId('whatif-diagram-shear').click();
    await expect.poll(diagram).toBe('shear');
    await page.getByTestId('rb-cmd-axial').click();
    await expect.poll(diagram).toBe('axial');
    await expect(panel).toBeVisible();

    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    await page.evaluate(id => window.__stabileoActions.selectElements([id]), ids[0]);
    await expect(page.getByTestId('whatif-tab-members')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('whatif-tab-loads').click();
    await page.evaluate(id => window.__stabileoActions.selectElements([id]), ids[1]);
    await expect(page.getByTestId('whatif-tab-members')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('whatif-tab-supports').click();
    for (const s of await panel.locator('[data-testid^=whatif-support-]').all()) await s.selectOption('rollerX');
    await expect(page.getByTestId('whatif-error')).toBeVisible();
    const moment = page.getByTestId('whatif-resp-moment');
    await expect(moment.locator('.wif-now')).toHaveText('—');
    await expect(moment.locator('.wif-pct')).toBeEmpty();
    await expect.poll(() => page.evaluate(() => {
      const frame = window.__stabileo.screenFrame();
      return { held: frame.held, drawn: frame.drawn };
    })).toEqual({ held: false, drawn: false });
    await page.getByTestId('whatif-reset').click();
    await expect(page.getByTestId('whatif-error')).toHaveCount(0);

    await page.getByTestId('adv-close').click();
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('liveCalc'))).toBe('false');
    await expect.poll(() => page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(true);
  });
});

test.describe('@slow explore in 3D', () => {
  test('the result row is the space one, and a mechanism is said', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { try { localStorage.setItem('liveCalc', 'false'); } catch { /* private mode */ } });
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
    await page.evaluate(() => window.__stabileoActions.solve());
    await openAdvancedFunction(page, 'whatif');
    const panel = page.getByTestId('whatif-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('whatif-resp-delta').locator('th')).toContainText(/nodal/i);
    for (const key of ['moment', 'shear']) await expect(page.getByTestId(`whatif-resp-${key}`).locator('th')).toContainText(/resultant/i);
    await expect(panel.locator('.wif-res-btn')).toHaveText(['δ', 'N', 'My', 'Vz', 'Mz', 'Vy', 'T']);
    await page.getByTestId('whatif-diagram-momentZ').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.diagramType())).toBe('momentZ');
    await page.getByTestId('whatif-tab-supports').click();
    for (const s of await panel.locator('[data-testid^=whatif-support-]').all()) await s.selectOption('rollerXY');
    await expect(page.getByTestId('whatif-error')).toBeVisible({ timeout: 20_000 });
    const moment = page.getByTestId('whatif-resp-moment');
    await expect(moment.locator('.wif-now')).toHaveText('—');
    await expect(moment.locator('.wif-pct')).toBeEmpty();
    await expect(page.getByTestId('whatif-live')).not.toHaveClass(/busy/);
    await expect.poll(() => page.evaluate(() => window.__stabileo.diagramMembers())).toBe(0);
    await page.getByTestId('whatif-reset').click();
    await expect(page.getByTestId('whatif-error')).toHaveCount(0, { timeout: 20_000 });
    await page.getByTestId('adv-close').click();
    await expect(panel).toHaveCount(0);
  });
});

test('@slow a support station slider cannot select an occupied endpoint', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions);
  await page.evaluate(() => window.__stabileoActions.loadExample('simply-supported'));
  await openAdvancedFunction(page, 'whatif');
  await page.getByTestId('whatif-tab-supports').click();
  const place = page.locator('select[data-testid^=whatif-supportnode-]').first();
  const member = await place.locator('option[value^="m:"]').first().getAttribute('value');
  await place.selectOption(member!);
  const slider = page.locator('input[data-testid^=whatif-supportnode-]').first();
  await slider.focus();
  const originalStation = await slider.inputValue();
  const version = await page.evaluate(() => window.__stabileo.modelVersion());
  await slider.press('End');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await page.evaluate(() => window.__stabileo.modelVersion())).toBe(version);
  await expect(place).toHaveValue(member!);
  await expect(slider).toHaveValue(originalStation);
  await slider.press('Home');
  await expect(place).toHaveValue(/^n:/);
});
