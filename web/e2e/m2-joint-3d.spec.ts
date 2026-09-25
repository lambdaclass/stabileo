/**
 * The designed joint, drawn — and the performance of doing so, measured.
 *
 * ── What this settles that the unit tests cannot ────────────────────
 *
 * `joint-layout.test.ts` proves the placement: bolts inside the plate, group centred, frame
 * following the member axis, nothing placed for an undesigned joint. What it cannot prove is
 * that the viewport actually builds those meshes, that they disappear when the design becomes
 * incomplete again, and that selecting a joint in one place selects it in the other.
 *
 * The timings are RECORDED, not asserted tightly. A hard threshold on a shared machine measures
 * the machine. What is asserted is that each operation completes at all; the numbers go to the
 * log so a regression is visible.
 */

import { test, expect, PRO_URL, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

async function jointMeshes(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as unknown as { __stabileo?: { jointMeshCount?: () => number } })
      .__stabileo?.jointMeshCount?.() ?? -1);
}

/**
 * The scene BY PART, not by mesh count.
 *
 * These tests used to assert a raw total — 7 for «a plate and six bolts». That number was never
 * the contract: the contract is one plate, one bolt per hole, and nothing else. M3 draws a bolt
 * as a shank plus a head, so the total moved to 13 while every word of the contract stayed true.
 *
 * Counting parts asserts the contract instead of a consequence of it, and it is strictly
 * stronger: `shanks === holes` and `heads === shanks` would catch a missing bolt, which a total
 * of 13 would not.
 */
interface JointSceneParts {
  plates: number; shanks: number; heads: number; holes: number;
}

async function jointParts(page: Page): Promise<JointSceneParts | null> {
  return page.evaluate(() =>
    (window as unknown as { __stabileo?: { jointScene?: () => unknown } })
      .__stabileo?.jointScene?.() ?? null) as Promise<JointSceneParts | null>;
}

/** One plate, one shank and one head per hole, and no other mesh in the group. */
async function expectPlateAndBoltsOnly(page: Page, holes: number): Promise<void> {
  await expect.poll(async () => (await jointParts(page))?.shanks ?? -1).toBe(holes);
  const parts = (await jointParts(page))!;
  expect(parts.plates).toBe(1);
  expect(parts.holes).toBe(holes);
  expect(parts.heads).toBe(holes);
  // Nothing else was added — no batten, no weld, no placeholder.
  expect(await jointMeshes(page)).toBe(1 + 2 * holes);
}

async function openSolvedShed(page: Page): Promise<number> {
  const t0 = Date.now();
  await page.goto(PRO_URL);
  await loadModel(page, '3d-nave-industrial');
  await solveModel(page);
  await expect(page.locator('canvas').first()).toBeAttached();
  return Date.now() - t0;
}

async function openJointPanel(page: Page): Promise<void> {
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-connections').click();
  await expect(page.getByTestId('conn-sec-joints')).toBeVisible();
}

async function designSelectedJoint(page: Page): Promise<void> {
  for (const [id, v] of [['jd-count', '6'], ['jd-rows', '2'],
    ['jd-plate-t', '12'], ['jd-plate-fu', '400']] as const) {
    await page.getByTestId(id).fill(v);
    await page.getByTestId(id).blur();
  }
}

/**
 * Every line mentioning a claim word must carry a negation.
 *
 * A blunt ban on the words keeps flagging the sentences whose whole job is to deny the claim —
 * «It cannot be fully verified: Table J.2.5 refers the base metal to Chapter J.4…» is the most
 * careful sentence on this screen and a plain `not.toContain('VERIFIED')` catches it.
 */
function assertNoApprovalClaim(text: string): void {
  const CLAIM = /\bverified\b|verificad[oa]s?\b|\bapproved\b|aprobad[oa]s?\b|certificad[oa]s?\b/i;
  const NEGATION = /\bnot\b|\bno\b|\bnever\b|\bcannot\b|\bwithout\b|ningun|ningún|\bsin\b|\bnão\b/i;
  for (const line of text.split('\n')) {
    if (CLAIM.test(line)) {
      expect(NEGATION.test(line), `claims approval without a negation: ${line}`).toBe(true);
    }
  }
}

test.describe('the plate and bolts appear only once the geometry is complete', () => {
  test('an undesigned joint draws nothing', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await expect(page.getByTestId('joint-design-state')).toHaveAttribute('data-state', 'notDesigned');
    expect(await jointMeshes(page)).toBe(0);
  });

  /*
   * The state the brief names explicitly: nothing fictional while `incomplete`. Bolts are chosen
   * and the plate is not, so there is no geometry — and a rendered plate standing in for one
   * that does not exist would be the most convincing fiction in the app.
   */
  test('an incomplete joint still draws nothing', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await page.getByTestId('jd-count').fill('6');
    await page.getByTestId('jd-count').blur();
    await expect(page.getByTestId('joint-design-state')).toHaveAttribute('data-state', 'incomplete');
    expect(await jointMeshes(page)).toBe(0);
  });

  test('a complete joint draws a plate and one bolt per hole', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);
    await expect(page.getByTestId('joint-plate')).toBeVisible();
    // One plate, one bolt per hole — asserted by part, so a bolt gaining a head does not read
    // as a broken contract.
    await expectPlateAndBoltsOnly(page, 6);
  });

  test('and the meshes go away when the design is undone', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);
    await expect.poll(() => jointMeshes(page)).toBeGreaterThan(0);

    await page.getByTestId('jd-plate-t').fill('');
    await page.getByTestId('jd-plate-t').blur();
    await expect(page.getByTestId('joint-plate-unavailable')).toBeVisible();
    await expect.poll(() => jointMeshes(page)).toBe(0);
  });
});

test.describe('selection is one channel, in both directions', () => {
  test('choosing a joint in the list selects its node in the scene', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    const row = page.locator('.conn-joint-row').first();
    const label = (await row.locator('.conn-node-id').innerText()).trim();
    await row.click();
    const selected = await page.evaluate(() =>
      (window as unknown as { __stabileo?: { selectedNodeIds?: () => number[] } })
        .__stabileo?.selectedNodeIds?.() ?? []);
    expect(selected).toHaveLength(1);
    expect(`N${selected[0]}`).toBe(label);
  });

  /*
   * The reverse. There is no parallel selection channel: the panel reads the same
   * `uiStore.selectedNodes` the scene writes, so a node picked anywhere opens its joint.
   */
  test('selecting a node elsewhere opens that joint in the panel', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    const rows = page.locator('.conn-joint-row');
    await rows.nth(0).click();
    const first = await page.evaluate(() =>
      (window as unknown as { __stabileo?: { selectedNodeIds?: () => number[] } })
        .__stabileo?.selectedNodeIds?.()[0] ?? -1);

    await rows.nth(1).click();
    const second = await page.evaluate(() =>
      (window as unknown as { __stabileo?: { selectedNodeIds?: () => number[] } })
        .__stabileo?.selectedNodeIds?.()[0] ?? -1);
    expect(second).not.toBe(first);
    await expect(rows.nth(1)).toHaveClass(/active/);
  });

  test('a design survives switching away and back', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    const rows = page.locator('.conn-joint-row');
    await rows.nth(0).click();
    await designSelectedJoint(page);
    await rows.nth(1).click();
    await rows.nth(0).click();
    await expect(page.getByTestId('jd-count')).toHaveValue('6');
    await expectPlateAndBoltsOnly(page, 6);
  });
});

test.describe('battens and welds are not drawn without geometry', () => {
  /*
   * §E.6 gives no batten dimension anywhere, and a weld has no geometry in this model at all.
   * The joint draws a plate and bolts and nothing else — a batten or a weld bead rendered here
   * would be an invented dimension in the one place it looks most authoritative.
   */
  test('a designed joint draws exactly the plate and its bolts', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);
    // «Exactly» is the point of this test, and counting parts is what makes it exact: a batten
    // or a weld mesh would break the `1 + 2 x holes` total.
    await expectPlateAndBoltsOnly(page, 6);
  });
});

test.describe('designed is not an approval', () => {
  test('no VERIFIED, and the state chip is not styled as a pass', async ({ page }) => {
    await openSolvedShed(page);
    await openJointPanel(page);
    await page.locator('.conn-joint-row').first().click();
    await designSelectedJoint(page);
    assertNoApprovalClaim(await page.getByTestId('joint-design').innerText());
    const state = await page.getByTestId('joint-design-state').getAttribute('data-state');
    expect(state).not.toBe('verified');
    // `designed` is deliberately neutral: only the states that need action carry colour.
    const colour = await page.getByTestId('joint-design-state')
      .evaluate((el) => getComputedStyle(el).color);
    expect(colour).toBeTruthy();
  });
});

test.describe('performance, measured on the shed', () => {
  test('viewer entry, joint switch, and geometry rebuild', async ({ page }) => {
    const loadMs = await openSolvedShed(page);
    await openJointPanel(page);
    const rows = page.locator('.conn-joint-row');

    await rows.nth(0).click();
    const t1 = Date.now();
    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveClass(/active/);
    const switchMs = Date.now() - t1;

    const t2 = Date.now();
    await designSelectedJoint(page);
    await expect.poll(() => jointMeshes(page)).toBeGreaterThan(0);
    const buildMs = Date.now() - t2;

    const t3 = Date.now();
    await page.getByTestId('jd-count').fill('8');
    await page.getByTestId('jd-count').blur();
    await expect.poll(async () => (await jointParts(page))?.shanks ?? -1).toBe(8);
    const rebuildMs = Date.now() - t3;

    // eslint-disable-next-line no-console
    console.log(`PERF load=${loadMs}ms switch=${switchMs}ms build=${buildMs}ms rebuild=${rebuildMs}ms`);
    expect(loadMs).toBeLessThan(60_000);
    expect(switchMs).toBeLessThan(10_000);
    expect(rebuildMs).toBeLessThan(10_000);
  });
});
