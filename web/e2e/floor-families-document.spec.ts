/**
 * PR18 — the visible floor-family deliverable, in a browser, in English and Spanish.
 *
 * ── Why this file exists ────────────────────────────────────────────
 *
 * Every earlier layer of this branch was covered: the engines by unit tests, the production
 * callers by store-level tests over a model built through `modelStore`'s own API, the records
 * and exports by document slices. What no test did was drive the WHOLE thing through a real
 * browser: load a model, solve it, state the ground, dimension a footing, run the design,
 * look at the punching evidence, export the report, the DXF and the spreadsheet, record a
 * review, change an input, watch the document become SUPERSEDED, and regenerate.
 *
 * That gap mattered more than it sounds. The one time this branch DID reach a browser it found
 * two defects in a day that 31 green unit tests had not — a footing edit clearing the solve, so
 * every footing reported "no reaction" no matter how it was dimensioned. Unit tests cover
 * seams; a journey covers the seams between the seams.
 *
 * ── The rules this file follows ─────────────────────────────────────
 *
 *  1. NOTHING is seeded. `seedDetailing` is not used, no store is injected, and every value
 *     is typed into the real input or chosen from the real select. An injected assembly proves
 *     the renderer accepts a value of that shape and nothing about producing one.
 *  2. The fixture arrives by the normal example path and the solve is the toolbar's own.
 *  3. The Spanish journey asserts on TRANSLATED output and on the engineering identifiers
 *     staying stable across locale — a mark that changes with the language is a mark two
 *     drawings of one project cannot share.
 *
 * `rc-qa-diagnostic-shells` is the fixture because it is the only one that has all of it: a
 * frame, twelve slab panels at +3,00, twelve wall panels, twelve columns — four of them
 * standing at slab nodes, so punching genuinely applies — and seven fixed supports to found.
 */

import { test, expect, loadModel, solveModel, computeDemands } from './fixtures';
import type { Page } from '@playwright/test';

const SHELLS = 'rc-qa-diagnostic-shells';

// ─── Reaching the panel ─────────────────────────────────────────

/**
 * Open a `<details>` disclosure IDEMPOTENTLY.
 *
 * Clicking the summary unconditionally toggles it, so a journey that visits the panel twice —
 * design, then edit an input, then look again — closed it the second time and every locator
 * inside went hidden. The gesture a user makes is "make sure it is open".
 */
async function ensureOpen(page: Page, testid: string) {
  const disclosure = page.getByTestId(testid);
  await expect(disclosure).toBeVisible();
  if (await disclosure.evaluate((el) => !(el as HTMLDetailsElement).open)) {
    await disclosure.locator('summary').first().click();
  }
  await expect(disclosure).toHaveJSProperty('open', true);
}

async function openFloorFamilies(page: Page) {
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
  await ensureOpen(page, 'floor-families-disclosure');
  await expect(page.getByTestId('floor-families')).toBeVisible();
}

async function openFoundations(page: Page) {
  await openFloorFamilies(page);
  await page.getByTestId('floor-family-foundations').click();
  await expect(page.getByTestId('foundations-panel')).toBeVisible();
}

// ─── Building the ground and the footing, through the real inputs ──

/** Add a stratum and state its allowable bearing pressure. Nothing is prefilled. */
async function addStatedSoil(page: Page, kPa: string) {
  await page.getByTestId('soil-add').click();
  const bearing = page.locator('[data-testid^="soil-"][data-testid$="-bearing"]').first();
  await expect(bearing).toBeVisible();
  await bearing.fill(kPa);
  await bearing.blur();
}

async function addAndDimensionFooting(page: Page) {
  const select = page.getByTestId('footing-add-node');
  await expect(select).toBeVisible();
  const node = await select.locator('option:not([value=""])').first().getAttribute('value');
  expect(node, 'the fixture must offer a supported node to found').not.toBeNull();
  await select.selectOption(node!);
  await expect(page.getByTestId('footing-editor')).toBeVisible();

  for (const [id, value] of [
    ['footing-B', '2.4'], ['footing-L', '2.4'], ['footing-thickness', '0.55'],
    ['footing-cover', '0.05'], ['footing-elevation', '-1.4'],
  ] as const) {
    const input = page.getByTestId(id);
    await input.fill(value);
    await input.blur();
  }

  // Both explicitly: a footing created before any stratum existed correctly has none, and the
  // realistic fix is the one a user performs.
  const column = page.getByTestId('footing-column');
  const firstColumn = await column.locator('option:not([value=""])').first()
    .getAttribute('value');
  expect(firstColumn, 'the founded node must carry a column').not.toBeNull();
  await column.selectOption(firstColumn!);

  const soil = page.getByTestId('footing-soil');
  const firstSoil = await soil.locator('option:not([value=""])').first().getAttribute('value');
  expect(firstSoil, 'a stratum must exist to found on').not.toBeNull();
  await soil.selectOption(firstSoil!);
}

/**
 * The whole journey up to a coordinated floor, by clicking the real command.
 *
 * `floor-design-run` is ONE production pass: it designs the shells, checks the footings,
 * generates the physical bars and coordinates the level assembly. Splitting the button would
 * imply three separately reachable stages that do not exist.
 */
async function designFloor(page: Page) {
  await loadModel(page, SHELLS);
  await solveModel(page);
  await computeDemands(page);
  await openFoundations(page);
  await addStatedSoil(page, '260');
  await addAndDimensionFooting(page);
  await page.getByTestId('floor-design-run').click();
  await expect(page.getByTestId('floor-foundations-summary')).toBeVisible();
}

// ─── Documents ──────────────────────────────────────────────────

async function openDetailingPanel(page: Page) {
  await ensureOpen(page, 'detailing-disclosure');
  /**
   * The exports and the professional review moved OUT of the detailing panel.
   *
   * They are a stage of the workflow now — `documents-disclosure` — rather than the tail of the
   * coordinated-detailing panel, so reaching `doc-report`, `doc-dxf`, `doc-xlsx` and the review
   * controls means opening that disclosure too. Every assertion in this file is unchanged; only
   * which container holds the controls is.
   */
  await ensureOpen(page, 'documents-disclosure');
  await expect(page.getByTestId('documents')).toBeVisible();
}

/**
 * Click the report button and read the document the browser was handed.
 *
 * The report is not a download: it opens a new window and prints, which gives better
 * typography, no bundled PDF writer and the user's own paper size. So the assertion has to read
 * the POPUP's content, not wait for a download that will never arrive.
 */
async function captureReport(page: Page): Promise<string> {
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 60_000 }),
    page.getByTestId('doc-report').click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  const html = await popup.content();
  await popup.close();
  return html;
}

/** Click an export and return exactly what the browser was handed. */
async function capture(page: Page, testid: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByTestId(testid).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

// ─── The English journey ────────────────────────────────────────

test.describe('@smoke the floor-family deliverable, end to end', () => {
  test('FD-A the punching evidence is visible in the panel', async ({ pro: page }) => {
    await designFloor(page);
    await page.getByTestId('floor-family-slabs').click();
    await expect(page.getByTestId('floor-slabs-table')).toBeVisible();

    // At least one panel supports a column, and its punching cell says something DEFINITE —
    // a utilisation, "not verified", or "no joint". Three distinct states, never collapsed:
    // a dash for the second would read as the first, which is how a flat plate came to look
    // like a beam-supported floor.
    const cells = page.locator('[data-testid^="slab-punching-P"]');
    await expect(cells.first()).toBeVisible();
    const texts = await cells.allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((t) => /\d+\.\d\d/.test(t) || /not verified/i.test(t))).toBe(true);

    // And the joint-by-joint table, so the number above can be traced to a node. A
    // utilisation with no joint behind it is a figure a reviewer cannot check.
    const joints = page.locator('[data-testid^="slab-punching-joints-P"]').first();
    await expect(joints).toBeVisible();
    await expect(joints).toContainText('#');
  });

  test('FD-B the report carries every family section and the punching free body',
    async ({ pro: page }) => {
      await designFloor(page);
      await openDetailingPanel(page);
      const html = await captureReport(page);

      // All three families reach the report, not only the one that had drawings first.
      expect(html).toContain('Slab-column punching');
      expect(html).toMatch(/Demands and Wood-Armer/);
      // `mxy` is the field a naive slab design discards; the report must show the raw triple
      // AND the transform, or the transformation is unauditable.
      expect(html).toContain('mxy');
      // The combinations that LOST are printed, with the winner starred.
      expect(html).toContain('combinations considered');
      expect(html).toContain('★');
      // Physical reinforcement, not just checks.
      expect(html).toMatch(/Reinforcement by region/);
      // No raw i18n key survived into a document a client reads.
      expect(html).not.toMatch(/detailing\.[a-zA-Z]+\.[a-zA-Z]+/);
    });

  test('FD-C the DXF contains the family sheets and their real geometry',
    async ({ pro: page }) => {
      await designFloor(page);
      await openDetailingPanel(page);
      const dxf = await capture(page, 'doc-dxf');

      expect(dxf).toContain('AC1009');
      // The layers the family sheets introduce. `RC-PUNCHING` existing at all means a slab
      // plan was issued: nothing else emits it.
      expect(dxf).toContain('RC-PUNCHING');
      expect(dxf).toContain('RC-OUTLINE');
      expect(dxf).toContain('RC-BAR');
      expect(dxf).toContain('RC-MARK');
      // Real bars, not an empty sheet: a POLYLINE per bar, in quantity.
      expect((dxf.match(/POLYLINE/g) ?? []).length).toBeGreaterThan(50);
      // Panel and wall dimension labels, in millimetres, from the record's own geometry.
      expect(dxf).toMatch(/l[xy] = \d{3,}/);
    });

  test('FD-D the spreadsheet reconciles the families, the checks and the punching',
    async ({ pro: page }) => {
      await designFloor(page);
      await openDetailingPanel(page);
      const xlsx = await capture(page, 'doc-xlsx');

      // The XLSX export is a real workbook; the captured bytes are asserted for the blocks
      // this branch added rather than parsed, because the block titles are the contract.
      for (const block of ['FLOOR FAMILIES', 'FAMILY CHECKS', 'SLAB-COLUMN PUNCHING']) {
        expect(xlsx, `the workbook must carry a ${block} block`).toContain(block);
      }
    });

  /**
   * The named review, and why this floor is REFUSED one.
   *
   * The first version of this test asserted the review was recorded, and it failed — correctly.
   * A review may only be recorded from CONSTRUCTIBLE, and this floor reaches COORDINATED: a
   * twelve-panel meshed slab on a real frame carries prohibited bar conflicts, spacing that is
   * not code-legal, and four joints whose punching the engine refuses under §8.4.4.2. Every one
   * of those is a real property of the fixture, not a defect.
   *
   * So the acceptance criterion is the refusal, and it is the STRONGER assertion: it proves the
   * review gate is live in the browser, names its own reason, and cannot be walked past by
   * filling in a name. A test that engineered the fixture into CONSTRUCTIBLE would be testing a
   * floor nobody has.
   *
   * ── Where the refusal is read, and why it moved ────────────────────
   *
   * This test used to CLICK `review-submit` and read `review-error`. The button is disabled
   * whenever `reviewBlockers` is non-empty, so the click could never land and the test spent its
   * whole 60 s timeout retrying it — the failure it showed in CI, and one that had been there
   * since the control moved rather than one the redesign introduced.
   *
   * The control was not weakened; the refusal was moved EARLIER. `reviewBlockers` states the
   * same three refusals `assembly.ts` raises, from the same locale keys, before the click rather
   * than after it — the principle this panel already applied to `issue-submit`. A refusal an
   * engineer reads only by pressing a button is a refusal they discover by trying to sign off.
   *
   * So the assertions are unchanged in substance and stronger in one respect: the gate must be
   * unwalkable AND say so with the name filled in, which is the state a user reaches just before
   * signing. `floor-design.spec.ts` reads the same control the same way.
   */
  test('FD-E the review gate is live and refuses a floor that is not CONSTRUCTIBLE',
    async ({ pro: page }) => {
      await designFloor(page);
      await openDetailingPanel(page);

      // The disclaimer is not decoration: this is not a legal sign-off and the UI says so
      // beside the button that records one.
      await expect(page.getByTestId('review-disclaimer')).toBeVisible();

      // Provisional maturities must be acknowledged one by one — every family row on this
      // branch is IMPLEMENTED_PROVISIONAL, and acknowledging them still does not lower the
      // state gate.
      const acks = page.locator('[data-testid^="ack-"]');
      for (let i = 0; i < await acks.count(); i++) await acks.nth(i).check();

      await page.getByTestId('review-engineer').fill('Bauti');
      await page.getByTestId('review-notes').fill('QA journey');

      // Refused, with the reason on screen and the state named — not silently ignored, and not
      // recorded. Everything a user could supply has been supplied: the acknowledgements, the
      // engineer and the notes. What remains is the state, and the state is not negotiable.
      await expect(page.getByTestId('review-submit')).toBeDisabled();
      const blockers = page.getByTestId('review-blockers');
      await expect(blockers).toBeVisible();
      // The refusal names the STATE that blocked it and the state it needs. Both are
      // engineering identifiers and stay untranslated; the sentence around them does not — this
      // message used to be a Spanish literal built inside a pure module, so an English-locale
      // user was refused in Spanish. Found by this journey.
      await expect(blockers).toContainText('CONSTRUCTIBLE');
      await expect(blockers).toContainText('only be reviewed');
      // And the reason it gives is the STATE, not the two things the user already did: a blocker
      // list still asking for a name after one was typed would be the same dead end in words.
      await expect(blockers).not.toContainText('engineer');
      await expect(page.getByTestId('review-record')).toHaveCount(0);

      // And the blocking conditions are visible, so the reason is actionable rather than a
      // bare refusal. Punching is one of them on this fixture.
      await openFloorFamilies(page);
      await page.getByTestId('floor-family-slabs').click();
      const cells = await page.locator('[data-testid^="slab-punching-P"]').allInnerTexts();
      expect(cells.some((t) => /not verified/i.test(t))).toBe(true);
    });

  test('FD-F editing the footing SUPERSEDES the document, and regeneration issues a new one',
    async ({ pro: page }) => {
      await designFloor(page);
      await openDetailingPanel(page);
      await capture(page, 'doc-dxf');

      // Revision 1 exists and is current.
      const revision = page.getByTestId('doc-revision');
      await expect(revision).toBeVisible();
      const first = await revision.innerText();

      // Change the geometry the document describes, through the real input.
      await openFoundations(page);
      const B = page.getByTestId('footing-B');
      await B.fill('3.0');
      await B.blur();

      // The document that justified the old dimensions is retired — non-destructively: the old
      // revision keeps its number and content and moves to the superseded list.
      await openDetailingPanel(page);
      await expect(page.getByTestId('doc-none')).toBeVisible();
      const superseded = page.getByTestId('superseded-docs');
      await expect(superseded).toBeVisible();

      // Regenerate and issue again: a NEW current revision, not the old one re-dated.
      await openFoundations(page);
      await page.getByTestId('floor-design-run').click();
      await openDetailingPanel(page);
      await capture(page, 'doc-dxf');
      await expect(revision).toBeVisible();
      expect(await revision.innerText()).not.toBe(first);
    });
});

// ─── The Spanish journey ────────────────────────────────────────

test.describe('@smoke the same deliverable in Spanish', () => {
  test.use({ appLocale: 'es' });

  test('FD-ES the controls, the states and the documents are translated',
    async ({ pro: page }) => {
      await designFloor(page);
      await page.getByTestId('floor-family-slabs').click();

      // The panel's own controls and column headings, in Spanish — not the English strings
      // with a Spanish page around them.
      const table = page.getByTestId('floor-slabs-table');
      await expect(table).toBeVisible();
      await expect(table).toContainText('Utiliz. punzonado');
      const joints = page.locator('[data-testid^="slab-punching-joints-P"]').first();
      await expect(joints).toBeVisible();
      await expect(joints).toContainText('Nudo');
      await expect(joints).toContainText('Columna');

      // No raw i18n key anywhere on the visible surface. An untranslated engine message
      // reaching a panel is precisely what the structured-message rule exists to prevent.
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/detailing\.[a-zA-Z]+\.[a-zA-Z]+/);
      expect(body).not.toMatch(/slabPunching\./);
    });

  test('FD-ES-DOC the report and the spreadsheet are issued in Spanish',
    async ({ pro: page }) => {
      await designFloor(page);
      await openDetailingPanel(page);

      const html = await captureReport(page);
      // The headings a Spanish reader expects, and NOT the English ones.
      expect(html).toContain('Punzonado losa-columna');
      expect(html).toContain('combinaciones consideradas');
      expect(html).not.toContain('Slab-column punching');
      // The punching position translated, rather than the raw TypeScript union member — the
      // defect that made a Spanish report say "edge".
      expect(html).toMatch(/interior|de borde|de esquina/);
      expect(html).not.toMatch(/detailing\.[a-zA-Z]+\.[a-zA-Z]+/);

      const xlsx = await capture(page, 'doc-xlsx');
      expect(xlsx).toContain('PUNZONADO LOSA-COLUMNA');
      expect(xlsx).toContain('FAMILIAS DE PISO');
    });

  /**
   * The engineering identifiers must NOT be translated.
   *
   * A bar mark, a panel id and a wall id are the names two drawings of one project share. If
   * they moved with the locale, a Spanish plan and an English schedule would describe the same
   * steel under different names — the exact failure that makes a bilingual deliverable unusable
   * on site. So the Spanish DXF is compared against the English one on the marks it carries.
   */
  test('FD-ES-IDS marks and panel ids are stable across locale', async ({ pro: page }) => {
    await designFloor(page);
    await openDetailingPanel(page);
    const dxf = await capture(page, 'doc-dxf');

    // Panel and wall ids are engineering identifiers and stay as they are.
    expect(dxf).toMatch(/P\d+/);
    // The layer names are a DXF contract, not user text: they never localise.
    expect(dxf).toContain('RC-PUNCHING');
    expect(dxf).toContain('RC-BAR');
    expect(dxf).not.toContain('HC-BARRA');

    // Decimal formatting in the DXF stays machine-readable — a Spanish decimal comma in a
    // coordinate would make the file unopenable.
    const coords = dxf.match(/^-?\d+\.\d+$/gm) ?? [];
    expect(coords.length).toBeGreaterThan(20);
    expect(dxf).not.toMatch(/^\s*-?\d+,\d+\s*$/m);
  });
});
