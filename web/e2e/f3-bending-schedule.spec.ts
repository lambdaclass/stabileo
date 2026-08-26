/**
 * Objective 9 — the schedule's Shape column is a diagram, not a grouping key.
 *
 * ── Why it seeds ──────────────────────────────────────────────────
 *
 * Because the three cases have to be on screen at once: a straight bar, a bent one, and one
 * bent about two axes that must be REFUSED. A real run produces whichever the model happens to
 * yield, and a suite that asserted the refusal only when a cranked bar happened to exist would
 * report green for the wrong reason — the same argument `f3-bar-states.spec.ts` records.
 *
 * ── What is NOT here ──────────────────────────────────────────────
 *
 * The plane fitting, the hook trimming, the leg extraction and the tolerance. Those are a pure
 * function's and they live in `bar-shape-diagram.test.ts`. What is here is what only the app
 * can answer: that the diagram reaches the cell, that a refused shape keeps its code and says
 * why, and that a reader who cannot see the picture is told the same thing it says.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

type Json = Record<string, unknown>;

const seg = (a: number[], b: number[]) => ({
  kind: 'straight',
  start: { x: a[0], y: a[1], z: a[2] },
  end: { x: b[0], y: b[1], z: b[2] },
  length: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
});

function bar(id: string, segments: Json[], over: Json = {}): Json {
  return {
    id, diameterMm: 16, role: 'longitudinal',
    segments,
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 6, ownerElementIds: [50], source: 'generated', locked: false, refs: [],
    ...over,
  };
}

/**
 * Three marks, one per case.
 *
 *   `S`  a 6 m straight             → one leg, drawn
 *   `L`  3 m then 1 m up, in x–z    → two legs, drawn
 *   `C`  the same, then 0,5 m in y  → bent about two axes, refused
 */
function assembly(): Json {
  const bars = [
    bar('s1', [seg([0, 0, 3], [6, 0, 3])]),
    bar('l1', [seg([0, 0, 3], [3, 0, 3]), seg([3, 0, 3], [3, 0, 4])],
      { cuttingLength: 4.1 }),
    bar('c1', [
      seg([0, 0, 3], [3, 0, 3]), seg([3, 0, 3], [3, 0, 4]), seg([3, 0, 4], [3, 0.5, 4]),
    ], { cuttingLength: 4.6 }),
  ];
  return {
    id: 'ASM-1', kind: 'beamLine', label: 'Nivel +3,00 — pórtico A',
    elementIds: [50],
    bars,
    marks: [
      {
        mark: 'S', diameterMm: 16, cuttingLength: 6, quantity: 4, shape: 'straight',
        massKg: 37.9, barIds: ['s1'],
      },
      {
        mark: 'L', diameterMm: 16, cuttingLength: 4.1, quantity: 2, shape: 'bent1',
        massKg: 12.9, barIds: ['l1'],
      },
      {
        mark: 'C', diameterMm: 16, cuttingLength: 4.6, quantity: 2, shape: 'bent2',
        massKg: 14.5, barIds: ['c1'],
      },
    ],
    joints: [], conflicts: [], unsupported: [],
    detailingRevision: 1, demandRevision: 5,
    state: 'CONSTRUCTIBLE', maturity: 'VALIDATED',
    provenance: {
      edition: '2025', verifierId: 'cirsoc201.provided.v2.2025', trace: [], assumptions: [],
    },
  };
}

async function ready(page: Page) {
  await page.evaluate((a) => {
    (window.__stabileoActions as unknown as { seedDetailing(x: unknown): void }).seedDetailing(a);
  }, [assembly()]);
  const d = page.getByTestId('detailing-disclosure');
  await expect(d).toBeVisible();
  await d.locator('> summary').click();
  await expect(page.getByTestId('schedule')).toBeVisible();
}

test.describe('@smoke a shape is drawn, with its dimensions', () => {
  test('S1 — a straight bar gets a diagram with its length on it', async ({ pro: page }) => {
    await ready(page);

    await expect(page.getByTestId('shape-S')).toHaveAttribute('data-shape', 'drawn');
    const svg = page.getByTestId('shape-svg-S');
    await expect(svg).toBeVisible();
    await expect(svg).toContainText('6000');
  });

  test('S2 — a bent bar’s legs are both dimensioned', async ({ pro: page }) => {
    await ready(page);

    const svg = page.getByTestId('shape-svg-L');
    await expect(svg).toContainText('3000');
    await expect(svg).toContainText('1000');
  });

  /*
   * A bender cuts to the cutting length and bends to the legs. Padding the legs so the two add
   * up would produce a bar that is right on the schedule and long in the shop, so the steel in
   * the bends is stated separately.
   */
  test('S3 — the steel in the bends is stated, not folded into the legs', async ({ pro: page }) => {
    await ready(page);
    await expect(page.getByTestId('shape-bends-L')).toContainText('100');
    // A straight bar has none, so it says nothing.
    await expect(page.getByTestId('shape-bends-S')).toHaveCount(0);
  });

  /*
   * A `<path>` is not readable, and a screen reader announces an unlabelled image as "image".
   * The shape column is the one column of this table that is not a number.
   */
  test('S4 — the diagram carries the same statement in words', async ({ pro: page }) => {
    await ready(page);
    const label = await page.getByTestId('shape-svg-L').getAttribute('aria-label');
    expect(label).toContain('3000 + 1000');
    expect(label).toContain('bent1');
  });
});

test.describe('@smoke a shape with no honest picture keeps its code and says why', () => {
  /*
   * A bar bent about two axes has no plane containing it. Flattening it would put a shape on
   * the schedule that no bender can make and that a checker cannot tell from a real one.
   */
  test('S5 — a bar bent about two axes is refused, and named', async ({ pro: page }) => {
    await ready(page);

    await expect(page.getByTestId('shape-C')).toHaveAttribute('data-shape', 'nonPlanar');
    await expect(page.getByTestId('shape-svg-C')).toHaveCount(0);
    const cell = page.getByTestId('shape-C');
    // The code stays: it is what the mark was grouped on.
    await expect(cell).toContainText('bent2');
    await expect(page.getByTestId('shape-none-C')).toContainText('bent about two axes');
  });

  test('S6 — and the other rows are unaffected by it', async ({ pro: page }) => {
    await ready(page);
    await expect(page.getByTestId('shape-S')).toHaveAttribute('data-shape', 'drawn');
    await expect(page.getByTestId('shape-L')).toHaveAttribute('data-shape', 'drawn');
  });
});

test.describe('@slow a real building’s ties are drawn, not refused', () => {
  /*
   * The case the first implementation got wrong, and it can only be caught on a real run. A
   * closed tie's 135° hooks turn INTO the core — out of the plane of the tie, by design — so a
   * planarity check over the whole path refuses every stirrup in the model: the shapes a bender
   * bends most were the ones with no picture. Planarity is measured over the BODY.
   */
  test('S7 — a closed tie has a diagram, and says its hooks were folded', async ({ pro: page }) => {
    const { designAll, loadModel } = await import('./fixtures');
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-design').click();
    const d = page.getByTestId('detailing-disclosure');
    if (await d.getAttribute('open') === null) await d.locator('> summary').click();
    await expect(page.getByTestId('schedule')).toBeVisible({ timeout: 30_000 });

    // Every drawn shape on a designed floor, and at least one of them a hooked tie.
    const cells = page.locator('[data-testid^="shape-"][data-shape]');
    const states = await cells.evaluateAll(
      (els) => els.map((e) => e.getAttribute('data-shape')));
    expect(states.length).toBeGreaterThan(0);
    expect(states.filter((s) => s === 'drawn').length).toBeGreaterThan(0);
    // The footnote appears once for the whole table, not once per stirrup.
    await expect(page.getByTestId('schedule-folded')).toHaveCount(1);
  });
});
