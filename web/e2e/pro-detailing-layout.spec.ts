/**
 * The coordinated-detailing section as a review screen: who gets the width, and can you read it.
 *
 * ── What was wrong ─────────────────────────────────────────────────
 *
 * The list of levels was a permanent 9–16rem column in a panel about 34rem wide. So the sheet —
 * the thing a reviewer is actually there to read — lived in the remaining eighteen, at 1:50, and
 * came out cropped. Navigation was taking a third of the screen at all times to answer a question
 * ("which level?") that is asked once.
 *
 * And the enlarged view had no zoom. The scroll was the pan and the sheet rendered at its natural
 * size: either you could read it or you could not. A trackpad pinch works and is invisible,
 * undiscoverable, and unavailable from a keyboard.
 *
 * ── What these tests hold to ───────────────────────────────────────
 *
 * That hiding the list actually gives the width to the preview — measured in pixels, before and
 * after — that the navigation is never REMOVED, and that the zoom is a real control with a
 * keyboard path. Plus the properties the enlarge dialog already had and must keep: one `<svg>`
 * from the official projection, Escape, and focus returning to the control that opened it.
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

function assembly(id: string, label: string, over: Json = {}): Json {
  return {
    id, kind: 'beamLine', label,
    elementIds: [1, 50],
    bars: [bar(`${id}-b-0`, 0.1), bar(`${id}-b-1`, 0.3)],
    marks: [{
      mark: 'A1', diameterMm: 10, cuttingLength: 5.3, quantity: 2, shape: 'straight',
      massKg: 6.5, barIds: [`${id}-b-0`, `${id}-b-1`],
    }],
    joints: [], conflicts: [], unsupported: [],
    detailingRevision: 1, demandRevision: 5,
    state: 'CONSTRUCTIBLE', maturity: 'IMPLEMENTED_PROVISIONAL',
    provenance: { edition: '2025', verifierId: 'cirsoc201.provided.v2.2025', trace: [], assumptions: [] },
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
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
}

/** Where the sheet preview sits inside the detailing section, and how wide it is. */
async function previewGeometry(page: Page): Promise<{ width: number; offsetTop: number }> {
  return page.evaluate(() => {
    const wf = document.querySelector('[data-testid="detailing-workflow"]')!;
    const p = document.querySelector('[data-testid="sheet-preview"]')!;
    const a = wf.getBoundingClientRect();
    const b = p.getBoundingClientRect();
    return { width: b.width, offsetTop: b.top - a.top };
  });
}

const LEVELS = [
  assembly('ASM-1', 'Nivel +3,00 — pórtico A'),
  assembly('ASM-2', 'Nivel +6,00 — pórtico A'),
];

test.describe('@smoke the level list stops taking the panel', () => {
  test('H1 — hiding the list gives the drawing the room, and never removes the navigation', async (
    { pro: page },
  ) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await seed(page, LEVELS);
    await openPanel(page);

    // Both levels reachable to begin with.
    await expect(page.getByTestId('assembly-ASM-1')).toBeVisible();
    await expect(page.getByTestId('assembly-ASM-2')).toBeVisible();
    const before = await previewGeometry(page);

    await page.getByTestId('detailing-list-toggle').click();
    await expect(page.getByTestId('assembly-ASM-1')).not.toBeVisible();
    const after = await previewGeometry(page);

    /**
     * Measured as offset, not only as width — and that is the point of the test.
     *
     * At 1280x720 the right panel is about 540px, just under the 34rem the container query uses,
     * so the section is ALREADY one column: the list stacks above the drawing rather than beside
     * it. There the list steals height and reading distance, not width. A test that asserted only
     * "the preview got wider" would have reported this defect as fixed at wider viewports and
     * absent at the one the complaint is about.
     *
     * So: the drawing must come closer to the top of the section, and must never get narrower.
     */
    expect(after.offsetTop, 'the drawing moves up by the height the list was holding')
      .toBeLessThan(before.offsetTop);
    expect(after.width, 'and it never gets narrower').toBeGreaterThanOrEqual(before.width);

    // Navigation is hidden, not gone: one click brings it back.
    await page.getByTestId('detailing-list-toggle').click();
    await expect(page.getByTestId('assembly-ASM-2')).toBeVisible();
  });

  test('H2 — while the list is hidden it still says which level you are on', async (
    { pro: page },
  ) => {
    await seed(page, LEVELS);
    await openPanel(page);
    await page.getByTestId('assembly-ASM-2').click();
    await page.getByTestId('detailing-list-toggle').click();

    await expect(page.getByTestId('detailing-current-level')).toContainText('+6,00');
  });

  test('H3 — the toggle is a real disclosure for assistive technology', async ({ pro: page }) => {
    await seed(page, LEVELS);
    await openPanel(page);
    const toggle = page.getByTestId('detailing-list-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAttribute('aria-controls', 'detailing-assembly-list');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('H4 — the result is stated before anything is opened', async ({ pro: page }) => {
    await seed(page, LEVELS);
    await openPanel(page);
    await expect(page.getByTestId('detailing-result')).toContainText('2');
  });
});

test.describe('@smoke the enlarged sheet can be zoomed and panned', () => {
  test('H5 — zoom is an explicit control, and it changes the drawing', async ({ pro: page }) => {
    await seed(page, LEVELS);
    await openPanel(page);
    await page.getByTestId('sheet-expand').click();

    await expect(page.getByTestId('sheet-zoom-level')).toContainText('100%');
    const before = await page.getByTestId('sheet-modal-body')
      .locator('svg').evaluate((el) => el.getBoundingClientRect().width);

    await page.getByTestId('sheet-zoom-in').click();
    await expect(page.getByTestId('sheet-zoom-level')).toContainText('150%');
    const after = await page.getByTestId('sheet-modal-body')
      .locator('svg').evaluate((el) => el.getBoundingClientRect().width);

    expect(after, 'the drawing is actually bigger, not just the label')
      .toBeGreaterThan(before);

    await page.getByTestId('sheet-zoom-reset').click();
    await expect(page.getByTestId('sheet-zoom-level')).toContainText('100%');
  });

  test('H6 — zoom is reachable from the keyboard', async ({ pro: page }) => {
    await seed(page, LEVELS);
    await openPanel(page);
    await page.getByTestId('sheet-expand').click();

    await page.keyboard.press('+');
    await expect(page.getByTestId('sheet-zoom-level')).toContainText('150%');
    await page.keyboard.press('-');
    await expect(page.getByTestId('sheet-zoom-level')).toContainText('100%');
    await page.keyboard.press('0');
    await expect(page.getByTestId('sheet-zoom-level')).toContainText('100%');
  });

  test('H7 — the scroll is the pan, and the zoom does not crop the drawing', async (
    { pro: page },
  ) => {
    await seed(page, LEVELS);
    await openPanel(page);
    await page.getByTestId('sheet-expand').click();
    await page.getByTestId('sheet-zoom-in').click();
    await page.getByTestId('sheet-zoom-in').click();

    const box = page.getByTestId('sheet-modal-body');
    const reach = await box.evaluate((el) => ({
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      canScroll: getComputedStyle(el).overflow === 'auto' || getComputedStyle(el).overflowX === 'auto',
    }));
    // Magnified past the window, the drawing is REACHABLE by scrolling rather than clipped.
    expect(reach.scrollW, 'the whole drawing is still there').toBeGreaterThan(reach.clientW);
    expect(reach.canScroll, 'and it can be panned to').toBe(true);
  });

  test('H8 — one svg, from the official projection, and Escape returns the focus', async (
    { pro: page },
  ) => {
    await seed(page, LEVELS);
    await openPanel(page);
    const expand = page.getByTestId('sheet-expand');
    await expand.click();

    const modal = page.getByTestId('sheet-modal');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    // No second renderer: exactly the one `sheetSvg` the DXF, the report and the schedule carry.
    expect(await page.getByTestId('sheet-modal-body').locator('svg').count()).toBe(1);

    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(expand).toBeFocused();
  });
});

test.describe('the detailing layout survives the three languages at 1280x720', () => {
  for (const locale of ['en', 'es', 'pt'] as const) {
    test(`H9 ${locale} — nothing overflows the panel`, async ({ pro: page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.getByTestId('lang-select').selectOption(locale);
      await seed(page, LEVELS);
      await openPanel(page);

      const over = await page.evaluate(() => {
        const wf = document.querySelector('[data-testid="detailing-workflow"]') as HTMLElement;
        const panel = document.querySelector('.rc-workflow') as HTMLElement;
        return {
          section: wf.scrollWidth - wf.clientWidth,
          panel: panel.scrollWidth - panel.clientWidth,
        };
      });
      expect(over.section).toBeLessThanOrEqual(1);
      expect(over.panel).toBeLessThanOrEqual(1);
    });
  }
});
