/**
 * Documents and professional review, as a stage rather than a footnote.
 *
 * ── What was wrong ─────────────────────────────────────────────────
 *
 * The report, the drawings, the bar schedule, the 3-D view, the provisional acknowledgements, the
 * engineer's name, the notes, `Record review` and `Issue for construction` all lived at the BOTTOM
 * of the coordinated-detailing panel. To reach the control that issues a set of drawings for
 * construction you opened detailing, selected an assembly, and scrolled past the bar list, the
 * conflicts, the sheet and the schedule.
 *
 * These are not details of the detailing. They are what the pipeline is for, and the last of them
 * carries a professional declaration. The workflow strip has counted Documents as its own stage
 * since PR20's first pass; the panel now agrees with it.
 *
 * ── What these tests hold to ───────────────────────────────────────
 *
 * The hierarchy — what exists, what you can take away, the review, the acceptances, the issue —
 * measured as document order; that a disabled `Issue for construction` says what it is waiting
 * for in TEXT; and that the stage explains itself when there is nothing to build from.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

type Json = Record<string, unknown>;

function bar(id: string, y: number): Json {
  return {
    id, diameterMm: 10, role: 'longitudinal',
    segments: [{
      kind: 'straight',
      start: { x: -0.15, y, z: 3 }, end: { x: 5.15, y, z: 3 }, length: 5.3,
    }],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 5.3, ownerElementIds: [50], source: 'generated', locked: false, refs: [],
  };
}

function assembly(over: Json = {}): Json {
  return {
    id: 'ASM-1', kind: 'beamLine', label: 'Nivel +3,00 — pórtico A',
    elementIds: [1, 50],
    bars: [bar('A-b-0', 0.1), bar('A-b-1', 0.3)],
    marks: [{
      mark: 'A1', diameterMm: 10, cuttingLength: 5.3, quantity: 2, shape: 'straight',
      massKg: 6.5, barIds: ['A-b-0', 'A-b-1'],
    }],
    joints: [], conflicts: [], unsupported: [],
    detailingRevision: 1, demandRevision: 5,
    state: 'CONSTRUCTIBLE', maturity: 'IMPLEMENTED_PROVISIONAL',
    provenance: {
      edition: '2025', verifierId: 'cirsoc201.provided.v2.2025',
      trace: [], assumptions: [],
    },
    ...over,
  };
}

async function seed(page: Page, assemblies: Json[]) {
  await page.evaluate((a) => {
    (window.__stabileoActions as unknown as { seedDetailing(x: unknown): void }).seedDetailing(a);
  }, assemblies);
}

async function openDocuments(page: Page) {
  const d = page.getByTestId('documents-disclosure');
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
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

test.describe('@smoke Documents is a stage of the panel', () => {
  test('E1 — it is a top-level section, not a tail of the detailing panel', async (
    { pro: page },
  ) => {
    const section = page.getByTestId('documents-disclosure');
    await expect(section).toBeVisible();
    // A direct child of the column, like every other stage.
    const isStage = await page.evaluate(() =>
      !!document.querySelector('.rc-workflow > [data-testid="documents-disclosure"]'));
    expect(isStage, 'Documents sits beside the other stages').toBe(true);
    // And it is no longer inside the detailing panel.
    await expect(page.getByTestId('detailing-workflow').getByTestId('documents-stage'))
      .toHaveCount(0);
  });

  test('E2 — with nothing to build from, it says so instead of showing dead buttons', async (
    { pro: page },
  ) => {
    await openDocuments(page);
    const empty = page.getByTestId('documents-empty');
    await expect(empty).toBeVisible();
    expect((await empty.innerText()).trim().length).toBeGreaterThan(30);
    // No export button offered for a document that cannot exist.
    await expect(page.getByTestId('doc-report')).toHaveCount(0);
  });

  test('E3 — the ranking: state, then exports, then review, then the issue', async (
    { pro: page },
  ) => {
    await seed(page, [assembly()]);
    await openDocuments(page);

    const state = await order(page, 'doc-none');
    const exports_ = await order(page, 'doc-report');
    const review = await order(page, 'review-disclaimer');
    const issue = await order(page, 'issue-submit');

    expect(state, 'what document exists is stated').toBeGreaterThan(-1);
    expect(state, 'before what you can take away').toBeLessThan(exports_);
    expect(exports_, 'before the professional review').toBeLessThan(review);
    expect(review, 'and the issue is last').toBeLessThan(issue);
  });

  test('E4 — all four projections are offered, in one group', async ({ pro: page }) => {
    await seed(page, [assembly()]);
    await openDocuments(page);
    for (const id of ['doc-report', 'doc-dxf', 'doc-xlsx', 'doc-3d']) {
      await expect(page.getByTestId(id), `${id} is offered`).toBeVisible();
    }
  });

  test('E5 — a disabled Issue for construction says what it is waiting for', async (
    { pro: page },
  ) => {
    await seed(page, [assembly()]);
    await openDocuments(page);

    await expect(page.getByTestId('issue-submit')).toBeDisabled();
    const why = page.getByTestId('issue-blockers');
    await expect(why, 'the requirement is on the page, not only in a tooltip').toBeVisible();
    expect((await why.innerText()).trim().length).toBeGreaterThan(0);
  });

  test('E6 — the declaration that software approval is not sign-off survives the move', async (
    { pro: page },
  ) => {
    await seed(page, [assembly()]);
    await openDocuments(page);
    await expect(page.getByTestId('review-disclaimer')).toBeVisible();
    await expect(page.getByTestId('review-engineer')).toBeVisible();
    await expect(page.getByTestId('review-notes')).toBeVisible();
  });
});

test.describe('the Documents stage speaks the three languages', () => {
  for (const [locale, title] of [
    ['en', 'Documents'],
    ['es', 'Documentos'],
    ['pt', 'Documentos'],
  ] as const) {
    test(`E7 ${locale} — the stage is named in the interface's language`, async ({ pro: page }) => {
      await page.getByTestId('lang-select').selectOption(locale);
      await expect(page.getByTestId('documents-disclosure')).toContainText(title);
    });
  }
});
