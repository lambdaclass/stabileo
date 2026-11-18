import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * A beam too small for its loads: the sheets say no reinforcement is possible with its section and
 * concrete, offer the section it verifies with, apply it to the model from the row, and designed
 * again after solving, the beam verifies with a section of its own.
 */
test.use({ appLocale: 'es' });

test('@smoke a beam with no reinforcement possible is offered a section, applied from the sheets', async ({ pro: page }) => {
  await loadModel(page, 'rc-beam-flexure');
  await page.evaluate(() => {
    const snap = JSON.parse(window.__stabileo.serializeProject()).snapshot as { elements: Array<[number, { sectionId: number }]> };
    const sid = snap.elements[0]![1].sectionId;
    window.__stabileoActions.updateSection(sid, { b: 0.15, h: 0.25, a: 0.0375, iy: (0.15 * 0.25 ** 3) / 12, iz: (0.25 * 0.15 ** 3) / 12 });
  });
  await solveModel(page);

  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('rc-design').click();
  await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('rc-open-beam').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  const row = ws.getByTestId('rc-row').first();
  await expect(row.getByTestId('rc-row-status')).toHaveText('Sin armado posible');
  await expect(row.getByTestId('rc-no-arrangement-tag')).toBeVisible();
  await row.click();
  await expect(ws.getByTestId('rc-no-arrangement')).toContainText('no encuentra un armado que verifique');
  await expect(ws.getByTestId('rc-resize-searching')).toHaveCount(0, { timeout: 40_000 });
  const section = ws.locator('[data-testid="rc-alternative"][data-kind="section"]');
  await expect(section).toContainText('15 × 40 cm (hoy 15 × 25 cm)');
  await section.getByTestId('rc-alternative-apply').click();
  await expect(ws).toHaveCount(0);

  const sections = await page.evaluate(() => {
    const snap = JSON.parse(window.__stabileo.serializeProject()).snapshot as { elements: Array<[number, { sectionId: number }]>; sections: Array<[number, { name: string; b?: number; h?: number }]> };
    const ids = new Set(snap.elements.map(([, e]) => e.sectionId));
    return snap.sections.filter(([id]) => ids.has(id)).map(([, s]) => ({ name: s.name.replace(/^\S+ /, ''), b: s.b, h: s.h }));
  });
  expect(sections).toEqual([{ name: '15×40', b: 0.15, h: 0.4 }]);

  await solveModel(page);
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('rc-design').click();
  await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('rc-open-beam').click();
  await expect(ws.getByTestId('rc-row').first().getByTestId('rc-row-status')).not.toHaveText(/No verifica|Sin armado posible/);
});
