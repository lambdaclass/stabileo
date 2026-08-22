/**
 * The `.ded` is the portable file. This is what it has to survive.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * The autosave round trip is covered (`project-restore.spec.ts`) and so is the small project's
 * save/open (`pro-project-files.spec.ts` B and C). What nothing covered was the FILE carrying a
 * whole designed building: 203 members, a coordinated detailing of about 21 000 bars, the floor
 * design, and every state the viewer reads off them. That is the case where a format problem
 * would actually show, and it is the case a user hits at the end of a real day's work.
 *
 * IndexedDB and `.ded` are not substitutes for each other and this file treats them as the two
 * different things they are: the autosave is local recovery, the `.ded` is what you send to
 * somebody. So the big project is prepared through the autosave, and then SAVED AS A FILE and
 * reopened on a page that has never seen it.
 *
 * ── What "survives" means here ─────────────────────────────────────
 *
 * Not "a download started". Every assertion below is made on a page that opened the file:
 * the model's own counts, the reinforcement, and then the 3-D scene compared against the census
 * recorded while the LIVE designed page was on screen — read off `mesh.visible` and the drawn
 * ranges rather than off the panel that summarises them. `rebar-3d.spec.ts` ties that same census
 * to the live page, so the chain this file completes is:
 *
 *     live design  ≡  autosave restore  ≡  .ded saved and reopened elsewhere
 *
 * ── Sizes, measured ────────────────────────────────────────────────
 *
 * The 7-storey project serialises to about 47,8 MB. It was 110,3 MB until `serializeProject`
 * stopped pretty-printing: sixty-two megabytes of indentation on a document that is mostly
 * nested arrays of coordinates. Both numbers download; the file simply had no reason to be twice
 * the size. The test reports what it actually wrote rather than asserting a number, and holds a
 * ceiling far above the measurement so a genuine format regression is still caught.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { bootPro } from './fixtures';
import {
  test, expect, openPreparedWorkspace, openWorkspaceFromCommandRow, readTally, readPieces,
} from './prepared-building';
import type { Page } from '@playwright/test';

const SMALL_FIXTURE = new URL(
  '../src/lib/export/__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url).pathname;

/** The ribbon's Project view, where PRO keeps Open and Save. */
async function openProjectView(page: Page) {
  await page.getByTestId('pr-project').click();
  await expect(page.getByTestId('pro-project-tab')).toBeVisible();
}

/** Open a `.ded` from disk through PRO's own control. */
async function openDed(page: Page, path: string) {
  await openProjectView(page);
  await page.getByTestId('pp-open-file').setInputFiles(path);
}

/** Save through the ribbon's button and keep the file. */
async function saveDed(page: Page, to: string): Promise<number> {
  const download = page.waitForEvent('download', { timeout: 300_000 });
  await page.getByTestId('pr-save').click();
  await (await download).saveAs(to);
  return readFileSync(to).length;
}

/**
 * The structural census of a project, taken from the page that has it open.
 *
 * The same families `autosaveFingerprint` counts, plus the two the design produces. Counts and
 * IDENTIFIERS both: a save that renumbered every node would match on counts alone.
 */
async function fingerprint(page: Page) {
  return page.evaluate(() => {
    const h = window.__stabileo;
    const ids = h.elementIds();
    return {
      elements: ids.length,
      elementIds: ids,
      reinforced: ids.filter((id) => !!h.reinforcement(id)).length,
      assemblies: (h as unknown as { detailingAssemblies(): unknown[] })
        .detailingAssemblies().length,
      solveCount: h.solveCount(),
      runCounts: h.runCounts(),
    };
  });
}

/** Nodes, quads and constraints, which no hook reports — read off the saved file. */
function fileCensus(path: string) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const s = parsed.snapshot;
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return {
    version: parsed.version,
    appMode: parsed.appMode,
    keys: Object.keys(parsed).sort(),
    nodes: len(s.nodes),
    elements: len(s.elements),
    quads: len(s.quads),
    plates: len(s.plates),
    constraints: len(s.constraints),
    loads: len(s.loads),
    supports: len(s.supports),
    footings: len(s.footings),
    reinforced: (s.elements as Array<[number, { reinforcement?: unknown }]>)
      .filter((e) => !!e[1]?.reinforcement).length,
    assemblies: len(s.detailing?.assemblies),
  };
}

// ─── The small project ───────────────────────────────────────────

test.describe('@smoke a small project survives the file', () => {
  test('save, reopen, and the fingerprint is the same one', async ({ pro: page }, testInfo) => {
    await openDed(page, SMALL_FIXTURE);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 })
      .toBe(8);
    const before = await fingerprint(page);

    const path = testInfo.outputPath('small.ded.json');
    const bytes = await saveDed(page, path);
    // eslint-disable-next-line no-console
    console.log(`small .ded: ${bytes} bytes`);

    // The file is a `.ded` of the version this app writes, and it parses.
    const census = fileCensus(path);
    expect(census.version).toBe('2.0');
    expect(census.appMode).toBe('pro');
    expect(census.nodes).toBe(8);
    expect(census.footings).toBe(1);

    // Reopen the file the app just wrote, and compare against what was open when it wrote it.
    await page.reload();
    await openDed(page, path);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 })
      .toBe(8);
    expect(await fingerprint(page), 'the reopened project is the project that was saved')
      .toEqual({ ...before, solveCount: 0 });
  });
});

// ─── The whole building ──────────────────────────────────────────

test.describe('@slow the 7-storey project survives the file', () => {
  test('saved as a .ded and reopened on a page that has never seen it', async (
    { preparedPage: page, preparedProject, browser }, testInfo,
  ) => {
    test.setTimeout(600_000);

    // The prepared project, exactly as `rebar-3d.spec.ts` asserts the autosave hands it back.
    const before = await fingerprint(page);
    expect(before.elements).toBe(preparedProject.elements);
    expect(before.reinforced).toBe(preparedProject.reinforced);
    expect(before.assemblies).toBe(preparedProject.assemblies);

    const path = testInfo.outputPath('edificio-7p.ded.json');
    const bytes = await saveDed(page, path);
    // eslint-disable-next-line no-console
    console.log(`7-storey .ded: ${bytes} bytes (${(bytes / 1e6).toFixed(1)} MB)`);

    /**
     * A ceiling, not an equality.
     *
     * Measured at 47,8 MB compact and 110,3 MB pretty-printed. 80 MB sits above the first and
     * below the second, so the indentation coming back — or anything else that doubles the
     * file — fails here instead of quietly costing every user of this project twice the disk.
     */
    expect(bytes, 'the file is compact, not pretty-printed').toBeLessThan(80_000_000);
    expect(bytes, 'and it is the whole building, not a truncated write')
      .toBeGreaterThan(10_000_000);

    // What the file itself contains — nodes, quads and constraints included, which no hook
    // reports and which a projection bug would drop silently.
    const census = fileCensus(path);
    expect(census.version).toBe('2.0');
    expect(census.appMode).toBe('pro');
    expect(census.keys).toEqual([
      'analysisMode', 'appMode', 'axisConvention3D', 'name', 'snapshot', 'timestamp',
      'version', 'viewportPresentation3D',
    ]);
    expect(census.elements).toBe(preparedProject.elements);
    expect(census.reinforced, 'the design is in the file').toBe(preparedProject.reinforced);
    expect(census.assemblies, 'and so is the coordinated detailing')
      .toBe(preparedProject.assemblies);
    expect(census.nodes, 'nodes').toBeGreaterThan(0);
    expect(census.quads, 'the shells the floor design needs').toBeGreaterThan(0);
    expect(census.supports).toBeGreaterThan(0);
    expect(census.loads).toBeGreaterThan(0);
    // `constraints` may legitimately be empty for this model; what must hold is that the field
    // survives as an array rather than disappearing.
    expect(Array.isArray(JSON.parse(readFileSync(path, 'utf8')).snapshot.constraints)).toBe(true);

    // ── A page that has never seen this project ────────────────────
    //
    // A context of its own: no autosave, no IndexedDB, nothing but the file.
    //
    // ── Why it is built HERE and not declared as a fixture ─────────
    //
    // It used to be the `pro` fixture, and this test was the only one in the suite that held
    // three browser contexts at once — the preparation's, the observer's, and this one. Playwright
    // builds every declared fixture BEFORE the body runs, so `pro` booted the whole application,
    // its WASM module and its worker pool alongside the 7-storey solve that `preparedProject` was
    // in the middle of. The test then failed at `the solve did not finish in 480 s` five runs in
    // a row, always at the same position, while the very same preparation succeeded for
    // `rebar-3d.spec.ts` — which uses the identical fixture and never holds a `pro` page next to
    // it.
    //
    // This page is not needed until the file has been written, which is minutes after the solve.
    // Building it at the moment it is first used costs nothing and takes a whole application off
    // the machine during the one stretch of the run that is contended. The coverage is unchanged:
    // it is the same fresh context opening the same file, asserted the same way.
    // The context options are read off the project rather than restated: a viewport or a locale
    // copied by hand is one that stops matching the config the moment the config changes.
    const opts = testInfo.project.use;
    const freshContext = await browser.newContext({
      baseURL: opts.baseURL,
      viewport: opts.viewport,
      deviceScaleFactor: opts.deviceScaleFactor,
      colorScheme: opts.colorScheme,
      locale: opts.locale,
      timezoneId: opts.timezoneId,
    });
    const fresh = await freshContext.newPage();
    await bootPro(fresh);

    await openDed(fresh, path);
    await expect
      .poll(() => fresh.evaluate(() => window.__stabileo.elementIds().length), { timeout: 180_000 })
      .toBe(preparedProject.elements);

    const after = await fingerprint(fresh);
    expect(after.elementIds, 'every member came back, under its own id')
      .toEqual(before.elementIds);
    expect(after.reinforced, 'with its reinforcement').toBe(preparedProject.reinforced);
    expect(after.assemblies, 'and its detailing').toBe(preparedProject.assemblies);
    // Opening is not solving, and it is not designing.
    expect(after.solveCount, 'opening a project must not solve it').toBe(0);
    expect(after.runCounts, 'opening a project must not run a design').toBeNull();

    // ── The scene the document draws, compared with the live one ───
    await fresh.evaluate(() => window.__stabileoActions.openDesignTab());
    await openWorkspaceFromCommandRow(fresh);
    await expect(fresh.getByTestId('rebar-tally')).toBeVisible();

    expect(await readTally(fresh), 'the family tally survives the file')
      .toEqual(preparedProject.tally);
    expect(await readPieces(fresh), 'the piece kinds survive the file')
      .toEqual(preparedProject.pieces);
    expect(await fresh.evaluate(() => window.__stabileo.rebarSceneCensus()),
      'the meshes drawn — bars, solids, conflict markers and all — survive the file')
      .toEqual(preparedProject.census);
    /**
     * A proposal is still declared a proposal.
     *
     * This is the assertion that found the defect the migration fix repairs. `provisionalMembers`
     * is stamped on the assembly when the detailing is generated and written to the file — the
     * check below proves the WRITE was never the problem — but `migrateDetailingStore` rebuilt
     * each assembly from an allow-list that did not include it, so every restore dropped it. The
     * bars kept their violet (`bars` is carried through whole) and the assembly stopped saying
     * "NO APTO PARA EMISIÓN CONSTRUCTIVA" on the banner, the sheet note and the report.
     *
     * Both halves are asserted here so a regression says which half broke.
     */
    const inFile = JSON.parse(readFileSync(path, 'utf8'))
      .snapshot.detailing.assemblies as Array<{ provisionalMembers?: number[] }>;
    expect(inFile.some((a) => (a.provisionalMembers?.length ?? 0) > 0),
      'the file records which members are proposals').toBe(true);
    expect(await fresh.getByTestId('rebar-provisional-banner').count() > 0,
      'and the project that opened it still says so').toBe(preparedProject.provisionalBanner);

    // Built by hand, so it is closed by hand. A browser drops the oldest context without warning
    // past about sixteen of them, and this one holds a WASM solver and a WebGL scene.
    await freshContext.close();
  });
});

// ─── Refusals ────────────────────────────────────────────────────

test.describe('@smoke a file that is not a project is refused, out loud', () => {
  test('a truncated .ded says so and leaves the open project alone', async (
    { pro: page }, testInfo,
  ) => {
    await openDed(page, SMALL_FIXTURE);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 })
      .toBe(8);

    // Half a file, as an interrupted download or a full disk would leave it.
    const truncated = testInfo.outputPath('truncated.ded.json');
    const whole = readFileSync(SMALL_FIXTURE, 'utf8');
    writeFileSync(truncated, whole.slice(0, Math.floor(whole.length / 2)), 'utf8');

    await page.getByTestId('pp-open-file').setInputFiles(truncated);

    // The refusal is ON SCREEN. A silent failure here is the one that costs work, because the
    // user believes the file they are holding is the file they are looking at.
    await expect(page.locator('[class*=toast]').filter({ hasText: /.+/ }).first())
      .toBeVisible({ timeout: 15_000 });
    const toasts = (await page.locator('[class*=toast]').allTextContents()).join(' | ');
    expect(toasts.trim().length, 'the refusal says something').toBeGreaterThan(0);

    // And the project that was open is still open, unharmed.
    expect(await page.evaluate(() => window.__stabileo.elementIds().length),
      'a refused file must not replace the project').toBe(8);
  });

  test('valid JSON that is not a project is refused the same way', async (
    { pro: page }, testInfo,
  ) => {
    await openDed(page, SMALL_FIXTURE);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 })
      .toBe(8);

    // Parses perfectly, means nothing. This is the payload a schema check has to catch, and the
    // one a `JSON.parse` guard alone would let through into the model.
    const notAProject = testInfo.outputPath('not-a-project.ded.json');
    writeFileSync(notAProject, JSON.stringify({ version: '2.0', name: 'x', snapshot: {} }), 'utf8');

    await page.getByTestId('pp-open-file').setInputFiles(notAProject);
    await expect(page.locator('[class*=toast]').filter({ hasText: /.+/ }).first())
      .toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.__stabileo.elementIds().length),
      'a project that fails validation must not replace the one that is open').toBe(8);
  });
});

// ─── The autosave says what actually happened ────────────────────

test.describe('@smoke the autosave reports the save it actually made', () => {
  test('the outcome, the stored revision and the fingerprint agree', async ({ pro: page }) => {
    await openDed(page, SMALL_FIXTURE);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 })
      .toBe(8);

    const wrote = await page.evaluate(() => window.__stabileoActions.autosaveNow());
    const stored = await page.evaluate(() => window.__stabileo.autosaveStored());
    const outcome = await page.evaluate(() => window.__stabileo.autosaveOutcome());

    /**
     * Three accounts of one write, and they have to be the same account.
     *
     * "Saved" that was not stored is the failure mode this whole autosave rewrite exists to
     * remove: under the old localStorage slot the write threw on quota, in silence, and the key
     * kept a stale project that a restore then handed back as if it were the day's work.
     */
    expect(wrote, 'the write reports where it went').toMatchObject({
      ok: true, backend: 'indexeddb',
    });
    expect(outcome?.ok, 'and the app remembers the same thing').toBe(true);
    expect(outcome?.backend).toBe('indexeddb');
    expect(stored.backend, 'and that is where the reader finds it').toBe('indexeddb');
    expect(stored.revision, 'the revision reported is the revision stored')
      .toBe((wrote as { revision: number }).revision);
    expect(stored.fingerprint.elements, 'and it holds the project that was open').toBe(8);
    expect(stored.rejected, 'nothing had to be refused on read').toBe(0);
    expect(stored.unfinishedRevision, 'no write started and vanished').toBeNull();
  });
});
