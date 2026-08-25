/**
 * The grouped element list — §8 objectives 1 and 2, on screen.
 *
 * `rc-member-list.test.ts` proves the census as arithmetic. What only a browser can add is that
 * the right state reaches the right element: that a family nobody has classified yet SAYS "not
 * counted yet" rather than "no members in this model", that an absent family offers nothing to
 * click, and that no column is filed under beams.
 *
 * The expected strings come from the dictionaries, imported here. Restating them would produce a
 * test that passes when the app and the test are wrong in the same way.
 */

import { test, expect, loadModel, solveModel, computeDemands } from './fixtures';
import en from '../src/lib/i18n/locales/en';
import es from '../src/lib/i18n/locales/es';
import pt from '../src/lib/i18n/locales/pt';
import type { Page } from '@playwright/test';

const DICTS: Record<string, Record<string, string>> = {
  en: en as unknown as Record<string, string>,
  es: es as unknown as Record<string, string>,
  pt: pt as unknown as Record<string, string>,
};

/** Frames only: `design-families.spec.ts` records that it holds no shells and no footings. */
const FRAMES = 'rc-design-qa-8';
/** The seven-storey building, which has more than a frame. */
const BUILDING = 'pro-edificio-7p';

/**
 * Load, solve, and classify.
 *
 * `computeDemands` needs a SOLVED model — it reads station forces — and the first version of this
 * spec called it straight after `loadModel`. Eleven tests timed out on `demandRevision()` staying
 * at 0, which is the demand pass never having run rather than anything about the list.
 */
async function classify(page: Page, model: string): Promise<void> {
  await loadModel(page, model);
  await solveModel(page);
  await computeDemands(page);
}

/** The list lives in the DETALLE stage, which has to be open to read it. */
async function openDetailing(page: Page): Promise<void> {
  const section = page.getByTestId('detailing-disclosure');
  if (await section.getAttribute('open') === null) {
    await section.locator('> summary').click();
  }
  await expect(page.getByTestId('rc-member-list')).toBeVisible();
}

/** Every string the list renders, flattened. */
async function listText(page: Page): Promise<string> {
  return (await page.getByTestId('rc-member-list').innerText()).replace(/\s+/g, ' ');
}

test.describe('@smoke the element list groups what the building has', () => {
  test('a frames-only model renders the linear group and not the others',
    async ({ pro: page }) => {
      await loadModel(page, FRAMES);
      await openDetailing(page);

      // Linear is always rendered: every reinforced-concrete frame has beams and columns.
      await expect(page.getByTestId('rc-group-linear')).toBeVisible();
      await expect(page.getByTestId('rc-group-label-linear'))
        .toHaveText(en['design.elementGroup.linear']);

      /*
       * Surface and foundation are ABSENT here, so they are not rendered at all — which is what
       * "no mostrarla como elemento seleccionable" means: no heading, no rows, nothing to click.
       */
      await expect(page.getByTestId('rc-group-surface')).toHaveCount(0);
      await expect(page.getByTestId('rc-group-foundation')).toHaveCount(0);
      await expect(page.getByTestId('rc-family-slab')).toHaveCount(0);
      await expect(page.getByTestId('rc-family-pedestal')).toHaveCount(0);
    });

  test('before the demands, the frame families say "not counted yet" and never "no members"',
    async ({ pro: page }) => {
      await loadModel(page, FRAMES);
      await openDetailing(page);

      for (const family of ['beam', 'column'] as const) {
        const section = page.getByTestId(`rc-family-${family}`);
        await expect(section, `${family} is shown, not hidden`).toBeVisible();
        await expect(section).toHaveAttribute('data-state', 'unknown');

        const census = page.getByTestId(`rc-family-census-${family}`);
        await expect(census).toHaveText(en['design.families.census.unknown']);
        /*
         * The assertion that matters. "not counted yet" and "no members in this model" are
         * different claims, and rendering the second here would tell someone their building has
         * no columns because they have not pressed Compute demands.
         */
        await expect(census).not.toHaveText(en['design.families.state.noElements']);
      }

      // Nothing is enumerable yet, and the list says which of the two reasons that is.
      await expect(page.getByTestId('rc-member-list-empty'))
        .toHaveText(en['design.memberList.nothingClassified']);
    });

  test('after the demands, the families are present with totals and detailed counts',
    async ({ pro: page }) => {
      await classify(page, FRAMES);
      await openDetailing(page);

      for (const family of ['beam', 'column'] as const) {
        await expect(page.getByTestId(`rc-family-${family}`))
          .toHaveAttribute('data-state', 'present');
        // The census is the "n of total detailed" sentence, so it carries both numbers.
        const census = await page.getByTestId(`rc-family-census-${family}`).innerText();
        expect(census, `${family} states both numbers`).toMatch(/\d+.*\d+/);
        await expect(page.getByTestId(`rc-family-rows-${family}`)).toBeVisible();
      }

      // Nothing is detailed yet, so every row says so rather than looking finished.
      const undetailed = page.locator('[data-testid^="rc-member-"][data-detailed="false"]');
      expect(await undetailed.count(), 'members are listed before being detailed')
        .toBeGreaterThan(0);
    });

  test('no column is filed under beams', async ({ pro: page }) => {
    await classify(page, FRAMES);
    await openDetailing(page);

    /*
     * The defect this guards is specific: `run-detailing.ts` builds one assembly per level,
     * always `kind: 'beamLine'`, holding that level's beams AND columns. A list that took the
     * family from the assembly would put every column under Beams and look entirely plausible.
     *
     * So: every row inside a family section declares that family, and the two families' id sets
     * do not overlap.
     */
    /*
     * `[data-family]` is load-bearing in this selector, not decoration. The prefix
     * `rc-member-` is shared by the row BUTTON and by its two children — `rc-member-label-…`
     * and `rc-member-id-…` — so matching on the prefix alone picks up three elements per row,
     * two of which carry no family and made this assertion fail on the test's own looseness.
     */
    const idsOf = (family: string) => page.locator(
      `[data-testid="rc-family-rows-${family}"] [data-testid^="rc-member-"][data-family]`,
    ).evaluateAll((els) => els.map((e) => ({
      id: e.getAttribute('data-testid'),
      family: e.getAttribute('data-family'),
    })));

    const beams = await idsOf('beam');
    const columns = await idsOf('column');
    expect(beams.length, 'beams are listed').toBeGreaterThan(0);
    expect(columns.length, 'columns are listed').toBeGreaterThan(0);
    expect(beams.every((r) => r.family === 'beam'), 'every row under Beams IS a beam').toBe(true);
    expect(columns.every((r) => r.family === 'column'), 'and likewise for columns').toBe(true);

    const overlap = beams.map((b) => b.id).filter((id) => columns.some((c) => c.id === id));
    expect(overlap, 'no member is listed under both families').toEqual([]);
  });

  test('a member reads as a human label with the technical id kept as secondary',
    async ({ pro: page }) => {
      await classify(page, FRAMES);
      await openDetailing(page);

      const first = page.locator(
        '[data-testid="rc-family-rows-beam"] [data-testid^="rc-member-"]').first();
      const id = (await first.getAttribute('data-testid'))!.replace('rc-member-', '');

      // The name is the family in the singular plus its position — "Beam 1", not "12".
      await expect(page.getByTestId(`rc-member-label-${id}`))
        .toHaveText(`${en['design.familySingular.beam']} 1`);
      // And the element id is still there, as secondary information rather than as the name.
      await expect(page.getByTestId(`rc-member-id-${id}`)).toContainText(id);
    });
});

test.describe('@smoke the list is one component with one selection channel', () => {
  test('nothing is mounted twice and no row is duplicated', async ({ pro: page }) => {
    await classify(page, FRAMES);
    await openDetailing(page);

    // Mounted once. A second copy is how two lists come to disagree about what is selected.
    await expect(page.getByTestId('rc-member-list')).toHaveCount(1);
    for (const g of ['linear'] as const) {
      await expect(page.getByTestId(`rc-group-${g}`)).toHaveCount(1);
    }
    for (const f of ['beam', 'column'] as const) {
      await expect(page.getByTestId(`rc-family-${f}`)).toHaveCount(1);
      await expect(page.getByTestId(`rc-family-rows-${f}`)).toHaveCount(1);
    }

    // Every member appears exactly once across the whole list.
    const ids = await page.locator('[data-testid^="rc-member-"][data-family]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
    expect(ids.length).toBe(new Set(ids).size);
  });

  test('rows are reachable and readable by keyboard', async ({ pro: page }) => {
    await classify(page, FRAMES);
    await openDetailing(page);

    const rows = page.locator('[data-testid="rc-family-rows-beam"] [data-testid^="rc-member-"]');
    const first = rows.first();

    // A real control: focusable, and its state is announced rather than only painted.
    await first.focus();
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('role', 'option');
    await expect(first).toHaveAttribute('aria-selected', /true|false/);

    // The family's rows are a listbox, named by the family, so the group is readable as a unit.
    const box = page.getByTestId('rc-family-rows-beam');
    await expect(box).toHaveAttribute('role', 'listbox');
    await expect(box).toHaveAttribute('aria-label', en['design.families.beam']);
  });
});

test.describe('a building with more than a frame', () => {
  test('renders the groups its families belong to', async ({ pro: page }) => {
    await classify(page, BUILDING);
    await openDetailing(page);

    /*
     * Asserted against the STORE rather than against an assumption about the fixture: the census
     * rule is "render unless entirely absent", and what this model holds is the model's business.
     * A test that hard-coded "this building has slabs" would be asserting the fixture.
     */
    const holds = await page.evaluate(() => {
      const w = window as unknown as { __stabileo: { elementIds(): number[] } };
      return { elements: w.__stabileo.elementIds().length };
    });
    expect(holds.elements, 'the building loaded').toBeGreaterThan(0);

    // Linear always. And the walls of a seven-storey building are classified by the demand pass,
    // so the surface group is rendered whenever any of them turned out to be a wall.
    await expect(page.getByTestId('rc-group-linear')).toBeVisible();
    const surfaceRendered = await page.getByTestId('rc-group-surface').count();
    if (surfaceRendered > 0) {
      await expect(page.getByTestId('rc-group-label-surface'))
        .toHaveText(en['design.elementGroup.surface']);
    }
    // Whatever is rendered, every rendered family declares a state and none of them is `absent`.
    const states = await page.locator('[data-testid^="rc-family-"][data-state]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
    expect(states.length).toBeGreaterThan(0);
    expect(states, 'an absent family is never rendered').not.toContain('absent');
  });
});

test.describe('the list at the four widths', () => {
  for (const vp of [
    { width: 1280, height: 720 },
    { width: 1024, height: 700 },
    { width: 900, height: 700 },
    { width: 820, height: 700 },
  ]) {
    test(`fits at ${vp.width}x${vp.height} without scrolling sideways`, async ({ pro: page }) => {
      await page.setViewportSize(vp);
      await classify(page, FRAMES);
      await openDetailing(page);

      const over = await page.getByTestId('rc-member-list').evaluate(
        (el) => el.scrollWidth - el.clientWidth);
      expect(over, `no horizontal overflow at ${vp.width}`).toBeLessThanOrEqual(1);

      // The panel itself must not start scrolling sideways because of the list either.
      const panelOver = await page.locator('.rc-workflow').evaluate(
        (el) => el.scrollWidth - el.clientWidth);
      expect(panelOver, 'the panel does not scroll sideways').toBeLessThanOrEqual(1);

      // And the group heading is still legible rather than clipped to nothing.
      const box = await page.getByTestId('rc-group-label-linear').boundingBox();
      expect(box!.width, 'the group heading has width').toBeGreaterThan(20);
    });
  }
});

test.describe('the list in three languages', () => {
  for (const locale of ['en', 'es', 'pt'] as const) {
    test(`${locale} — every label is translated and no raw key reaches the screen`, async (
      { pro: page },
    ) => {
      const D = DICTS[locale];
      await page.getByTestId('lang-select').selectOption(locale);
      await classify(page, FRAMES);
      await openDetailing(page);

      await expect(page.getByTestId('rc-group-label-linear'))
        .toHaveText(D['design.elementGroup.linear']);
      await expect(page.getByTestId('rc-family-label-beam'))
        .toHaveText(D['design.families.beam']);
      await expect(page.getByTestId('rc-family-label-column'))
        .toHaveText(D['design.families.column']);

      /*
       * A missing key renders as the key itself, which is the one i18n defect a test can catch
       * without knowing the language. `design.` is the prefix every key in this list uses.
       */
      const text = await listText(page);
      expect(text, 'no raw i18n key on screen').not.toMatch(/design\.[a-zA-Z]+\./);
    });
  }
});
