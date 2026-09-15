import { test, expect, loadModel } from './fixtures';

/**
 * Stairs in PRO.
 *
 * A stair flight is an inclined waist slab, which the solver has been able to
 * take since quads existed (`engine/__tests__/inclined-shell.test.ts`). What
 * was missing was any way to ASK for one: the plates panel built flat quads
 * from nodes already placed, so a stair meant working out the top edge's z by
 * hand and typing four node ids.
 *
 * Framed on `mat-foundation` because it arrives with nodes and quads at known
 * coordinates — building the starting geometry through the viewport would be
 * testing the camera.
 */
async function openStair(page: import('@playwright/test').Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-shells').click();
  await page.getByTestId('stair-toggle').click();
}

const maxZ = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    Math.max(...window.__stabileo.nodeIds().map((n: number) => window.__stabileo.nodePos(n)!.z)));

test.describe('@smoke PRO — stairs', () => {
  test('builds a flight off two nodes: inclined, and meshed along the run', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    const before = await page.evaluate(() => window.__stabileo.quadIds().length);
    const zBefore = await maxZ(page);

    await openStair(page);
    // Nodes 1 and 2 are the raft's first edge — 4.5 m apart, both at z = 0.
    await page.getByTestId('stair-n0').fill('1');
    await page.getByTestId('stair-n1').fill('2');
    await page.getByTestId('stair-steps').fill('12');
    await page.getByTestId('stair-generate').click();

    await expect(page.getByTestId('stair-success')).toBeVisible();
    // One quad per riser, and the flight genuinely climbs: a flat strip would
    // satisfy a count assertion on its own.
    expect(await page.evaluate(() => window.__stabileo.quadIds().length)).toBe(before + 12);
    expect(await maxZ(page)).toBeCloseTo(zBefore + 12 * 0.175, 2);
  });

  test('carries the steps as load rather than as geometry', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    const before = await page.evaluate(() => window.__stabileo.modelCensus().loads);

    await openStair(page);
    await page.getByTestId('stair-n0').fill('1');
    await page.getByTestId('stair-n1').fill('2');
    await page.getByTestId('stair-steps').fill('8');
    await page.getByTestId('stair-generate').click();
    await expect(page.getByTestId('stair-success')).toBeVisible();

    // One surface load per shell. Without it the flight is short by the weight
    // of the treads — about a third of the concrete in it — and nothing in the
    // model says so.
    expect(await page.evaluate(() => window.__stabileo.modelCensus().loads)).toBe(before + 8);
  });

  test('the step weight can be declined, and then nothing is loaded', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    const before = await page.evaluate(() => window.__stabileo.modelCensus().loads);

    await openStair(page);
    await page.getByTestId('stair-step-load').uncheck();
    await page.getByTestId('stair-n0').fill('1');
    await page.getByTestId('stair-n1').fill('2');
    await page.getByTestId('stair-steps').fill('6');
    await page.getByTestId('stair-generate').click();
    await expect(page.getByTestId('stair-success')).toBeVisible();

    expect(await page.evaluate(() => window.__stabileo.modelCensus().loads)).toBe(before);
  });

  test('warns about an uncomfortable stair without refusing to build it', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await openStair(page);
    await page.getByTestId('stair-n0').fill('1');
    await page.getByTestId('stair-n1').fill('2');
    await page.getByTestId('stair-riser').fill('0.24');
    await page.getByTestId('stair-tread').fill('0.18');

    await expect(page.getByTestId('stair-warn').first()).toBeVisible();
    /* Comfort is a rule of the human stride, not a clause. A stair inside an
       existing shaft is sometimes the stair you have, so the warning says so
       and the button stays live — what a geometry that cannot EXIST does
       instead is disable it, and that is a different test. */
    await expect(page.getByTestId('stair-generate')).toBeEnabled();
  });

  test('refuses a geometry that cannot exist', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await openStair(page);
    await page.getByTestId('stair-n0').fill('1');
    await page.getByTestId('stair-n1').fill('2');
    await page.getByTestId('stair-steps').fill('1');   // a flight of one riser
    await expect(page.getByTestId('stair-generate')).toBeDisabled();
  });
});

test.describe('@smoke PRO — editing a plate that already exists', () => {
  test('a slab becomes a stair, keeping the footprint it was drawn with', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    // Quad 1 spans nodes 1-2-11-10: a 4.5 m × 4.5 m raft panel, flat at z = 0.
    const before = await page.evaluate(() => window.__stabileo.quadIds().length);
    const zBefore = await maxZ(page);
    const xBefore = await page.evaluate(() =>
      Math.max(...window.__stabileo.nodeIds().map((n: number) => window.__stabileo.nodePos(n)!.x)));

    await openStair(page);
    await page.getByTestId('stair-quad-id').fill('1');
    await expect(page.getByTestId('stair-derived-tread')).toBeVisible();
    await page.getByTestId('stair-convert').click();
    await expect(page.getByTestId('stair-success')).toBeVisible();

    const after = await page.evaluate(() => ({
      ids: window.__stabileo.quadIds(),
      xs: window.__stabileo.nodeIds().map((n: number) => window.__stabileo.nodePos(n)!.x),
    }));
    // The original is gone, replaced by a meshed flight — not one tilted quad.
    expect(after.ids).not.toContain(1);
    expect(after.ids.length).toBeGreaterThan(before);
    // It climbed a full storey, and the plan outline did not move: the raft is
    // 4.5 m panels and the widest x is still where it was.
    expect(await maxZ(page)).toBeCloseTo(zBefore + 16 * 0.175, 2);
    expect(Math.max(...after.xs)).toBeCloseTo(xBefore, 6);
  });

  test('curvature can be given to a plate after it is drawn', async ({ pro: page }) => {
    /* The flag used to be settable only in the creator, so a slab that turns
       out not to be flat had no way to say it is a cáscara. The table row
       already printed `≈` for one and offered no way to put it there. */
    await loadModel(page, 'mat-foundation');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();

    expect(await page.evaluate(() => window.__stabileo.quadCurved(1))).toBe(false);
    await page.getByTestId('plate-curved-1').check();
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.quadCurved(1)))
      .toBe(true);

    // And back off again — it is a property of the row, not a one-way door.
    await page.getByTestId('plate-curved-1').uncheck();
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.quadCurved(1)))
      .toBe(false);
  });
});
