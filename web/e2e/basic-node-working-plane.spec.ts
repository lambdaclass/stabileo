import { test, expect, CURRENT_STAMP } from './fixtures';

test('@smoke a node on another level does not block placement on the working plane', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions);
  expect(await page.evaluate(file => window.__stabileoActions.loadProject(file), {
    version: '2.0', name: 'Upper beam', analysisMode: '3d', timestamp: '2026-01-01T00:00:00.000Z',
    snapshot: {
      solvedWith: CURRENT_STAMP,
      name: 'Upper beam', localAxisConvention: 'zUpStrongAxis',
      nodes: [[1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 4, y: 0, z: 3 }]],
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
        releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false } }]],
      materials: [[1, { id: 1, name: 'Steel', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]],
      sections: [[1, { id: 1, name: 'Beam', a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-5 }]],
      supports: [], loads: [], loadCases: [{ id: 1, type: 'D', name: 'Dead' }], combinations: [],
      nextId: { node: 3, material: 2, section: 2, element: 2, support: 1, load: 1, loadCase: 2,
        combination: 1, plate: 1, quad: 1, group: 1, connector: 1, footing: 1, soilProfile: 1 },
    },
  })).toBe(true);
  await page.getByTestId('cam-menu').click();
  await page.getByRole('button', { name: 'Top view', exact: false }).click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.cameraState()!.polarDeg)).toBeLessThan(5);
  await page.getByTestId('rb-cmd-node').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCreateZ())).toBe(0);
  // Arming the tool opens the data panel, and the narrower canvas is framed again a few frames
  // later: read where node 1 is once it has stopped moving, not where it was.
  let last = '';
  await expect.poll(async () => {
    const p = JSON.stringify(await page.evaluate(() => window.__stabileo.nodeScreenPos(1)));
    const still = p === last && p !== 'null';
    last = p;
    return still;
  }, { intervals: [250] }).toBe(true);
  const top = await page.evaluate(() => window.__stabileo.nodeScreenPos(1));
  expect(top).not.toBeNull();
  await page.mouse.click(top!.x, top!.y);
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(3);
  const created = await page.evaluate(() => window.__stabileo.nodePos(3));
  expect(created!.z).toBeCloseTo(0);
  // Perspective projects this pixel to a different x/y on the ground. Clicking it
  // again must reuse that snapped ground node, without adding a duplicate.
  await page.mouse.click(top!.x, top!.y);
  expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(3);
});
