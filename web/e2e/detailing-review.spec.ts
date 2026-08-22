/**
 * The detailing panel as a REVIEW screen.
 *
 * ── What this file is asserting, and why it is not covered elsewhere ──
 *
 * `detailing.spec.ts` asserts that each fact exists: the conflict pager works, the unsupported
 * list appears, the blockers say what they block. What nothing asserted was the property that
 * makes those facts usable — that they are RANKED and that they are REACHABLE.
 *
 * Ranked: a reviewer's first question is "can this be issued", and the answer is the blocking
 * errors. They used to sit below several hundred bar rows, with the warnings above them. A test
 * that only checks each notice is visible passes just as happily with the order inverted, which
 * is exactly how the order came to be inverted.
 *
 * Reachable: `BarConflict.elementIds` carried the comment "for routing the conflict to a member
 * in the UI" and nothing routed anything. A conflict named two bar ids and left the reviewer to
 * find the member by hand.
 *
 * ── Why it seeds instead of designing a building ───────────────────
 *
 * Conflicts are the thing under test and a real 7-storey run may produce none — a suite that
 * asserts conflict behaviour only when a conflict happens to exist is a suite that reports green
 * for the wrong reason. `seedDetailing` puts known conflicts, known members and known warnings on
 * screen, so every assertion below is about the panel rather than about the model.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

type Json = Record<string, unknown>;

/** The shape `buildFloorAssembly` writes, so the panel renders it rather than refusing it. */
function bar(id: string, y: number, diameterMm = 10): Json {
  return {
    id, diameterMm, role: 'longitudinal',
    segments: [{
      kind: 'straight',
      start: { x: -0.15, y, z: 3 }, end: { x: 5.15, y, z: 3 }, length: 5.3,
    }],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 5.3, ownerElementIds: [50], source: 'generated', locked: false, refs: [],
  };
}

/** A conflict between two known bars, in two known members. */
function conflict(barA: string, barB: string, elementIds: number[], shortfall = 0.014): Json {
  return {
    severity: 'clearance', barA, barB,
    at: { x: 0, y: 0, z: 3 },
    clearance: 0.025 - shortfall, required: 0.025, shortfall,
    elementIds,
  };
}

function assembly(over: Json = {}): Json {
  return {
    id: 'ASM-1', kind: 'beamLine', label: 'Nivel +3,00 — pórtico A',
    elementIds: [1, 50, 60],
    bars: [bar('A-b-0', 0.1), bar('A-b-1', 0.3), bar('A-b-2', 0.5, 20)],
    marks: [{
      mark: 'A1', diameterMm: 10, cuttingLength: 5.3, quantity: 3, shape: 'straight',
      massKg: 9.8, barIds: ['A-b-0', 'A-b-1', 'A-b-2'],
    }],
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

/**
 * Where a testid sits in the panel's reading order.
 *
 * Ranking is a claim about ORDER, so it is measured as order — the position of the node in the
 * document — and not by taking a screenshot and looking at it.
 */
async function domIndex(page: Page, testid: string): Promise<number> {
  return page.evaluate((id) => {
    const panel = document.querySelector('[data-testid="detailing-workflow"]');
    if (!panel) return -1;
    const target = panel.querySelector(`[data-testid="${id}"]`);
    if (!target) return -1;
    return [...panel.querySelectorAll('*')].indexOf(target);
  }, testid);
}

test.describe('@smoke the detailing panel ranks what is wrong', () => {
  test('R1 — blocking errors come before warnings, and both before the bar list', async (
    { pro: page },
  ) => {
    await seed(page, [assembly({
      conflicts: [conflict('A-b-0', 'A-b-1', [1, 50])],
      unsupported: [{ message: 'Aberturas de losa no cubiertas.' }],
    })]);
    await openPanel(page);

    const conflicts = await domIndex(page, 'conflict-list');
    const warnings = await domIndex(page, 'unsupported-list');
    const bars = await domIndex(page, 'bar-list');

    expect(conflicts, 'the conflicts are on screen').toBeGreaterThan(-1);
    expect(warnings, 'so are the warnings').toBeGreaterThan(-1);
    expect(bars, 'and so is the bar list').toBeGreaterThan(-1);

    expect(conflicts, 'what blocks the sheet is read before what merely annotates it')
      .toBeLessThan(warnings);
    expect(warnings, 'and neither is buried under several hundred bar rows')
      .toBeLessThan(bars);
  });

  test('R2 — the summary counts what is wrong before anything is expanded', async (
    { pro: page },
  ) => {
    await seed(page, [assembly({
      conflicts: [conflict('A-b-0', 'A-b-1', [1, 50]), conflict('A-b-1', 'A-b-2', [50, 60])],
      unsupported: [{ message: 'Aberturas de losa no cubiertas.' }],
      stateBlockers: ['Faltan revisiones de armadura transversal.'],
    })]);
    await openPanel(page);

    // Two conflicts plus one state blocker are three things that stop this being issued.
    await expect(page.getByTestId('problems-errors')).toContainText('3');
    await expect(page.getByTestId('problems-warnings')).toContainText('1');
  });

  test('R3 — an assembly with nothing wrong says so, once', async ({ pro: page }) => {
    await seed(page, [assembly()]);
    await openPanel(page);

    await expect(page.getByTestId('problems-summary')).toBeVisible();
    await expect(page.getByTestId('no-conflicts')).toBeVisible();
    // No error or warning chip invented for an assembly that has neither.
    await expect(page.getByTestId('problems-errors')).toHaveCount(0);
    await expect(page.getByTestId('problems-warnings')).toHaveCount(0);
    await expect(page.getByTestId('conflict-list')).toHaveCount(0);
  });

  test('R4 — a conflict routes to the members it is in', async ({ pro: page }) => {
    await seed(page, [assembly({ conflicts: [conflict('A-b-0', 'A-b-1', [1, 50])] })]);
    await openPanel(page);

    // Both members named by the conflict are offered, and only those.
    await expect(page.getByTestId('conflict-member-1')).toBeVisible();
    await expect(page.getByTestId('conflict-member-50')).toBeVisible();
    await expect(page.getByTestId('conflict-member-60')).toHaveCount(0);

    await page.getByTestId('conflict-member-50').click();
    // The selection the rest of the application listens to — not a highlight local to this list.
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.selection()))
      .toEqual([50]);
  });

  test('R5 — a conflict opens the sheet it is drawn on', async ({ pro: page }) => {
    await seed(page, [assembly({ conflicts: [conflict('A-b-0', 'A-b-1', [1, 50])] })]);
    await openPanel(page);

    await expect(page.getByTestId('sheet-modal')).toHaveCount(0);
    await page.getByTestId('conflict-sheet-0').click();

    const modal = page.getByTestId('sheet-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    // The same dialog the enlarge control opens — one drawing, one way to close it.
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
  });

  test('R6 — the fortieth conflict is one click away, not forty', async ({ pro: page }) => {
    const many = Array.from({ length: 6 }, (_, i) =>
      conflict(`A-b-${i}`, `A-b-${i + 1}`, [1 + i, 50]));
    await seed(page, [assembly({ conflicts: many })]);
    await openPanel(page);

    await expect(page.getByTestId('conflict-counter')).toContainText('1');
    await page.getByTestId('conflict-item-4').locator('button.row').click();

    // The pager follows the list, so the two are one selection rather than two cursors.
    await expect(page.getByTestId('conflict-counter')).toContainText('5');
    await expect(page.getByTestId('conflict-item-4')).toHaveAttribute('aria-current', 'true');
  });

  test('R7 — severity is legible with the colour removed', async ({ pro: page }) => {
    await seed(page, [assembly({
      conflicts: [conflict('A-b-0', 'A-b-1', [1, 50])],
      unsupported: [{ message: 'Aberturas de losa no cubiertas.' }],
    })]);
    await openPanel(page);

    // A glyph and a word on each chip, so a reader who cannot tell red from amber still can.
    await expect(page.getByTestId('problems-errors')).toContainText('✕');
    await expect(page.getByTestId('problems-warnings')).toContainText('⚠');
    // And the shortfall is stated as a number, not implied by how red the row is.
    await expect(page.getByTestId('conflict-item-0')).toContainText('14 mm');
  });
});

test.describe('@smoke the review screen speaks the three languages', () => {
  for (const [locale, none] of [
    ['en', 'Nothing blocking'],
    ['es', 'Nada que bloquee'],
    ['pt', 'Nada bloqueando'],
  ] as const) {
    test(`R8 ${locale} — the all-clear is in the interface's language`, async ({ pro: page }) => {
      // The picker, not a hook: this asserts what a user who changes the language actually sees.
      await page.getByTestId('lang-select').selectOption(locale);
      await seed(page, [assembly()]);
      await openPanel(page);
      await expect(page.getByTestId('problems-summary')).toContainText(none);
    });
  }
});
