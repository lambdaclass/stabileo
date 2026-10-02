/**
 * A member of variable section, from Specifications: two sections of one family at its ends, the
 * transition the analysis will use, and a solve that reports the member as one with its diagrams.
 */
import { test, expect } from './fixtures';

const cantilever = {
  version: '2.0', name: 'haunch', timestamp: '2026-01-01T00:00:00.000Z', analysisMode: 'pro',
  snapshot: {
    name: 'haunch', localAxisConvention: 'zUpStrongAxis',
    nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]],
    materials: [[1, { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 240 }]],
    sections: [[1, { id: 1, name: 'IPE 300', a: 0.00538, iy: 8.356e-5, iz: 6.04e-6 }], [2, { id: 2, name: 'IPE 600', a: 0.0156, iy: 9.208e-4, iz: 3.387e-5 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false } }]],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }]],
    loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0, caseId: 1 } }],
    loadCases: [{ id: 1, type: 'D', name: 'Dead Load' }], combinations: [],
    nextId: { node: 3, material: 2, section: 3, element: 2, support: 2, load: 2, loadCase: 2, combination: 1, plate: 1, quad: 1, group: 1, connector: 1, footing: 1, soilProfile: 1 },
  },
};

test.describe('@smoke members of variable section', () => {
  test('two IPE at the ends blend vertex by vertex, and the solve draws its diagram', async ({ pro: page }) => {
    expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), cantilever)).toBe(true);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-specifications').click();
    await page.evaluate(() => window.__stabileoActions.selectElements([1]));
    await page.getByTestId('spec-variable').check();
    await page.getByTestId('spec-variable-j').selectOption('2');
    await expect(page.getByTestId('spec-variable-mode')).toBeVisible();
    await expect(page.getByTestId('spec-variable-table').locator('tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('spec-variable-problem')).toHaveCount(0);
    const entity = await page.evaluate(() => window.__stabileo.entityData('element', 1)) as { variableSection?: { sectionJ: number } };
    expect(entity.variableSection?.sectionJ).toBe(2);

    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-solve').click();
    const my = page.getByTestId('pr-cmd-momentY');
    await expect(my).toBeEnabled();
    await my.click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.diagramMembers())).toBeGreaterThan(0);
  });
});
