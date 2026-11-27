import { test as it, expect, CURRENT_STAMP, type Page } from './fixtures';
import { openAdvancedFunction } from './advanced-panel';

async function openPointLoadedCantilever(page: Page, mode: '2d' | '3d', native: boolean,
  load: { p: number; px?: number; my?: number; isGlobal?: boolean } = { p: 0, px: 10, isGlobal: true },
) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => window.__stabileo?.solverReady());
  const loaded = await page.evaluate(({ mode, native, load, stamp }) => window.__stabileoActions.loadProject({
    version: '2.0', name: 'Point-loaded cantilever', analysisMode: mode,
    snapshot: {
      solvedWith: stamp,
      ...(mode === '2d' ? { drawPlane2D: 'xy' } : {}),
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 4, z: 0 }]],
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
      materials: [[1, { id: 1, name: 'Test material', e: 200000, nu: 0.3, rho: 0 }]],
      sections: [[1, { id: 1, name: 'Test section', a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]],
      supports: [[1, { id: 1, nodeId: 1, type: native ? 'fixed3d' : 'fixed' }]],
      loads: [{ type: 'pointOnElement', data: { id: 1, elementId: 1, a: 1, ...load } }],
      nextId: { node: 3, element: 2, material: 2, section: 2, support: 2, load: 2 },
    },
  }), { mode, native, load, stamp: CURRENT_STAMP });
  expect(loaded).toBe(true);
}

async function openReport(page: Page, nonlinear: boolean) {
  if (nonlinear) {
    await openAdvancedFunction(page, 'pdelta');
    await expect(page.getByText(/P-Δ converged in/)).toBeVisible();
    await page.getByTestId('rb-cmd-deformed').click();
  }
  const project = page.locator('[data-testid="basic-panel"][data-panel="project"]');
  if (!(await project.isVisible())) await page.getByTestId('hdr-project').click();
  await page.getByTestId('export-report').click();
  const dialog = page.getByTestId('calc-report-dialog');
  await expect(dialog).toBeVisible();
  const [report] = await Promise.all([page.waitForEvent('popup'), dialog.getByTestId('calc-report-generate').click()]);
  await expect(report.locator('#sec-loads')).toBeVisible();
  return report;
}

async function expectPointLoadInSolverPlane(report: Page, axis: 'y' | 'z', mode: '2d' | '3d') {
  const reactions = report.locator('.page', { has: report.locator('#sec-reactions') });
  const headers = mode === '3d' ? ['Node', 'Fx (kN)', 'Fy (kN)', 'Fz (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Mz (kN·m)']
    : ['Node', 'Rx (kN)', 'Rz (kN)', 'My (kN·m)'];
  await expect(reactions.locator('th')).toHaveText(headers);
  const fixed = reactions.locator('tr').nth(1).locator('td');
  const expected = mode === '2d' ? [1, 0, -10, 0]
    : axis === 'y' ? [1, 0, -10, 0, 0, 0, 0] : [1, 0, 0, -10, 0, 0, 0];
  expect((await fixed.allTextContents()).map(Number)).toEqual(expected);
  const load = report.locator('.page', { has: report.locator('#sec-loads') })
    .getByRole('row').filter({ has: report.getByRole('cell', { name: 'pointOnElement', exact: true }) });
  await expect(load.locator('td').nth(2)).toHaveText(`Member 1: P${axis}=10 kN, a=1 m, global axes`, { timeout: 2000 });
}

for (const nonlinear of [false, true]) {
  it.describe(`@smoke Basic point-load report (P-Delta=${nonlinear})`, () => {
    it('#2370 a legacy axial point load on a native spatial Y member reports Py', async ({ page }) => {
      await openPointLoadedCantilever(page, '3d', true);
      await expectPointLoadInSolverPlane(await openReport(page, nonlinear), 'y', '3d');
    });

    for (const mode of ['2d', '3d'] as const) {
      it(`a legacy axial point load on a planar member reports Pz in ${mode}`, async ({ page }) => {
        await openPointLoadedCantilever(page, mode, false);
        await expectPointLoadInSolverPlane(await openReport(page, nonlinear), 'z', mode);
      });
    }
  });
}

for (const nonlinear of [false, true]) {
  it.describe(`@smoke Basic point-couple report (P-Delta=${nonlinear})`, () => {
    for (const isGlobal of [false, true]) {
      it(`#2370 the embedded XZ point couple balances in spatial axes (global=${isGlobal})`, async ({ page }) => {
        await expectPointCoupleBalance(page, '3d', false, nonlinear, isGlobal, 'y', -5);
      });

      it(`a native XY point couple balances about Z (global=${isGlobal})`, async ({ page }) => {
        await expectPointCoupleBalance(page, '3d', true, nonlinear, isGlobal, 'z', 5);
      });

      it(`a 2D point couple balances in the planar convention (global=${isGlobal})`, async ({ page }) => {
        await expectPointCoupleBalance(page, '2d', false, nonlinear, isGlobal, 'y', 5);
      });
    }
  });
}

async function expectPointCoupleBalance(
  page: Page, mode: '2d' | '3d', native: boolean, nonlinear: boolean, isGlobal: boolean, axis: 'y' | 'z', moment: number,
) {
  await openPointLoadedCantilever(page, mode, native, { p: 0, my: 5, isGlobal });
  const report = await openReport(page, nonlinear);
  const reactions = report.locator('.page', { has: report.locator('#sec-reactions') });
  await expect(reactions.locator('th')).toHaveText(mode === '3d'
    ? ['Node', 'Fx (kN)', 'Fy (kN)', 'Fz (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Mz (kN·m)']
    : ['Node', 'Rx (kN)', 'Rz (kN)', 'My (kN·m)']);
  const expected = mode === '2d' ? [1, 0, 0, -moment]
    : [1, 0, 0, 0, 0, axis === 'y' ? -moment : 0, axis === 'z' ? -moment : 0];
  const actual = (await reactions.locator('tr').nth(1).locator('td').allTextContents()).map(Number);
  expect(actual).toEqual(expected);

  const load = report.locator('.page', { has: report.locator('#sec-loads') })
    .getByRole('row').filter({ has: report.getByRole('cell', { name: 'pointOnElement', exact: true }) });
  const description = await load.locator('td').nth(2).textContent();
  expect.soft(description).toBe(`Member 1: M${axis}=${moment} kN·m, a=1 m${isGlobal ? ', global axes' : ''}`);
  const axes = mode === '2d' ? ['y'] : ['x', 'y', 'z'];
  const reactionMoments = actual.slice(-axes.length);
  const residual = axes.map((axis, index) => reactionMoments[index]! + Number(description?.match(new RegExp(`M${axis}=([^ ]+)`))?.[1] ?? 0));
  expect(residual).toEqual(axes.map(() => 0));
}
