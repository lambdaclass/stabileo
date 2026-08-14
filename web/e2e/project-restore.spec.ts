/**
 * The returning user's whole path: open, reload, restore, and do the day's work.
 *
 * ── What this file is for ──────────────────────────────────────────
 *
 * Every failure in this investigation was reachable from one short sequence, and none of them
 * was reachable from the unit suite:
 *
 *   Error al resolver 3D: Failed to execute 'postMessage' on 'Worker':
 *   [object Array] could not be cloned.
 *
 *   Error en caso 3D "Superimposed dead (screed+finish+partitions)":
 *   Parse error: Error: invalid type: unit value, expected a sequence
 *
 * The causes are owned by `project-restore-roundtrip.test.ts`, which proves each one in
 * isolation. What only a browser can show is that they are GONE from the sequence a person
 * actually performs — and, in one case, that a repair was ever needed at all: the parallel
 * solve had been throwing `DataCloneError` on every solve of any model carrying a constraint,
 * and `solveCombinations3DParallel` caught it and fell back to the sequential solver. Correct
 * results, one thread, and the only trace was a `console.warn` nobody was reading. So a silent
 * fallback is a FAILURE here, not a detail.
 *
 * ── Restored twice, and what the second pass found ─────────────────
 *
 * The journey restores, works, and then reloads and restores AGAIN, because a returning user
 * does not return once.
 *
 * The second pass was written expecting to restore a snapshot carrying the whole design, and
 * for a long time that is not what the app could offer. `localStorage` gives an origin a few
 * megabytes, and this project stopped fitting the moment `designAll` finished: the autosave was
 * written normally after the load and after the solve, and from the design onwards every write
 * threw `QuotaExceededError`. It threw in silence, which is worse than not saving — the key
 * still held the PRE-DESIGN snapshot, so a reload offered a restore banner that handed back the
 * model as it was before the design ran, with nothing reporting the difference.
 *
 * The autosave now lives in IndexedDB, which has no comparable ceiling and stores the object
 * rather than a string. So the second pass asserts what it was written to assert in the first
 * place: the stored project CONTAINS the reinforcement, the restore brings it back, no
 * over-quota warning appears, and the save that happened is the save that is reported.
 *
 * ── Nothing here is a timing ───────────────────────────────────────
 *
 * The forbidden strings are watched on the console and on every toast for the whole run, so a
 * failure is attributed to the step that caused it. The viewport assertions are counters —
 * canvases, WebGL contexts, scene builds — because a browser drops the oldest context without
 * warning past about sixteen, and a leak per open is a viewport that silently stops rendering
 * after a dozen visits.
 */

import { test, expect } from '@playwright/test';

type Page = import('@playwright/test').Page;

const PRO_URL = '/app/pro?e2e=1';
const EXAMPLE = 'pro-edificio-7p';

/**
 * Anything that must never appear, whatever the step.
 *
 * Matched against console output AND against the visible toasts, because the app catches most
 * of these and turns them into a message — which is how they reached the user in the first
 * place, and how they would reach one again.
 */
const FORBIDDEN = [
  /could not be cloned/i,
  /structured.?clone/i,
  /postMessage/i,
  /invalid type/i,
  /parse error/i,
  /not structured-cloneable/i,
];

/** A silent downgrade from the worker pool to the main thread. */
const FALLBACK = /Parallel solve failed|falling back to sequential/i;

interface Watch {
  errors: string[];
  fallbacks: string[];
  forbidden: string[];
}

/**
 * Toasts have to be RECORDED as they are raised, never sampled off the DOM later.
 *
 * A toast removes itself after 4 s (`ui.svelte.ts` `toast()`), and the moment a spec can next
 * look is not under the spec's control: `__stabileoActions.solve()` resolves when the solve
 * resolves, but the evaluate cannot RETURN until the main thread is free, and publishing a
 * restored-and-designed model — 203 reinforced members across 7 combinations — blocks it for
 * about six seconds after the toast goes up. The assertion window then opens on an empty
 * container and stays empty, which reads exactly like a solve that reported nothing.
 *
 * That is what made this file red on main: not a missing toast, a missed one. The first pass
 * survived only because an un-designed model publishes fast enough to still be inside the 4 s.
 *
 * So a MutationObserver installed before any app code runs appends every toast to a page-side
 * log that nothing clears on a timer. `assertClean` gains the same soundness for free — its
 * forbidden-string check used to sample the container too, so a dismissed error toast would
 * have passed it silently, which is the failure direction that actually matters.
 */
const TOAST_LOG_KEY = '__e2eToastLog';

function recordToasts(page: Page) {
  return page.addInitScript(([key]) => {
    const w = window as unknown as { __toastLog?: string[] };
    if (w.__toastLog) return;

    // The log lives in sessionStorage so it spans the RUN, not one page load. `boot`
    // navigates three times, and the console watcher this is paired with accumulates
    // across all of them; a per-load toast log would make `assertClean`'s two halves
    // disagree about scope, and a forbidden toast raised before a reload would go
    // unseen. Same origin and same tab survive `goto`, and `boot` clears only
    // localStorage.
    let log: string[] = [];
    try { log = JSON.parse(sessionStorage.getItem(key) ?? '[]'); } catch { log = []; }
    w.__toastLog = log;
    const save = () => { try { sessionStorage.setItem(key, JSON.stringify(log)); } catch { /* private mode */ } };

    // Keyed on the element's CURRENT TEXT, not on "have I seen this element" — because
    // `App.svelte` renders toasts through an UNKEYED `{#each}`. Svelte recycles the same
    // `.toast` div by index and rewrites its text when one toast replaces another in a
    // single flush, which emits no addedNodes at all. Watching insertions alone would
    // therefore miss exactly the case this file cares about: a new toast raised as a 4 s
    // dismissal fires. Text-keyed also fixes the reverse — an element inserted empty and
    // filled a microtask later still gets recorded.
    const lastText = new Map<Element, string>();
    const scan = () => {
      let dirty = false;
      for (const el of Array.from(document.querySelectorAll('.toast'))) {
        const text = (el.textContent ?? '').trim();
        if (!text || lastText.get(el) === text) continue;
        lastText.set(el, text);
        log.push(text);
        dirty = true;
      }
      if (dirty) save();
    };
    // `document`, not `documentElement`: an init script runs against the initial empty
    // document, where `documentElement` is still null and `observe` throws.
    new MutationObserver(scan).observe(document, {
      childList: true, subtree: true, characterData: true,
    });
  }, [TOAST_LOG_KEY]);
}

/** Every toast raised so far in the run, in order, dismissed or not. */
async function toastsSeen(page: Page): Promise<string[]> {
  const log = await page.evaluate(() =>
    (window as unknown as { __toastLog?: string[] }).__toastLog);
  // Never default to []. An absent recorder would otherwise read as "no toasts were
  // raised", turning every forbidden-toast assertion below into a silent vacuous pass —
  // the one failure direction this file exists to prevent.
  expect(log, 'the toast recorder is installed').toBeDefined();
  return log!;
}

/** Forget the toasts recorded so far, alongside the console watcher's own reset. */
async function resetToasts(page: Page) {
  await page.evaluate(([key]) => {
    const w = window as unknown as { __toastLog?: string[] };
    if (w.__toastLog) w.__toastLog.length = 0;
    try { sessionStorage.setItem(key, '[]'); } catch { /* private mode */ }
  }, [TOAST_LOG_KEY]);
}

function watchPage(page: Page): Watch {
  const w: Watch = { errors: [], fallbacks: [], forbidden: [] };
  const inspect = (text: string, fromError: boolean) => {
    if (fromError && !/SwiftShader|WebGL|GroupMarkerNotSet|Automatic fallback/i.test(text)) {
      w.errors.push(text);
    }
    if (FALLBACK.test(text)) w.fallbacks.push(text);
    for (const rx of FORBIDDEN) if (rx.test(text)) { w.forbidden.push(text); break; }
  };
  page.on('console', (m) => inspect(m.text(), m.type() === 'error'));
  page.on('pageerror', (e) => inspect(String(e), true));
  return w;
}

/** Assert the run is still clean, naming the step that dirtied it. */
async function assertClean(page: Page, w: Watch, step: string) {
  const toasts = (await toastsSeen(page)).join(' | ');
  for (const rx of FORBIDDEN) {
    expect(toasts, `${step}: a toast matched ${rx}`).not.toMatch(rx);
  }
  expect(w.forbidden, `${step}: forbidden output\n${w.forbidden.join('\n')}`).toEqual([]);
  expect(w.errors, `${step}: console errors\n${w.errors.join('\n')}`).toEqual([]);
  expect(w.fallbacks, `${step}: the parallel solve fell back\n${w.fallbacks.join('\n')}`).toEqual([]);
}

/**
 * Boot the PRO app in a known locale.
 *
 * The autosave is no longer a string a spec can carry from one page load to the next: it lives
 * in IndexedDB, which survives a reload of the same origin by itself. That is closer to what a
 * returning user experiences than seeding a key ever was — nothing is handed to the app, it
 * finds its own save.
 *
 * `localStorage` is still cleared, for the locale and the workspace session; the workspace key
 * has to go because a restored tab session bypasses the autosave banner entirely.
 */
async function boot(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('stabileo-lang', 'es');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
  await page.goto(PRO_URL);
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

/** The census of what the autosave actually holds right now. */
async function stored(page: Page) {
  return page.evaluate(() => window.__stabileo.autosaveStored());
}

/** Press Restaurar on the banner the app shows for a saved project. */
async function restoreFromBanner(page: Page) {
  // The prompt is inline beside the tab strip, not the full-width banner it replaced;
  // keyed off its test id rather than a layout class so a restyle does not break this.
  const banner = page.getByTestId('autosave-prompt');
  await expect(banner, 'the saved-project banner is offered').toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText('Se encontró un proyecto guardado');
  await banner.locator('button.restore').click();
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 30_000 })
    .toBeGreaterThan(0);
}

/** Calculate, and wait for the result rather than for a duration. */
async function calculate(page: Page) {
  const before = await page.evaluate(() => window.__stabileo.solveCount());
  // Only the toasts THIS solve raises may satisfy it. The log is cumulative and outlives the
  // reload it was recorded on, so matching the whole thing would let the second calculate pass
  // on the first one's success — which is precisely the silence this step exists to catch.
  const mark = (await toastsSeen(page)).length;
  await page.evaluate(async () => { await window.__stabileoActions.solve(); });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solveCount()), { timeout: 120_000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => (await toastsSeen(page)).slice(mark).join(' | '), { timeout: 120_000 })
    .toContain('Análisis 3D exitoso');
}

/** The counters a viewport open must not move by more than one. */
async function counters(page: Page) {
  return page.evaluate(() => ({
    builds: window.__stabileo.rebarSceneBuilds(),
    canvases: document.querySelectorAll('canvas').length,
    contexts: [...document.querySelectorAll('canvas')].filter((c) =>
      !!(c as HTMLCanvasElement).getContext('webgl2')
      || !!(c as HTMLCanvasElement).getContext('webgl')).length,
  }));
}

/** What the workspace says is in the scene, read off its own tally. */
async function tally(page: Page) {
  const families: Record<string, { solids: number; longitudinal: number; transverse: number }> = {};
  for (const family of ['column', 'beam', 'slab', 'wall', 'footing', 'pedestal']) {
    const row = page.getByTestId(`rebar-tally-${family}`);
    if (await row.count() === 0) continue;
    const cells = await row.locator('td').allTextContents();
    families[family] = {
      solids: parseInt(cells[0] ?? '0', 10),
      longitudinal: parseInt(cells[1] ?? '0', 10),
      transverse: parseInt(cells[2] ?? '0', 10),
    };
  }
  return families;
}

/**
 * Open the 3-D workspace and wait for the SCENE, not for the overlay.
 *
 * The workspace paints before it builds — that is what stops the click looking dead on a model
 * whose floors have been designed — so "visible" is not "ready". The build counter is the
 * signal that the geometry exists, and it moves exactly once per build whatever the model's
 * size, unlike the transient "building" status which a small model may never paint.
 */
async function openViewer(page: Page, step: string) {
  const before = await counters(page);
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible({ timeout: 120_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.rebarSceneBuilds()), { timeout: 180_000 })
    .toBeGreaterThan(before.builds);
  // A scene that built but drew nothing is an empty viewport, and it looks like a working one.
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.canvasInkRatio()), { timeout: 120_000 })
    .toBeGreaterThan(0);

  const after = await counters(page);
  expect(after.builds - before.builds, `${step}: one geometry build per open`).toBe(1);
  expect(after.canvases - before.canvases, `${step}: no duplicate canvas`).toBe(1);
  expect(after.contexts - before.contexts, `${step}: no extra WebGL context`).toBe(1);
  return after;
}

async function closeViewer(page: Page) {
  await page.getByTestId('rebar-workspace-close').click();
  await expect(page.getByTestId('rebar-workspace')).toBeHidden();
}

/** The app must still answer while and after all of this. */
async function assertResponsive(page: Page, step: string) {
  const t0 = Date.now();
  const answer = await page.evaluate(() => window.__stabileo.elementIds().length);
  const dt = Date.now() - t0;
  expect(answer, `${step}: the app still knows its model`).toBeGreaterThan(0);
  expect(dt, `${step}: the app answered in ${dt} ms`).toBeLessThan(15_000);
}

/**
 * The recorder's own guard, because the journey below cannot prove this.
 *
 * `App.svelte` renders toasts through an UNKEYED `{#each}`, so Svelte recycles the same
 * `.toast` div by index and rewrites its text rather than inserting a node. A recorder
 * that watched `addedNodes` alone — the first version of this one — silently missed
 * exactly that, which is the case where a new toast replaces one that is dismissing.
 *
 * The @slow journey passes either way, because whether the container happens to empty
 * first is a timing accident. So the three shapes are pinned here directly, in a second,
 * on every PR rather than only on main.
 */
test('@smoke the toast recorder catches inserted, recycled and late-filled toasts', async ({ page }) => {
  await recordToasts(page);
  await page.goto(PRO_URL);

  // Mirrors App.svelte's markup: `.toast > span` holding the message text node.
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'toast-container';
    document.body.appendChild(host);
    const el = document.createElement('div');
    el.className = 'toast toast-success';
    const span = document.createElement('span');
    span.appendChild(document.createTextNode('inserted message'));
    el.appendChild(span);
    host.appendChild(el);
  });
  await expect.poll(() => toastsSeen(page)).toContain('inserted message');

  // The unkeyed-{#each} recycle, done the way Svelte does it: `set_text` assigns the
  // existing text node's `.data`. That is a characterData record and NOT a childList
  // one — assigning `textContent` here instead would replace the node and quietly test
  // the wrong thing, passing even against an observer that watches insertions only.
  await page.evaluate(() => {
    const node = document.querySelector('.toast span')!.firstChild as Text;
    node.data = 'recycled message';
  });
  await expect.poll(() => toastsSeen(page)).toContain('recycled message');

  // Inserted empty and filled a tick later — the case an element-keyed `seen` set
  // permanently swallowed.
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'toast toast-info';
    document.querySelector('.toast-container')!.appendChild(el);
    setTimeout(() => { el.textContent = 'late message'; }, 10);
  });
  await expect.poll(() => toastsSeen(page)).toContain('late message');
});

test('@slow restore, design, view in 3-D — then reload and do it again', async ({ page }) => {
  test.setTimeout(900_000);
  const w = watchPage(page);
  // Installed once, before the first navigation — not inside `boot`, which runs three
  // times and would stack three copies of the script onto every later page load.
  await recordToasts(page);

  // ── 1. Open the example ──────────────────────────────────────────
  await boot(page);
  // Nothing carried over from an earlier run of this file: the database survives a reload by
  // design, which is the point, and a stale revision would make step 11 assert on the wrong
  // vintage of the project.
  await page.evaluate(() => window.__stabileoActions.autosaveDiscard());
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
  await page.evaluate((name) => window.__stabileoActions.loadExample(name), EXAMPLE);
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length))
    .toBeGreaterThan(0);

  // The autosave is written by the app's own 30 s timer. Waited for rather than faked: the
  // defect lived in what that timer wrote and in what the banner did with it.
  await expect
    .poll(async () => (await stored(page)).revision, { timeout: 90_000, intervals: [1000] })
    .toBeGreaterThan(0);
  const firstSave = await stored(page);
  expect(firstSave.backend, 'the autosave is on IndexedDB, not the few-megabyte fallback')
    .toBe('indexeddb');
  expect(firstSave.fingerprint.elements, 'and it holds the model').toBeGreaterThan(0);
  expect(firstSave.fingerprint.reinforced, 'nothing is designed yet').toBe(0);

  // ── 2–4. Reload, find the banner, restore ────────────────────────
  await boot(page);
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
  await restoreFromBanner(page);
  await assertClean(page, w, 'restore');

  // ── 5–6. Calculate ───────────────────────────────────────────────
  await calculate(page);
  await assertClean(page, w, 'calculate after restore');

  // ── 7. Verify, design all, detail, and design the floors ─────────
  await page.evaluate(() => window.__stabileoActions.computeDemands());
  await page.evaluate(() => window.__stabileoActions.codeCheck());
  await page.evaluate(() => window.__stabileoActions.designAll());
  await expect.poll(() => page.evaluate(() => window.__stabileo.runCounts()?.total ?? 0),
    { timeout: 180_000 }).toBeGreaterThan(0);
  const runCounts = (await page.evaluate(() => window.__stabileo.runCounts()))!;
  expect(runCounts.verified, 'members were verified').toBeGreaterThan(0);
  await assertClean(page, w, 'design all');

  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() => (window.__stabileo as unknown as
      { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 180_000 })
    .toBeGreaterThan(0);

  await page.getByTestId('floor-families-disclosure').locator('> summary').click();
  const floors = page.getByTestId('floor-design-run');
  await expect(floors).toBeEnabled();
  await floors.click();
  await expect(page.getByTestId('floor-families')).toBeVisible({ timeout: 300_000 });
  await assertClean(page, w, 'detailing and floor design');
  await assertResponsive(page, 'after the floor design');

  // ── 8–9. Open the viewer and check the scene is COMPLETE ─────────
  await openViewer(page, 'first open');
  await assertClean(page, w, 'open 3-D');

  const families = await tally(page);
  console.log('scene tally after floor design:', JSON.stringify(families));
  for (const family of ['column', 'beam', 'slab', 'wall'] as const) {
    expect(families[family], `${family} is present in the tally`).toBeTruthy();
    expect(families[family].solids, `${family} has concrete in the scene`).toBeGreaterThan(0);
  }
  // The families the DOCUMENT produced steel for must have steel HERE. Slabs and walls are the
  // ones the floor design adds, and the ones a projection bug would drop.
  for (const family of ['column', 'slab', 'wall'] as const) {
    const bars = families[family].longitudinal + families[family].transverse;
    expect(bars, `${family} carries its steel into the scene`).toBeGreaterThan(0);
  }
  // …and none of them may be reported as an empty family while the document holds them.
  const emptyFamilies = await page.getByTestId('rebar-empty-families').textContent()
    .catch(() => null);
  for (const family of ['Losa', 'Tabique', 'Columna', 'Viga']) {
    if (emptyFamilies) expect(emptyFamilies).not.toContain(family);
  }

  // Beam states: the 117 biaxial proposals are reported, not hidden, their cause is stated
  // once rather than 117 times, and the sheet-level consequence is on screen.
  const provisional = page.getByTestId('rebar-status-PROVISIONAL');
  await expect(provisional, 'provisional members keep their own row').toBeVisible();
  const cause = page.getByTestId('rebar-status-cause-PROVISIONAL');
  await expect(cause, 'the shared cause is stated').toBeVisible();
  await expect(cause).toHaveAttribute('data-reason-key', 'design.reason.provisionalBiaxial');
  // A proposal that looks like a design is the one failure this state exists to prevent.
  await expect(page.getByTestId('rebar-provisional-banner'), 'and it says it is not for issue')
    .toContainText(/NO APTO PARA/i);

  // Selection: a member picked from the list becomes the selection.
  const firstMember = page.getByTestId('rebar-element-list').locator('button.element').first();
  await firstMember.click();
  await expect(page.getByTestId('rebar-element-list').locator('button.selected'))
    .toHaveCount(1);

  // ── 10. Close ────────────────────────────────────────────────────
  await closeViewer(page);
  await assertClean(page, w, 'close 3-D');

  // ── 11–13. Reload, restore again, calculate again, open again ────
  /**
   * The stored project now CONTAINS the design. This is the assertion the whole file was
   * written for and could not make.
   *
   * The design run asks for a save itself, so this does not wait on the 30 s timer — and the
   * outcome hook says which trigger it was, so a save that happened by accident thirty seconds
   * later would not satisfy it.
   */
  const designedSave = await stored(page);
  expect(designedSave.backend).toBe('indexeddb');
  expect(designedSave.revision, 'the design produced a newer revision')
    .toBeGreaterThan(firstSave.revision!);
  expect(designedSave.fingerprint.reinforced,
    'the stored snapshot carries the reinforcement the design produced').toBeGreaterThan(0);
  expect(designedSave.rejected, 'nothing had to be refused on read').toBe(0);
  expect(designedSave.unfinishedRevision, 'no write started and vanished').toBeNull();

  const outcome = await page.evaluate(() => window.__stabileo.autosaveOutcome());
  expect(outcome?.ok, 'the app reports the save that actually happened').toBe(true);
  expect(outcome?.backend).toBe('indexeddb');

  // The over-quota warning belonged to the localStorage autosave. Its appearance now would
  // mean the app had silently fallen back to it.
  const toastsNow = (await toastsSeen(page)).join(' | ');
  expect(toastsNow, 'no over-quota warning, because there is no quota to exceed')
    .not.toMatch(/demasiado grande para el guardado autom/i);

  await boot(page);
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
  w.errors.length = 0; w.fallbacks.length = 0; w.forbidden.length = 0;
  await resetToasts(page);
  await restoreFromBanner(page);

  // The restored model carries the design. Under the old autosave this was the morning's
  // model: reinforcement count zero, with nothing on screen saying so.
  const restoredReinforced = await page.evaluate(() =>
    window.__stabileo.elementIds().filter((id) => !!window.__stabileo.reinforcement(id)).length);
  expect(restoredReinforced, 'the restore hands back the afternoon, not the morning')
    .toBeGreaterThan(0);

  await calculate(page);
  await assertClean(page, w, 'calculate after the second restore');

  // The detailing has to be regenerated after a restore — the document is not persisted — so
  // the viewer is opened on the same path a user would take.
  await page.evaluate(() => window.__stabileoActions.computeDemands());
  await page.evaluate(() => window.__stabileoActions.codeCheck());
  await page.evaluate(() => window.__stabileoActions.designAll());
  await expect.poll(() => page.evaluate(() => window.__stabileo.runCounts()?.total ?? 0),
    { timeout: 180_000 }).toBeGreaterThan(0);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const regenerate = page.getByTestId('cmd-generate-detailing');
  await expect(regenerate).toBeEnabled();
  await regenerate.click();
  await expect
    .poll(() => page.evaluate(() => (window.__stabileo as unknown as
      { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 180_000 })
    .toBeGreaterThan(0);

  await openViewer(page, 'second open, after a second restore');
  await assertClean(page, w, 'open 3-D after the second restore');
  const familiesAgain = await tally(page);
  console.log('scene tally after the second restore:', JSON.stringify(familiesAgain));
  for (const family of ['column', 'beam'] as const) {
    expect(familiesAgain[family].solids, `${family} survives the second restore`)
      .toBeGreaterThan(0);
  }
  await assertResponsive(page, 'end of journey');
});
