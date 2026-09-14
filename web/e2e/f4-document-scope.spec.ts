/**
 * F4 — what a document covers, chosen on screen and declared on the file.
 *
 * ── The state these tests make unreachable ─────────────────────────
 *
 * Three answers to "qué cubre este documento", none of them comparable:
 *
 *   the FAMILIES the design run was asked for — stamped on every export by `scopeStatement`;
 *   the ASSEMBLIES the detailing happened to draw — what the sheets actually show;
 *   `ExportRecord.elements` — recorded on every emission since F0 and rendered nowhere.
 *
 * A user who designed beams and columns, generated the detailing and then unticked `column` in
 * Diseñar got a set whose banner said "SCOPE: beams" and whose sheets drew the columns. Nothing in
 * that chain is false on its own, and the reader on site cannot find the seam.
 *
 * ── What is asserted, and what deliberately is not ─────────────────
 *
 * Asserted: the base scope is a READING of Diseñar; the stage can only narrow it; a narrowing
 * changes what the emission records; the two empty states are worded apart; a preview says it is
 * not an emission and leaves no record.
 *
 * NOT asserted: that anything here can add a family. That is the point — the refusal is stated
 * and there is no control, so the test is the ABSENCE of one plus the sentence that explains it.
 */
import {
  test, expect, designAll, loadModel, openDocumentsStage, solveModel, computeDemands,
} from './fixtures';
import type { Page } from '@playwright/test';

const QA = 'rc-design-qa-8';

/** Open DETALLE. Direct child only: the stage contains nested disclosures of its own. */
async function openDetailing(page: Page) {
  const d = page.getByTestId('detailing-disclosure');
  await expect(d).toBeVisible();
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
}

/**
 * A project with a real coordinated detailing, through the real commands.
 *
 * Not `seedDetailing`: the scope's base is classified from `verificationStore.contexts`, so a
 * seeded assembly has no family and every test would run against the `unclassified` path — the
 * one branch that is NOT what the product rule is about.
 */
async function preparedProject(page: Page) {
  await loadModel(page, QA);
  await designAll(page);
  await openDetailing(page);
  await page.getByTestId('cmd-generate-detailing').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as {
      __stabileo: { detailingAssemblies(): unknown[] };
    }).__stabileo.detailingAssemblies().length), { timeout: 120_000 })
    .toBeGreaterThan(0);
  await openDocumentsStage(page);
  await expect(page.getByTestId('doc-scope-picker')).toBeVisible();
}

/** Where a testid sits in the stage's reading order. */
async function order(page: Page, testid: string): Promise<number> {
  return page.evaluate((id) => {
    const root = document.querySelector('[data-testid="documents-stage"]');
    if (!root) return -1;
    const el = root.querySelector(`[data-testid="${id}"]`);
    return el ? [...root.querySelectorAll('*')].indexOf(el) : -1;
  }, testid);
}

/** The ids the picker offers, read off the checkboxes rather than assumed. */
async function offeredIds(page: Page): Promise<number[]> {
  await page.getByTestId('doc-scope-disclosure').locator('> summary').click();
  const boxes = page.locator('[data-testid^="doc-scope-member-"]');
  const n = await boxes.count();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const id = await boxes.nth(i).getAttribute('data-testid');
    out.push(Number(id!.replace('doc-scope-member-', '')));
  }
  return out.sort((a, b) => a - b);
}

test.describe('@smoke Documentos states what it is, and what it will emit', () => {
  test('F4-A the conceptual difference with Detalle is on the screen', async ({ pro: page }) => {
    await preparedProject(page);
    const vs = page.getByTestId('doc-vs-detailing');
    await expect(vs).toBeVisible();
    // A sentence, not a label: it has to distinguish two stages and it is the only place the
    // distinction is written where a user can read it.
    expect((await vs.innerText()).trim().length).toBeGreaterThan(60);
    /*
     * And it comes first in the stage.
     *
     * Measured against the scope picker and not against `doc-readiness`: that line renders only
     * once a document has been BUILT, which no export has done yet at this point, so the
     * comparison would have been against an element that is legitimately absent.
     */
    expect(await order(page, 'doc-vs-detailing'))
      .toBeLessThan(await order(page, 'doc-scope-picker'));
  });

  test('F4-B the scope is stated before the buttons that act on it', async ({ pro: page }) => {
    await preparedProject(page);
    const picker = await order(page, 'doc-scope-picker');
    const exports_ = await order(page, 'doc-report');
    expect(picker).toBeGreaterThan(-1);
    expect(picker, 'what will be exported, above the export').toBeLessThan(exports_);
  });

  test('F4-C the base scope is a reading of Diseñar, and says it cannot be widened here', async (
    { pro: page },
  ) => {
    await preparedProject(page);
    const base = page.getByTestId('doc-scope-base');
    await expect(base).toContainText('columns');
    await expect(base).toContainText('beams');
    // The refusal, in words, next to the boxes that can only narrow.
    await expect(base).toContainText('Diseñar');
    // No control here adds a family. The absence IS the contract.
    await expect(page.getByTestId('doc-scope-add-family')).toHaveCount(0);
  });

  test('F4-D with nothing narrowed it declares the whole documentable set', async (
    { pro: page },
  ) => {
    await preparedProject(page);
    const statement = page.getByTestId('doc-scope-statement');
    await expect(statement).toHaveAttribute('data-whole', 'true');
    await expect(statement).toContainText('whole documentable set');
  });
});

test.describe('narrowing changes what leaves, and says so', () => {
  test('F4-E unticking a member reduces the statement and the record', async ({ pro: page }) => {
    await preparedProject(page);
    const ids = await offeredIds(page);
    expect(ids.length, 'the QA frame offers several members').toBeGreaterThan(1);

    await page.getByTestId(`doc-scope-member-${ids[0]}`).uncheck();

    const statement = page.getByTestId('doc-scope-statement');
    await expect(statement).toHaveAttribute('data-whole', 'false');
    await expect(statement).toContainText(`${ids.length - 1} of ${ids.length}`);

    // And the emission carries the same set — the field `ExportRecord.elements` has held since
    // F0 and nothing rendered.
    await page.getByTestId('doc-xlsx').click();
    const elements = page.getByTestId('export-record-elements-0');
    await expect(elements).toBeVisible();
    await expect(elements).toContainText(`${ids.length - 1} member`);
    await expect(elements, 'the dropped member is not in it')
      .not.toContainText(new RegExp(`\\b${ids[0]}\\b`));
  });

  test('F4-F the whole-scope button returns to everything', async ({ pro: page }) => {
    await preparedProject(page);
    const ids = await offeredIds(page);
    await page.getByTestId(`doc-scope-member-${ids[0]}`).uncheck();
    await expect(page.getByTestId('doc-scope-statement')).toHaveAttribute('data-whole', 'false');
    await page.getByTestId('doc-scope-all').click();
    await expect(page.getByTestId('doc-scope-statement')).toHaveAttribute('data-whole', 'true');
  });

  test('F4-G selecting nothing blocks every export, and names the fix', async ({ pro: page }) => {
    await preparedProject(page);
    await page.getByTestId('doc-scope-none').click();
    await expect(page.getByTestId('doc-scope-statement')).toContainText('nothing to export');

    for (const id of ['doc-report', 'doc-dxf', 'doc-xlsx', 'doc-3d']) {
      await page.getByTestId(id).click();
      const err = page.getByTestId('doc-error');
      await expect(err, `${id} refuses`).toBeVisible();
      await expect(err).toContainText('Tick at least one');
    }
    // A refusal is not an emission: nothing was recorded by four blocked clicks.
    await expect(page.getByTestId('export-log-empty')).toBeVisible();
  });
});

test.describe('the design scope is the only way to widen', () => {
  test('F4-H a family unticked in Diseñar leaves the documentable base, named', async (
    { pro: page },
  ) => {
    await preparedProject(page);
    const before = await offeredIds(page);

    // Diseñar owns the families. Unticking one there is the ONLY thing that moves the base.
    await page.getByTestId('design-family-column').uncheck();

    const excluded = page.getByTestId('doc-scope-excluded');
    await expect(excluded).toBeVisible();
    await expect(excluded, 'the family, and the remedy').toContainText('columns');
    await expect(excluded).toContainText('Diseñar');

    const after = await offeredIds(page);
    expect(after.length, 'the columns are no longer documentable').toBeLessThan(before.length);
    expect(after.length).toBeGreaterThan(0);
  });
});

test.describe('a preview is a preview', () => {
  test('F4-I the drawing preview renders a sheet and leaves no record', async ({ pro: page }) => {
    await preparedProject(page);
    // Said before the buttons, not under the result.
    const caveat = page.getByTestId('doc-preview-not-export');
    await expect(caveat).toBeVisible();
    await expect(caveat).toContainText('no record');
    expect(await order(page, 'doc-preview-not-export'))
      .toBeLessThan(await order(page, 'doc-preview-dxf'));

    await page.getByTestId('doc-preview-dxf').click();
    await expect(page.getByTestId('doc-preview-sheet')).toBeVisible();
    await expect(page.getByTestId('doc-preview-scope')).toContainText('Revision');
    // Nothing left the app, so the emission list is still empty.
    await expect(page.getByTestId('export-log-empty')).toBeVisible();
  });

  test('F4-J the schedule preview renders the same rows the file would carry', async (
    { pro: page },
  ) => {
    await preparedProject(page);
    await page.getByTestId('doc-preview-xlsx').click();
    const table = page.getByTestId('doc-preview-table');
    await expect(table).toBeVisible();
    expect(await table.locator('tr').count()).toBeGreaterThan(1);
    await expect(page.getByTestId('export-log-empty')).toBeVisible();
  });

  test('F4-K a preview follows the narrowing', async ({ pro: page }) => {
    await preparedProject(page);
    const ids = await offeredIds(page);
    await page.getByTestId(`doc-scope-member-${ids[0]}`).uncheck();
    await page.getByTestId('doc-preview-dxf').click();
    const scope = page.getByTestId('doc-preview-scope');
    await expect(scope).toContainText(`${ids.length - 1} member`);
  });
});

test.describe('the stage speaks the three languages and holds four widths', () => {
  for (const [locale, word] of [
    ['en', 'What to document'],
    ['es', 'Qué documentar'],
    ['pt', 'O que documentar'],
  ] as const) {
    test(`F4-L ${locale} — the scope picker is titled in the reader's language`, async (
      { pro: page },
    ) => {
      await preparedProject(page);
      await page.getByTestId('lang-select').selectOption(locale);
      await expect(page.getByTestId('doc-scope-picker')).toContainText(word);
      // The statement translates too, and is not left in English beside a translated heading —
      // the half-translated state `i18n-coverage-gap.md` is about.
      const statement = page.getByTestId('doc-scope-statement');
      await expect(statement).toBeVisible();
      expect((await statement.innerText()).trim().length).toBeGreaterThan(20);
    });
  }

  for (const width of [1280, 1024, 900, 820]) {
    test(`F4-M ${width}px — nothing in the picker overflows the panel`, async ({ pro: page }) => {
      await page.setViewportSize({ width, height: 720 });
      await preparedProject(page);
      const overflow = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="doc-scope-picker"]') as HTMLElement;
        const panel = root.closest('[data-testid="documents-stage"]') as HTMLElement;
        return {
          picker: root.scrollWidth - root.clientWidth,
          panel: panel.scrollWidth - panel.clientWidth,
          body: document.body.scrollWidth - document.body.clientWidth,
        };
      });
      // A tolerance of 1 px: sub-pixel layout rounding is not an overflow.
      expect(overflow.picker, 'the picker fits its own box').toBeLessThanOrEqual(1);
      expect(overflow.panel, 'and the stage fits the column').toBeLessThanOrEqual(1);
      expect(overflow.body, 'and the page never scrolls sideways').toBeLessThanOrEqual(1);
    });
  }
});

test.describe('a member with no family is kept, not dropped', () => {
  test('F4-N an assembly nothing classified is in the base and says so', async ({ pro: page }) => {
    /*
     * The one case `seedDetailing` is the right tool for: an assembly with no `MemberContext`
     * behind it is exactly a project edited after its detailing ran. Silently removing steel from
     * a drawing set is the failure this branch may not trade for tidiness, so the member stays in
     * the base and the panel names it.
     */
    await loadModel(page, QA);
    await solveModel(page);
    await computeDemands(page);
    await page.evaluate(() => {
      (window.__stabileoActions as unknown as { seedDetailing(x: unknown): void })
        .seedDetailing([{
          id: 'ASM-X', kind: 'beamLine', label: 'Orphan',
          elementIds: [90210],
          bars: [], marks: [], joints: [], conflicts: [], unsupported: [],
          detailingRevision: 1, demandRevision: 1,
          state: 'CONSTRUCTIBLE', maturity: 'IMPLEMENTED_PROVISIONAL',
          provenance: { edition: '2025', verifierId: 'x', trace: [], assumptions: [] },
        }]);
    });
    await openDocumentsStage(page);
    const unclassified = page.getByTestId('doc-scope-unclassified');
    await expect(unclassified).toBeVisible();
    await expect(unclassified).toContainText('90210');
    // In the set, not excluded from it.
    await expect(page.getByTestId('doc-scope-statement')).toHaveAttribute('data-whole', 'true');
  });
});
