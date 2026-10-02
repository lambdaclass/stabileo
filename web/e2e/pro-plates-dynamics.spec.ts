/**
 * PRO 8/10 from the panels: member behaviour and stiffness modifiers, shear areas, foundation
 * springs, the mesher and the surface generator, the time history kept with the project, modes
 * until 90 % of the mass, and the pushover curve with its step slider. The numbers are pinned in
 * the unit suites (`member-behaviour`, `foundation-springs`, `mesher`, `surfaces`,
 * `dynamics-requests`, `pushover-curve`); this checks that each panel writes what they compute.
 */
import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

const data = (page: import('@playwright/test').Page, kind: 'element' | 'support' | 'section' | 'setting', key: number | string) =>
  page.evaluate(([k, id]) => window.__stabileo.entityData(k as never, id as never), [kind, key] as const) as Promise<any>;

test.describe('@smoke PRO plates and dynamics', () => {
  test('member behaviour and a CIRSOC 201 stiffness preset land on the member', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-specifications').click();
    await page.evaluate(() => window.__stabileoActions.selectElements([1]));
    await expect(page.getByTestId('spec-members')).toBeVisible();
    await page.getByTestId('mb-behaviour').selectOption('tensionOnly');
    await page.getByTestId('mb-stiffness').selectOption('column');
    const e = await data(page, 'element', 1);
    expect(e.behaviour).toBe('tensionOnly');
    expect(e.stiffness).toMatchObject({ preset: 'column', iy: 0.7, iz: 0.7 });
  });

  test('shear deformation for every section, from its geometry', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-sections').click();
    await page.getByTestId('sec-shear-all-on').click();
    expect((await data(page, 'section', 1)).shearAreas).toEqual({ basis: 'geometry' });
    await page.getByTestId('sec-shear-all-off').click();
    expect((await data(page, 'section', 1)).shearAreas ?? null).toBeNull();
  });

  test('foundation springs from a typed ks, one way', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-specifications').click();
    await page.getByTestId('spec-section-surfaces').click();
    // Nothing selected: the part says what it edits and how to choose the shells.
    await expect(page.getByTestId('spec-empty-shells')).toBeVisible();
    await expect(page.getByTestId('fs-apply')).toHaveCount(0);
    const before = await page.evaluate(() => window.__stabileo.modelCensus().supports);
    await page.evaluate(() => window.__stabileoActions.selectShells([]));
    await page.getByTestId('fs-source').selectOption('typed');
    await page.getByTestId('fs-ks').fill('20000');
    await page.getByTestId('fs-uplift').check();
    await page.getByTestId('fs-apply').click();
    await expect(page.getByTestId('fs-done')).toBeVisible();
    // A spring at every raft node, replacing the support a node had: as many supports as before
    // on this raft, whose every node was on springs already, and each one now lifts.
    expect(await page.evaluate(() => window.__stabileo.modelCensus().supports)).toBe(before);
    const sups = (await data(page, 'setting', 'supports')) as Array<[number, any]>;
    const s1 = sups.map(([, s]) => s).find((s) => s.nodeId === 1);
    expect(s1).toMatchObject({ type: 'custom3d', uplift: true });
    expect(s1.kz).toBeGreaterThan(0);
  });

  test('the mesher meshes a circular plate with a hole, and a cylinder is placed with the ghost', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();
    await page.getByRole('button', { name: /Generador de malla|Mesh generator|Gerador de malha/ }).click();
    await page.getByTestId('ms-circle').check();
    await page.getByTestId('ms-center').fill('0; 0; 0');
    await page.getByTestId('ms-radius').fill('3');
    await page.getByTestId('ms-add-hole').click();
    await page.getByTestId('ms-hole-center-0').fill('1; 0; 0');
    await page.getByTestId('ms-hole-r-0').fill('0.5');
    await expect(page.getByTestId('ms-summary')).toBeVisible();
    await page.getByTestId('ms-apply').click();
    await expect(page.getByTestId('ms-done')).toBeVisible();
    const plate = await page.evaluate(() => window.__stabileo.quadIds().length);
    expect(plate).toBeGreaterThan(20);

    await page.getByTestId('sf-kind').selectOption('cylinder');
    await expect(page.getByTestId('sf-summary')).toBeVisible();
    await page.getByTestId('sf-place').click();
    await expect(page.getByTestId('placement-hud')).toBeVisible();
    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId('placement-hud')).toBeHidden();
    expect(await page.evaluate(() => window.__stabileo.quadIds().length)).toBeGreaterThan(plate);
  });

  test('the time history is kept with the project: two directions, a scale and a nodal force', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('adv-chip-timehistory').click();
    await page.getByTestId('th-steps').fill('100');
    await page.getByTestId('th-src-y').selectOption('sine');
    await page.getByTestId('th-scale-y').fill('0.5');
    await page.getByTestId('th-add-force').click();
    await page.getByTestId('th-run').click();
    await expect(page.getByTestId('th-chart').first()).toBeVisible({ timeout: 30_000 });
    const d = await data(page, 'setting', 'dynamics');
    expect(d.timeHistory.nSteps).toBe(100);
    expect(d.timeHistory.ground.x.source).toBe('sine');
    expect(d.timeHistory.ground.y).toMatchObject({ source: 'sine', scale: 0.5 });
    expect(d.timeHistory.ground.y.sine).toEqual({ ampG: 0.3, freqHz: 2 });
    expect(d.timeHistory.forces).toHaveLength(1);
    // Closed and opened again, the panel reads the project, not its defaults.
    await page.getByTestId('adv-chip-timehistory').click();
    await page.getByTestId('adv-chip-timehistory').click();
    await expect(page.getByTestId('th-steps')).toHaveValue('100');
    await expect(page.getByTestId('th-scale-y')).toHaveValue('0.5');
  });

  test('a record read in the wrong unit is flagged, and choosing its unit reads it again', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('adv-chip-timehistory').click();
    await page.getByTestId('th-src-x').selectOption('record');
    // A table in cm/s², a 500 gal peak, read while the unit still says g: 500 g.
    const table = Array.from({ length: 50 }, (_, k) => `${(k * 0.01).toFixed(2)} ${k === 10 ? 500 : 0}`).join('\n');
    await page.getByTestId('th-file-x').setInputFiles({ name: 'gal.txt', mimeType: 'text/plain', buffer: Buffer.from(table) });
    await expect(page.getByTestId('th-warning-x-pgaHigh')).toBeVisible();
    await page.getByTestId('th-unit-x').selectOption('cm/s2');
    await expect(page.getByTestId('th-warning-x-pgaHigh')).toHaveCount(0);
    await expect(page.getByTestId('th-record-x')).toContainText(/0[.,]51/);
  });

  test('time-history undo and redo update the editor and survive closing it', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('adv-chip-timehistory').click();
    const steps = page.getByTestId('th-steps');
    const storedSteps = async () => (await data(page, 'setting', 'dynamics'))?.timeHistory.nSteps;
    await steps.fill('120');
    await expect.poll(storedSteps).toBe(120);
    await steps.fill('100');
    await expect.poll(storedSteps).toBe(100);
    await steps.blur();
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(storedSteps).toBe(120);
    await expect(steps).toHaveValue('120');
    await page.keyboard.press(`${mod}+Shift+z`);
    await expect.poll(storedSteps).toBe(100);
    await expect(steps).toHaveValue('100');
    await page.keyboard.press(`${mod}+z`);
    await expect(steps).toHaveValue('120');
    await page.getByTestId('adv-chip-timehistory').click();
    await expect.poll(storedSteps).toBe(120);
    await page.getByTestId('adv-chip-timehistory').click();
    await expect(steps).toHaveValue('120');
    // Closing before the debounce fires still saves a pending edit exactly once.
    await steps.fill('80');
    await page.getByTestId('adv-chip-timehistory').click();
    await expect.poll(storedSteps).toBe(80);
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(storedSteps).toBe(120);
    await page.getByTestId('adv-chip-timehistory').click();
    await expect(steps).toHaveValue('120');
  });

  test('modes until 90 % of the mass', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('modal-auto').check();
    await page.getByTestId('adv-run-modal').click();
    await expect(page.getByTestId('modal-auto-note')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('adv-modal-row-0')).toBeVisible();
  });

  test('advanced analyses refuse semi-rigid ends instead of treating them as rigid', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    // Semi-rigid ends are set under Model › Specifications, members section (its default).
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-specifications').click();
    await expect(page.getByTestId('spec-tab')).toBeVisible();
    await page.evaluate(() => window.__stabileoActions.selectElements([1]));
    await page.getByTestId('mb-semi-i-on').check();
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('adv-run-modal').click();
    await expect(page.locator('.adv-error')).toContainText(/semirrígidas|semi-rigid/);
    await expect(page.getByTestId('adv-modal-row-0')).toHaveCount(0);
    await page.getByTestId('adv-chip-timehistory').click();
    await page.getByTestId('th-run').click();
    await expect(page.locator('.adv-error')).toContainText(/semirrígidas|semi-rigid/);
    await expect(page.getByTestId('th-chart')).toHaveCount(0);
  });

  test('pushover: the capacity curve, the step slider and the hinges on the model', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('adv-chip-nolineal').click();
    await page.locator('.adv-panel').filter({ has: page.locator('select') }).getByRole('button').last().click();
    await expect(page.getByTestId('pushover-view')).toBeVisible({ timeout: 30_000 });
    const readout = page.getByTestId('po-readout');
    await expect(readout).toContainText('λ');
    await page.getByTestId('po-slider').fill('0');
    await expect(readout).toContainText(/Sin carga|Unloaded|Sem carga/);
    await expect(page.getByTestId('po-hinges')).toContainText(/rótula|hinge/i);
    await page.getByTestId('po-slider').fill('1');
    await expect(page.getByTestId('po-hinges')).toContainText(/1/);
    await page.getByTestId('po-show').check();
    expect(await page.evaluate(() => window.__stabileo.diagramType())).toBe('deformed');
  });
});

test.describe('@smoke PRO is a space workspace everywhere', () => {
  test('a member\'s context menu offers turning its local axes, as in Basic 3D', async ({ pro: page }) => {
    // It checked for '3d' alone: PRO, always a space workspace, lost the entry.
    await loadModel(page, '3d-portal-frame');
    await page.evaluate(() => window.__stabileoActions.openContextMenu(1));
    await expect(page.getByTestId('ctx-rotate-local-axes')).toBeVisible();
  });
});
