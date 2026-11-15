/**
 * Interaction contracts between the model, design and documents.
 *
 * ── What this file is for ──────────────────────────────────────────
 *
 * Each test states ONE thing a user must be able to rely on while moving between the model, the
 * design surfaces and the documents: the selection survives the trip, the camera does not move
 * under them, a member chosen in one place is the member shown in the next, a model change marks
 * what it invalidates, a delete key never reaches the model from behind an overlay.
 *
 * The tests are written against what is OBSERVABLE — the model selection, the camera, the design's
 * current member, the topmost surface on screen — and not against today's layout. Everything that
 * depends on WHERE a surface lives today (how design is entered and left, which ribbon command
 * shows a panel) is in the small helpers right below this comment. A
 * reorganisation of the interface rewrites those helpers and keeps the tests.
 *
 * ── Expected failures ──────────────────────────────────────────────
 *
 * A contract the application does not meet yet is a `test.fail()` with one line naming the
 * defect. The suite stays green while the defect stands and turns red the day the contract is met,
 * which is the cue to drop the `.fail` (as `it.fails` does in the unit suite). Every one of them was
 * run and observed failing for the reason it names.
 *
 * Fixtures: `rc-design-qa-8` (eight concrete members, designed where a contract needs it) and
 * `3d-portal-frame` (steel: its members are the ones design's piece sheet shows).
 */
import {
  test, expect, loadModel, solveModel, designAll, openDeskStage, designPlace } from './fixtures';
import type { Page, Locator } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Mark the running test as a contract the application does not meet yet, for the reason given.
 * `CONTRACTS_RAW=1` runs every contract as a plain test, to see what each one observes today.
 * Every contract below is met today; a new one the application does not meet yet is written with
 * this.
 */
function knownDefect(reason: string): void {
  test.fail(process.env.CONTRACTS_RAW !== '1', reason);
}

// ─── Place-specific steps: a layout migration rewrites these, not the tests ────────────────────

/**
 * Enter design from the model. Today: the Design stage, which opens the design desk docked around
 * the model viewer (desktop), so the viewer stays on screen in design.
 */
async function enterDesign(page: Page): Promise<void> {
  await openDeskStage(page);
}

/**
 * Leave design by its way out. Design is a stage of its own, docked around the viewer, so on a
 * desktop its way out is the stage bar: the Model stage.
 */
async function leaveDesignByClose(page: Page): Promise<void> {
  await page.getByTestId('pr-stage-model').click();
  await expect(designSurface(page)).toBeHidden();
}

/** Leave design with the keyboard. */
async function leaveDesignByEscape(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(designSurface(page)).toBeHidden();
}

/** The design surface as a whole. */
function designSurface(page: Page): Locator {
  return page.getByTestId('design-desk');
}

/** The member the desk's piece sheet holds: its id (the heading reads its name, `member-names.ts`). */
async function designCurrentMember(page: Page): Promise<number | null> {
  const head = page.getByTestId('desk-inspector').locator('h4[data-member-id]');
  if (await head.count() === 0) return null;
  const id = await head.getAttribute('data-member-id');
  return id ? Number(id) : null;
}

/** From design, ask to see the current member in the model. */
async function showCurrentInModel(page: Page): Promise<void> {
  await page.getByTestId('desk-show-in-model').click();
}

/** The model's selected members. */
function modelSelection(page: Page): Promise<number[]> {
  return page.evaluate(() => window.__stabileo.selection());
}

/** Select members in the model, as a pick in the viewport does. */
async function selectInModel(page: Page, ids: number[]): Promise<void> {
  await page.evaluate((x) => (window.__stabileoActions as unknown as { selectElements(i: number[]): void }).selectElements(x), ids);
}

type Cam = { up: number[]; pos: number[]; target: number[]; polarDeg: number } | null;
function camera(page: Page): Promise<Cam> {
  return page.evaluate(() => (window.__stabileo as unknown as { cameraState(): Cam }).cameraState());
}
/**
 * The camera is where it was: the same vectors to a micrometre. Re-reading the camera after a
 * resize recomputes it with float noise in the last digits (1e-14), which is not a move.
 */
function expectSameCamera(after: Cam, before: Cam): void {
  expect(after).not.toBeNull();
  for (const k of ['up', 'pos', 'target'] as const) {
    after![k].forEach((v, i) => expect(v, `camera ${k}[${i}]`).toBeCloseTo(before![k][i]!, 6));
  }
  expect(after!.polarDeg).toBeCloseTo(before!.polarDeg, 6);
}

/** Count the framing requests the model view receives, by kind. */
async function countFraming(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: { sel: number; fit: number } };
    w.__frames = { sel: 0, fit: 0 };
    window.addEventListener('stabileo-zoom-to-selection', () => { w.__frames.sel++; });
    window.addEventListener('stabileo-zoom-to-fit', () => { w.__frames.fit++; });
  });
}
function framing(page: Page): Promise<{ sel: number; fit: number }> {
  return page.evaluate(() => ({ ...(window as unknown as { __frames: { sel: number; fit: number } }).__frames }));
}

/** Whether the model viewer is on screen, and not covered, while design is open. */
async function viewerShown(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const c = document.querySelector('.viewport-container canvas');
    if (!c) return false;
    const r = c.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && !hit.closest('[data-testid="design-desk"]');
  });
}

/** Leave design for the model stage, by the stage bar. */
async function leaveDesignForModel(page: Page): Promise<void> {
  await page.getByTestId('pr-stage-model').click();
  await expect(designSurface(page)).toBeHidden();
}

/** Open a new project tab, and come back to the first one. */
async function newProjectTab(page: Page): Promise<void> {
  await page.locator('.tab-add').click();
}
async function backToFirstTab(page: Page): Promise<void> {
  await page.locator('.tab-bar .tab').first().click();
}

/** qa-8 solved and designed, design not open. */
async function designedFrame(page: Page): Promise<void> {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
}

/** The steel portal with a combination, solved (as `other-codes.spec.ts` prepares it). */
async function steelPortal(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.__stabileoActions.loadExample('3d-portal-frame');
    const a = window.__stabileoActions as unknown as { updateSection(id: number, d: unknown): void; combineCases(n: string): void };
    a.updateSection(1, { shape: 'I', tw: 0.0108, tf: 0.0162 });
    a.combineCases('1.0 todos');
  });
  await solveModel(page);
}

/** A model change: the section of member `id` made wider. */
async function changeSectionOf(page: Page, id: number): Promise<void> {
  await page.evaluate((e) => {
    const sec = (window.__stabileo as unknown as { entityData(k: string, id: number): { sectionId: number } }).entityData('element', e).sectionId;
    (window.__stabileoActions as unknown as { updateSection(id: number, d: unknown): void }).updateSection(sec, { b: 0.45 });
  }, id);
}

/** Visit another stage and come back to design, where it was left. */
async function roundTripFromClassicDesign(page: Page): Promise<void> {
  await page.getByTestId('pr-stage-model').click();
  await openDeskStage(page);
}

// ─── The contracts ──────────────────────────────────────────────────────────────────────────────

test.describe('interaction contracts', () => {
  test('@smoke C1 — the model selection survives model → design → model (close control)', async ({ pro: page }) => {
    const ids = await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await selectInModel(page, [ids[4]!]);
    await enterDesign(page);
    await leaveDesignByClose(page);
    expect(await modelSelection(page)).toEqual([ids[4]]);
  });

  test('@smoke C1b — the model selection survives model → design → model (Escape)', async ({ pro: page }) => {
    const ids = await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await selectInModel(page, [ids[4]!]);
    await enterDesign(page);
    await leaveDesignByEscape(page);
    expect(await modelSelection(page)).toEqual([ids[4]]);
  });

  test('@smoke C2 — entering design shows the model\'s selected member as design\'s current member', async ({ pro: page }) => {
    await steelPortal(page);
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    await selectInModel(page, [ids[1]!]);
    await enterDesign(page);
    await expect.poll(() => designCurrentMember(page)).toBe(ids[1]);
  });

  test('@smoke C3 — «show in model» selects the member and frames it', async ({ pro: page }) => {
    await steelPortal(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[0]!;
    await countFraming(page);
    await enterDesign(page);
    await selectInModel(page, [id]);
    await expect.poll(() => designCurrentMember(page)).toBe(id);
    await showCurrentInModel(page);
    await expect(designSurface(page)).toBeHidden();
    expect(await modelSelection(page)).toEqual([id]);
    await expect.poll(async () => (await framing(page)).sel).toBeGreaterThan(0);
  });

  test('@smoke C6 — opening and closing design leaves the model camera where it was', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await expect.poll(() => camera(page)).not.toBeNull();
    const before = await camera(page);
    await enterDesign(page);
    await leaveDesignByClose(page);
    expectSameCamera(await camera(page), before);
  });

  test('@smoke C7 — returning to design restores its place and current member', async ({ pro: page }) => {
    await steelPortal(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[1]!;
    await designPlace(page, 'connections');
    await selectInModel(page, [id]);
    await leaveDesignByClose(page);
    await enterDesign(page);
    await expect(page.getByTestId('desk-rail-connections')).toHaveClass(/on/);
    await expect.poll(() => designCurrentMember(page)).toBe(id);
  });

  test('@smoke C8 — returning to a stage restores the command last used in it (model)', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-sections').click();
    await expect(page.getByTestId('pr-cmd-sections')).toHaveClass(/active/);
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-stage-model').click();
    await expect(page.getByTestId('pr-cmd-sections')).toHaveClass(/active/);
  });

  test('@smoke C8b — returning to a stage restores the command last used in it (analysis)', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await expect(page.getByTestId('pr-cmd-advanced')).toHaveClass(/active/);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-stage-analyse').click();
    await expect(page.getByTestId('pr-cmd-advanced')).toHaveClass(/active/);
  });

  test('@smoke C12 — a model change marks the designed members out of date', async ({ pro: page }) => {
    await designedFrame(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[0]!;
    expect(await page.evaluate((e) => window.__stabileo.displayStatus(e), id)).toBe('ok');
    await changeSectionOf(page, id);
    await expect.poll(() => page.evaluate((e) => window.__stabileo.displayStatus(e), id)).toBe('stale');
  });

  test('@smoke C13 — an other-codes run survives leaving and returning, or says it must be run again', async ({ pro: page }) => {
    await steelPortal(page);
    await designPlace(page, 'otherCodes');
    await page.getByTestId('other-codes-run').click();
    await expect(page.getByTestId('other-codes-results')).toBeVisible();
    await roundTripFromClassicDesign(page);
    await designPlace(page, 'otherCodes');
    await expect(page.getByTestId('other-codes-results').or(page.getByTestId('other-codes-stale'))).toBeVisible();
  });

  test('@smoke C14 — a chosen joint survives a stage round trip', async ({ pro: page }) => {
    await steelPortal(page);
    await designPlace(page, 'connections');
    const rows = page.locator('.conn-joint-row');
    await expect(rows.first()).toBeVisible();
    const pick = rows.nth(Math.min(1, (await rows.count()) - 1));
    await pick.click();
    const chosen = await page.locator('.conn-joint-row.active').innerText();
    await roundTripFromClassicDesign(page);
    await designPlace(page, 'connections');
    await expect(page.locator('.conn-joint-row.active')).toHaveText(chosen);
  });

  test('@smoke C15 — a diagnostics row frames its selection, not the whole model', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    // qa-8 with a second member over e5's nodes: a duplicate is a finding that names its member.
    const file = await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()));
    const els = file.snapshot.elements as Array<[number, Record<string, unknown>]> | Array<Record<string, unknown>>;
    if (Array.isArray(els[0])) {
      const pairs = els as Array<[number, Record<string, unknown>]>;
      const [, e5] = pairs.find(([id]) => id === 5)!;
      pairs.push([99, { ...e5, id: 99 }]);
    } else {
      const list = els as Array<Record<string, unknown>>;
      list.push({ ...list.find((e) => e.id === 5)!, id: 99 });
    }
    expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), file)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds())).toContain(99);
    await countFraming(page);
    await page.evaluate(() => (window.__stabileoActions as unknown as { openProTab(t: string): void }).openProTab('diagnostics'));
    const row = page.locator('.diag-item').filter({ has: page.locator('.diag-refs') }).first();
    await expect(row).toBeVisible();
    await row.click();
    expect((await modelSelection(page)).length).toBeGreaterThan(0);
    await expect.poll(async () => (await framing(page)).sel).toBeGreaterThan(0);
    expect((await framing(page)).fit).toBe(0);
  });

  test('@smoke C16 — design\'s current member does not leak across project tabs', async ({ pro: page }) => {
    await steelPortal(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[0]!;
    await enterDesign(page);
    await selectInModel(page, [id]);
    await expect.poll(() => designCurrentMember(page)).toBe(id);
    await leaveDesignByClose(page);
    await newProjectTab(page);
    await steelPortal(page);
    await enterDesign(page);
    await expect.poll(() => designCurrentMember(page), { timeout: 30_000 }).not.toBe(id);
  });

  test('@smoke C18 — Delete while design is open never deletes model members', async ({ pro: page }) => {
    const ids = await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await selectInModel(page, [ids[4]!]);
    await enterDesign(page);
    await page.getByTestId('desk-inspector').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
    expect(await page.evaluate(() => window.__stabileo.elementIds())).toEqual(ids);
  });

  test('@smoke C20 — design is entered with the model viewer on screen, and a pick in the viewer is design\'s', async ({ pro: page }) => {
    await steelPortal(page);
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    await selectInModel(page, [ids[2]!]);
    await enterDesign(page);
    expect(await viewerShown(page), 'the viewer is visible beside design').toBe(true);
    await expect.poll(() => designCurrentMember(page)).toBe(ids[2]);
    await selectInModel(page, [ids[0]!]);
    await expect.poll(() => designCurrentMember(page)).toBe(ids[0]);
  });

  test('@slow C22 — a project tab keeps its own design place and member', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await steelPortal(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[1]!;
    await designPlace(page, 'connections');
    await selectInModel(page, [id]);
    await leaveDesignByClose(page);
    await newProjectTab(page);
    await steelPortal(page);
    await enterDesign(page);
    await expect(page.getByTestId('desk-rail-steel')).toHaveClass(/on/);
    expect(await designCurrentMember(page)).toBeNull();
    await leaveDesignByClose(page);
    await backToFirstTab(page);
    await enterDesign(page);
    await expect(page.getByTestId('desk-rail-connections')).toHaveClass(/on/);
    await expect.poll(() => designCurrentMember(page), { timeout: 60_000 }).toBe(id);
  });

  test('@slow C23 — a member deleted in the model leaves the design and the model selections', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await steelPortal(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[0]!;
    await enterDesign(page);
    await selectInModel(page, [id]);
    await expect.poll(() => designCurrentMember(page)).toBe(id);
    await leaveDesignForModel(page);
    expect(await modelSelection(page)).toEqual([id]);
    await page.locator('body').press('Delete');
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds())).not.toContain(id);
    expect(await modelSelection(page)).toEqual([]);
    await enterDesign(page);
    expect(await designCurrentMember(page)).toBeNull();
  });
});
