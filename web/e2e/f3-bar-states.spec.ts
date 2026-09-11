/**
 * Objective 5 — a bar says what it is called AND what state it is in, and a conflict names bars
 * rather than quoting keys.
 *
 * ── Why this seeds instead of designing a building ─────────────────
 *
 * The same reason `detailing-review.spec.ts` gives, plus one more. The three states under test
 * are unmarked, marked and provisional, and a real run produces whichever the model happens to
 * yield: a suite that asserts provisional behaviour only when a provisional bar happens to exist
 * reports green for the wrong reason. Seeding puts all three on screen at once.
 *
 * The cost matters too. `f3-bar-labels.spec.ts` is `@slow` because it designs a real building —
 * §9.4 measured it and moved the redundancy out of the blocking suite rather than widening the
 * budget. Everything here is a claim about the PANEL, so none of it needs a solver.
 *
 * ── What it does not re-assert ────────────────────────────────────
 *
 * That the primary label is never an engine key. That is a negative over a pure function and it
 * lives in `rc-bar-label.test.ts`, where it costs nothing and cannot be satisfied by a component
 * that happens to render something else. What is here is what only a browser can answer: that
 * the state reaches the row, that the reason reaches the reader, and that the keys survive at a
 * secondary level instead of being dropped.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

type Json = Record<string, unknown>;

/** The shape the panel renders. `provisional` is what `BarPath` carries and the 3-D view paints. */
function bar(id: string, y: number, over: Json = {}): Json {
  return {
    id, diameterMm: 16, role: 'longitudinal',
    segments: [{
      kind: 'straight',
      start: { x: -0.15, y, z: 3 }, end: { x: 5.15, y, z: 3 }, length: 5.3,
    }],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 5.3, ownerElementIds: [50], source: 'generated', locked: false, refs: [],
    ...over,
  };
}

/**
 * One assembly holding all three states at once.
 *
 *   `A-marked`       in the mark, certified          → marked
 *   `A-unmarked`     absent from the mark            → not marked
 *   `A-own`          `provisional: 'biaxial'`        → provisional, its own proposal
 *   `A-through`      owned by member 60, a proposal  → provisional, an inherited one
 *
 * `A-own` is deliberately IN the mark too: a provisional bar can carry a mark, and the row that
 * loses it is the row a bender cannot fabricate from.
 */
function assembly(over: Json = {}): Json {
  return {
    id: 'ASM-1', kind: 'beamLine', label: 'Nivel +3,00 — pórtico A',
    elementIds: [1, 50, 60],
    bars: [
      bar('A-marked', 0.1),
      bar('A-unmarked', 0.3),
      bar('A-own', 0.5, { provisional: 'biaxial' }),
      bar('A-through', 0.7, { ownerElementIds: [60] }),
    ],
    marks: [{
      mark: 'A1', diameterMm: 16, cuttingLength: 5.3, quantity: 2, shape: 'straight',
      massKg: 9.8, barIds: ['A-marked', 'A-own'],
    }],
    // The assembly's OWN field, which is what `scene-model.ts` builds the viewer's
    // `provisionalMembers` from. Not derived from bar ownership — see `provisionalMembersOf`.
    provisionalMembers: [60],
    joints: [], conflicts: [], unsupported: [],
    detailingRevision: 1, demandRevision: 5,
    state: 'CONSTRUCTIBLE', maturity: 'IMPLEMENTED_PROVISIONAL',
    provenance: {
      edition: '2025', verifierId: 'cirsoc201.provided.v2.2025',
      trace: [], assumptions: ['Brazo elástico interno adoptado como 0,9 d.'],
    },
    ...over,
  };
}

async function seed(page: Page, assemblies: Json[]) {
  await page.evaluate((a) => {
    (window.__stabileoActions as unknown as { seedDetailing(x: unknown): void }).seedDetailing(a);
  }, assemblies);
}

async function openPanel(page: Page) {
  const d = page.getByTestId('detailing-disclosure');
  await expect(d).toBeVisible();
  await d.locator('> summary').click();
}

async function openBars(page: Page) {
  await page.getByTestId('bar-list').locator('> summary').click();
  await expect(page.getByTestId('bar-A-marked')).toBeVisible();
}

test.describe('@smoke a bar carries its state as well as its name', () => {
  test('B1 — the three states reach the rows, each on the right bar', async ({ pro: page }) => {
    await seed(page, [assembly()]);
    await openPanel(page);
    await openBars(page);

    for (const [id, state] of [
      ['A-marked', 'marked'],
      ['A-unmarked', 'unmarked'],
      ['A-own', 'provisional'],
      ['A-through', 'provisional'],
    ]) {
      await expect(page.getByTestId(`bar-${id}`), id).toHaveAttribute('data-bar-state', state);
    }
  });

  /*
   * The flattening the module was written to prevent, asserted on screen: a provisional bar is
   * still marked `A1`, and a reviewer reading the row can still fabricate from it.
   */
  test('B2 — a provisional bar keeps the mark a bender asks for', async ({ pro: page }) => {
    await seed(page, [assembly()]);
    await openPanel(page);
    await openBars(page);

    await expect(page.getByTestId('bar-mark-A-own')).toHaveText('A1');
    await expect(page.getByTestId('barstate-A-own')).toContainText('Provisional');
  });

  /*
   * Two proposals reach these rows and they are resolved in different places. A reviewer who
   * cannot tell them apart goes looking in the wrong one, so the reason is TEXT on the row —
   * not a tooltip, which no keyboard reaches and not every screen reader announces.
   */
  test('B3 — the two kinds of provisional say which they are', async ({ pro: page }) => {
    await seed(page, [assembly()]);
    await openPanel(page);
    await openBars(page);

    await expect(page.getByTestId('barnote-A-own')).toContainText('secondary axis');
    const inherited = page.getByTestId('barnote-A-through');
    await expect(inherited).toContainText('whose design is a proposal');
    // And it routes: the member that is actually the proposal, not every member it touches.
    await expect(inherited).toContainText('60');
  });

  test('B4 — a certified bar carries no proposal note at all', async ({ pro: page }) => {
    await seed(page, [assembly()]);
    await openPanel(page);
    await openBars(page);

    await expect(page.getByTestId('barnote-A-marked')).toHaveCount(0);
    await expect(page.getByTestId('barnote-A-unmarked')).toHaveCount(0);
  });

  /* The state is legible with the colour removed — the rule R7 already holds severity to. */
  test('B5 — each state is a glyph and a word, not a colour', async ({ pro: page }) => {
    await seed(page, [assembly()]);
    await openPanel(page);
    await openBars(page);

    await expect(page.getByTestId('barstate-A-marked')).toContainText('●');
    await expect(page.getByTestId('barstate-A-unmarked')).toContainText('○');
    await expect(page.getByTestId('barstate-A-own')).toContainText('◆');
    await expect(page.getByTestId('barstate-A-unmarked')).toContainText('Not marked');
  });

  /*
   * The census partitions the list: the three counts sum to the rows. Asserted on screen because
   * the summary is what a reviewer reads before deciding whether to open the list at all.
   */
  test('B6 — the summary counts the four bars once each', async ({ pro: page }) => {
    await seed(page, [assembly()]);
    await openPanel(page);

    const census = page.getByTestId('barcensus');
    await expect(census).toContainText('2 provisional');
    await expect(census).toContainText('1 not marked');
    await expect(census).toContainText('1 marked');
  });

  test('B7 — the technical id is still on the row, one level down', async ({ pro: page }) => {
    await seed(page, [assembly()]);
    await openPanel(page);
    await openBars(page);

    await expect(page.getByTestId('bar-id-A-own')).toHaveText('A-own');
  });
});

test.describe('@smoke a conflict names bars, and keeps the keys underneath', () => {
  const clash = (barA: string, barB: string): Json => ({
    severity: 'clearance', barA, barB,
    at: { x: 0, y: 0, z: 3 },
    clearance: 0.011, required: 0.025, shortfall: 0.014,
    elementIds: [50, 60],
  });

  /*
   * The defect: the row read `{barA} / {barB}` — two engine keys as the primary text of the line
   * a reviewer reads first. It is what `rc-bar-label.ts` was written for, one component over.
   */
  test('C1 — the row leads with the marks, not the keys', async ({ pro: page }) => {
    await seed(page, [assembly({ conflicts: [clash('A-marked', 'A-unmarked')] })]);
    await openPanel(page);

    // `A-marked` is in mark A1; `A-unmarked` is not marked, so it leads with its diameter.
    await expect(page.getByTestId('conflict-lead-0')).toHaveText('A1 / Ø16');
  });

  test('C2 — and the keys survive, at a secondary level', async ({ pro: page }) => {
    await seed(page, [assembly({ conflicts: [clash('A-marked', 'A-unmarked')] })]);
    await openPanel(page);

    await expect(page.getByTestId('conflict-ids-0')).toHaveText('A-marked / A-unmarked');
  });

  /*
   * A mark is a fabrication type, not an identity, so a clash between two bars of one mark is
   * real and reads `A1 / A1`. Without the keys it looks like a bar colliding with itself.
   */
  test('C3 — two bars of the same mark are still two bars', async ({ pro: page }) => {
    await seed(page, [assembly({ conflicts: [clash('A-marked', 'A-own')] })]);
    await openPanel(page);

    await expect(page.getByTestId('conflict-lead-0')).toHaveText('A1 / A1');
    await expect(page.getByTestId('conflict-ids-0')).toHaveText('A-marked / A-own');
  });

  /*
   * A conflict may reference a bar this assembly does not hold. There is nothing else true to
   * say about it, so it keeps its key rather than rendering blank or inventing a name.
   */
  test('C4 — an unresolvable side keeps its key rather than going blank', async ({ pro: page }) => {
    await seed(page, [assembly({ conflicts: [clash('A-marked', 'ghost-9')] })]);
    await openPanel(page);

    await expect(page.getByTestId('conflict-lead-0')).toHaveText('A1 / ghost-9');
  });

  /* The pager's one-line detail is what a reviewer copies into a bug report. Both forms stay. */
  test('C5 — the detail line carries the names and the keys', async ({ pro: page }) => {
    await seed(page, [assembly({ conflicts: [clash('A-marked', 'A-unmarked')] })]);
    await openPanel(page);

    const detail = page.getByTestId('conflict-detail');
    await expect(detail).toContainText('A1 / Ø16');
    await expect(page.getByTestId('conflict-detail-ids')).toHaveText('A-marked / A-unmarked');
  });
});
