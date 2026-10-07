/**
 * "Explained step by step", as a student meets it: one entry in Advanced, a
 * catalog of methods by group, each saying what it does and what the
 * structure must be, and an example that opens straight into the method.
 * Every method's document is walked to its last step without an error, and
 * each one ends comparing itself with the matrix solve.
 */
import { test, expect, type Page } from './fixtures';

async function boot(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
}
async function openCatalog(page: Page) {
  // Closing a document goes back to the Advanced panel, and the ribbon command toggles it.
  if (!(await page.getByTestId('adv-steps').isVisible())) await page.getByTestId('rb-cmd-advanced').click();
  await page.getByTestId('adv-steps').click();
  await expect(page.getByTestId('steps-catalog')).toBeVisible();
}

test.describe('@smoke explained step by step', () => {
  test('the catalog: groups in order, help, requirements, and why a method is not available', async ({ page }) => {
    await boot(page);
    await openCatalog(page);
    const groups = await page.locator('[data-testid^=steps-group-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(groups).toEqual([
      'steps-group-stiffness', 'steps-group-flexibility', 'steps-group-continuous',
      'steps-group-frames', 'steps-group-trusses', 'steps-group-deformation',
    ]);
    const first = page.getByTestId('steps-method-dsm');
    await expect(first).toContainText(/must be|debe ser|deve ser/);
    await page.getByTestId('steps-help-dsm').click();
    await expect(first.locator('.sc-helptext')).toBeVisible();
    // Nothing drawn yet: not available, and it says why.
    await expect(page.getByTestId('steps-open-dsm')).toBeDisabled();
    await expect(first).toContainText(/draw one|dibujá una|desenhe uma/);
  });

  test('every method opens from its example and walks to the end, comparing with the matrix method', async ({ page }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await openCatalog(page);
    const ids = await page.locator('[data-testid^=steps-method-]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')!.replace('steps-method-', '')));
    const documented = ids.filter((id) => id !== 'dsm' && id !== 'fm');
    expect(documented.length).toBeGreaterThan(0);
    for (const id of documented) {
      await test.step(id, async () => {
        await page.getByTestId(`steps-example-${id}`).click();
        const doc = page.getByTestId('steps-doc');
        await expect(doc).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('steps-error')).toHaveCount(0);
        const n = await page.getByTestId('steps-tab').count();
        expect(n).toBeGreaterThan(1);
        let compared = false;
        for (let k = 0; k < n; k++) {
          await page.getByTestId('steps-next').click();
          if (await doc.locator('.sb-compare').count()) compared = true;
        }
        await expect(page.getByTestId('steps-next')).toBeDisabled();
        expect(compared, `${id} compares with the matrix method`).toBe(true);
        await page.getByTestId('steps-back').click();
        await expect(page.getByTestId('steps-catalog')).toBeVisible();
      });
    }
    expect(errors).toEqual([]);
  });

  test('the stiffness method from its example: classification and fixed-end actions', async ({ page }) => {
    await boot(page);
    await openCatalog(page);
    await page.getByTestId('steps-example-dsm').click();
    await expect(page.locator('.wizard')).toBeVisible();
    await expect(page.locator('.wizard .katex').filter({ hasText: /GH\s*=\s*3/ }).first()).toBeVisible();
  });

  test('an assumption can be switched: Castigliano without the axial term', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await openCatalog(page);
    await page.getByTestId('steps-example-castigliano').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    const box = page.getByTestId('steps-opt-axial');
    await expect(box).toBeChecked();
    await page.getByTestId('steps-opt-help-axial').click();
    await expect(page.locator('.sd-opt-text')).toBeVisible();
    // The document is rebuilt on the step the reader was on.
    await page.getByTestId('steps-tab').nth(1).click();
    await box.uncheck();
    await expect(box).not.toBeChecked();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    await expect(page.getByTestId('steps-tab').nth(1)).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });

  test('the compatibility matrix with the frame members held at their length', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await openCatalog(page);
    await page.getByTestId('steps-open-compatibility').click();
    const doc = page.getByTestId('steps-doc');
    await expect(doc).toBeVisible();
    const box = page.getByTestId('steps-opt-inextensible');
    await expect(box).not.toBeChecked();
    await box.check();
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    // The displacements that follow from the independent ones are marked †, down to the comparison.
    await expect(doc).toContainText('†');
    const n = await page.getByTestId('steps-tab').count();
    let compared = false;
    for (let k = 0; k < n; k++) {
      await page.getByTestId('steps-next').click();
      if (await doc.locator('.sb-compare').count()) compared = true;
    }
    expect(compared).toBe(true);
    await box.uncheck();
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('every step-by-step view opens in Advanced, with the same back row, title, tabs and footer', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await openCatalog(page);
    const panelTitle = page.getByTestId('bp-title');
    await expect(panelTitle).toHaveText(/Advanced|Avanzado|Avançado/);
    // The panel's ✕ is the only close: the catalog has a back row, no second ✕.
    await expect(page.getByTestId('steps-catalog').locator('button', { hasText: '×' })).toHaveCount(0);
    for (const [open, back] of [['steps-open-crossSway', 'steps-back'], ['steps-open-dsm', 'dsm-back'], ['steps-open-fm', 'fm-back']] as const) {
      await page.getByTestId(open).click();
      await expect(panelTitle).toHaveText(/Advanced|Avanzado|Avançado/);
      await expect(page.locator('.sh-name')).toBeVisible();
      await expect(page.locator('.sf-title h3')).toBeVisible();
      await expect(page.locator('.sf-nav button').first()).toBeVisible();
      await expect(page.locator('.sf-foot')).toBeVisible();
      await page.locator('.sf-foot button').last().click();
      await expect(page.locator('.sf-step')).toBeVisible();
      await page.getByTestId(back).click();
      await expect(page.getByTestId('steps-catalog')).toBeVisible();
    }
    // And from the catalog, back to the list of advanced functions.
    await page.getByTestId('steps-catalog-back').click();
    await expect(page.getByTestId('adv-steps')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Advanced lists its functions by group, and leaves the envelope to the results view', async ({ page }) => {
    await boot(page);
    await page.getByTestId('rb-cmd-advanced').click();
    const panel = page.locator('.advanced-grid');
    const groups = await panel.locator('[data-testid^=adv-group-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(groups).toEqual(['adv-group-structure', 'adv-group-buckling', 'adv-group-dynamics', 'adv-group-moving', 'adv-group-learn', 'adv-group-design']);
    // Every entry sits under a header: the first thing in the list is one.
    const firstChild = await panel.evaluate((el) => el.firstElementChild?.getAttribute('data-testid'));
    expect(firstChild).toBe('adv-group-structure');
    // Each header comes right before its own entries.
    const order = await panel.evaluate((el) => [...el.children].map((c) => c.getAttribute('data-testid') ?? c.textContent?.trim().slice(0, 24) ?? ''));
    const b = order.indexOf('adv-group-buckling'), m = order.indexOf('adv-group-moving');
    expect(order[b + 1]).toMatch(/P-?Δ|P-Delta/i);
    expect(order[m + 1]).toMatch(/influen/i);
    await expect(panel).not.toContainText(/Envolvente|Envelope|Envoltória/);
  });

  test('a document offers to refresh after changing self-weight in the loads panel', async ({ page }) => {
    await boot(page);
    await openCatalog(page);
    await page.getByTestId('steps-example-threeMoments').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    await expect(page.getByTestId('steps-refresh')).toHaveCount(0);
    await page.getByTestId('rb-cmd-load').click();
    // Self-weight sits at the top of the loads panel's Combinations fold.
    await page.locator('.combos-fold > summary').click();
    const selfWeight = page.getByTestId('selfweight-toggle');
    await selfWeight.setChecked(!(await selfWeight.isChecked()));
    await page.getByTestId('rb-cmd-advanced').click();
    await expect(page.getByTestId('steps-refresh')).toBeVisible();
    await page.getByTestId('steps-refresh').click();
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    await expect(page.getByTestId('steps-refresh')).toHaveCount(0);
  });

  test('a document says when the model has changed, and updates', async ({ page }) => {
    await boot(page);
    await openCatalog(page);
    await page.getByTestId('steps-example-threeMoments').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    await expect(page.getByTestId('steps-refresh')).toHaveCount(0);
    // Change the model: a node placed on the canvas.
    await page.getByTestId('rb-cmd-node').click();
    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
    // Drawing shows the model data; the document waits in Advanced and says the model changed.
    await page.getByTestId('rb-cmd-advanced').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    await expect(page.getByTestId('steps-refresh')).toBeVisible();
    await page.getByTestId('steps-refresh').click();
    await expect(page.getByTestId('steps-refresh')).toHaveCount(0);
  });

  test('methods that work on a chosen member or node take the selection', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('truss'));
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    // Every member of the truss as the target: the method opens and walks, or says why not.
    let opened = 0;
    for (const id of ids) {
      await page.evaluate((m) => window.__stabileoActions.selectElements([m]), id);
      await openCatalog(page);
      const open = page.getByTestId('steps-open-sections');
      await open.scrollIntoViewIfNeeded();
      if (await open.isEnabled()) {
        await open.click();
        await expect(page.getByTestId('steps-doc')).toBeVisible();
        await expect(page.getByTestId('steps-error')).toHaveCount(0);
        for (let k = 0; k < (await page.getByTestId('steps-tab').count()); k++) await page.getByTestId('steps-next').click();
        // Back to the methods, and back again to the list of advanced functions.
        await page.getByTestId('steps-back').click();
        await page.getByTestId('steps-catalog-back').click();
        opened++;
      } else {
        await expect(page.getByTestId('steps-method-sections').locator('.sc-state.no')).toBeVisible();
        await page.getByTestId('steps-catalog-back').click();
      }
    }
    expect(opened).toBeGreaterThan(ids.length / 2);
    // Virtual work at a node picked on the canvas.
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('rb-cmd-select').click();
    const nodes = await page.evaluate(() => window.__stabileo.nodeIds());
    const pos = (await page.evaluate((n) => window.__stabileo.nodeScreenPos(n), nodes[2]))!;
    await page.mouse.click(pos.x, pos.y);
    await openCatalog(page);
    await page.getByTestId('steps-open-virtualWork').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('@smoke explained step by step on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the catalog opens in the sheet and a document walks to its end', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.getByTestId('rb-cmd-advanced').tap();
    await page.getByTestId('adv-steps').tap();
    await expect(page.getByTestId('steps-catalog')).toBeVisible();
    for (const id of ['crossBeams', 'joints', 'doubleIntegration']) {
      await page.getByTestId(`steps-example-${id}`).tap();
      await expect(page.getByTestId('steps-doc')).toBeVisible();
      const n = await page.getByTestId('steps-tab').count();
      for (let k = 0; k < n; k++) await page.getByTestId('steps-next').tap();
      await expect(page.getByTestId('steps-next')).toBeDisabled();
      await page.getByTestId('steps-back').tap();
    }
    expect(errors).toEqual([]);
  });
});
