import { test, expect, openBasicProjectPanel } from './fixtures';

// A cantilever above Euler's critical load can converge on an indefinite
// stiffness matrix. Convergence must not turn that into a stable result.
function postcriticalColumn(mode: '2d' | '3d') {
  const n = 8, length = 5, e = 200_000, inertia = 1e-4;
  const pcr = Math.PI ** 2 * e * 1000 * inertia / (4 * length ** 2);
  return {
    version: '2.0', name: 'Postcritical column', analysisMode: mode,
    snapshot: {
      name: 'Postcritical column',
      nodes: Array.from({ length: n + 1 }, (_, i) => [i + 1, {
        id: i + 1, x: 0, y: mode === '2d' ? length * i / n : 0,
        z: mode === '3d' ? length * i / n : 0,
      }]),
      elements: Array.from({ length: n }, (_, i) => [i + 1, {
        id: i + 1, type: 'frame', nodeI: i + 1, nodeJ: i + 2,
        materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {},
      }]),
      materials: [[1, { id: 1, name: 'Steel', e, nu: 0.3, rho: 0 }]],
      sections: [[1, { id: 1, name: 'Column', a: 0.01, iy: inertia, iz: inertia, j: inertia }]],
      supports: [[1, { id: 1, nodeId: 1, type: mode === '2d' ? 'fixed' : 'fixed3d' }]],
      loads: [{ type: mode === '2d' ? 'nodal' : 'nodal3d', data: {
        id: 1, nodeId: n + 1, fx: 1, fy: 0, fz: -1.5 * pcr, mx: 0, my: 0, mz: 0,
      } }],
      nextId: { node: 10, element: 9, material: 2, section: 2, support: 2, load: 2 },
    },
  };
}

test.describe('@smoke P-Delta stability', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  });

  for (const mode of ['2d', '3d'] as const) {
    test(`reports a converged postcritical ${mode} column as unstable`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await openBasicProjectPanel(page);
      await page.getByTestId('project-open-file').setInputFiles({
        name: 'postcritical.ded', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(postcriticalColumn(mode))),
      });
      await page.getByTestId('rb-cmd-advanced').click();
      await page.locator('button.adv-btn', { hasText: 'P-Δ' }).click();
      await expect(page.getByTestId('pdelta-result')).toContainText('B₂ = ∞');
      await expect(page.getByTestId('pdelta-result')).toContainText('unstable');
      await expect(page.getByText('Unstable structure (P-Δ)', { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('runs P-Delta with prescribed support settlements', async ({ page }) => {
    await page.evaluate(() => window.__stabileoActions.loadExample('settlement'));
    await page.getByTestId('rb-cmd-advanced').click();
    await page.locator('button.adv-btn', { hasText: 'P-Δ' }).click();
    await expect(page.getByTestId('pdelta-result')).toContainText('B₂ = 1.000');
    await expect(page.getByTestId('pdelta-result')).not.toContainText('unstable');
    await expect(page.getByText(/P-Δ converged in/)).toBeVisible();
  });
});
