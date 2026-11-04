import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { buildDxf, dxfCircle, dxfLine } from '../src/lib/cad/__tests__/dxf-fixture';

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * A plan traced on its template with the object snaps a CAD program offers: the member tool takes
 * a line's middle, then its end, each shown with its mark; a snap turned off is not offered; F3
 * turns them all off and on.
 *
 * The plan (cm): a 6 × 5 m frame on VIGAS, a column circle r = 15 cm at its lower-left corner.
 */
const DXF = buildDxf({
  insunits: 5, layers: ['VIGAS', 'PILARES'],
  entities: [
    dxfLine('VIGAS', 0, 0, 600, 0), dxfLine('VIGAS', 600, 0, 600, 500), dxfLine('VIGAS', 600, 500, 0, 500), dxfLine('VIGAS', 0, 500, 0, 0),
    dxfCircle('PILARES', 300, 250, 15),
  ].join('\n'),
});

const screen = (page: Page, x: number, y: number, z: number) => page.evaluate(([a, b, c]) => window.__stabileo.worldScreenPos(a!, b!, c!), [x, y, z]);
const hint = (page: Page) => page.getByTestId('osnap-hint');

test('@smoke a plan traced on its template with the snaps chosen', async ({ pro: page }) => {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-grid').click();
  await page.getByTestId('grid-heights').fill('3');
  await page.getByTestId('grid-generate-levels').click();
  await page.getByTestId('underlay-file').setInputFiles({ name: 'planta.dxf', mimeType: 'application/dxf', buffer: Buffer.from(DXF) });
  await page.getByTestId('underlay-unit').selectOption('cm');
  await page.getByTestId('underlay-level').selectOption({ label: 'N1' });
  await page.getByTestId('underlay-lay').click();

  // Nodes are put at the template's level; then members, by the snaps.
  await page.getByTestId('pr-cmd-nodes').click();
  await page.getByTestId('draw-node').click();
  await page.getByTestId('draw-level').fill('3');
  await page.getByTestId('draw-level').press('Tab');
  await page.getByTestId('pr-cmd-elements').click();
  await page.getByTestId('draw-element').click();

  // Near the bottom line's middle: the midpoint, with its mark; a click puts the node there.
  const mid = (await screen(page, 3, 0, 3))!;
  await page.mouse.move(mid.x + 4, mid.y + 3);
  await expect(hint(page)).toHaveAttribute('data-mode', 'midpoint');
  await page.mouse.click(mid.x + 4, mid.y + 3);
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(1);
  const first = await page.evaluate(() => window.__stabileo.nodePosition(window.__stabileo.nodeIds()[0]!));
  expect(first!.x).toBeCloseTo(3, 6); expect(first!.y).toBeCloseTo(0, 6); expect(first!.z).toBeCloseTo(3, 6);

  // Its end: a second node, and the member between them.
  const end = (await screen(page, 6, 0, 3))!;
  await page.mouse.move(end.x - 3, end.y + 4);
  await expect(hint(page)).toHaveAttribute('data-mode', 'endpoint');
  await page.mouse.click(end.x - 3, end.y + 4);
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(1);

  // The column's centre is a centre (its quadrants, 15 cm off, are as close on screen: the nearest
  // point is taken, so the pointer is put on it); the midpoint turned off is not offered any more.
  const c = (await screen(page, 3, 2.5, 3))!;
  await page.mouse.move(c.x, c.y);
  await expect(hint(page)).toHaveAttribute('data-mode', 'center');
  await page.getByTestId('osnap-menu').locator('summary').click();
  await page.getByTestId('osnap-mode-midpoint').uncheck();
  await page.mouse.move(mid.x + 4, mid.y + 3 - 30);
  await page.mouse.move((await screen(page, 3, 5, 3))!.x + 4, (await screen(page, 3, 5, 3))!.y + 3);
  await expect(hint(page)).toHaveCount(0);
  // Remembered per browser.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stabileo-osnap') ?? '[]'))).not.toContain('midpoint');

  // F3: all off, then on again, on a corner with no node yet (a node there is taken before a snap).
  await page.getByTestId('osnap-menu').locator('summary').click();
  const corner = (await screen(page, 6, 5, 3))!;
  await page.mouse.move(corner.x - 3, corner.y + 4);
  await expect(hint(page)).toHaveAttribute('data-mode', 'endpoint');
  await page.keyboard.press('F3');
  await page.mouse.move(corner.x - 2, corner.y + 5);
  await expect(hint(page)).toHaveCount(0);
  await page.keyboard.press('F3');
  await page.mouse.move(corner.x - 3, corner.y + 4);
  await expect(hint(page)).toHaveAttribute('data-mode', 'endpoint');
});
