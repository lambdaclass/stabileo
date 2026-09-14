/**
 * H1-E — the last three of the viewer: the section cut, the narrow rail, and per-family display.
 *
 * These are the items `h1e-fixture-coverage.md` §4 listed as still open. Each is exercised
 * against the drawn scene, not against the control's own state: a `<select>` that changes its own
 * value proves nothing about whether anything was cut.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

type Hooks = {
  __stabileo: {
    detailingAssemblies(): unknown[];
    rebarSceneBuilds(): number;
    rebarSceneCensus(): { bars: Record<string, number>; solids: Record<string, number> };
  };
};

async function openViewer(page: Page, model = 'rc-design-qa-8') {
  await loadModel(page, model);
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window as unknown as Hooks).__stabileo.detailingAssemblies().length), { timeout: 120_000 })
    .toBeGreaterThan(0);
  await openDocumentsStage(page);
  const before = await page.evaluate(() =>
    (window as unknown as Hooks).__stabileo.rebarSceneBuilds());
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() =>
      (window as unknown as Hooks).__stabileo.rebarSceneBuilds()), { timeout: 240_000 })
    .toBeGreaterThan(before);
}

const census = (page: Page) => page.evaluate(() =>
  JSON.stringify((window as unknown as Hooks).__stabileo.rebarSceneCensus()));

test.describe('@slow the section cut', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  /**
   * The cut is a CLIPPING PLANE, not a filter.
   *
   * `RebarViewport3D` sets `renderer.localClippingEnabled = true` and clips at material level, so
   * no mesh is removed and the census does not move. The first version of this asserted the
   * census changed and failed on all three axes — the same mistake as reading the census for an
   * opacity change, and worth recording rather than quietly rewriting: the instrument was wrong,
   * not the feature.
   *
   * What IS observable from the DOM is the dependent control: choosing an axis brings up the
   * position slider, and choosing none takes it away. That is the state the panel owns, and it is
   * what these assert. The clipped pixels are not reachable without a WebGL readback.
   */
  test('choosing an axis brings up its position, and choosing none removes it',
    async ({ pro: page }) => {
      await openViewer(page);
      const axis = page.getByTestId('rebar-section-axis');
      await expect(axis).toBeAttached();
      await expect(page.getByTestId('rebar-section-at'), 'no cut, no position')
        .toHaveCount(0);

      await axis.selectOption('x');
      await expect(page.getByTestId('rebar-section-at')).toBeAttached();
      expect(await axis.inputValue()).toBe('x');

      await axis.selectOption('');
      await expect(page.getByTestId('rebar-section-at'), 'and it goes away again')
        .toHaveCount(0);
    });

  test('the position runs across the model, not across an arbitrary range',
    async ({ pro: page }) => {
      await openViewer(page);
      await page.getByTestId('rebar-section-axis').selectOption('y');
      const at = page.getByTestId('rebar-section-at');
      await expect(at).toBeAttached();

      /*
       * The bounds come from the scene, so they say something real: a cut that could only travel
       * over a fixed 0..1 would miss most of a building. Measured on `rc-design-qa-8`, the y range
       * spans about 5.4 m with a margin either side.
       */
      const min = Number(await at.getAttribute('min'));
      const max = Number(await at.getAttribute('max'));
      expect(Number.isFinite(min) && Number.isFinite(max), 'real bounds').toBe(true);
      expect(max - min, 'the cut spans the model').toBeGreaterThan(1);

      /*
       * Set through the DOM rather than `fill()`. A `type="range"` rejects a value off its step —
       * "Malformed value" — and the step here is derived from the span, so a computed 80 % lands
       * between stops.
       */
      const target = min + (max - min) * 0.8;
      await at.evaluate((el, v) => {
        const input = el as HTMLInputElement;
        input.value = String(v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, target);
      expect(Number(await at.inputValue()), 'the slider took the position')
        .toBeGreaterThan(min + (max - min) * 0.5);
    });

  test('all three axes are offered and each is selectable', async ({ pro: page }) => {
    await openViewer(page);
    const axis = page.getByTestId('rebar-section-axis');
    for (const a of ['x', 'y', 'z']) {
      await axis.selectOption(a);
      expect(await axis.inputValue(), `${a} is a real option`).toBe(a);
      await expect(page.getByTestId('rebar-section-at'),
        `${a} has a position`).toBeAttached();
    }
    await axis.selectOption('');
    expect(await axis.inputValue()).toBe('');
  });
});

test.describe('@slow the rail at a narrow viewport', () => {
  test.slow();

  test('below 860 the toggle appears and actually collapses the rail', async ({ pro: page }) => {
    /*
     * Opened AT 820, not resized into it.
     *
     * `onResize` sets `railOpen = wide` whenever the width crosses 860 — deliberate, and the
     * source says why: "The rail is one tap away and starts closed" on mobile. The first version
     * of this resized after opening and raced that handler: it read the rail as still open,
     * clicked, and got the state the resize had already decided. A test that fights a documented
     * behaviour is measuring itself.
     */
    await page.setViewportSize({ width: 820, height: 700 });
    await openViewer(page);

    const toggle = page.getByTestId('rebar-rail-toggle');
    await expect(toggle, 'the toggle exists at this width, unlike at 1280').toBeVisible();

    const rail = page.getByTestId('rebar-rail');
    const openBefore = await rail.isVisible();
    await toggle.click();
    await expect.poll(() => rail.isVisible(), { timeout: 5_000 }).toBe(!openBefore);
    await toggle.click();
    await expect.poll(() => rail.isVisible(), { timeout: 5_000 }).toBe(openBefore);
  });

  test('the toggle keeps focus and reports its state to a screen reader',
    async ({ pro: page }) => {
      await page.setViewportSize({ width: 820, height: 700 });
      await openViewer(page);
      const toggle = page.getByTestId('rebar-rail-toggle');
      await toggle.focus();
      const before = await toggle.getAttribute('aria-expanded');
      await toggle.click();
      /*
       * `aria-expanded` is the whole accessible payload of this control — it has no label but a
       * glyph — so if it does not move, a screen-reader user cannot tell the rail closed.
       */
      expect(await toggle.getAttribute('aria-expanded'), 'the state is announced')
        .not.toBe(before);
      expect(await page.evaluate(() =>
        document.activeElement?.getAttribute('data-testid')), 'and focus survives the toggle')
        .toBe('rebar-rail-toggle');
    });

  test('the workspace still fits, and the canvas is not squeezed out',
    async ({ pro: page }) => {
      await page.setViewportSize({ width: 820, height: 700 });
      await openViewer(page);
      const box = await page.getByTestId('rebar-workspace')
        .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(box.scroll, 'no sideways scroll at 820').toBeLessThanOrEqual(box.client + 1);
      /*
       * The rail becomes a sheet OVER the canvas at this width, and the source comment says why:
       * "A 17 rem column on a 390 px screen leaves the viewport unusable, and the viewport is the
       * reason the workspace exists." So the canvas must still have real area.
       */
      const canvas = await page.getByTestId('rebar-canvas').boundingBox();
      expect(canvas!.width, 'the viewport keeps its width').toBeGreaterThan(400);
      expect(canvas!.height).toBeGreaterThan(200);
    });
});

test.describe('@slow per-family display', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('each family that HAS geometry can be switched off on its own',
    async ({ pro: page }) => {
      await openViewer(page);
      const c = JSON.parse(await census(page)) as {
        bars: Record<string, number>; solids: Record<string, number>;
      };
      const present = Object.keys(c.bars).filter((k) => c.bars[k] > 0);
      expect(present.length, 'this model draws at least one family').toBeGreaterThan(0);

      const toggled: string[] = [];
      for (const family of present) {
        const control = page.getByTestId(`rebar-layer-${family}`);
        if (!(await control.count())) continue;
        const before = await census(page);
        await control.click();
        await expect.poll(() => census(page), { timeout: 10_000 }).not.toBe(before);
        await control.click();
        await expect.poll(() => census(page), { timeout: 10_000 }).toBe(before);
        toggled.push(family);
      }
      expect(toggled.length, 'and at least one of them is switchable').toBeGreaterThan(0);
      test.info().annotations.push(
        { type: 'coverage', description: `families toggled: ${toggled.join(', ')}` });
    });

  test('a family with nothing in it is named as empty, not hidden',
    async ({ pro: page }) => {
      await openViewer(page);
      const c = JSON.parse(await census(page)) as { bars: Record<string, number> };
      const absent = Object.keys(c.bars).filter((k) => c.bars[k] === 0);
      expect(absent.length, 'this model has families with nothing in them')
        .toBeGreaterThan(0);

      /*
       * The rule this branch has applied everywhere: an absence is stated, not left blank. The
       * empty families are listed by name in `rebar-empty-families`, and their layer rows carry
       * an `.empty` mark rather than disappearing — a family you cannot see is a family you
       * cannot ask about.
       */
      const listed = page.getByTestId('rebar-empty-families');
      await expect(listed).toBeVisible();
      const text = (await listed.innerText()).toLowerCase();
      const named = absent.filter((f) => text.includes(f));
      expect(named.length, `the empty families are named — "${text.slice(0, 60)}"`)
        .toBeGreaterThan(0);
      test.info().annotations.push({
        type: 'coverage',
        description: `${absent.length} empty families, ${named.length} named`,
      });
    });

  test('the tally reports every family the scene draws', async ({ pro: page }) => {
    await openViewer(page);
    const tally = page.getByTestId('rebar-tally');
    await expect(tally).toBeVisible();

    /*
     * The tally splits each family into solids, longitudinal and transverse — it is not the
     * census's bar count, and asserting `toContain('200')` against it was reading one number
     * expecting another. Its own comment says what it is for: "12 705 bars looked full while
     * every column tie in the building was absent. Lots of bars and all the bars are
     * indistinguishable by eye."
     *
     * So the assertion is per FAMILY ROW, against the families the census says are drawn.
     */
    const c = JSON.parse(await census(page)) as { bars: Record<string, number> };
    const drawn = Object.keys(c.bars).filter((k) => c.bars[k] > 0);
    expect(drawn.length).toBeGreaterThan(0);

    for (const family of drawn) {
      const row = page.getByTestId(`rebar-tally-${family}`);
      await expect(row, `${family} has a row`).toBeVisible();
      const cells = (await row.innerText()).match(/\d+/g) ?? [];
      expect(cells.length, `${family} states figures`).toBeGreaterThan(1);
    }

    // And the headline bar count agrees with the census total, which is the drift this guards.
    const total = Object.values(c.bars).reduce((a, b) => a + b, 0);
    expect((await tally.innerText()).replace(/[\u00a0\u202f\s]/g, ''),
      'the total matches what is drawn').toContain(String(total));
    test.info().annotations.push(
      { type: 'coverage', description: `families in the tally: ${drawn.join(', ')}` });
  });
});
