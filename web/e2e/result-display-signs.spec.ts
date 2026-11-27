import { test as it, expect, CURRENT_STAMP, type Page } from './fixtures';
import { openAdvancedFunction } from './advanced-panel';

type Mode = '2d' | '3d';
type Vector = [number, number, number];

async function openCantilever(page: Page, mode: Mode, force: Vector, couple: Vector) {
  await page.goto('/app/basic?e2e=1');
  const loaded = await page.evaluate(({ mode, force, couple, stamp }) => {
    const [fx, fy, fz] = force, [mx, my, mz] = couple;
    return window.__stabileoActions.loadProject({
      version: '2.0', name: 'Reaction display cantilever', analysisMode: mode,
      snapshot: {
        solvedWith: stamp,
        ...(mode === '2d' ? { drawPlane2D: 'xy' } : {}),
        nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]],
        elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
        materials: [[1, { id: 1, name: 'Test material', e: 200000, nu: 0.3, rho: 0 }]],
        sections: [[1, { id: 1, name: 'Test section', a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]],
        supports: [[1, { id: 1, nodeId: 1, type: mode === '2d' ? 'fixed' : 'fixed3d' }]],
        loads: [{ type: mode === '2d' ? 'nodal' : 'nodal3d', data: { id: 1, nodeId: 2, fx, fy, fz, mx, my: mode === '2d' ? -my : my, mz } }],
        nextId: { node: 3, element: 2, material: 2, section: 2, support: 2, load: 2 },
      },
    });
  }, { mode, force, couple, stamp: CURRENT_STAMP });
  expect(loaded).toBe(true);
}

async function reactionRow(page: Page, mode: Mode) {
  const tabs = page.locator('.results-sub-tabs');
  await tabs.getByRole('button', { name: 'Reactions', exact: true }).click();
  const results = page.locator('.results-content');
  await expect(results.locator('th').allTextContents()).resolves.toEqual(mode === '3d'
    ? ['Node', 'Rx (kN)', 'Ry (kN)', 'Rz (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Mz (kN·m)']
    : ['Node', 'Rx (kN)', 'Rz (kN)', 'My (kN·m)']);
  await expect(results.locator('tbody tr')).toHaveCount(1);
  const [id, ...values] = (await results.locator('tbody td').allTextContents()).map(Number);
  expect(id).toBe(1);
  return values;
}

it.describe('@smoke Basic reaction display equilibrium', () => {
  it('#2370 the 3D reaction table balances all three applied tip couples', async ({ page }) => {
    const couple: Vector = [2, -3, 4];
    await openCantilever(page, '3d', [0, 0, 0], couple);
    await page.getByTestId('rb-cmd-solve').click();
    const row = await reactionRow(page, '3d');
    expect(row.slice(0, 3).map(value => value + 0)).toEqual([0, 0, 0]);
    expect(row.slice(3).map((value, index) => value + couple[index]!)).toEqual([0, 0, 0]);
  });

  for (const mode of ['2d', '3d'] as const) {
    for (const nonlinear of [false, true]) {
      it(`#2370 all ${mode} reaction columns balance the applied force and couple (P-Delta=${nonlinear})`, async ({ page }) => {
        const force: Vector = [nonlinear ? 0 : 5, mode === '3d' ? 2 : 0, -3];
        const couple: Vector = [mode === '3d' ? 2 : 0, -3, mode === '3d' ? 4 : 0];
        await openCantilever(page, mode, force, couple);
        if (nonlinear) {
          await openAdvancedFunction(page, 'pdelta');
          await expect(page.getByText(/P-Δ converged in/)).toBeVisible();
          await page.getByTestId('rb-cmd-deformed').click();
        } else {
          await page.getByTestId('rb-cmd-solve').click();
        }
        const row = await reactionRow(page, mode);
        const tipWrench = mode === '3d'
          ? [...force, couple[0], couple[1] - 4 * force[2], couple[2] + 4 * force[1]]
          : [force[0], force[2], couple[1] - 4 * force[2]];
        row.forEach((value, index) => expect(value + tipWrench[index]!).toBeCloseTo(0, 4));
      });
    }
  }
});
