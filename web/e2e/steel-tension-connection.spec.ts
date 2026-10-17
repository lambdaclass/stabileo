/**
 * Tension rupture from the end connection, as a user reaches it: a hanger in tension is NOT
 * EVALUATED until its ends are described; "Add the end connection" selects it, the editor
 * previews An, U and Ae, Apply writes both ends, and the rupture ratio appears.
 */
import { test, expect } from './fixtures';

test.use({ viewport: { width: 1400, height: 1000 } });

const project = {
  version: '2.0', name: 'Hanger in tension', analysisMode: 'pro',
  snapshot: {
    nodes: [[1, { id: 1, x: 0, y: 0, z: 4 }], [2, { id: 2, x: 0, y: 0, z: 0 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    materials: [[1, { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235, fu: 360 }]],
    sections: [[1, {
      id: 1, name: 'IPE 200', profileFamily: 'IPE', shape: 'I', a: 28.5e-4, iy: 1943e-8, iz: 142e-8, j: 6.98e-8,
      h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085,
    }]],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }]],
    loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 2, caseId: 1, fx: 0, fy: 0, fz: -300, mx: 0, my: 0, mz: 0 } }],
    loadCases: [{ id: 1, name: 'Dead', type: 'D' }],
    combinations: [{ id: 1, name: '1.0D', factors: [{ caseId: 1, factor: 1 }] }],
    nextId: { node: 3, element: 2, material: 2, section: 2, support: 2, load: 2, loadCase: 2, combination: 2 },
  },
};

test('a tension member is not evaluated until its end connection is described', async ({ pro: page }) => {
  await page.getByTestId('pr-project').click();
  await page.getByTestId('pp-open-file').setInputFiles({
    name: 'hanger.ded', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
  });
  // The file opens asynchronously: solve only once the model is in.
  await expect.poll(() => page.evaluate(() => { const c = window.__stabileo.modelCensus(); return `${c.nodes}/${c.elements}/${c.loads}`; })).toBe("2/1/1");
  await page.evaluate(async () => { await window.__stabileoActions.solve(); });
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-steel').click();
  await expect(page.getByTestId('pro-steel-workflow')).toBeVisible();

  const row = page.getByTestId('tc-result-1');
  await row.scrollIntoViewIfNeeded();
  await expect(row).toHaveAttribute('data-state', 'missing');
  await expect(row).toContainText(/#1 I/);
  await page.screenshot({ path: 'test-results/tension-not-evaluated.png', fullPage: false });

  // The action selects the member and brings the editor into view.
  await page.getByTestId('tc-result-add-1').click();
  const editor = page.getByTestId('tc-editor').first();
  await expect(editor.getByTestId('tc-stored')).toContainText('1');

  await editor.getByTestId('tc-preset').selectOption('iFlangesBolted');
  await expect(editor.getByTestId('tc-connected')).toHaveValue('flanges');
  // Nothing invented: the preview names what is missing.
  await expect(editor.getByTestId('tc-preview-refused-1')).toBeVisible();
  await editor.getByTestId('tc-diameter').fill('16');
  await editor.getByTestId('tc-bolts').fill('3');
  await editor.getByTestId('tc-pitch').fill('50');
  // IPE 200, 2 lines per flange of 3 × M16 at 50: An = 2170, U = 0,769, Ae = 1670 mm².
  await expect(editor.getByTestId('tc-preview-1')).toContainText('2170');
  await expect(editor.getByTestId('tc-preview-1')).toContainText('0.769');
  await expect(editor.getByTestId('tc-preview-1')).toContainText('1670');
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/tension-editor.png', fullPage: false });
  await editor.getByTestId('tc-apply').click();
  // Writing a member property retires the results on hand, as every member edit does: re-solve.
  await expect(page.getByTestId('tc-results-solve')).toBeVisible();
  await page.evaluate(async () => { await window.__stabileoActions.solve(); });

  await row.scrollIntoViewIfNeeded();
  await expect(row).toHaveAttribute('data-state', 'ok');
  // φPn = 0,75·360·1669,7 = 450,8 kN; 300/450,8 = 67 %
  await expect(page.getByTestId('tc-result-ratio-1')).toContainText('67');
  await page.getByTestId('tc-result-steps-1').click();
  await expect(page.getByTestId('tc-result-pre-1')).toContainText('D.3.2');
  await expect(page.getByTestId('tc-result-pre-1')).toContainText('B.4.2.2');
  // In the interface language, not the checker's Spanish log.
  await expect(page.getByTestId('tc-result-pre-1')).toContainText('Yield on the gross section');
  await expect(page.getByTestId('tc-result-pre-1')).toContainText('Member 1, end J');
  await expect(page.getByTestId('tc-result-pre-1')).not.toContainText('Fluencia');
  await expect(page.getByTestId('tc-result-phipn-1')).toHaveText('450.8 kN');
  await page.screenshot({ path: 'test-results/tension-evaluated.png', fullPage: false });
});
