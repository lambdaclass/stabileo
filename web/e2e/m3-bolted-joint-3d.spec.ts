/**
 * The bolted joint, drawn on the real shed — M3's first block.
 *
 * ── What this settles that the unit tests cannot ────────────────────
 *
 * `joint-meshes.test.ts` proves the geometry against a fixture: the plate oriented onto the
 * frame, the holes cut, the shank on the normal, nothing built when there is nothing to build.
 * What a fixture cannot prove is that the shed's OWN joints come out that way — the member axes
 * are the building's, not a test's, and the defect this block fixed was invisible precisely
 * because it only appeared on members that do not run along global X.
 *
 * So this file drives `3d-nave-industrial`, designs a joint through the panel a user would use,
 * and asserts on `__stabileo.jointScene()` — the composition of the scene as built, including
 * whether the bolts are inside the plate in the plate's own frame.
 *
 * ── Why the numbers are asserted and the timings are not ────────────
 *
 * The geometry is deterministic: 6 holes of 22 mm and 20 mm shanks come from the design, so they
 * are asserted exactly. Frame times on a shared machine measure the machine, so they are logged.
 */

import { test, expect, PRO_URL, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

interface JointScene {
  nodeId: number;
  plates: number;
  shanks: number;
  heads: number;
  holes: number;
  holeDiameterMm: number;
  boltDiameterMm: number;
  boltsInsidePlate: boolean;
  boundingRadiusM: number;
  state: string;
}

const scene = (page: Page) =>
  page.evaluate(() => (window as unknown as {
    __stabileo?: { jointScene?: () => unknown };
  }).__stabileo?.jointScene?.() ?? null) as Promise<JointScene | null>;

const meshCount = (page: Page) =>
  page.evaluate(() => (window as unknown as {
    __stabileo?: { jointMeshCount?: () => number };
  }).__stabileo?.jointMeshCount?.() ?? -1);

const selectedNodes = (page: Page) =>
  page.evaluate(() => (window as unknown as {
    __stabileo?: { selectedNodeIds?: () => number[] };
  }).__stabileo?.selectedNodeIds?.() ?? []);

async function openSolvedShed(page: Page): Promise<void> {
  await page.goto(PRO_URL);
  await loadModel(page, '3d-nave-industrial');
  await solveModel(page);
  await expect(page.locator('canvas').first()).toBeAttached();
}

async function openJointPanel(page: Page): Promise<void> {
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-connections').click();
  await expect(page.getByTestId('conn-sec-joints')).toBeVisible();
}

/** Fill the four inputs that make a bolted joint drawable. */
async function designSelectedJoint(page: Page, over: Record<string, string> = {}): Promise<void> {
  const values: Record<string, string> = {
    'jd-count': '6', 'jd-rows': '2', 'jd-plate-t': '12', 'jd-plate-fu': '400', ...over,
  };
  for (const [id, v] of Object.entries(values)) {
    await page.getByTestId(id).fill(v);
    await page.getByTestId(id).blur();
  }
}

test.describe('@smoke M3 — the bolted joint is drawn on the shed', () => {
  test('a designed joint draws an oriented plate, its holes and its bolts', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);

    await expect.poll(() => meshCount(page)).toBeGreaterThan(0);
    const s = (await scene(page))!;
    expect(s).not.toBeNull();

    // One plate, one shank and one head per bolt.
    expect(s.plates).toBe(1);
    expect(s.shanks).toBe(6);
    expect(s.heads).toBe(6);

    // Six holes, and the J.3.3 clearance visible: a 20 mm bolt in a 22 mm hole.
    expect(s.holes).toBe(6);
    expect(s.holeDiameterMm).toBeCloseTo(22, 3);
    expect(s.boltDiameterMm).toBeCloseTo(20, 3);
    expect(s.boltDiameterMm).toBeLessThan(s.holeDiameterMm);

    /*
     * The property this whole block exists for, asserted on the building's own geometry.
     *
     * Before: the plate was an axis-aligned box while the bolts were placed in the member
     * frame, and on the default shed's joint node 9 — first member along global Z — four of its
     * six bolts stood outside the plate. This is that, on the real shed, through the real
     * viewport.
     */
    expect(s.boltsInsidePlate).toBe(true);

    // And it is small: a couple of hundred millimetres inside a building tens of metres across,
    // which is why framing it is a command rather than a nicety.
    expect(s.boundingRadiusM).toBeGreaterThan(0);
    expect(s.boundingRadiusM).toBeLessThan(1);
  });

  test('the same joint stays drawn when its own steel is clicked', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);
    await expect.poll(() => meshCount(page)).toBeGreaterThan(0);

    const before = await selectedNodes(page);
    expect(before).toHaveLength(1);

    /*
     * Clicking the plate used to DELETE it.
     *
     * The joint meshes live in `jointsParent`, which no raycast consulted, so a click on the
     * plate hit nothing, fell through to «no hit → clear the selection», and the meshes — which
     * exist only for the selected node — vanished. Inspecting a joint by clicking it was the one
     * gesture guaranteed to close it.
     *
     * The joint is framed first so the plate actually occupies pixels to click: at model zoom it
     * is under a pixel, and a click at the centre of the canvas would land on the structure
     * behind it.
     */
    await page.getByTestId('conn-scene-inspect').click();
    await page.waitForTimeout(250);
    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);

    expect(await selectedNodes(page)).toEqual(before);
    expect(await meshCount(page)).toBeGreaterThan(0);
  });

  test('choosing the joint in the list is what puts it in the scene', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);
    await expect.poll(() => meshCount(page)).toBeGreaterThan(0);
    const first = (await scene(page))!.nodeId;
    expect(await selectedNodes(page)).toEqual([first]);

    /*
     * A second row, designed too — the list driving the viewer.
     *
     * The second joint has to be designed as well, and that is not incidental: an undesigned
     * joint draws NOTHING, so switching to one would empty the scene and prove only that the
     * scene follows the selection into emptiness. Designing it makes the assertion about the
     * scene MOVING rather than about it clearing.
     */
    await page.locator('.conn-joint-row').nth(1).click();
    await expect.poll(async () => (await selectedNodes(page))[0]).not.toBe(first);
    await designSelectedJoint(page);
    await expect.poll(() => meshCount(page)).toBeGreaterThan(0);

    const second = (await scene(page))!.nodeId;
    expect(second).not.toBe(first);
    expect(await selectedNodes(page)).toEqual([second]);
  });

  test('switching to an undesigned joint empties the scene and says why', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);
    await expect.poll(() => meshCount(page)).toBeGreaterThan(0);

    // The other half of the same contract: the scene follows the selection into emptiness too,
    // and the panel says which state that emptiness is.
    await page.locator('.conn-joint-row').nth(1).click();
    await expect.poll(() => meshCount(page)).toBe(0);
    expect(await scene(page)).toBeNull();
    await expect(page.getByTestId('conn-scene-empty')).toBeVisible();
  });
});

test.describe('M3 — what is not drawn, and why it says so', () => {
  test('an undesigned joint draws nothing and the panel explains it', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await expect(page.getByTestId('joint-design-state')).toHaveAttribute('data-state', 'notDesigned');

    expect(await meshCount(page)).toBe(0);
    expect(await scene(page)).toBeNull();

    /*
     * The message is the point. `jointSceneLayout` has always named why it produced nothing, and
     * the viewport used to discard those keys — so «this joint has no drawable geometry» looked
     * exactly like «nothing is selected», which is the difference between an app that is waiting
     * for you and an app that is broken.
     */
    const empty = page.getByTestId('conn-scene-empty');
    await expect(empty).toBeVisible();
    const text = (await empty.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
    // No raw i18n key reached the screen.
    expect(text).not.toMatch(/joint\.scene\.|plate\.missing\./);
    // And no inspect button, because there is nothing to frame.
    await expect(page.getByTestId('conn-scene-inspect')).toHaveCount(0);
  });

  test('a joint with bolts but no plate thickness names the missing input', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    // Bolts chosen, plate thickness deliberately left empty → GEOMETRY_UNAVAILABLE.
    await designSelectedJoint(page, { 'jd-plate-t': '' });

    await expect.poll(() => meshCount(page)).toBe(0);
    await expect(page.getByTestId('conn-scene-empty')).toBeVisible();
    const reasons = page.getByTestId('conn-scene-reason');
    expect(await reasons.count()).toBeGreaterThan(0);
    const text = (await page.getByTestId('conn-scene-empty').innerText()).toLowerCase();
    // It names the thickness rather than saying only «cannot draw».
    expect(text).toMatch(/espesor|thickness|espessura/);
  });

  test('the meshes go away when the design is undone', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);
    await expect.poll(() => meshCount(page)).toBeGreaterThan(0);

    await designSelectedJoint(page, { 'jd-plate-t': '' });
    await expect.poll(() => meshCount(page)).toBe(0);
    await expect(page.getByTestId('conn-scene-empty')).toBeVisible();
  });
});

test.describe('M3 — a failing joint keeps its geometry', () => {
  /**
   * `exceeded` must still draw. A joint with a failing check has geometry, and hiding it hides
   * the thing the user opened the joint to look at. The failure is provoked through §J.3.3's
   * spacing minimum, so no analysis result is needed to produce it.
   */
  test('an exceeded joint is drawn, with the same steel as a passing one', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();

    await designSelectedJoint(page);
    await expect.poll(() => meshCount(page)).toBeGreaterThan(0);
    const passing = (await scene(page))!;

    // A spacing far below `3d` fails the geometric check while leaving the plate buildable.
    await page.getByTestId('jd-spacing').fill('10');
    await page.getByTestId('jd-spacing').blur();

    await expect(page.getByTestId('joint-design-state')).toHaveAttribute('data-state', 'exceeded');
    const failing = (await scene(page))!;
    expect(failing).not.toBeNull();
    expect(failing.state).toBe('exceeded');
    expect(failing.plates).toBe(1);
    expect(failing.shanks).toBeGreaterThan(0);
    expect(failing.holes).toBeGreaterThan(0);
    expect(failing.boltsInsidePlate).toBe(true);
    // Same bolt, same hole: the verdict changed and the steel did not.
    expect(failing.boltDiameterMm).toBeCloseTo(passing.boltDiameterMm, 3);
    expect(failing.holeDiameterMm).toBeCloseTo(passing.holeDiameterMm, 3);
  });
});

test.describe('M3 — one entity behind the panel and the scene', () => {
  test('the scene reports the state the panel shows, for the node the panel lists', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);
    await expect.poll(() => meshCount(page)).toBeGreaterThan(0);

    /*
     * The single-source claim, asserted rather than asserted-about-in-a-comment.
     *
     * `jointSceneLayout` reads `JointDesign`, and `JointDesign` is what the panel renders — so
     * the state chip on screen and the state the scene was built from cannot differ. If someone
     * ever introduces a view model, this is where the two stop agreeing.
     *
     * Documents are NOT part of this assertion, and that is deliberate: nothing tabulates joints
     * yet (I-09 — there is no metallic export), so a test claiming three consumers agree would
     * be asserting about a consumer that does not exist.
     */
    const s = (await scene(page))!;
    const chip = page.getByTestId('joint-design-state');
    await expect(chip).toHaveAttribute('data-state', s.state);
    expect(await selectedNodes(page)).toEqual([s.nodeId]);

    // And the designed-joint list the store publishes contains that same node.
    const designed = await page.evaluate(() => (window as unknown as {
      __stabileo?: { jointDesignedNodeIds?: () => number[] };
    }).__stabileo?.jointDesignedNodeIds?.() ?? []);
    expect(designed).toContain(s.nodeId);
  });
});
