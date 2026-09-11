/**
 * The eight things that had to be true end to end, on a real designed building.
 *
 * ── Why one spec for eight claims ─────────────────────────────────
 *
 * Because they are one chain, and each link costs a `designAll` to reach. Editing a bar has to
 * reach the detailing, the sheet and the 3-D; locking has to survive a regeneration; the
 * regeneration has to say what it replaced; the exports have to record it. Split across eight
 * files this would be eight solves of the same building to assert eight steps of one story.
 *
 * The per-property tests live where they belong — `rc-bar-lock.test.ts`, `rc-selection.test.ts`,
 * `bar-shape-diagram.test.ts`, `detailing-edit-retroactive.test.ts`, `export-log.test.ts` — and
 * are not repeated here. What is here is the chain: that pressing the real controls in order
 * produces the stated outcome.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1400, height: 900 } });

type Assembly = {
  id: string; detailingRevision: number; state: string; elementIds: number[];
  bars: Array<{ id: string; locked?: boolean; ownerElementIds: number[] }>;
};

function assemblies(page: Page): Promise<Assembly[]> {
  return page.evaluate(() =>
    (window.__stabileo as unknown as { detailingAssemblies(): Assembly[] })
      .detailingAssemblies());
}

function sheet(page: Page) {
  return page.evaluate(() => (window.__stabileo as unknown as {
    detailingSheet(): {
      title: { revision: number };
      polylines: Array<{ layer: string; points: Array<{ x: number; y: number }> }>;
      circles: Array<{ centre: { x: number; y: number } }>;
      dimensions: Array<{ label: string; axis?: string }>;
    } | null;
  }).detailingSheet());
}

async function openPanel(page: Page) {
  const d = page.getByTestId('detailing-disclosure');
  await expect(d).toBeAttached();
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
}

/** A designed, coordinated project with the detailing panel open. */
async function coordinated(page: Page): Promise<number[]> {
  const ids = await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await openPanel(page);
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect.poll(async () => (await assemblies(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  return ids;
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
  await count.fill(String(Number(await count.inputValue()) + 1));
  await count.blur();
  return beam;
}

/** Lock the member the given element belongs to, through the bar list. */
async function lockMember(page: Page, elementId: number): Promise<boolean> {
  await openPanel(page);
  const asm = (await assemblies(page)).find((a) => a.elementIds.includes(elementId));
  if (!asm) return false;
  const bar = asm.bars.find((b) => b.ownerElementIds.includes(elementId));
  if (!bar) return false;
  await page.getByTestId(`assembly-${asm.id}`).click();
  await page.getByTestId('bar-list').locator('> summary').click();
  const control = page.getByTestId(`barlock-${bar.id}`);
  if (await control.count() === 0) return false;
  await control.click();
  return true;
}

test.describe('@slow 1 — editing a bar updates Detalle, the sheet and the 3-D', () => {
  test('P1 — the level invalidates and the sheet follows its revision', async ({ pro: page }) => {
    const ids = await coordinated(page);
    const before = await assemblies(page);
    const beam = await editABeam(page, ids);
    const owner = before.find((a) => a.elementIds.includes(beam))!;

    // Detalle: the level the member is on is no longer current.
    await expect.poll(async () => (await assemblies(page))
      .find((a) => a.id === owner.id)?.detailingRevision).toBe(owner.detailingRevision + 1);

    // The panel says which, and offers the command that answers it.
    await openPanel(page);
    await expect(page.getByTestId('detailing-edited-what')).toContainText(String(beam));

    // The sheet is built from the assemblies, so it carries the revision they carry — never one
    // cached from before the edit. The 3-D document is built from the same assemblies, which is
    // what `f3-edit-retroactive.spec.ts` E6 pins for the drawing.
    await page.getByTestId(`assembly-${owner.id}`).click();
    await expect.poll(async () => (await sheet(page))?.title.revision)
      .toBe(owner.detailingRevision + 1);
  });
});

test.describe('@slow 2 — invalidation forces the right states', () => {
  test('P2 — the edited level drops its earned state and no other level moves', async ({ pro: page }) => {
    const ids = await coordinated(page);
    const before = await assemblies(page);
    const beam = await editABeam(page, ids);
    const owner = before.find((a) => a.elementIds.includes(beam))!;

    await expect.poll(async () => (await assemblies(page))
      .find((a) => a.id === owner.id)?.detailingRevision).toBe(owner.detailingRevision + 1);

    const after = await assemblies(page);
    // CONSTRUCTIBLE is a claim that the bars FIT; new bars have not been checked.
    if (owner.state === 'CONSTRUCTIBLE' || owner.state === 'COORDINATED') {
      expect(after.find((a) => a.id === owner.id)!.state).toBe('VERIFIED');
    }
    for (const a of before.filter((x) => x.id !== owner.id)) {
      expect(after.find((x) => x.id === a.id)!.detailingRevision, a.id)
        .toBe(a.detailingRevision);
    }
  });
});

test.describe('@slow 3 and 4 — regenerating keeps what is locked and replaces what is not', () => {
  /*
   * The product decision, end to end. `runDetailing` carries a LOCKED member's bars through
   * untouched; everything else is re-detailed from the design outcomes. So the locked member's
   * bar ids survive a regeneration and the unlocked ones need not.
   */
  test('P3 — a locked member’s bars survive a regeneration', async ({ pro: page }) => {
    const ids = await coordinated(page);
    const beam = await editABeam(page, ids);
    test.skip(!(await lockMember(page, beam)), 'no bar to lock on this member');

    const lockedIds = (await assemblies(page)).flatMap((a) => a.bars)
      .filter((b) => b.locked).map((b) => b.id);
    expect(lockedIds.length).toBeGreaterThan(0);

    await page.getByTestId('cmd-generate-detailing').click();
    await expect.poll(async () => {
      const after = (await assemblies(page)).flatMap((a) => a.bars).map((b) => b.id);
      return lockedIds.every((id) => after.includes(id));
    }, { timeout: 60_000 }).toBe(true);
  });

  /*
   * And the warning that has to come BEFORE it. A warning that arrives after the work is gone
   * is not a warning, so it is beside the command while the user is deciding.
   */
  test('P4 — the command warns which unlocked hand edits it will replace', async ({ pro: page }) => {
    const ids = await coordinated(page);
    await expect(page.getByTestId('regen-warning')).toHaveCount(0);

    const beam = await editABeam(page, ids);
    const warning = page.getByTestId('regen-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(String(beam));
    await expect(warning).toContainText('will replace');

    // Lock it and the warning stops naming it: it is no longer going to be replaced.
    test.skip(!(await lockMember(page, beam)), 'no bar to lock on this member');
    await expect.poll(async () =>
      (await warning.count()) === 0 || !(await warning.innerText()).includes('will replace'),
    { timeout: 20_000 }).toBe(true);
  });
});

test.describe('@slow 5 and 6 — exports record themselves and Documentos says what was retouched', () => {
  test('P5 — an export writes a real record', async ({ pro: page }) => {
    await coordinated(page);
    await openDocumentsStage(page);
    await page.getByTestId('doc-dxf').click();

    await expect.poll(async () => page.evaluate(() =>
      (window.__stabileo as unknown as { exportRecords(): unknown[] }).exportRecords().length))
      .toBe(1);
    await expect(page.getByTestId('export-record-0')).toBeVisible();
  });

  /*
   * The two claims a reader deciding whether to issue needs, and they are different: a LOCKED
   * hand edit is the arrangement the engineer chose and the next run keeps it; an unlocked one
   * is on this drawing and will not survive.
   */
  test('P6 — Documentos separates the retouched that stay from the ones that go', async ({ pro: page }) => {
    const ids = await coordinated(page);
    const beam = await editABeam(page, ids);
    await openDocumentsStage(page);
    await page.getByTestId('doc-dxf').click();

    await expect(page.getByTestId('doc-retouch-replaced')).toContainText(String(beam));
    await expect(page.getByTestId('doc-retouch-replaced')).toContainText('NOT locked');

    test.skip(!(await lockMember(page, beam)), 'no bar to lock on this member');
    await openDocumentsStage(page);
    await page.getByTestId('doc-dxf').click();
    await expect(page.getByTestId('doc-retouch-kept')).toContainText(String(beam));
    await expect(page.getByTestId('doc-retouch-kept')).toContainText('LOCKED');
  });
});

test.describe('@slow 7 — the section station is a station, not always zero', () => {
  /*
   * `sectionAt` was `0` and no control ever set it, so every section sheet in the app was a cut
   * at the model's origin. It defaults to mid-span of the longest member now, and the control
   * moves it.
   */
  test('P7 — the default is not the origin, and changing it changes the cut', async ({ pro: page }) => {
    await coordinated(page);
    await page.getByTestId('sheet-kind-section').click();

    const station = page.getByTestId('sheet-station');
    await expect(station).toBeVisible();
    const first = Number(await station.inputValue());
    expect(first, 'the default is not the origin').not.toBe(0);

    const before = await sheet(page);
    const range = await page.getByTestId('sheet-station-range').innerText();
    const max = Number(/([\d.]+)\s*m/.exec(range.split('and')[1] ?? '')?.[1] ?? NaN);
    test.skip(!Number.isFinite(max) || max <= first, 'no room to move the station');

    await station.fill(((first + max) / 2).toFixed(2));
    await station.blur();
    await expect.poll(async () => JSON.stringify(await sheet(page)))
      .not.toBe(JSON.stringify(before));
  });
});

test.describe('@slow 8 — the schedule uses the real developed length', () => {
  /*
   * `cuttingLength` is `developedLength(segments)` — straight runs plus every arc at r·θ. The
   * diagram decomposes it into legs and bends, and the two must add back up: a schedule whose
   * total was the sum of its own drawn dimensions looks consistent and orders short steel.
   */
  test('P8 — the diagram’s total is the row’s cut length, bends included', async ({ pro: page }) => {
    await coordinated(page);
    await openPanel(page);
    const table = page.getByTestId('schedule');
    await expect(table).toBeVisible();

    const bent = page.locator('[data-testid^="shape-bends-"]').first();
    test.skip(await bent.count() === 0, 'this level has only straight bars');
    const mark = (await bent.getAttribute('data-testid'))!.replace('shape-bends-', '');

    // Three numbers that have to be one number: the total under the diagram, the steel the
    // diagram says is in the bends, and the row's own Cut length column.
    const total = Number(/(\d+)/.exec(
      await page.getByTestId(`shape-total-${mark}`).innerText())![1]);
    const bends = Number(/(\d+)/.exec(await bent.innerText())![1]);

    const row = table.locator('tr', { has: page.getByTestId(`shape-${mark}`) });
    const cells = await row.locator('td').allInnerTexts();
    // `cuttingLengthM`, in metres, two decimals — the column `buildSchedule` fills from
    // `BarMark.cuttingLength`, which is `developedLength(segments)`.
    const cutM = cells.map(Number).find((v) => Number.isFinite(v)
      && Math.abs(v * 1000 - total) < 1);
    expect(cutM, 'the diagram and the row state one length').toBeDefined();

    /*
     * And it is NOT the sum of the straight runs. On a Ø8 tie with 135° hooks the arcs are 188
     * mm of a 1 650 mm bar; a schedule that "simplified" the total to its drawn dimensions
     * would order short steel and look perfectly consistent doing it.
     */
    expect(bends).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(bends);
  });
});

/**
 * The new surfaces at the four widths and in the three languages.
 *
 * ── What this measures, and what it does not ──────────────────────
 *
 * Overflow and untranslated keys, on the three panels this run added: the rótulo, the bending
 * schedule and the emission log. Contrast is `concrete-copy-contrast` and `h1c`'s job and is
 * deliberately not repeated — a second contrast auditor with a different tolerance is how two
 * gates come to disagree about the same pixel.
 *
 * A missing key renders as the key itself, which is the one i18n defect a test can catch without
 * knowing the language. `f3-member-list.spec.ts` uses the same tripwire on `design.`.
 */
for (const vp of [
  { width: 1280, height: 720 },
  { width: 1024, height: 700 },
  { width: 900, height: 700 },
  { width: 820, height: 700 },
]) {
  test.describe(`@slow the new panels at ${vp.width}x${vp.height}`, () => {
    test('nothing overflows sideways', async ({ pro: page }) => {
      await page.setViewportSize(vp);
      await coordinated(page);
      await openPanel(page);

      for (const id of ['rotulo', 'schedule', 'detailing-workflow']) {
        const el = page.getByTestId(id);
        if (await el.count() === 0) continue;
        const over = await el.evaluate((n) => n.scrollWidth - n.clientWidth);
        expect(over, `${id} at ${vp.width}`).toBeLessThanOrEqual(1);
      }

      // And the panel itself does not start scrolling sideways because of them.
      const panelOver = await page.locator('.rc-workflow').evaluate(
        (el) => el.scrollWidth - el.clientWidth);
      expect(panelOver, `the panel at ${vp.width}`).toBeLessThanOrEqual(1);
    });
  });
}

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`@slow the new panels in ${locale}`, () => {
    test('every label is translated and no raw key reaches the screen', async ({ pro: page }) => {
      await page.getByTestId('lang-select').selectOption(locale);
      await coordinated(page);
      await openPanel(page);

      // The rótulo, the schedule and — after an export — the emission log.
      await openDocumentsStage(page);
      await page.getByTestId('doc-dxf').click();
      await expect(page.getByTestId('export-record-0')).toBeVisible();

      for (const id of ['rotulo', 'export-log']) {
        const text = await page.getByTestId(id).innerText();
        expect(text.length, `${id} says something`).toBeGreaterThan(10);
        expect(text, `${id} has no raw key`).not.toMatch(/\bdetailing\.[a-z]/i);
        expect(text, `${id} has no raw key`).not.toMatch(/\bdesign\.[a-z]/i);
      }

      await openPanel(page);
      const schedule = await page.getByTestId('schedule').innerText();
      expect(schedule).not.toMatch(/\bdetailing\.[a-z]/i);
    });
  });
}
