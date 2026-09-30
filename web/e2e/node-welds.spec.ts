import { test, expect, openBasicProjectPanel } from './fixtures';
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('@smoke a fallback paste keeps the existing support at a welded destination', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions);
  await openBasicProjectPanel(page);
  const project = {
    version: '2.0', name: 'Paste support', analysisMode: '2d',
    snapshot: {
      name: 'Paste support',
      nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }], [3, { id: 3, x: 1, y: 1 }]],
      elements: [[1, { id: 1, nodeI: 1, nodeJ: 2, type: 'frame', materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
      materials: [[1, { id: 1, name: 'Steel', e: 200000, nu: 0.3, rho: 0 }]],
      sections: [[1, { id: 1, name: 'Beam', a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]],
      supports: [[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: 3, type: 'fixed', dz: 0.005 }], [3, { id: 3, nodeId: 2, type: 'rollerX' }]],
      loads: [], nextId: { node: 4, element: 2, material: 2, section: 2, support: 4, load: 1 },
    },
  };
  await page.getByTestId('project-open-file').setInputFiles({ name: 'paste.ded', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(3);
  const before = await page.evaluate(() => window.__stabileo.entityData('support', 2));
  await page.evaluate(() => { window.__stabileoActions.selectElements([1]); (document.activeElement as HTMLElement)?.blur(); });
  await page.keyboard.press(`${mod}+x`);
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(0);
  const undoBefore = await page.evaluate(() => window.__stabileo.undoCount());
  await page.keyboard.press(`${mod}+v`);
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(1);
  expect(await page.evaluate(() => window.__stabileo.entityData('support', 2))).toEqual(before);
  expect(await page.evaluate(() => window.__stabileo.entityData('support', 4))).toMatchObject({ nodeId: 4, type: 'rollerX' });
  expect(await page.evaluate(() => window.__stabileo.undoCount())).toBe(undoBefore + 1);
  await page.keyboard.press(`${mod}+z`);
  expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(3);
  expect(await page.evaluate(() => window.__stabileo.entityData('support', 2))).toEqual(before);
  await page.keyboard.press(`${mod}+Shift+z`);
  expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(4);
  expect(await page.evaluate(() => window.__stabileo.entityData('support', 2))).toEqual(before);
});

test('@smoke a coordinate paste validates every row before changing the model', async ({ pro: page }) => {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-nodes').click();
  const undoBefore = await page.evaluate(() => window.__stabileo.undoCount());
  const paste = async (text: string) => page.locator('.pro-nodes-table-wrap').evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData('text', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, text);
  for (const invalid of ['bad\t3\t0', '2\t3\tbad', 'Infinity\t3\t0', '2']) {
    await paste(`1\t2\t0\n${invalid}\n4\t5\t0`);
    await expect(page.locator('.pro-paste-error')).toBeVisible();
    expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(0);
    expect(await page.evaluate(() => window.__stabileo.undoCount())).toBe(undoBefore);
  }
  await paste('1\t2\t0\n1\t2\t0\n4\t5');
  await expect(page.locator('.pro-paste-error')).toHaveCount(0);
  await expect(page.locator('.pro-nodes-table tbody tr')).toHaveCount(2);
  expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(2);
  expect(await page.evaluate(() => window.__stabileo.undoCount())).toBe(undoBefore + 1);
  await page.keyboard.press(`${mod}+z`);
  expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(0);
});

test('@smoke a new node can share X and Y while the user is still entering Z', async ({ pro: page }) => {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-nodes').click();
  await page.locator('.pro-nodes-table-wrap').evaluate((el) => {
    const data = new DataTransfer(); data.setData('text', '0\t0\t0');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(1);
  await page.getByTestId('pro-add-node').click();
  const row = page.locator('.pro-nodes-table tbody tr').last();
  await row.locator('input[data-col="x"]').fill('0');
  await row.locator('input[data-col="y"]').fill('0');
  await row.locator('input[data-col="y"]').press('Tab');
  await expect(page.locator('.pro-nodes-table tbody tr')).toHaveCount(2);
  await row.locator('input[data-col="z"]').fill('3');
  await row.locator('input[data-col="z"]').blur();
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(2);
  // Explicitly confirming a complete duplicate still welds, rather than adding a twin.
  await page.getByTestId('pro-add-node').click();
  await row.locator('input[data-col="x"]').fill('0');
  await row.locator('input[data-col="y"]').fill('0');
  await row.locator('input[data-col="z"]').fill('3');
  await row.locator('input[data-col="z"]').blur();
  await expect(page.locator('.pro-nodes-table tbody tr')).toHaveCount(2);
  expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(2);
});

test('@smoke a second fallback paste welds onto the first without stacking a member', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions);
  await openBasicProjectPanel(page);
  const project = {
    version: '2.0', name: 'Paste twice', analysisMode: '2d',
    snapshot: {
      name: 'Paste twice',
      nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]],
      elements: [[1, { id: 1, nodeI: 1, nodeJ: 2, type: 'frame', materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
      materials: [[1, { id: 1, name: 'Steel', e: 200000, nu: 0.3, rho: 0 }]],
      sections: [[1, { id: 1, name: 'Beam', a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]],
      supports: [], loads: [], nextId: { node: 3, element: 2, material: 2, section: 2, support: 1, load: 1 },
    },
  };
  await page.getByTestId('project-open-file').setInputFiles({ name: 'twice.ded', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(2);
  await page.evaluate(() => { window.__stabileoActions.selectElements([1]); (document.activeElement as HTMLElement)?.blur(); });
  await page.keyboard.press(`${mod}+x`);
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(0);
  await page.keyboard.press(`${mod}+v`);
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(1);
  await page.keyboard.press(`${mod}+v`);
  // The second paste lands on the first: the same two nodes, and no second member on them.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(1);
});

test('@smoke a new row is kept when focus leaves it through its own delete button', async ({ pro: page }) => {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-nodes').click();
  await page.getByTestId('pro-add-node').click();
  const row = page.locator('.pro-nodes-table tbody tr').last();
  await row.locator('input[data-col="x"]').fill('1');
  await row.locator('input[data-col="y"]').fill('2');
  await row.locator('input[data-col="z"]').fill('3');
  await row.locator('input[data-col="z"]').press('Tab');
  // Focus is on the row's × now; leaving it for anything else commits the row.
  await page.locator('.pro-nodes-table thead').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(1);
});

test('@smoke moving a node onto another through its row joins them', async ({ pro: page }) => {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-nodes').click();
  await page.locator('.pro-nodes-table-wrap').evaluate((el) => {
    const data = new DataTransfer(); data.setData('text', '1\t2\t0\n4\t5\t0');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(2);
  const row = page.locator('.pro-nodes-table tbody tr').nth(1);
  await row.locator('input[data-col="x"]').fill('1');
  await row.locator('input[data-col="y"]').fill('2');
  await row.locator('input[data-col="y"]').blur();
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(1);
});
