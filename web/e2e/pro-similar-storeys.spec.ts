/**
 * Master and similar storeys on a 13-level building with three typical plans: a beam edited on a
 * master reaches its similar storeys and no other, and the edit is undone in one step.
 */
import { test, expect } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

const rel = { tx: false, ry: false, rz: false, my: false, mz: false, t: false };

function building() {
  const nodes: Array<[number, object]> = [], elements: Array<[number, object]> = [];
  const levels: Array<{ id: string; name: string; z: number; similarTo?: string }> = [];
  let nid = 0, eid = 0;
  const node = (x: number, z: number) => { nodes.push([++nid, { id: nid, x, y: 0, z }]); return nid; };
  const el = (i: number, j: number) => { elements.push([++eid, { id: eid, type: 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId: 1, releaseI: rel, releaseJ: rel }]); return eid; };
  const beams: number[] = [];
  let prev: [number, number] | null = null;
  for (let k = 0; k <= 13; k++) {
    const master = k >= 1 && k <= 4 ? 'L1' : k >= 5 && k <= 8 ? 'L5' : k >= 9 && k <= 12 ? 'L9' : undefined;
    levels.push({ id: `L${k}`, name: `N${k}`, z: 3 * k, ...(master && master !== `L${k}` && k !== 4 ? { similarTo: master } : {}) });
    const cur: [number, number] = [node(0, 3 * k), node(6, 3 * k)];
    if (prev) { el(prev[0], cur[0]); el(prev[1], cur[1]); beams[k] = el(cur[0], cur[1]); }
    prev = cur;
  }
  return {
    file: {
      version: '2.0', name: 'Torre', timestamp: '2026-11-02T12:00:00.000Z', analysisMode: 'pro',
      snapshot: {
        localAxisConvention: 'zUpStrongAxis', nodes,
        materials: [[1, { id: 1, name: 'H-30', e: 30000, nu: 0.2, rho: 25, fy: 0 }]],
        sections: [[1, { id: 1, name: 'V20x50', a: 0.1, iz: 2e-3, iy: 3e-4, j: 1e-4, b: 0.2, h: 0.5 }], [2, { id: 2, name: 'V25x60', a: 0.15, iz: 4.5e-3, iy: 7.8e-4, j: 2e-4, b: 0.25, h: 0.6 }]],
        elements, supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 2, type: 'fixed3d' }]],
        loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
        grid: { axes: [], levels },
        nextId: { node: nid + 1, material: 2, section: 3, element: eid + 1, support: 3, load: 1, loadCase: 2, combination: 1 },
      },
    },
    beams,
  };
}

test('@smoke a beam edited on a master storey reaches its similar storeys and no other, undone in one step', async ({ pro: page }) => {
  const { file, beams } = building();
  expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), file)).toBe(true);

  // N4 is made similar to N1 from the levels table: three typical plans of four storeys each.
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-grid').click();
  await page.getByTestId('grid-similar-N4').selectOption('L1');

  await page.getByTestId('storey-scope-similar').click();
  await page.evaluate((id) => window.__stabileoActions.selectElements([id]), beams[1]!);
  await expect(page.getByTestId('storey-scope-note')).toContainText(/3/);

  await page.getByTestId('pr-cmd-elements').click();
  await page.getByTestId('batch-section').selectOption('2');
  const section = (id: number) => page.evaluate((i) => (window.__stabileo.entityData('element', i) as { sectionId: number }).sectionId, id);
  for (const k of [1, 2, 3, 4]) expect(await section(beams[k]!), `N${k}`).toBe(2);
  for (const k of [5, 9, 13]) expect(await section(beams[k]!), `N${k}`).toBe(1);

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  for (const k of [1, 2, 3, 4]) expect(await section(beams[k]!), `N${k} after undo`).toBe(1);
});
