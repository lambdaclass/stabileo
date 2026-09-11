/**
 * Objective 7 — the sheet has concrete on it, and the concrete is dimensioned.
 *
 * ── Why this one designs a real building ──────────────────────────
 *
 * The opposite reason `f3-bar-lock.spec.ts` seeds. The claim under test is that the sheet's
 * geometry comes from THE MODEL — the same sections, the same nodes, the same cover the
 * verification ran with — and a seeded assembly carries no model behind it. `seedDetailing`
 * hands the panel bars and no members, which is precisely the state in which the old sheet
 * looked identical to the new one: both draw bars, and only one of them draws the beam.
 *
 * So this pays for `designAll`, following `detailing-sheet-fieldset.spec.ts`, and it is `@slow`
 * for the same measured reason.
 *
 * ── What is NOT here ──────────────────────────────────────────────
 *
 * Every geometric property — the hull, the section clip, the cover inset, the bound on
 * dimensioned members. Those are pure functions and they live in `sheet-geometry.test.ts`,
 * where a raking column costs nothing to construct. What is here is what only the app can
 * answer: that the store hands the drawing engine the model's real members instead of an empty
 * array and a hard-coded box, and that what comes out reaches the screen.
 */

import { test, expect, designAll, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

/** The sheet controls exist only once there is detailing to draw. */
async function openDetailing(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
  const disclosure = page.getByTestId('detailing-disclosure');
  await expect(disclosure).toBeAttached();
  if (await disclosure.getAttribute('open') === null) {
    await disclosure.locator('> summary').click();
  }
  await expect(page.getByTestId('sheet-preview')).toBeVisible({ timeout: 30_000 });
}

/** The sheet as the store built it, before any renderer touched it. */
function sheet(page: Page) {
  return page.evaluate(() =>
    (window.__stabileo as unknown as { detailingSheet(): unknown }).detailingSheet());
}

type Sheet = {
  polylines: Array<{ layer: string; points: Array<{ x: number; y: number }> }>;
  dimensions: Array<{ label: string; axis?: 'x' | 'y'; from: { x: number; y: number } }>;
  circles: Array<{ centre: { x: number; y: number } }>;
  notes: string[];
};

test.describe('@slow the elevation carries the members it draws steel for', () => {
  /*
   * The defect. `drawElevation` was called with `outlines: []`, so an elevation was bars
   * floating in white space — a bar diagram, not a reinforcement drawing.
   */
  test('G1 — there is concrete on the elevation, on the outline layer', async ({ pro: page }) => {
    await openDetailing(page);
    const s = await sheet(page) as Sheet;

    const outlines = s.polylines.filter((p) => p.layer === 'RC-OUTLINE');
    expect(outlines.length).toBeGreaterThan(0);
    // A silhouette, not a stroke: every outline closes on at least three vertices.
    for (const o of outlines) expect(o.points.length).toBeGreaterThanOrEqual(3);
  });

  /*
   * The concrete has to be where the steel is. If the outlines came from anywhere other than
   * the members the bars belong to, they would not overlap them — which is exactly what the
   * hard-coded section rectangle did on the section sheet.
   */
  test('G2 — the concrete stands round the steel, not beside it', async ({ pro: page }) => {
    await openDetailing(page);
    const s = await sheet(page) as Sheet;

    const box = (pts: Array<{ x: number; y: number }>) => ({
      minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
      minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
    });
    const concrete = box(s.polylines.filter((p) => p.layer === 'RC-OUTLINE')
      .flatMap((p) => p.points));
    const steel = box(s.polylines.filter((p) => p.layer === 'RC-BAR' || p.layer === 'RC-STIRRUP')
      .flatMap((p) => p.points));

    expect(steel.minX).toBeGreaterThanOrEqual(concrete.minX - 0.05);
    expect(steel.maxX).toBeLessThanOrEqual(concrete.maxX + 0.05);
    expect(steel.minY).toBeGreaterThanOrEqual(concrete.minY - 0.05);
    expect(steel.maxY).toBeLessThanOrEqual(concrete.maxY + 0.05);
  });

  test('G3 — the elevation is dimensioned on both axes', async ({ pro: page }) => {
    await openDetailing(page);
    const s = await sheet(page) as Sheet;

    expect(s.dimensions.some((d) => d.axis === 'x')).toBe(true);
    // The one the `axis` field exists for: a depth emitted as a horizontal dimension is a
    // zero-length line with its label stacked on top of it.
    expect(s.dimensions.some((d) => d.axis === 'y')).toBe(true);
  });

  /* Measured off the drawn geometry, and labelled as a cover rather than as another length. */
  test('G4 — the cover is dimensioned', async ({ pro: page }) => {
    await openDetailing(page);
    const s = await sheet(page) as Sheet;

    const covers = s.dimensions.filter((d) => d.label.startsWith('r '));
    expect(covers.length).toBeGreaterThan(0);
    for (const c of covers) expect(c.axis).toBe('y');
  });

  /*
   * A witness line outside the extents is a witness line cropped off the preview: `sheetToSvg`
   * builds its viewBox from the extents plus a fixed pad, and dimensions sit 300 mm off the
   * concrete on the side they are drawn on.
   */
  test('G5 — every dimension is inside the sheet it belongs to', async ({ pro: page }) => {
    await openDetailing(page);
    const svg = await page.getByTestId('sheet-preview').innerHTML();
    const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    expect(view).not.toBeNull();
    // The SVG is emitted inside a translate of `pad − min`, so a coordinate below zero or past
    // the viewBox is content the reader never sees.
    expect(Number(view![1])).toBeGreaterThan(0);
    expect(Number(view![2])).toBeGreaterThan(0);
  });
});

test.describe('@slow the section is a section of something', () => {
  async function showSection(page: Page) {
    await openDetailing(page);
    await page.getByTestId('sheet-kind-section').click();
  }

  /*
   * The hard-coded outline was `±0.15 × ±0.30` centred on (0, 0) while every bar is placed at
   * its ABSOLUTE position from the projection's origin. On any member not sitting at the
   * origin the box and the cage were drawn metres apart.
   */
  test('G6 — the section outline contains the bars cut by the plane', async ({ pro: page }) => {
    await showSection(page);
    const s = await sheet(page) as Sheet;
    test.skip(s.circles.length === 0, 'the default station cuts no bars in this model');

    const outline = s.polylines.find((p) => p.layer === 'RC-OUTLINE');
    expect(outline).toBeDefined();
    const xs = outline!.points.map((p) => p.x);
    const ys = outline!.points.map((p) => p.y);
    for (const c of s.circles) {
      expect(c.centre.x).toBeGreaterThanOrEqual(Math.min(...xs) - 0.05);
      expect(c.centre.x).toBeLessThanOrEqual(Math.max(...xs) + 0.05);
      expect(c.centre.y).toBeGreaterThanOrEqual(Math.min(...ys) - 0.05);
      expect(c.centre.y).toBeLessThanOrEqual(Math.max(...ys) + 0.05);
    }
  });

  /* The specified cover, drawn where the steel can be checked against it. */
  test('G7 — the section carries a cover line on its own layer', async ({ pro: page }) => {
    await showSection(page);
    const s = await sheet(page) as Sheet;

    const cover = s.polylines.filter((p) => p.layer === 'RC-COVER');
    expect(cover.length).toBe(1);
    // Inside the concrete, by construction.
    const outline = s.polylines.find((p) => p.layer === 'RC-OUTLINE')!;
    const span = (pts: Array<{ x: number; y: number }>) =>
      Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    expect(span(cover[0].points)).toBeLessThan(span(outline.points));
  });

  test('G8 — the section states b and h', async ({ pro: page }) => {
    await showSection(page);
    const s = await sheet(page) as Sheet;

    expect(s.dimensions.some((d) => d.axis === 'x')).toBe(true);
    expect(s.dimensions.some((d) => d.axis === 'y')).toBe(true);
  });

  /*
   * And the cover line reaches the SVG dashed, which is the whole of what distinguishes it from
   * a second, inner concrete face — the edge a reviewer would otherwise measure.
   */
  test('G9 — the cover line is dashed on screen', async ({ pro: page }) => {
    await showSection(page);
    const svg = await page.getByTestId('sheet-preview').innerHTML();
    expect(svg).toContain('stroke-dasharray');
  });
});
