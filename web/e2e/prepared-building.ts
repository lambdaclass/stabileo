/**
 * The 7-storey building, prepared ONCE per worker and restored by every observer.
 *
 * ── The failure this removes ───────────────────────────────────────
 *
 * Four tests in `rebar-3d.spec.ts` and five in `rebar-viewport-cost.spec.ts` each ran a COMPLETE
 * setup of `pro-edificio-7p`: load 203 members, SOLVE, design every one of them, coordinate the
 * detailing, run the floor design, and only then build the scene they are actually about.
 * `workers: 1`, so they run one after another in the same browser process. The symptom was
 * `rebar-3d.spec.ts:319` failing when the file ran whole and passing when it ran alone —
 * diagnosed in `docs/handoffs/pr20-heavy-spec-starvation.md`, and NOT a missing timeout: all four
 * already declared a budget.
 *
 * The operation that degrades is the SOLVE, and it does not degrade gently. `fixtures.ts` records
 * the measurement: on a run where the cost spec had just spent ten minutes on this machine, a
 * 7-storey solve that takes about ten seconds on an idle one exceeded FOUR MINUTES, with the
 * worker pool up and no fallback to the sequential solver. So the fix is to stop solving the same
 * building nine times to look at nine different things about one scene.
 *
 * Measured here while building this: the whole chain — load, solve, designAll, detailing, floor
 * design — is about 17 s on an idle machine. That is what it costs when nothing is competing with
 * it, and it is exactly what stops being true once a file has been running for ten minutes.
 *
 * ── Why the project travels in the browser and not through the test ─
 *
 * Two transports were measured on the prepared project and both failed:
 *
 *   - `pro-project-save` (the real `.ded` download) produced NO download in 180 s and the browser
 *     context disappeared underneath the run. `saveProject` builds
 *     `JSON.stringify(buildProjectFile(), null, 2)` — a pretty-printed string of a document
 *     carrying ~21 000 bars — and then a Blob of it. Reported as a product finding in
 *     `pr20-pro-design-matrix.md` §10; it is not a test-harness detail.
 *   - `context.storageState({ indexedDB: true })` did not return within twenty minutes.
 *
 * What DOES work is the app's own autosave: `requestAutosave` stores the designed project in
 * IndexedDB in about two seconds, and `project-restore.spec.ts` already proves a returning user
 * gets it back. So the project never leaves the browser. The preparation runs the chain once and
 * asks for the same save the 30 s timer asks for; each observer opens a NEW PAGE in that context,
 * the app finds its own save, and the test presses Restaurar — the production restore path, the
 * same one a returning user takes.
 *
 * ── Why this is isolation and not a shared page ────────────────────
 *
 * A shared page is the trap the handoff names: `rebar-workspace.svelte.ts` deliberately keeps the
 * layer switches across a close/reopen ("closing keeps the switches, reloading resets"), so one
 * test's toggle would change what the next one observes — and so would its selection, its
 * isolation, its status filter, its section plane and its camera.
 *
 * A new PAGE shares none of that. Every store is a fresh module instance in a fresh realm, with a
 * fresh WebGL context, exactly as it is for a page Playwright hands out. What the shared context
 * carries is STORAGE, which is the one thing that has to travel. Nothing here writes to that
 * storage: the observers open a viewer and read it. The fixture nevertheless checks the stored
 * fingerprint against the prepared one before every restore, so if a future test ever does write
 * over the slot, this fails loudly instead of measuring a different building.
 *
 * ── Artifacts ──────────────────────────────────────────────────────
 *
 * A context created from the `browser` fixture is still instrumented by Playwright, so `trace`,
 * `video` and `screenshot` from the config apply to it and a failure here produces the same
 * evidence a failure on an ordinary page does. Driving `context.tracing` here as well is not just
 * redundant, it throws — "Tracing has been already started" — which is how this was established
 * rather than assumed.
 */

import {
  test as proTest, expect, designAll, loadModel, bootPro, SOLID_FAMILIES,
  type RebarSceneCensus,
} from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';

/** The example every heavy spec in this suite sets up. */
export const BUILDING = 'pro-edificio-7p';

/** One row of the on-screen family tally: concrete solids, longitudinals, transverse. */
export interface FamilyTally {
  solids: number;
  longitudinal: number;
  transverse: number;
}

/** What the preparation produced, and the context holding it. */
export interface PreparedProject {
  /** The context whose IndexedDB carries the autosaved project. */
  context: BrowserContext;
  /** Members in the model when it was saved. */
  elements: number;
  /** Coordinated assemblies in the document when it was saved. */
  assemblies: number;
  /** Members carrying reinforcement when it was saved. */
  reinforced: number;
  /** The family tally the workspace showed on the live page. */
  tally: Record<string, FamilyTally>;
  /** Piece kinds the workspace counted apart, and how many of each. */
  pieces: Record<string, number>;
  /** What the renderer was actually drawing, read off the meshes. */
  census: RebarSceneCensus;
  /**
   * Whether the workspace showed the "not for issue" banner for provisional members.
   *
   * Captured on the LIVE page, like the tally and the census, so a restore can be asserted to
   * reproduce it. It is read off the DOCUMENT (`scene.provisionalMembers`) rather than off the
   * design run, which is what makes it a fair thing to expect from a restored project at all.
   */
  provisionalBanner: boolean;
}

/** Coordinated assemblies currently in the model. */
export function assemblyCount(page: Page): Promise<number> {
  return page.evaluate(() => (window.__stabileo as unknown as
    { detailingAssemblies(): unknown[] }).detailingAssemblies().length);
}

/** Members that carry reinforcement. */
function reinforcedCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__stabileo.elementIds()
    .filter((id) => !!window.__stabileo.reinforcement(id)).length);
}

/**
 * The family tally, read off the table beside the canvas.
 *
 * Cells rather than a split of the row's text: the second and third carry a unit word after the
 * number. A family with no row is absent from the result, which is the same distinction the
 * empty-family notice makes.
 */
export async function readTally(page: Page): Promise<Record<string, FamilyTally>> {
  const out: Record<string, FamilyTally> = {};
  for (const family of SOLID_FAMILIES) {
    const row = page.getByTestId(`rebar-tally-${family}`);
    if (await row.count() === 0) continue;
    const cells = await row.locator('td').allTextContents();
    const n = (i: number) => parseInt((cells[i] ?? '0').trim(), 10) || 0;
    out[family] = { solids: n(0), longitudinal: n(1), transverse: n(2) };
  }
  return out;
}

/** The piece kinds counted apart — a hoop and a single-leg crosstie are different pieces. */
export async function readPieces(page: Page): Promise<Record<string, number>> {
  const table = page.getByTestId('rebar-pieces');
  if (await table.count() === 0) return {};
  const out: Record<string, number> = {};
  for (const row of await table.locator('tr').all()) {
    const id = await row.getAttribute('data-testid');
    if (!id?.startsWith('rebar-piece-')) continue;
    const cell = (await row.locator('td').first().textContent()) ?? '0';
    out[id.slice('rebar-piece-'.length)] = parseInt(cell.trim(), 10) || 0;
  }
  return out;
}

/**
 * Open the 3-D workspace and wait for its GEOMETRY, not for the overlay.
 *
 * The workspace paints BEFORE it builds — that is what stops the click looking dead on a model
 * whose floors have been designed — so `toBeVisible` returns while the build is still to come.
 * Waited on the build COUNTER rather than on the "building" status: on a small model the build
 * takes two frames and that status may never be painted at all, so `toBeHidden` would pass on an
 * element that was never there.
 *
 * `cmd-open-3d` is the command-row button PR20 promoted out of the detailing disclosure. It is
 * the same operation as `doc-3d` — both call `openRebar3D` on the same document instance — and it
 * does not require opening a disclosure first. The disclosure's own button keeps its coverage in
 * `rebar-3d.spec.ts`, which still walks the full journey.
 */
export async function openWorkspaceFromCommandRow(page: Page): Promise<void> {
  const before = await page.evaluate(() => window.__stabileo.rebarSceneBuilds());
  const open = page.getByTestId('cmd-open-3d');
  await expect(open, 'the 3-D command is enabled once a document exists').toBeEnabled();
  await open.click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible({ timeout: 120_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.rebarSceneBuilds()), { timeout: 180_000 })
    .toBeGreaterThan(before);
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.rebarSceneCensus() !== null),
      { timeout: 60_000 })
    .toBe(true);
}

/**
 * Open the workspace on a restored building, and check it is the building that was prepared.
 *
 * The counts are asserted rather than trusted: a restore that silently dropped the floor design
 * would otherwise leave every observer measuring a smaller building and reporting success.
 */
export async function openPreparedWorkspace(
  page: Page, prepared: PreparedProject,
): Promise<void> {
  expect(await assemblyCount(page), 'the restored project carries its detailing')
    .toBe(prepared.assemblies);
  expect(await reinforcedCount(page), 'the restored project carries the design')
    .toBe(prepared.reinforced);

  /**
   * The detailing disclosure is opened for PARITY, not because this path needs it.
   *
   * The setup this replaces reached the viewer through that disclosure, so it left the panel
   * open — and a test that closes the workspace and REOPENS it from `doc-3d` finds that button
   * inside a shut `<details>` if nobody opened it. Playwright then waits for an element that
   * exists, is enabled, and will never be visible: the reopen loop in
   * `rebar-viewport-cost.spec.ts` spent its whole fifteen-minute budget on exactly that, which
   * is how this was found rather than reasoned about.
   *
   * So the prepared setup leaves the page in the same shape the old one did, and the test bodies
   * stay untouched.
   */
  const disclosure = page.getByTestId('detailing-disclosure');
  if (await disclosure.getAttribute('open') === null) {
    await disclosure.locator('> summary').click();
  }
  await expect(disclosure, 'the detailing panel is open, as the setup it replaces left it')
    .toHaveAttribute('open', '');

  await openWorkspaceFromCommandRow(page);
}

/**
 * Time every stage of the preparation, and say so on the way past.
 *
 * ── Why this is here and not a comment ─────────────────────────────
 *
 * When this chain overruns, all Playwright reports is the assertion that happened to be waiting
 * — `the solve did not finish in 480 s` — and the reader is left to guess whether the boot was
 * slow, the solve was slow, or the detailing was. Five failures were classified from that one
 * line, which is not enough evidence to classify anything.
 *
 * So each stage prints its own duration as it completes. On a healthy run the numbers are the
 * baseline; on a failing one, the stages that DID print bound the problem to the one that did
 * not. It costs one line of output per stage and it is the difference between a diagnosis and a
 * hypothesis.
 */
async function stage<T>(name: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } finally {
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    // eslint-disable-next-line no-console
    console.log(`  prep · ${name}: ${secs} s`);
  }
}

/**
 * Run the whole chain once, record what it produced, and let the app save it.
 *
 * Kept out of the fixture body only so the fixture reads as what it is — a value with a
 * lifetime — rather than as a hundred-line procedure.
 */
async function prepare(page: Page): Promise<Omit<PreparedProject, 'context'>> {
  await stage('boot', () => bootPro(page));
  // Nothing carried over from an earlier run: IndexedDB survives by design, which is the point,
  // and a stale revision would be restored by every observer in this worker.
  await page.evaluate(() => window.__stabileoActions.autosaveDiscard());

  await stage('load + solve', () => loadModel(page, BUILDING));
  await stage('design all', () => designAll(page));

  // Beams and columns come from `cmd-generate-detailing`; slabs, walls and footings come from
  // `floor-design-run` in its own disclosure. A caller who wants the whole structure has to run
  // both — that is the app's real shape, and a preparation that ran only the first would hand
  // every observer a building with no floors in it.
  await stage('detailing', async () => {
    await page.getByTestId('detailing-disclosure').locator('> summary').click();
    const generate = page.getByTestId('cmd-generate-detailing');
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect.poll(() => assemblyCount(page), { timeout: 180_000 }).toBeGreaterThan(0);
  });

  await stage('floor design', async () => {
    await page.getByTestId('floor-families-disclosure').locator('> summary').click();
    const floors = page.getByTestId('floor-design-run');
    await expect(floors).toBeEnabled();
    await floors.click();
    await expect(page.getByTestId('floor-families')).toBeVisible({ timeout: 300_000 });
  });

  const elements = (await page.evaluate(() => window.__stabileo.elementIds())).length;
  const assemblies = await assemblyCount(page);
  const reinforced = await reinforcedCount(page);

  // The scene as the design produced it, recorded so an observer can assert that the restore
  // reproduces it rather than assume so.
  const { tally, pieces, census, provisionalBanner } = await stage('scene census', async () => {
    await openWorkspaceFromCommandRow(page);
    await expect(page.getByTestId('rebar-tally')).toBeVisible();
    const t = await readTally(page);
    const p = await readPieces(page);
    const c = (await page.evaluate(() => window.__stabileo.rebarSceneCensus()))!;
    expect(c, 'the prepared scene is drawing something').not.toBeNull();
    const banner = await page.getByTestId('rebar-provisional-banner').count() > 0;
    await page.getByTestId('rebar-workspace-close').click();
    await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
    return { tally: t, pieces: p, census: c, provisionalBanner: banner };
  });

  /**
   * The same save the 30 s timer and every post-design hook ask for.
   *
   * Not a fixture writing a file: this is `requestAutosave`, and what it writes is what a user
   * who closed the tab at this moment would be offered on their next visit.
   */
  const wrote = await page.evaluate(() => window.__stabileoActions.autosaveNow());
  expect(wrote, 'the app saved the prepared project')
    .toMatchObject({ ok: true, backend: 'indexeddb' });
  const stored = await page.evaluate(() => window.__stabileo.autosaveStored());
  expect(stored.fingerprint.elements, 'and the save holds the model').toBe(elements);
  expect(stored.fingerprint.reinforced, 'and the design in it').toBe(reinforced);

  return { elements, assemblies, reinforced, tally, pieces, census, provisionalBanner };
}

/**
 * `preparedProject` — the context that holds the saved building, and what is in it.
 *
 * Worker-scoped, with a timeout of its own so the chain is charged to the fixture rather than to
 * whichever test happens to run first — the budgets on those tests are for the gestures they
 * measure, and a setup hidden inside one of them is exactly the accounting this pass exists to
 * fix.
 *
 * Built on demand, like every Playwright fixture: a run that selects only tests which never ask
 * for it never pays for it. `workers: 1`, so one preparation serves every file that does.
 */
export const test = proTest.extend<
  { preparedPage: Page }, { preparedProject: PreparedProject }
>({
  preparedProject: [async ({ browser }, use, workerInfo) => {
    /**
     * A context built here, not the one Playwright gives a test.
     *
     * `browser.newContext()` does not inherit the project's `use` options, so they are taken from
     * `project.use` rather than restated — a viewport or a locale copied by hand is one that
     * stops matching the config the moment the config changes.
     */
    const opts = workerInfo.project.use;
    const context = await browser.newContext({
      baseURL: opts.baseURL,
      viewport: opts.viewport,
      deviceScaleFactor: opts.deviceScaleFactor,
      colorScheme: opts.colorScheme,
      locale: opts.locale,
      timezoneId: opts.timezoneId,
    });

    let facts: Omit<PreparedProject, 'context'>;
    const page = await context.newPage();
    try {
      facts = await prepare(page);
    } catch (e) {
      await context.close();
      throw e;
    }
    /**
     * The preparation's own page is closed and the CONTEXT kept.
     *
     * The page held a WASM solver, a 21 000-tube scene and a WebGL context; a browser drops the
     * oldest context without warning past about sixteen, so leaving this one alive for the rest
     * of the run would spend one of them on a page nothing will look at again. What the observers
     * need is the storage, and that belongs to the context.
     */
    await page.close();

    // eslint-disable-next-line no-console
    console.log(`\nprepared ${BUILDING}: ${facts.elements} members, ${facts.assemblies} assemblies, `
      + `${facts.reinforced} reinforced, ${facts.census.triangles} triangles drawn\n`);

    await use({ context, ...facts });
    await context.close();
  }, { scope: 'worker', timeout: 900_000 }],

  /**
   * A page of its own, in the prepared context, with the project restored into it.
   *
   * Everything a test could carry to the next one — stores, selection, switches, camera, WebGL —
   * belongs to the page and dies with it. What survives is the autosave, and it is read, never
   * written, by anything that uses this fixture.
   */
  preparedPage: async ({ preparedProject }, use) => {
    const { context } = preparedProject;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // WebGL software-rasteriser chatter is expected under SwiftShader.
      if (/SwiftShader|WebGL|GroupMarkerNotSet|Automatic fallback/i.test(text)) return;
      consoleErrors.push(text);
    });
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await bootPro(page);

    /**
     * The stored project is the prepared one — checked before it is restored.
     *
     * Nothing that uses this fixture writes to the autosave, so this should never fire. It is
     * here because "should never" is what a shared resource always says right up until a test
     * that does write is added, and a silent overwrite would turn every measurement below into a
     * measurement of a different building.
     */
    const stored = await page.evaluate(() => window.__stabileo.autosaveStored());
    expect(stored.fingerprint.elements, 'the stored project is still the prepared one')
      .toBe(preparedProject.elements);
    expect(stored.fingerprint.reinforced, 'and still carries its design')
      .toBe(preparedProject.reinforced);

    // Restaurar — the button a returning user presses, not a hook.
    const banner = page.getByTestId('autosave-prompt');
    await expect(banner, 'the saved-project offer is made').toBeVisible({ timeout: 60_000 });
    await banner.locator('button.restore').click();
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 })
      .toBe(preparedProject.elements);
    // The Design tab again: restoring replaces the project, and the table only exists while it
    // is the active PRO tab.
    await page.evaluate(() => window.__stabileoActions.openDesignTab());

    await use(page);

    await page.close();

    expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  },
});

export { expect };
