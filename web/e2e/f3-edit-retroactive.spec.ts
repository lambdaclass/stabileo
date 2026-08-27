/**
 * Objective 10 — an edit reaches every representation of the member it edited.
 *
 * ── Why this one designs a real building ──────────────────────────
 *
 * Because the claim spans the whole pipeline: a bar count changed in the design table has to
 * reach the coordinated assemblies, the sheet drawn from them, the schedule ordered from them,
 * and the 3-D document built from them. A seeded assembly has no design table behind it, and a
 * unit test — `detailing-edit-retroactive.test.ts` — already pins the wiring in isolation.
 * What only the app can answer is that the edit made through the REAL control travels the
 * whole way, and that the user is told which levels stopped being current.
 *
 * The edit is made through `count-bottomSpanLayers-…`, the same control `rc-design.spec.ts` B1
 * uses. Nothing here goes through a test hook.
 */

import { test, expect, loadModel, solveModel, computeDemands } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1400, height: 900 } });

/** The persisted assemblies — what a reopened project would contain. */
function assemblies(page: Page): Promise<Array<{
  id: string; detailingRevision: number; state: string; elementIds: number[];
}>> {
  return page.evaluate(() =>
    (window.__stabileo as unknown as { detailingAssemblies(): Array<{
      id: string; detailingRevision: number; state: string; elementIds: number[];
    }> }).detailingAssemblies());
}

/** A designed, detailed project with the detailing panel open. */
async function detailed(page: Page): Promise<number[]> {
  const ids = await loadModel(page, 'rc-design-qa-8');
  await solveModel(page);
  await computeDemands(page);
  await page.evaluate(() => window.__stabileoActions.designAll());
  await expect.poll(() =>
    page.evaluate(() => window.__stabileo.runCounts()?.verified ?? 0)).toBeGreaterThan(0);
  await expect.poll(async () => (await assemblies(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  return ids;
}

/**
 * Open the detailing panel, if it is not already open.
 *
 * `<details>` toggles, so an unconditional click on the summary CLOSES an open panel — and a
 * control inside a closed one resolves in the DOM and is not clickable, which is a sixty-second
 * timeout rather than an assertion failure.
 */
async function openPanel(page: Page) {
  const d = page.getByTestId('detailing-disclosure');
  await expect(d).toBeAttached();
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
}

/** Change one beam's bottom-bar count through the real control. Returns the member. */
async function editABeam(page: Page, ids: number[]): Promise<number> {
  const beam = await page.evaluate(
    (list) => list.find((id) => window.__stabileo.rebarSummary(id).startsWith('b')) ?? list[0],
    ids);
  await page.getByTestId('filter-all').click();
  await page.getByTestId(`row-expand-${beam}`).click();
  const count = page.getByTestId(`count-bottomSpanLayers-0-${beam}`);
  await expect(count).toBeVisible();
  const before = Number(await count.inputValue());
  await count.fill(String(before + 1));
  await count.blur();
  return beam;
}

test.describe('@slow an edit reaches the detailing it invalidates', () => {
  /*
   * The defect. `_setOnReinforcementCommit` invalidated the VERIFICATION and nothing touched
   * the assemblies, so `model.detailing` kept the bars from before the edit — and every
   * projection built from it went on describing steel the model no longer had.
   */
  test('E1 — the level the edited member is on bumps its revision', async ({ pro: page }) => {
    const ids = await detailed(page);
    const before = await assemblies(page);
    const beam = await editABeam(page, ids);

    const owner = before.find((a) => a.elementIds.includes(beam));
    expect(owner, 'the edited member is on an assembly').toBeDefined();

    await expect.poll(async () => (await assemblies(page))
      .find((a) => a.id === owner!.id)?.detailingRevision)
      .toBe(owner!.detailingRevision + 1);
  });

  /*
   * CONSTRUCTIBLE is a claim that the bars FIT. New bars have not been checked, so the claim
   * drops back rather than being carried over onto steel nobody verified.
   */
  test('E2 — and it loses the state it had earned', async ({ pro: page }) => {
    const ids = await detailed(page);
    const before = await assemblies(page);
    const beam = await editABeam(page, ids);
    const owner = before.find((a) => a.elementIds.includes(beam))!;
    test.skip(owner.state === 'DRAFT' || owner.state === 'VERIFIED',
      'this level had earned no state to lose');

    await expect.poll(async () => (await assemblies(page))
      .find((a) => a.id === owner.id)?.state).toBe('VERIFIED');
  });

  /*
   * The precision it turns on: an edit to one beam invalidates the level it is on and no other.
   * A blanket invalidation would tell a user their whole building was out of date because they
   * changed one bar.
   */
  test('E3 — every other level is left exactly as it was', async ({ pro: page }) => {
    const ids = await detailed(page);
    const before = await assemblies(page);
    test.skip(before.length < 2, 'this model has one level');
    const beam = await editABeam(page, ids);
    const owner = before.find((a) => a.elementIds.includes(beam))!;

    await expect.poll(async () => {
      const now = await assemblies(page);
      return before
        .filter((a) => a.id !== owner.id)
        .every((a) => now.find((b) => b.id === a.id)?.detailingRevision === a.detailingRevision);
    }).toBe(true);
  });
});

test.describe('@slow the user is told which levels stopped being current', () => {
  /*
   * An assembly that silently drops from CONSTRUCTIBLE back to VERIFIED is a state change with
   * no author. The notice names the members edited and the levels invalidated, because a
   * message that said "the detailing is out of date" would be true of a one-beam edit and of a
   * fifty-beam one alike.
   */
  test('E4 — the notice names the members and the levels', async ({ pro: page }) => {
    const ids = await detailed(page);
    await openPanel(page);
    await expect(page.getByTestId('detailing-edited')).toHaveCount(0);

    const beam = await editABeam(page, ids);
    await openPanel(page);

    const notice = page.getByTestId('detailing-edited');
    await expect(notice).toBeVisible();
    await expect(page.getByTestId('detailing-edited-what')).toContainText(String(beam));
    await expect(page.getByTestId('detailing-edited-what')).toContainText('1 detailing level');
  });

  /*
   * And it is ANSWERED rather than dismissed. There is no dismiss control on purpose: silencing
   * a statement about the project without changing the project is the one thing it must not
   * allow.
   */
  test('E5 — regenerating clears it, and nothing else does', async ({ pro: page }) => {
    const ids = await detailed(page);
    await editABeam(page, ids);
    await openPanel(page);
    await expect(page.getByTestId('detailing-edited')).toBeVisible();

    await page.getByTestId('detailing-edited-regenerate').click();
    await expect(page.getByTestId('detailing-edited')).toHaveCount(0, { timeout: 60_000 });
  });
});

test.describe('@slow the drawing follows the assemblies', () => {
  /*
   * The other end of the same wire. The invalidation reaching the assemblies is only useful if
   * what is DRAWN comes from them, so the sheet's title block must carry the revision the
   * assembly carries — not one cached from before the edit.
   *
   * What this deliberately does NOT assert is that the regenerated steel differs from the
   * steel before the edit. It does not, and that is the app's design rather than a defect:
   * `runDetailing` details from the DESIGN outcomes, so a regeneration reproduces the designed
   * arrangement. The app's answer to "keep my arrangement through a regeneration" is the pin —
   * `lockedBars`, objective 6 — and `detailing.spec.ts` D21 pins exactly that.
   */
  test('E6 — the sheet carries the revision the assembly carries', async ({ pro: page }) => {
    const ids = await detailed(page);
    await openPanel(page);
    await editABeam(page, ids);
    await openPanel(page);
    await page.getByTestId('detailing-edited-regenerate').click();
    await expect(page.getByTestId('detailing-edited')).toHaveCount(0, { timeout: 60_000 });

    await expect.poll(async () => {
      const sheet = await page.evaluate(() => (window.__stabileo as unknown as {
        detailingSheet(): { title: { sheetNumber: string; revision: number } } | null;
      }).detailingSheet());
      if (!sheet) return null;
      const owner = (await assemblies(page))
        .find((a) => sheet.title.sheetNumber.startsWith(a.id));
      return owner ? sheet.title.revision === owner.detailingRevision : null;
    }, { timeout: 30_000 }).toBe(true);
  });
});
