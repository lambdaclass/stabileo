import { test, expect, CURRENT_STAMP } from './fixtures';

for (const mode of ['2d', '3d'] as const) {
  for (const alpha of [0, -5e-6, 5e-6, undefined]) {
    test(`@smoke #2656 Basic ${mode} displays the free expansion of a project with α=${alpha}`, async ({ page }) => {
      await page.goto('/app/basic?e2e=1');
      await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
      const loaded = await page.evaluate(({ mode, alpha, stamp }) => window.__stabileoActions.loadProject({
        version: '2.0', name: 'Free expansion', analysisMode: mode,
        snapshot: {
          solvedWith: stamp, drawPlane2D: 'xy',
          nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]],
          elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
          materials: [[1, { id: 1, name: 'Thermal specimen', userDefined: true, e: alpha === undefined ? 70000 : 30000, nu: 0.2, rho: 25, alpha }]],
          sections: [[1, { id: 1, name: 'Section', a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]],
          supports: [[1, { id: 1, nodeId: 1, type: mode === '2d' ? 'fixed' : 'fixed3d' }]],
          loads: [{ type: 'thermal', data: { id: 1, elementId: 1, dtUniform: 20, dtGradient: 0 } }],
          nextId: { node: 3, element: 2, material: 2, section: 2, support: 2, load: 2 },
        },
      }), { mode, alpha, stamp: CURRENT_STAMP });
      expect(loaded).toBe(true);
      await page.getByTestId('rb-cmd-solve').click();
      await page.locator('.results-sub-tabs').getByRole('button', { name: 'Displacements', exact: true }).click();
      const table = page.locator('.results-content table');
      await expect(table.locator('th').nth(1)).toContainText('(mm)');
      const tip = table.locator('tbody tr').filter({ has: page.getByRole('cell', { name: '2', exact: true }) });
      const cell = tip.locator('td').nth(1);
      await expect(cell).toHaveText(/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i);
      expect(Number(await cell.innerText())).toBeCloseTo((alpha ?? 12e-6) * 20 * 4 * 1000, 9);
    });
  }
}
