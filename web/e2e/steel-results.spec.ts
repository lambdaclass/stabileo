/**
 * The CIRSOC 301 results screen as a user reaches it: every steel member with every check the
 * engine ran, its ratio, the governing check, the status — pass, fail or not evaluated with the
 * reason — the proven-bound badge from the engine gate, and the calculation in the interface
 * language. An angle strut is not evaluated until its end condition (E.5) is stated.
 */
import { test, expect, designPlace, CURRENT_STAMP } from './fixtures';

test.use({ viewport: { width: 1400, height: 1000 } });

const project = {
  version: '2.0', name: 'Steel results', analysisMode: 'pro',
  snapshot: {
    solvedWith: CURRENT_STAMP,
    nodes: [
      [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 3, y: 0, z: 0 }],
      [3, { id: 3, x: 0, y: 2, z: 4 }], [4, { id: 4, x: 0, y: 2, z: 0 }],
      [5, { id: 5, x: 5, y: 0, z: 0 }], [6, { id: 6, x: 5, y: 0, z: 2 }],
    ],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1 }],
      [3, { id: 3, type: 'frame', nodeI: 5, nodeJ: 6, materialId: 1, sectionId: 2 }],
    ],
    materials: [[1, { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235, fu: 360 }]],
    sections: [
      [1, { id: 1, name: 'IPE 200', profileFamily: 'IPE', shape: 'I', a: 28.5e-4, iy: 1943e-8, iz: 142e-8, j: 6.98e-8, h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085 }],
      [2, { id: 2, name: 'L 80x80x8', profileFamily: 'L', shape: 'L', a: 12.3e-4, iy: 72.2e-8, iz: 72.2e-8, h: 0.08, b: 0.08, t: 0.008 }],
    ],
    supports: [
      [1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 3, type: 'fixed3d' }], [3, { id: 3, nodeId: 5, type: 'fixed3d' }],
    ],
    loads: [
      { type: 'nodal3d', data: { id: 1, nodeId: 2, caseId: 1, fx: 0, fy: 0, fz: -5, mx: 0, my: 0, mz: 0 } },
      { type: 'nodal3d', data: { id: 2, nodeId: 4, caseId: 1, fx: 0, fy: 0, fz: -50, mx: 0, my: 0, mz: 0 } },
      { type: 'nodal3d', data: { id: 3, nodeId: 6, caseId: 1, fx: 0, fy: 0, fz: -20, mx: 0, my: 0, mz: 0 } },
    ],
    loadCases: [{ id: 1, name: 'Dead', type: 'D' }],
    combinations: [{ id: 1, name: '1.0D', factors: [{ caseId: 1, factor: 1 }] }],
    nextId: { node: 7, element: 4, material: 2, section: 3, support: 4, load: 4, loadCase: 2, combination: 2 },
  },
};

test('every steel member with every CIRSOC 301 check, from the engine', async ({ pro: page }) => {
  await page.getByTestId('pr-project').click();
  await page.getByTestId('pp-open-file').setInputFiles({
    name: 'steel.ded', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect.poll(() => page.evaluate(() => { const c = window.__stabileo.modelCensus(); return `${c.nodes}/${c.elements}/${c.loads}`; })).toBe('6/3/3');
  await page.evaluate(async () => { await window.__stabileoActions.solve(); });
  await page.getByTestId('pr-stage-design').click();
  await designPlace(page, 'steel');
  await expect(page.getByTestId('pro-steel-workflow')).toBeVisible();

  const table = page.getByTestId('steel-results');
  await table.scrollIntoViewIfNeeded();

  // The cantilever beam: evaluated, governed by strong-axis flexure, and its pass carries the
  // engine's proven bound.
  const beam = page.getByTestId('steel-result-1');
  await expect(beam).toHaveAttribute('data-status', 'pass');
  await expect(beam).toContainText('Flexure, strong axis (F)');
  await expect(page.getByTestId('steel-result-proven-1')).toContainText('Proven bound');
  await page.getByTestId('steel-result-open-1').click();
  await expect(page.getByTestId('steel-check-1-flexureStrong')).toContainText('F.2');
  await expect(page.getByTestId('steel-check-1-shear')).toContainText('G.2');
  await expect(page.getByTestId('steel-result-pre-1')).toContainText('Flexure, strong axis');
  await expect(page.getByTestId('steel-result-pre-1')).not.toContainText('Flexión');
  await page.screenshot({ path: 'test-results/steel-results-beam.png', fullPage: false });

  // The hanger: tension NOT EVALUATED without its end connection, with the reason.
  const hanger = page.getByTestId('steel-result-2');
  await expect(hanger).toHaveAttribute('data-status', 'notEvaluated');
  await page.getByTestId('steel-result-open-2').click();
  await expect(page.getByTestId('steel-check-why-2-tension')).toContainText('end connection is missing');

  // The angle strut: compression NOT EVALUATED until E.5 is stated.
  const strut = page.getByTestId('steel-result-3');
  await expect(strut).toHaveAttribute('data-status', 'notEvaluated');
  await page.getByTestId('steel-result-open-3').click();
  await expect(page.getByTestId('steel-check-why-3-compression')).toContainText('§E.5');
  await page.screenshot({ path: 'test-results/steel-results-angle-refused.png', fullPage: false });

  await page.evaluate(() => window.__stabileoActions.selectElements([3]));
  const editor = page.getByTestId('angle-editor');
  await editor.scrollIntoViewIfNeeded();
  await editor.getByTestId('angle-condition').selectOption('e5aLong');
  await editor.getByTestId('angle-apply').click();
  await expect(page.getByTestId('angle-now-3')).toContainText('E.5(a)');
  // A member edit retires the results on hand: re-solve.
  await page.evaluate(async () => { await window.__stabileoActions.solve(); });
  await table.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('steel-result-3')).not.toHaveAttribute('data-status', 'notEvaluated');
  // Its detail is still open from before.
  await expect(page.getByTestId('steel-check-3-compression')).toContainText(/E\.5|E\.4/);
  await expect(page.getByTestId('steel-result-pre-3')).toContainText('(kL/r)m');
  await page.screenshot({ path: 'test-results/steel-results-angle.png', fullPage: false });
});
