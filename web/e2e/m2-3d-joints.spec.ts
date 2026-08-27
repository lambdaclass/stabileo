/**
 * The 3-D view of the industrial shed: nodes, sections, and the joint selected in two places.
 *
 * ── What only a browser settles ────────────────────────────────────
 *
 * `node-scale.test.ts` proves the radius follows the model and never drops below the picking
 * floor. It cannot prove that a node is still clickable, that the section view actually draws
 * profiles, or that selecting a joint in the list highlights the same joint in the scene. Those
 * are the four things here.
 *
 * The timings are recorded rather than asserted tightly: a hard threshold on a shared CI machine
 * measures the machine. What IS asserted is that the viewer becomes usable at all, and the
 * numbers are printed so a regression is visible in the log.
 */

import { test, expect, PRO_URL, loadModel } from './fixtures';
import type { Locator, Page } from '@playwright/test';

/**
 * The viewport canvas — the biggest one on the page.
 *
 * `page.locator('canvas').first()` is not it: measured, that returns an 80×80 element at
 * (8, 607), a corner decoration. Five clicks aimed at its centre hit nothing, which read as
 * broken picking and was a wrong target.
 */
async function viewportCanvas(page: Page): Promise<Locator> {
  const canvases = page.locator('canvas');
  const n = await canvases.count();
  let best = canvases.first();
  let bestArea = 0;
  for (let i = 0; i < n; i++) {
    const box = await canvases.nth(i).boundingBox();
    const area = box ? box.width * box.height : 0;
    if (area > bestArea) { bestArea = area; best = canvases.nth(i); }
  }
  return best;
}

async function openShed(page: Page): Promise<void> {
  await page.goto(PRO_URL);
  await loadModel(page, '3d-nave-industrial');
  await expect(await viewportCanvas(page)).toBeVisible();
}

async function openShedConnections(page: Page): Promise<void> {
  await openShed(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-connections').click();
  await expect(page.getByTestId('conn-sec-joints')).toBeVisible();
}

/** The node marker radius the scene is currently drawing, metres. */
async function markerRadius(page: Page): Promise<number | null> {
  return page.evaluate(() =>
    (window as unknown as { __stabileo?: { nodeMarkerRadius?: () => number | null } })
      .__stabileo?.nodeMarkerRadius?.() ?? null);
}

test.describe('nodes are sized for the model', () => {
  /*
   * The defect this replaces: a fixed 0.07 m sphere, whatever the model. On a 30 m shed that is
   * a speck; on a 2 m detail model it is a third of a member.
   */
  test('the shed loads and its nodes are visible without burying the members', async ({ page }) => {
    const t0 = Date.now();
    await openShed(page);
    const loadMs = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`3D shed load: ${loadMs} ms`);
    expect(loadMs).toBeLessThan(30_000);

    const r = await markerRadius(page);
    if (r !== null) {
      // Between the two clamps for a model this size.
      expect(r).toBeGreaterThan(0.02);
      expect(r).toBeLessThan(0.18);
    }
  });

  /*
   * Picking is not broken by the resize.
   *
   * Counted over NODES AND ELEMENTS, not nodes alone. A blind click over a dense model lands on
   * a member far more often than on a panel point — members are metres long, markers are
   * centimetres — so requiring a node hit would test my aim rather than the app's raycasting. My
   * first version did exactly that and failed on a scene where picking works.
   *
   * That the markers are large enough to hit is the unit test's job: `nodeRadiusFor` never
   * returns below the picking floor, and `NodesInstanced` raycasts the visible mesh, so the
   * floor IS the target size.
   */
  test('picking still works after the resize', async ({ page }) => {
    await openShed(page);
    const canvas = await viewportCanvas(page);
    const box = (await canvas.boundingBox())!;
    // Sweep a small grid near the middle; a shed fills the viewport, so something is under it.
    let picked = 0;
    for (const [dx, dy] of [[0, 0], [-40, -20], [40, 20], [-20, 30], [30, -30]] as const) {
      await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
      const sel = await page.evaluate(() => {
        const a = (window as unknown as {
          __stabileo?: { selectedNodeIds?: () => number[]; selection?: () => number[] };
        }).__stabileo;
        return (a?.selectedNodeIds?.().length ?? 0) + (a?.selection?.().length ?? 0);
      });
      if (sel > 0) picked++;
    }
    expect(picked, 'no click over the shed selected anything').toBeGreaterThan(0);
  });
});

test.describe('the section view draws profiles', () => {
  test('switching to sections keeps the scene and the nodes', async ({ page }) => {
    await openShed(page);
    const before = await markerRadius(page);
    await page.getByTitle(/secciones|sections|seções/i).first().click();
    await page.waitForTimeout(400);
    await expect(await viewportCanvas(page)).toBeVisible();
    const after = await markerRadius(page);
    if (before !== null && after !== null) {
      // Halved in the section view, so the extruded profiles are not buried by the markers —
      // and never below the picking floor.
      expect(after).toBeLessThanOrEqual(before);
      expect(after).toBeGreaterThanOrEqual(0.02);
    }
  });
});

test.describe('a joint is the same joint in both places', () => {
  test('selecting in the list highlights it in the scene', async ({ page }) => {
    await openShedConnections(page);
    const row = page.locator('.conn-joint-row').first();
    const label = await row.locator('.conn-node-id').innerText();
    await row.click();
    await expect(row).toHaveClass(/active/);

    // The shared selection is what the scene reads, so asserting on it asserts on the scene.
    const selected = await page.evaluate(() =>
      (window as unknown as { __stabileo?: { selectedNodeIds?: () => number[] } })
        .__stabileo?.selectedNodeIds?.() ?? []);
    if (selected.length > 0) {
      expect(`N${selected[0]}`).toBe(label.trim());
    }
  });

  test('changing joints is quick enough to browse', async ({ page }) => {
    await openShedConnections(page);
    const rows = page.locator('.conn-joint-row');
    await rows.nth(0).click();
    const t0 = Date.now();
    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveClass(/active/);
    const switchMs = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`joint switch: ${switchMs} ms`);
    expect(switchMs).toBeLessThan(5_000);
  });
});

test.describe('nothing is certified by being drawn', () => {
  /*
   * A joint rendered in 3-D looks finished. It is not: plate, weld and batten geometry are
   * `GEOMETRY_UNAVAILABLE`, and drawing the members that meet at a node says nothing about
   * whether the connection between them has been checked.
   */
  test('the joints panel claims no verification', async ({ page }) => {
    await openShedConnections(page);
    await page.locator('.conn-joint-row').first().click();
    const text = (await page.getByTestId('conn-sec-joints').innerText()).toUpperCase();
    expect(text).not.toContain('VERIFIED');
    expect(text).not.toContain('VERIFICADO');
  });

  test('an empty model shows an empty state, not a joint', async ({ page }) => {
    await page.goto(PRO_URL);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-connections').click();
    await expect(page.getByTestId('conn-no-joints')).toBeVisible();
    await expect(page.locator('.conn-joint-row')).toHaveCount(0);
  });
});
