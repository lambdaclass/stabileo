import { test, expect, ribbonCmd } from './fixtures';
import type { Page } from '@playwright/test';
import { buildDxf, dxfLine, dxfLwPolyline, simplePlanDxf } from '../src/lib/cad/__tests__/dxf-fixture';

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
    await expect(page.getByTestId('plan-draw-kind-beam')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('building-storey-select').locator('option:checked'), 'the storey stays the one its columns were drawn on').toContainText('N0');
    await expect(page.getByTestId('plan-draw-level'), 'and its beams go on its ceiling').toContainText('N1');
    await page.getByTestId('plan-draw-mode-axis').click();
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
    await page.getByTestId('building-storey-select').selectOption({ index: 0 });
    await expect(page.getByTestId('building-storey-borrowed'), 'the storey above draws over the one below').toContainText('N0');
    await page.getByTestId('building-storey-select').selectOption({ index: 1 });
    await expect(page.getByTestId('building-storey-template')).toContainText('plan');
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
  test('columns, beams and a slab drawn as rectangles; the slab tells its free side, and with the snaps off the point is free', async ({ pro: page }) => {
    await levelsOnly(page);
    await page.getByTestId('building-columns-draw').click();
    for (const [x, y] of [[0, 0], [6, 0], [6, 5], [0, 5]] as const) {
      await click(page, x - 0.15, y - 0.15, 0);
      await click(page, x + 0.15, y + 0.15, 0);
    }
    await expect.poll(async () => (await model(page)).elements.length).toBe(4);
    await page.getByTestId('plan-draw-exit').click();

    await page.getByTestId('building-tab-beams').click();
    await page.getByTestId('building-beams-draw').click();
    await expect(page.getByTestId('plan-draw-mode-rect')).toHaveAttribute('aria-checked', 'true');
    for (const [a, b] of [[[0, -0.1], [6, 0.1]], [[5.9, 0], [6.1, 5]], [[-0.1, 0], [0.1, 5]]] as const) {
      await click(page, a[0], a[1], 3);
      await click(page, b[0], b[1], 3);
    }
    await expect.poll(async () => (await model(page)).elements.length).toBe(7);
    await page.getByTestId('plan-draw-exit').click();

    await page.getByTestId('building-tab-slabs').click();
    await expect(page.getByTestId('building-storey-borrowed'), 'no template laid: nothing borrowed').toHaveText(/./);
    await page.getByTestId('building-slabs-draw').click();
    await expect(page.getByTestId('plan-draw-level')).toContainText('N1');
    await click(page, 0.1, 0.1, 3);
    const hover = await at(page, 5.9, 4.9, 3);
    await page.mouse.move(hover.x, hover.y);
    await page.mouse.move(hover.x + 1, hover.y);
    await expect(page.getByTestId('plan-draw-free-edge'), 'the side with no beam, before the click').toHaveCount(1);
    await page.mouse.click(hover.x, hover.y);
    await expect.poll(async () => (await model(page)).groups?.find(([, g]) => g.data?.kind === 'slab')?.[1].data?.edges).toEqual(['beam', 'beam', 'free', 'beam']);

    await page.getByTestId('plan-draw-snaps').click();
    await page.getByTestId('plan-snap-on').uncheck();
    await page.getByTestId('plan-draw-snaps').click();
    const near = await at(page, 6.03, 0.04, 3);
    await page.mouse.move(near.x, near.y);
    await page.mouse.move(near.x + 1, near.y);
    await expect(page.getByTestId('plan-draw-snap'), 'nothing captures the point').toHaveCount(0);
    await page.keyboard.press('F3');
    await page.mouse.move(near.x, near.y);
    await expect(page.getByTestId('plan-draw-snap')).toHaveCount(1);

    // On the level above, a box over the whole bay does not take the columns of the storey below, hidden under it.
    await page.getByTestId('plan-draw-exit').click();
    await page.getByTestId('plan-view-up').click();
    await page.getByTestId('pr-select').click();
    await page.getByTestId('select-mode-elements').click();
    const [p0, p1] = [await at(page, -1, -1, 3), await at(page, 7, 6, 3)];
    await page.mouse.move(p0.x, p1.y);
    await page.mouse.down();
    await page.mouse.move((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, { steps: 4 });
    await page.mouse.move(p1.x, p0.y, { steps: 4 });
    await page.mouse.up();
    const snap = await model(page);
    const z = new Map(snap.nodes.map(([id, n]) => [id, n.z ?? 0]));
    const columns = snap.elements.filter(([, e]) => z.get(e.nodeI) !== z.get(e.nodeJ)).map(([id]) => id);
    const taken = await page.evaluate(() => window.__stabileo.selection());
    expect(columns.length).toBe(4);
    expect(taken.filter((id) => columns.includes(id))).toEqual([]);
    await page.getByTestId('plan-view-down').click();
    await page.mouse.move(p0.x, p1.y);
    await page.mouse.down();
    await page.mouse.move(p1.x, p0.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await page.evaluate(() => window.__stabileo.selection())).length, 'on its own storey the same box takes them').toBeGreaterThan(0);
  });
  test('a wall drawn as a rectangle between two columns reaches them and stands its storey', async ({ pro: page }) => {
    await levelsOnly(page);
    await page.getByTestId('building-columns-draw').click();
    for (const [x, y] of [[0, 0], [6, 0]] as const) { await click(page, x - 0.15, y - 0.15, 0); await click(page, x + 0.15, y + 0.15, 0); }
    await expect.poll(async () => (await model(page)).elements.length).toBe(2);
    await page.getByTestId('plan-draw-exit').click();
    await page.getByTestId('building-tab-walls').click();
    await page.getByTestId('building-walls-draw').click();
    await expect(page.getByTestId('plan-draw-kind-wall')).toHaveAttribute('aria-checked', 'true');
    await click(page, 0.15, -0.1, 0);
    await click(page, 5.85, 0.1, 0);
    await expect.poll(async () => (await model(page)).groups?.find(([, g]) => g.data?.kind === 'wall')?.[1].data).toMatchObject({ kind: 'wall', levelFrom: expect.any(String), levelTo: expect.any(String) });
    const m = await model(page);
    expect(m.elements.length, 'the columns are cut to share the wall’s mesh').toBeGreaterThan(2);
  });

  test('on a template, a click inside each column and between the lines of each wall captures them, and the bar switches kinds', async ({ pro: page }) => {
    const rect = (x: number, y: number) => dxfLwPolyline('COLS', [[x - 0.15, y - 0.15], [x + 0.15, y - 0.15], [x + 0.15, y + 0.15], [x - 0.15, y + 0.15]], true);
    const walls = [
      dxfLine('MUROS', 0.15, -0.15, 5.85, -0.15), dxfLine('MUROS', 0.15, 0.05, 5.85, 0.05),
      dxfLine('MUROS', 0.15, 5.15, 5.85, 5.15), dxfLine('MUROS', 0.15, 4.95, 5.85, 4.95),
      dxfLine('MUROS', -0.15, 0.15, -0.15, 4.85), dxfLine('MUROS', 0.05, 0.15, 0.05, 4.85),
      dxfLine('MUROS', 6.15, 0.15, 6.15, 4.85), dxfLine('MUROS', 5.95, 0.15, 5.95, 4.85),
    ];
    const dxf = buildDxf({ insunits: 6, layers: ['COLS', 'MUROS'], entities: [rect(0, 0), rect(6, 0), rect(6, 5), rect(0, 5), ...walls].join('\n') });
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'building');
    await page.getByTestId('grid-heights').fill('3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('underlay-file').setInputFiles({ name: 'walls.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) });
    await page.getByTestId('underlay-unit').selectOption('m');
    await page.getByTestId('underlay-level').selectOption({ label: 'N0' });
    await page.getByTestId('underlay-lay').click();
    await page.getByTestId('grid-open-building').click();
    const shift = await page.evaluate(() => { const u = JSON.parse(window.__stabileo.serializeProject()).snapshot.underlays[0]; return { x: u.dx, y: u.dy }; });
    const X = (x: number) => x + shift.x, Y = (y: number) => y + shift.y;
    const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;

    await page.getByTestId('building-columns-draw').click();
    await page.getByTestId('plan-draw-mode-capture').click();
    for (const [x, y] of [[0, 0], [6, 0], [6, 5], [0, 5]] as const) await click(page, X(x + 0.06), Y(y + 0.09), 0);
    await expect.poll(async () => (await model(page)).groups?.filter(([, g]) => g.data?.kind === 'column').length).toBe(4);
    await expect(page.getByTestId('plan-draw-last')).toContainText('C4');
    let m = await model(page);
    expect(m.nodes.filter(([, n]) => (n.z ?? 0) === 0).map(([, n]) => [r6(n.x - shift.x), r6(n.y - shift.y)]), 'each on the centre of its outline').toEqual([[0, 0], [6, 0], [6, 5], [0, 5]]);

    await page.keyboard.press('b');
    await expect(page.getByTestId('plan-draw-kind-beam')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('building-tab-beams'), 'the panel follows').toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('plan-draw-mode-capture').click();
    const inWall = await at(page, X(3), Y(-0.05), 3);
    await page.mouse.move(inWall.x, inWall.y);
    await page.mouse.move(inWall.x + 1, inWall.y);
    await expect(page.getByTestId('plan-draw-frames'), 'the two columns it frames into').toHaveCount(2);
    await page.mouse.click(inWall.x, inWall.y);
    await click(page, X(3), Y(5.05), 3);
    await expect.poll(async () => (await model(page)).elements.length).toBe(6);
    m = await model(page);
    const pos = new Map(m.nodes);
    const tops = (ids: number[]) => ids.map((id) => { const n = pos.get(id)!; return [r6(n.x - shift.x), r6(n.y - shift.y), n.z ?? 0]; });
    expect(tops([m.elements[4]![1].nodeI, m.elements[4]![1].nodeJ]), 'from column to column, at its ceiling').toEqual([[0, 0, 3], [6, 0, 3]]);

    await page.getByTestId('plan-draw-mode-rect').click();
    await page.getByTestId('plan-draw-snaps').click();
    await page.getByTestId('plan-snap-on').uncheck();
    await page.getByTestId('plan-draw-snaps').click();
    await click(page, X(2.9), Y(0.3), 3);
    await click(page, X(3.1), Y(4.7), 3);
    await expect.poll(async () => (await model(page)).elements.length, 'the beams it falls short of are reached and cut').toBe(9);
    m = await model(page);
    const last = m.elements[m.elements.length - 1]![1];
    const pos2 = new Map(m.nodes);
    const [ni, nj] = [last.nodeI, last.nodeJ].map((id) => { const n = pos2.get(id)!; return [n.x - shift.x, n.y - shift.y]; });
    expect([ni![1], nj![1]].map(r6), 'on the axes of the two beams').toEqual([0, 5]);
    for (const n of [ni!, nj!]) expect(Math.abs(n[0]! - 3), 'where it was drawn, to the free point’s centimetre').toBeLessThan(0.011);
  });
});
