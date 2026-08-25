/**
 * Objective 6 — pinning a bar, and saying what the pin froze.
 *
 * ── Why this seeds instead of designing a building ─────────────────
 *
 * The same reason `f3-bar-states.spec.ts` gives. The fact under test is REACH — that a pin on a
 * bar continuous over a support freezes the column as well as the beam — and a real run
 * produces whichever bars the model happens to yield. A suite that asserted reach only when a
 * continuous bar happened to exist would report green for the wrong reason. Seeding puts a
 * one-member bar and a two-member bar on screen at once.
 *
 * `detailing.spec.ts` D21 already covers the engine side on a real run: a pinned bar survives
 * regeneration. Nothing here re-asserts that.
 *
 * ── What is NOT here ──────────────────────────────────────────────
 *
 * The reach arithmetic, the census union and the two-key state/action split. Those are
 * properties of a pure function and they live in `rc-bar-lock.test.ts`, where they cost
 * nothing and cannot be satisfied by a component that happens to render something else. What
 * is here is what only a browser can answer: that the press lands on the bar it was pressed
 * for, that the consequence reaches the reader, that focus survives the toggle, and that the
 * pin is one fact rather than two.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

type Json = Record<string, unknown>;

/** The shape the panel renders. `locked` is `BarPath.locked` — the engine's own field. */
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
 * One assembly with the three cases a pin can be in.
 *
 *   `L-inside`   owned by member 50 alone     → a pin freezes one member
 *   `L-through`  owned by members 50 and 60   → a pin freezes both, and says so
 *   `L-prop`     a proposal, owned by 50      → a pin on steel that may not be issued
 */
function assembly(over: Json = {}): Json {
  return {
    id: 'ASM-1', kind: 'beamLine', label: 'Nivel +3,00 — pórtico A',
    elementIds: [50, 60],
    bars: [
      bar('L-inside', 0.1),
      bar('L-through', 0.3, { ownerElementIds: [50, 60] }),
      bar('L-prop', 0.5, { provisional: 'biaxial' }),
    ],
    marks: [{
      mark: 'A1', diameterMm: 16, cuttingLength: 5.3, quantity: 3, shape: 'straight',
      massKg: 14.7, barIds: ['L-inside', 'L-through', 'L-prop'],
    }],
    joints: [], conflicts: [], unsupported: [],
    detailingRevision: 1, demandRevision: 5,
    state: 'CONSTRUCTIBLE', maturity: 'VALIDATED',
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

async function openPanel(page: Page) {
  const d = page.getByTestId('detailing-disclosure');
  await expect(d).toBeVisible();
  await d.locator('> summary').click();
}

async function openBars(page: Page) {
  await page.getByTestId('bar-list').locator('> summary').click();
  await expect(page.getByTestId('bar-L-inside')).toBeVisible();
}

async function ready(page: Page) {
  await seed(page, [assembly()]);
  await openPanel(page);
  await openBars(page);
}

test.describe('@smoke a pin lands on the bar it was pressed for', () => {
  /*
   * The defect the per-bar testid closes. Every row's control was the literal `bar-lock`, so a
   * suite could only reach `.first()` and no test could tell a pin on the right bar from a pin
   * on any bar.
   */
  test('L1 — pressing one row’s control pins that row and no other', async ({ pro: page }) => {
    await ready(page);

    await expect(page.getByTestId('bar-L-through')).toHaveAttribute('data-bar-lock', 'free');
    await page.getByTestId('barlock-L-through').click();

    await expect(page.getByTestId('bar-L-through')).toHaveAttribute('data-bar-lock', 'pinned');
    await expect(page.getByTestId('bar-L-inside')).toHaveAttribute('data-bar-lock', 'free');
    await expect(page.getByTestId('bar-L-prop')).toHaveAttribute('data-bar-lock', 'free');
  });

  test('L2 — and pressing it again releases it', async ({ pro: page }) => {
    await ready(page);
    const control = page.getByTestId('barlock-L-inside');

    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('bar-L-inside')).toHaveAttribute('data-bar-lock', 'free');
  });
});

test.describe('@smoke the pin says what it froze', () => {
  /*
   * The whole reason the module exists. `lockedMemberIds()` walks every pinned bar's owners, so
   * a pin on a bar continuous over a support stops the repair loop touching a column the user
   * never opened — and nothing said so. It is TEXT on the row: a tooltip is not reachable by
   * keyboard and is not read by every screen reader.
   */
  test('L3 — a pin on a continuous bar names both members it freezes', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('barlock-L-through').click();

    const note = page.getByTestId('barlocknote-L-through');
    await expect(note).toContainText('2 members');
    await expect(note).toContainText('50, 60');
    await expect(note).toContainText('continuously');
  });

  test('L4 — a pin inside one member says one member, not a plural', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('barlock-L-inside').click();

    const note = page.getByTestId('barlocknote-L-inside');
    await expect(note).toContainText('member 50');
    await expect(note).not.toContainText('continuously');
  });

  test('L5 — a free bar claims no consequence at all', async ({ pro: page }) => {
    await ready(page);
    await expect(page.getByTestId('barlocknote-L-inside')).toHaveCount(0);
    await expect(page.getByTestId('barlocknote-L-through')).toHaveCount(0);
  });

  /*
   * A pin on a proposal is legitimate — you pin it while it is reviewed — and it is a
   * contradiction the row has to state, because the two facts pull opposite ways.
   */
  test('L6 — a pin on provisional steel says the pin does not issue it', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('barlock-L-prop').click();

    await expect(page.getByTestId('barlocknote-L-prop'))
      .toContainText('does not make it issuable');
    await expect(page.getByTestId('bar-pins-provisional'))
      .toContainText('1 on provisional steel');
  });
});

test.describe('@smoke the summary is what a keyboard reader is told', () => {
  /*
   * `aria-pressed` flipping announces the button; it says nothing about the consequence, and a
   * row already rendered is not re-read. The live region is the one place a press reports what
   * it did. It is mounted empty and filled, never created on demand: a live region that did not
   * exist before its content did is not reliably announced.
   */
  test('L7 — the pin summary is a live region present before anything is pinned', async ({ pro: page }) => {
    await ready(page);

    const pins = page.getByTestId('bar-pins');
    await expect(pins).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId('bar-pins-count')).toHaveCount(0);
  });

  /*
   * The union, on screen. Two pins that share member 50 freeze three members between them —
   * 50, 60 — not four. It is the same set `lockedMemberIds()` hands the repair loop.
   */
  test('L8 — two pins report the union of what they freeze, not the sum', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('barlock-L-inside').click();
    await page.getByTestId('barlock-L-through').click();

    await expect(page.getByTestId('bar-pins-count')).toContainText('2 locked');
    const frozen = page.getByTestId('bar-pins-frozen');
    await expect(frozen).toContainText('2 member');
    await expect(frozen).toContainText('50, 60');
  });
});

test.describe('@smoke the control is operable and does not lose the keyboard', () => {
  /*
   * The keyboard dead end `SelectionDetails` documents at length: an `{#if}/{:else}` pair
   * destroys the pressed button and creates the other one, focus falls to `<body>`, and the
   * next Tab restarts at the top of the document. This control is ONE node that swaps its
   * label, and the row is keyed on the bar id, so both survive. Asserted rather than assumed.
   */
  test('L9 — focus stays on the control across a toggle', async ({ pro: page }) => {
    await ready(page);
    const control = page.getByTestId('barlock-L-inside');

    await control.focus();
    await page.keyboard.press('Space');
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect(control).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(control).toHaveAttribute('aria-pressed', 'false');
    await expect(control).toBeFocused();
  });

  /*
   * Two hundred buttons announcing `Pin` name nothing. The accessible name carries the row's
   * own label — the MARK, which is what `rc-bar-label.ts` decided the row is called — and never
   * the engine key underneath it.
   */
  test('L10 — the control is named after the bar, by its mark', async ({ pro: page }) => {
    await ready(page);
    const control = page.getByTestId('barlock-L-inside');

    await expect(control).toHaveAttribute('aria-label', 'Lock bar A1');
    await control.click();
    await expect(control).toHaveAttribute('aria-label', 'Unlock bar A1');
  });

  /* The state is legible with the colour removed, the rule R7 holds severity to. */
  test('L11 — the state is a glyph and a word, not a tint', async ({ pro: page }) => {
    await ready(page);
    const control = page.getByTestId('barlock-L-inside');

    await expect(control).toContainText('◯');
    await expect(control).toContainText('Lock');
    await control.click();
    await expect(control).toContainText('⬤');
    await expect(control).toContainText('Unlock');
  });
});

test.describe('@smoke the pin is one fact, not two', () => {
  /*
   * Retroactivity, and the shape of it §3 states: no two independent representations of one
   * element. The pin is written to `BarPath.locked` on the model, and every reader — the row,
   * `lockedMemberIds()`, and `SceneBar.locked` in the 3-D view — reads that one field. Asserted
   * against the persisted model rather than against a second surface, because the model is
   * what a reopened project will contain.
   */
  test('L12 — the pin is on the model the moment it is pressed', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('barlock-L-through').click();

    // The OBSERVATION hook `detailing.spec.ts` uses, reading `modelStore.model.detailing` —
    // which is where the assemblies live and what a reopened project will contain.
    const pinned = await page.evaluate(() =>
      (window.__stabileo as unknown as {
        detailingAssemblies(): Array<{ bars: Array<{ id: string; locked?: boolean }> }>;
      }).detailingAssemblies()
        .flatMap((a) => a.bars).filter((b) => b.locked).map((b) => b.id));
    expect(pinned).toEqual(['L-through']);
  });

  /*
   * And the panel holds no copy of it. The row's state comes from the bar it renders, so
   * rewriting the model under the panel moves the row — which a local `$state` mirror could
   * not do.
   */
  test('L13 — re-seeding a pinned bar shows the pin without anything being pressed', async ({ pro: page }) => {
    await seed(page, [assembly({
      bars: [bar('L-inside', 0.1, { locked: true }), bar('L-through', 0.3, { ownerElementIds: [50, 60] })],
    })]);
    await openPanel(page);
    await openBars(page);

    await expect(page.getByTestId('bar-L-inside')).toHaveAttribute('data-bar-lock', 'pinned');
    await expect(page.getByTestId('barlock-L-inside')).toHaveAttribute('aria-pressed', 'true');
  });
});
