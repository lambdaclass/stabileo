import { test, expect, ribbonCmd } from './fixtures';
import type { Page } from '@playwright/test';
import { simplePlanDxf } from '../src/lib/cad/__tests__/dxf-fixture';

test.use({ viewport: { width: 1400, height: 900 } });

type Model = { nodes: Array<[number, { x: number; y: number; z?: number }]>; elements: Array<[number, { nodeI: number; nodeJ: number; offset?: unknown }]>; groups?: Array<[number, { kind: string; data?: Record<string, unknown> }]> };
const model = async (page: Page): Promise<Model> => {
  const p = JSON.parse(await page.evaluate(() => window.__stabileo.serializeProject())) as { snapshot: Model };
  return p.snapshot;
};
const at = async (page: Page, x: number, y: number, z: number) => (await page.evaluate(([a, b, c]) => window.__stabileo.worldScreenPos(a!, b!, c!), [x, y, z]))!;
const click = async (page: Page, x: number, y: number, z: number) => { const s = await at(page, x, y, z); await page.mouse.click(s.x, s.y); };

async function levelsOnly(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await ribbonCmd(page, 'building');
  await page.getByTestId('grid-heights').fill('3');
  await page.getByTestId('grid-generate-levels').click();
  await page.getByTestId('grid-open-building').click();
  await expect(page.getByTestId('building-tab-columns')).toHaveAttribute('aria-selected', 'true');
}

test.describe('@smoke drawing the building on the plan', () => {
  test('with levels and no axes, columns are drawn on the plan and beams frame into them', async ({ pro: page }) => {
    await levelsOnly(page);

    await page.getByTestId('building-columns-draw').click();
    await expect(page.getByTestId('plan-draw-bar')).toBeVisible();
    await expect(page.getByTestId('plan-view-chip')).toBeVisible();
    await page.getByTestId('plan-draw-fp--1--1').click();
    await click(page, 0, 0, 0);
    await expect(page.getByTestId('plan-draw-step')).toContainText(/opuesta|opposite/i);
    await click(page, 0.4, 0.3, 0);
    await expect.poll(async () => (await model(page)).elements.length).toBe(1);

    await page.getByTestId('plan-draw-mode-point').click();
    await page.getByTestId('plan-draw-fp-0-0').click();
    await click(page, 6, 0, 0);
    await expect.poll(async () => (await model(page)).elements.length).toBe(2);

    let m = await model(page);
    const columns = (m.groups ?? []).filter(([, g]) => g.kind === 'physicalMember' && g.data?.kind === 'column');
    expect(columns.map(([, g]) => g.data?.fixedPoint)).toEqual([[-1, -1], [0, 0]]);
    const corner = m.elements[0]![1];
    expect(corner.offset).toMatchObject({ frame: 'global', i: { x: expect.closeTo(0.2, 1), y: expect.closeTo(0.15, 1) } });

    await page.getByTestId('plan-draw-exit').click();
    await page.getByTestId('building-tab-beams').click();
    await page.getByTestId('building-beams-draw').click();
    await expect(page.getByTestId('plan-draw-bar')).toContainText(/Viga|Beam/);
    await expect(page.getByTestId('building-storey-select').locator('option:checked'), 'the storey stays the one its columns were drawn on').toContainText('N0');
    await expect(page.getByTestId('plan-draw-level'), 'and its beams go on its ceiling').toContainText('N1');
    await page.getByTestId('plan-draw-width').fill('20');
    await page.getByTestId('plan-draw-width').press('Enter');
    await page.getByTestId('plan-draw-height').fill('50');
    await page.getByTestId('plan-draw-height').press('Enter');
    await click(page, 0.2, 0.15, 3);
    await click(page, 6, 0, 3);
    await expect.poll(async () => (await model(page)).elements.length).toBe(3);
    m = await model(page);
    const tops = m.nodes.filter(([, n]) => Math.abs((n.z ?? 0) - 3) < 1e-6).map(([id]) => id).sort();
    const beam = m.elements[2]![1];
    expect([beam.nodeI, beam.nodeJ].sort()).toEqual(tops);

    const hover = await at(page, 6, 2, 3);
    await page.mouse.move(hover.x, hover.y);
    await page.keyboard.type('4');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await model(page)).elements.length).toBe(4);
    m = await model(page);
    const pos = new Map(m.nodes);
    const typed = m.elements[3]![1];
    const [i, j] = [pos.get(typed.nodeI)!, pos.get(typed.nodeJ)!];
    expect(Math.hypot(j.x - i.x, j.y - i.y), 'the length typed').toBeCloseTo(4, 9);
    expect(j.y - i.y, 'towards the pointer').toBeGreaterThan(3.9);
  });

  test('on a DXF template, the corners of its column and the faces of its wall snap exactly, from the level above too', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'building');
    await page.getByTestId('grid-heights').fill('3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('underlay-file').setInputFiles({ name: 'plan.dxf', mimeType: 'application/dxf', buffer: Buffer.from(simplePlanDxf()) });
    await page.getByTestId('underlay-unit').selectOption('m');
    await page.getByTestId('underlay-level').selectOption({ label: 'N0' });
    await page.getByTestId('underlay-lay').click();
    await expect(page.getByTestId('underlay-row-plan')).toBeVisible();
    await page.getByTestId('grid-open-building').click();

    const shift = await page.evaluate(() => { const u = JSON.parse(window.__stabileo.serializeProject()).snapshot.underlays[0]; return { x: u.dx, y: u.dy }; });
    const X = (x: number) => x + shift.x, Y = (y: number) => y + shift.y;

    await page.getByTestId('building-columns-draw').click();
    const near = await at(page, X(5.86), Y(-0.14), 0);
    await page.mouse.move(near.x, near.y);
    await page.mouse.move(near.x + 1, near.y);
    await expect(page.getByTestId('plan-draw-snap')).toHaveAttribute('data-mode', 'endpoint');
    await page.mouse.click(near.x, near.y);
    await click(page, X(6.14), Y(0.13), 0);
    await expect.poll(async () => (await model(page)).elements.length).toBe(1);
    let m = await model(page);
    const base = m.nodes.map(([, n]) => n).filter((n) => (n.z ?? 0) === 0);
    expect(base.map((n) => [+n.x.toFixed(9), +n.y.toFixed(9)])).toEqual([[X(6), Y(0)]]);

    await page.getByTestId('plan-draw-exit').click();
    await page.getByTestId('building-tab-beams').click();
    await page.getByTestId('building-beams-draw').click();
    await page.getByTestId('plan-draw-mode-faces').click();
    await click(page, X(0.02), Y(2.01), 3);
    await click(page, X(5.98), Y(2.02), 3);
    await click(page, X(3.02), Y(2.21), 3);
    await expect.poll(async () => (await model(page)).elements.length).toBe(2);
    m = await model(page);
    const pos = new Map(m.nodes);
    const b = m.elements[1]![1];
    expect([pos.get(b.nodeI), pos.get(b.nodeJ)].map((n) => [+n!.x.toFixed(9), +n!.y.toFixed(9), n!.z])).toEqual([[X(0), Y(2.1), 3], [X(6), Y(2.1), 3]]);
  });
});
