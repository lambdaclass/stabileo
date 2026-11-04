/**
 * Interaction contracts between the model, design and documents.
 *
 * ── What this file is for ──────────────────────────────────────────
 *
 * Each test states ONE thing a user must be able to rely on while moving between the model, the
 * design surfaces and the documents: the selection survives the trip, the camera does not move
 * under them, a member chosen in one place is the member shown in the next, an unsaved edit is not
 * dropped without a word, a model change marks what it invalidates, a delete key never reaches
 * the model from behind an overlay.
 *
 * The tests are written against what is OBSERVABLE — the model selection, the camera, the design's
 * current member, the topmost surface on screen — and not against today's layout. Everything that
 * depends on WHERE a surface lives today (how design is entered and left, how the 3-D view is
 * opened, which ribbon command shows a panel) is in the small helpers right below this comment. A
 * reorganisation of the interface rewrites those helpers and keeps the tests.
 *
 * ── Expected failures ──────────────────────────────────────────────
 *
 * A contract the application does not meet yet is a `test.fail()` with one line naming the
 * defect. The suite stays green while the defect stands and turns red the day the contract is met,
 * which is the cue to drop the `.fail` (as `it.fails` does in the unit suite). Every one of them was
 * run and observed failing for the reason it names.
 *
 * Fixtures: `rc-design-qa-8` (eight concrete members; designed and detailed where a contract needs
 * bars), `3d-portal-frame` (steel, for the joints and the other codes), `3d-building` (enough
 * members for the navigator to scroll).
 */
import {
  test, expect, loadModel, solveModel, designAll, openDeskStage, deskTab, designPlace } from './fixtures';
import type { Page, Locator } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Mark the running test as a contract the application does not meet yet, for the reason given.
 * `CONTRACTS_RAW=1` runs every contract as a plain test, to see what each one observes today.
 * Every contract below is met today (C8, C8b, C9, C12, C12b and C13 were the last to be); a new
 * one the application does not meet yet is written with this.
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

/** Make `id` design's current member, from inside design. */
async function pickDesignMember(page: Page, id: number): Promise<void> {
  await page.getByTestId(`desk-row-${id}`).click();
}

/** Design's current member, as design names it; null when design shows none. */
/** The member the desk's inspector holds: its id (the heading reads its name, `member-names.ts`). */
async function designCurrentMember(page: Page): Promise<number | null> {
  const head = page.getByTestId('desk-inspector').locator('h4[data-member-id]');
  if (await head.count() === 0) return null;
  const id = await head.getAttribute('data-member-id');
  return id ? Number(id) : null;
}

/** Whether design's member list is long enough to scroll, and how far it is scrolled. */
async function memberListScroll(page: Page): Promise<{ overflows: boolean; top: number }> {
  return page.getByTestId('desk-navigator').locator('ul').evaluate((ul) => ({
    overflows: ul.scrollHeight > ul.clientHeight + 1, top: ul.scrollTop,
  }));
}

/** From design, ask to see the current member in the model. */
async function showCurrentInModel(page: Page): Promise<void> {
  await page.getByTestId('desk-show-in-model').click();
}

/** From design, open the 3-D reinforcement view on the current member. */
async function openDesign3D(page: Page): Promise<void> {
  await page.getByTestId('desk-open-3d').click();
}

/** The 3-D reinforcement view. */
function view3D(page: Page): Locator {
  return page.getByTestId('rebar-workspace');
}

/** Open the 3-D reinforcement view from the coordinated detailing (the Detail step's rail). */
async function open3DFromDetailing(page: Page): Promise<void> {
  await designPlace(page, 'detailing');
  await page.getByTestId('desk-rail-3d').click();
  await expect(view3D(page)).toBeVisible();
}

/** Close the 3-D view by its close control. */
async function close3D(page: Page): Promise<void> {
  await page.getByTestId('rebar-workspace-close').click();
  await expect(view3D(page)).toBeHidden();
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
function rebarSelection(page: Page): Promise<number[]> {
  return page.evaluate(() => (window.__stabileo as unknown as { rebarSelection(): number[] }).rebarSelection());
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
    return !!hit && !hit.closest('[data-testid="design-desk"], [data-testid="rebar-workspace"]');
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

/** Make an unsaved edit in the frame editor of a verified beam; returns the beam and its stored bars. */
async function frameDraft(page: Page): Promise<{ id: number; stored: string }> {
  const rows = page.locator('[data-testid^="desk-row-"]').filter({ has: page.locator('.dot.st-ok') });
  await expect(rows.first()).toBeVisible({ timeout: 45_000 });
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    await rows.nth(i).click();
    if (await page.getByTestId('desk-open-frame').isVisible()) break;
  }
  const id = (await designCurrentMember(page))!;
  const stored = await page.evaluate((e) => JSON.stringify(window.__stabileo.reinforcement(e)), id);
  await page.getByTestId('desk-open-frame').click();
  await page.locator('[data-testid^="frame-bar-b"]').last().click();
  const count = page.getByTestId('frame-bar-count');
  await count.fill(String(Number(await count.inputValue()) + 1));
  await count.press('Enter');
  await expect(page.getByTestId('frame-state')).toHaveText(/Unsaved|Sin guardar/);
  return { id, stored };
}

/** The surface that would receive a click at the centre of the window. */
async function topmostAtCentre(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const owner = el?.closest('[data-testid="rebar-workspace"], [data-testid="design-desk"]');
    return owner?.getAttribute('data-testid') ?? (el ? 'model' : null);
  });
}

/** qa-8 solved and designed, design not open. */
async function designedFrame(page: Page): Promise<void> {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
}

/** The coordinated detailing: design's Detail step. */
async function openDetailing(page: Page): Promise<void> {
  await designPlace(page, 'detailing');
}

/** qa-8 designed and detailed. */
async function detailedFrame(page: Page): Promise<void> {
  await designedFrame(page);
  await openDetailing(page);
  await page.getByTestId('cmd-generate-detailing').click();
  await expect.poll(() => page.evaluate(() => (window.__stabileo as unknown as
    { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 45_000 }).toBeGreaterThan(0);
}

/** A member of the open design list whose design verified and carries bars. */
async function verifiedRow(page: Page): Promise<number> {
  const row = page.locator('[data-testid^="desk-row-"]').filter({ has: page.locator('.dot.st-ok') }).first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  return Number((await row.getAttribute('data-testid'))!.replace('desk-row-', ''));
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
    await designedFrame(page);
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    await selectInModel(page, [ids[5]!]);
    await enterDesign(page);
    await expect.poll(() => designCurrentMember(page)).toBe(ids[5]);
  });

  test('@smoke C3 — «show in model» selects the member and frames it', async ({ pro: page }) => {
    await designedFrame(page);
    await countFraming(page);
    await enterDesign(page);
    const id = await verifiedRow(page);
    await pickDesignMember(page, id);
    await showCurrentInModel(page);
    await expect(designSurface(page)).toBeHidden();
    expect(await modelSelection(page)).toEqual([id]);
    await expect.poll(async () => (await framing(page)).sel).toBeGreaterThan(0);
  });

  test('@smoke C4 — opening 3-D reinforcement from design shows that member, as the topmost surface', async ({ pro: page }) => {
    await detailedFrame(page);
    await enterDesign(page);
    const id = await verifiedRow(page);
    await pickDesignMember(page, id);
    await openDesign3D(page);
    await expect(view3D(page)).toBeVisible();
    expect(await topmostAtCentre(page)).toBe('rebar-workspace');
    expect(await rebarSelection(page)).toEqual([id]);
  });

  test('@smoke C5 — Escape in the 3-D view returns to design without closing design', async ({ pro: page }) => {
    await detailedFrame(page);
    await enterDesign(page);
    const id = await verifiedRow(page);
    await pickDesignMember(page, id);
    await openDesign3D(page);
    await expect(view3D(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(view3D(page)).toBeHidden();
    await expect(designSurface(page)).toBeVisible();
    expect(await designCurrentMember(page)).toBe(id);
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

  test('@smoke C6b — opening and closing the 3-D view leaves the model camera where it was', async ({ pro: page }) => {
    await detailedFrame(page);
    await expect.poll(() => camera(page)).not.toBeNull();
    const before = await camera(page);
    await open3DFromDetailing(page);
    await close3D(page);
    expectSameCamera(await camera(page), before);
  });

  test('@smoke C7 — returning to design restores its view, level, filter and current member', async ({ pro: page }) => {
    await designedFrame(page);
    await enterDesign(page);
    const id = await verifiedRow(page);
    await page.getByTestId('desk-filter-ok').click();
    await pickDesignMember(page, id);
    const level = await page.getByTestId('desk-level').inputValue();
    await deskTab(page, 'levels');
    await leaveDesignByClose(page);
    await enterDesign(page);
    await expect(page.getByTestId('desk-levels')).toBeVisible();
    await expect(page.getByTestId('desk-filter-ok')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('desk-level')).toHaveValue(level);
    expect(await designCurrentMember(page)).toBe(id);
  });

  test('@smoke C7b — returning to design brings the current member\'s row back into view', async ({ pro: page }) => {
    await designedFrame(page);
    // A window short enough that qa-8's eight members overflow the list. Design docked under the
    // ribbon shares the window's height with the app's bars and the rail's own entries; on a short
    // window the rail lays its places in two columns to leave the list its height (interface A),
    // so the list overflows at 480 px; at 300 px there is no room left for a list at all.
    await page.setViewportSize({ width: 1440, height: 480 });
    await enterDesign(page);
    expect((await memberListScroll(page)).overflows, 'the member list scrolls').toBe(true);
    const last = page.locator('[data-testid^="desk-row-"]').last();
    await last.scrollIntoViewIfNeeded();
    await last.click();
    const id = Number((await last.getAttribute('data-testid'))!.replace('desk-row-', ''));
    expect((await memberListScroll(page)).top).toBeGreaterThan(0);
    await leaveDesignByClose(page);
    await enterDesign(page);
    expect(await designCurrentMember(page)).toBe(id);
    await expect(page.getByTestId(`desk-row-${id}`)).toBeInViewport();
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

  test('@smoke C9 — the member list keeps its filter, search and open row across a change of place', async ({ pro: page }) => {
    await designedFrame(page);
    await designPlace(page, 'list');
    await page.getByTestId('filter-ok').click();
    const first = page.locator('[data-testid^="design-row-"]').first();
    const id = Number((await first.getAttribute('data-testid'))!.replace('design-row-', ''));
    await page.getByTestId('design-search').fill(String(id));
    await page.getByTestId(`row-expand-${id}`).click();
    await expect(page.getByTestId(`design-detail-${id}`)).toBeVisible();
    await designPlace(page, 'designData');
    await designPlace(page, 'list');
    await expect(page.getByTestId('filter-ok')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('design-search')).toHaveValue(String(id));
    await expect(page.getByTestId(`design-detail-${id}`)).toBeVisible();
  });

  test('@smoke C10 — the active modelling level is design\'s initial level', async ({ pro: page }) => {
    await designedFrame(page);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-from-model').click();
    const radios = page.locator('[data-testid^="grid-activate-"]');
    await expect.poll(() => radios.count()).toBeGreaterThan(1);
    const zNow = () => page.evaluate(() => (window.__stabileo as unknown as { nodeCreateZ(): number }).nodeCreateZ());
    // Work on a level above the ground, whichever row lists it.
    for (let i = 0; i < await radios.count() && await zNow() === 0; i++) await radios.nth(i).check();
    const z = await zNow();
    expect(z).toBeGreaterThan(0);
    await enterDesign(page);
    await expect(page.getByTestId('desk-level')).toHaveValue(String(z));
  });

  test('@smoke C11 — an unsaved edit in a design editor is neither applied nor dropped without a word on leaving', async ({ pro: page }) => {
    await designedFrame(page);
    await enterDesign(page);
    const rows = page.locator('[data-testid^="desk-row-"]').filter({ has: page.locator('.dot.st-ok') });
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click();
      if (await page.getByTestId('desk-open-frame').isVisible()) break;
    }
    const id = (await designCurrentMember(page))!;
    const stored = await page.evaluate((e) => JSON.stringify(window.__stabileo.reinforcement(e)), id);
    await page.getByTestId('desk-open-frame').click();
    await page.locator('[data-testid^="frame-bar-b"]').last().click();
    const count = page.getByTestId('frame-bar-count');
    await count.fill(String(Number(await count.inputValue()) + 1));
    await count.press('Enter');
    await expect(page.getByTestId('frame-state')).toHaveText(/Unsaved|Sin guardar/);

    await leaveDesignByClose(page);
    // Not applied behind the user's back.
    expect(await page.evaluate((e) => JSON.stringify(window.__stabileo.reinforcement(e)), id)).toBe(stored);
    // And not dropped without a word: either design is still open asking, or the draft is there on return.
    if (await designSurface(page).isHidden()) {
      await enterDesign(page);
      await deskTab(page, 'frame');
    }
    await expect(page.getByTestId('frame-state')).toHaveText(/Unsaved|Sin guardar/);
  });

  test('@smoke C12 — a model change marks the designed members out of date', async ({ pro: page }) => {
    await designedFrame(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[0]!;
    expect(await page.evaluate((e) => window.__stabileo.displayStatus(e), id)).toBe('ok');
    await changeSectionOf(page, id);
    await expect.poll(() => page.evaluate((e) => window.__stabileo.displayStatus(e), id)).toBe('stale');
    await enterDesign(page);
    await expect(page.getByTestId(`desk-row-${id}`)).toBeVisible();
  });

  test('@smoke C12d — a model change marks the documents out of date', async ({ pro: page }) => {
    await detailedFrame(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[0]!;
    await changeSectionOf(page, id);
    await enterDesign(page);
    await deskTab(page, 'documents');
    await expect(designSurface(page).getByTestId('documents-outdated')).toBeVisible();
  });

  test('@smoke C12b — design states that its results are out of date because the model changed', async ({ pro: page }) => {
    await designedFrame(page);
    const id = (await page.evaluate(() => window.__stabileo.elementIds()))[0]!;
    await changeSectionOf(page, id);
    await enterDesign(page);
    await expect(designSurface(page)).toContainText(/model (has )?changed|out of date/i);
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
    await designedFrame(page);
    await enterDesign(page);
    const id = await verifiedRow(page);
    await pickDesignMember(page, id);
    await leaveDesignByClose(page);
    await page.locator('.tab-add').click();
    await designedFrame(page);
    await enterDesign(page);
    await expect.poll(() => designCurrentMember(page), { timeout: 30_000 }).not.toBe(id);
  });

  test('@slow C17 — the 3-D view drops a selected member that no longer exists after re-detailing', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await detailedFrame(page);
    await open3DFromDetailing(page);
    // A beam (the last member), so the frame stays stable without it.
    const rows = page.locator('[data-testid="rebar-element-list"] button[data-testid^="rebar-element-"]');
    const victim = Number((await rows.last().getAttribute('data-testid'))!.replace('rebar-element-', ''));
    await rows.last().click();
    expect(await rebarSelection(page)).toEqual([victim]);
    await close3D(page);
    await leaveDesignForModel(page);
    await selectInModel(page, [victim]);
    await page.locator('body').press('Delete');
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds())).not.toContain(victim);
    // Redesign every member that is left. C25 pins that «Design all» does the same now; it re-ran
    // only 2 of the 7 here before (runCounts().total 2) and the detailing refused the rest.
    await solveModel(page);
    await page.evaluate(async () => { await (window.__stabileoActions as unknown as { autoDesign(ids: number[]): unknown }).autoDesign(window.__stabileo.elementIds()); });
    await openDetailing(page);
    const generate = page.getByTestId('cmd-generate-detailing');
    await expect(generate).toBeEnabled({ timeout: 180_000 });
    await generate.click();
    await expect.poll(() => page.evaluate((v) => (window.__stabileo as unknown as { detailingAssemblies(): Array<{ elementIds: number[] }> })
      .detailingAssemblies().some((a) => a.elementIds.includes(v)), victim), { timeout: 60_000 }).toBe(false);
    expect(await rebarSelection(page)).not.toContain(victim);
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

  test('@smoke C18b — Delete while the 3-D view is open never deletes model members', async ({ pro: page }) => {
    await detailedFrame(page);
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    await selectInModel(page, [ids[4]!]);
    await open3DFromDetailing(page);
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
    expect(await page.evaluate(() => window.__stabileo.elementIds())).toEqual(ids);
  });

  test('@smoke C19 — a detailing-conflict row selects and frames its member', async ({ pro: page }) => {
    const ids = await loadModel(page, 'rc-design-qa-8');
    const target = ids[5]!;
    await page.evaluate((t) => {
      (window.__stabileoActions as unknown as { seedDetailing(x: unknown): void }).seedDetailing([{
        id: 'ASM-1', kind: 'beamLine', label: 'L1', elementIds: [t],
        bars: [], marks: [], joints: [], unsupported: [],
        conflicts: [{
          severity: 'clearance', barA: 'a', barB: 'b', at: { x: 0, y: 0, z: 3 },
          clearance: 0.011, required: 0.025, shortfall: 0.014, elementIds: [t],
        }],
        detailingRevision: 1, demandRevision: 5, state: 'CONSTRUCTIBLE', maturity: 'IMPLEMENTED_PROVISIONAL',
        provenance: { edition: '2025', verifierId: 'cirsoc201.provided.v2.2025', trace: [], assumptions: [] },
      }]);
    }, target);
    await countFraming(page);
    await openDetailing(page);
    await page.getByTestId(`conflict-member-${target}`).click();
    await expect.poll(() => modelSelection(page)).toEqual([target]);
    await expect.poll(async () => (await framing(page)).sel).toBeGreaterThan(0);
  });
  test('@smoke C20 — design is entered with the model viewer on screen, and a pick in either is the other\'s', async ({ pro: page }) => {
    await designedFrame(page);
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    await selectInModel(page, [ids[2]!]);
    await enterDesign(page);
    expect(await viewerShown(page), 'the viewer is visible beside design').toBe(true);
    await expect.poll(() => designCurrentMember(page)).toBe(ids[2]);
    await expect(page.getByTestId(`desk-row-${ids[2]}`)).toHaveClass(/on/);
    // A pick in the viewer (the model selection) is design's member; a pick in design is the model's.
    await selectInModel(page, [ids[6]!]);
    await expect.poll(() => designCurrentMember(page)).toBe(ids[6]);
    await pickDesignMember(page, ids[1]!);
    expect(await modelSelection(page)).toEqual([ids[1]]);
  });

  test('@smoke C21 — leaving design for another stage keeps an unsaved frame edit as a draft and says so', async ({ pro: page }) => {
    await designedFrame(page);
    await enterDesign(page);
    const { id, stored } = await frameDraft(page);
    await leaveDesignForModel(page);
    await expect(page.locator('.toast').filter({ hasText: /draft|borrador/i })).toBeVisible();
    expect(await page.evaluate((e) => JSON.stringify(window.__stabileo.reinforcement(e)), id)).toBe(stored);
    await enterDesign(page);
    await expect(page.getByTestId('desk-drafts')).toBeVisible();
    await deskTab(page, 'frame');
    await expect(page.getByTestId('frame-state')).toHaveText(/Unsaved|Sin guardar/);
    // «Discard» drops it, and design stops announcing it.
    await page.getByTestId('frame-discard').click();
    await expect(page.getByTestId('desk-drafts')).toBeHidden();
    expect(await page.evaluate((e) => JSON.stringify(window.__stabileo.reinforcement(e)), id)).toBe(stored);
  });

  test('@slow C22 — a project tab keeps its own design state, drafts and member', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await designedFrame(page);
    await enterDesign(page);
    const { id } = await frameDraft(page);
    await page.getByTestId('desk-filter-ok').click();
    await leaveDesignByClose(page);
    await newProjectTab(page);
    await designedFrame(page);
    await enterDesign(page);
    // The other project's draft, filter and member are not here.
    await expect(page.getByTestId('desk-drafts')).toBeHidden();
    await expect(page.getByTestId('desk-filter-all')).toHaveAttribute('aria-checked', 'true');
    expect(await designCurrentMember(page)).toBeNull();
    await leaveDesignByClose(page);
    await backToFirstTab(page);
    await enterDesign(page);
    await expect(page.getByTestId('desk-filter-ok')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => designCurrentMember(page), { timeout: 60_000 }).toBe(id);
    await expect(page.getByTestId('desk-drafts')).toBeVisible();
  });

  test('@slow C23 — a member deleted in the model leaves design, the model and the 3-D view selections', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await detailedFrame(page);
    await enterDesign(page);
    const id = await verifiedRow(page);
    await pickDesignMember(page, id);
    await openDesign3D(page);
    expect(await rebarSelection(page)).toEqual([id]);
    await page.keyboard.press('Escape');
    await leaveDesignForModel(page);
    expect(await modelSelection(page)).toEqual([id]);
    await page.locator('body').press('Delete');
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds())).not.toContain(id);
    expect(await modelSelection(page)).toEqual([]);
    expect(await rebarSelection(page)).toEqual([]);
    await enterDesign(page);
    expect(await designCurrentMember(page)).toBeNull();
    await expect(page.getByTestId(`desk-row-${id}`)).toHaveCount(0);
  });

  test('@slow C25 — «Design all» after a member is deleted designs every member left, and the detailing takes them', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await designedFrame(page);
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    const victim = ids[ids.length - 1]!;
    // A member is deleted in the model: design, open from the start, is left for the model stage.
    await leaveDesignForModel(page);
    await selectInModel(page, [victim]);
    await page.locator('body').press('Delete');
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds())).not.toContain(victim);
    await solveModel(page);
    await page.evaluate(() => window.__stabileoActions.designAll());
    await expect.poll(() => page.evaluate(() => window.__stabileo.runCounts()?.total ?? 0), { timeout: 180_000 }).toBe(ids.length - 1);
    await openDetailing(page);
    const generate = page.getByTestId('cmd-generate-detailing');
    await expect(generate).toBeEnabled({ timeout: 60_000 });
  });

  test('@smoke C24 — with nothing to design, design offers its two ways in, each saying what is missing', async ({ pro: page }) => {
    await enterDesign(page);
    // Preparing is where an empty project stands, and its step says so; pressing it shows the ways in.
    await expect(page.getByTestId('desk-step-prepare')).toHaveAttribute('aria-current', 'step');
    await page.getByTestId('desk-step-prepare').click();
    const existing = page.getByTestId('desk-route-existing');
    const scratch = page.getByTestId('desk-route-scratch');
    await expect(existing).toBeVisible();
    await expect(scratch).toBeVisible();
    await expect(page.getByTestId('desk-route-existing-missing').locator('li')).not.toHaveCount(0);
    await expect(page.getByTestId('desk-route-scratch-missing').locator('li')).not.toHaveCount(0);
    // The scratch route opens the existing building constructor, in the model.
    await page.getByTestId('desk-route-building').click();
    await expect(designSurface(page)).toBeHidden();
    await expect(page.getByTestId('pr-cmd-building')).toHaveCount(0);
    await expect(page.getByTestId('pr-more-moreTools')).toHaveClass(/active/);
  });
});
