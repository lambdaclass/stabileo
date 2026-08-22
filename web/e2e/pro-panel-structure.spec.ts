/**
 * The right panel's structure: what is read first, and what stays put while you read it.
 *
 * ── Two defects, both about position rather than content ───────────
 *
 * **The summary was last.** The regulation in force and the count of every member lived inside the
 * command bar, below three collapsible stages. On the 720 px window this branch claims to support,
 * a reviewer opened the Design tab and had to scroll past regulations, floors and detailing to
 * learn which code the project is checked against and that five members do not verify. Every fact
 * was present and the first question was answered last.
 *
 * **The titles did not stay.** Each open stage had `max-height: 70vh; overflow: auto` — a scroller
 * inside a column that already scrolls. Crossing one section took two wheel gestures, and the
 * section title could not stick to the panel because it was trapped in the nested box. Scrolling
 * inside "Slabs, walls and foundations" left "1 · Project regulations" pinned above it, naming a
 * section the reader had already left.
 *
 * Both are claims about LAYOUT, so both are measured as layout — document order, computed styles
 * and `elementFromPoint` — and not by looking at a screenshot.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Position of a testid in the panel's reading order. */
async function order(page: Page, testid: string): Promise<number> {
  return page.evaluate((id) => {
    const root = document.querySelector('.rc-workflow') ?? document.body;
    const el = root.querySelector(`[data-testid="${id}"]`);
    return el ? [...root.querySelectorAll('*')].indexOf(el) : -1;
  }, testid);
}

test.describe('@smoke the panel says where the project stands, first', () => {
  test('S1 — the status section precedes every stage, and the command bar follows them', async (
    { pro: page },
  ) => {
    const overview = await order(page, 'design-overview-disclosure');
    const regs = await order(page, 'code-settings-disclosure');
    const detailing = await order(page, 'detailing-disclosure');
    const toolbar = await order(page, 'design-toolbar');

    expect(overview, 'the status section is on screen').toBeGreaterThan(-1);
    expect(overview, 'and it is read before the regulations stage').toBeLessThan(regs);
    expect(regs).toBeLessThan(detailing);
    expect(detailing, 'the commands come after the stages, as they did').toBeLessThan(toolbar);
  });

  test('S2 — the regulation and the counts are IN it, and nowhere else', async ({ pro: page }) => {
    const overview = page.getByTestId('design-overview');
    await expect(overview.getByTestId('active-concrete-code')).toBeVisible();
    await expect(overview.getByTestId('design-counts')).toBeVisible();

    // Moved, not copied. A second read-out is a second thing to keep in sync.
    await expect(page.getByTestId('active-concrete-code')).toHaveCount(1);
    await expect(page.getByTestId('design-counts')).toHaveCount(1);
    await expect(page.getByTestId('design-toolbar').getByTestId('design-counts')).toHaveCount(0);
  });

  test('S3 — an empty project says so instead of showing seven zeroes', async ({ pro: page }) => {
    await expect(page.getByTestId('design-overview-empty')).toBeVisible();
    await expect(page.getByTestId('summary-count-total')).toBeVisible();
  });

  test('S4 — the status section collapses and reopens', async ({ pro: page }) => {
    const section = page.getByTestId('design-overview-disclosure');
    await expect(section).toHaveAttribute('open', '');
    await section.locator('> summary').click();
    await expect(section).not.toHaveAttribute('open', '');
    // A closed `<details>` keeps its children in the DOM and stops painting them, so the claim
    // is about visibility. It also means nothing was destroyed: reopening costs no rebuild.
    await expect(page.getByTestId('design-overview')).not.toBeVisible();
    await section.locator('> summary').click();
    await expect(page.getByTestId('design-overview')).toBeVisible();
  });
});

test.describe('@smoke section titles stay while their section is read', () => {
  test('S5 — every stage title is sticky, and no open stage is its own scroller', async (
    { pro: page },
  ) => {
    const facts = await page.evaluate(() => {
      const out: { id: string; position: string; overflowY: string }[] = [];
      // Stages only — direct children of the column. The rule is about SECTIONS; a sub-disclosure
      // inside one (the unavailable-editions list, the bar list) is content, and making every
      // nested title sticky is how titles start stacking on top of each other.
      for (const d of document.querySelectorAll('.rc-workflow > details[data-testid]')) {
        const summary = d.querySelector(':scope > summary');
        if (!summary) continue;
        out.push({
          id: d.getAttribute('data-testid')!,
          position: getComputedStyle(summary).position,
          overflowY: getComputedStyle(d).overflowY,
        });
      }
      return out;
    });

    expect(facts.length, 'the panel has stages').toBeGreaterThan(2);
    for (const f of facts) {
      expect(f.position, `${f.id} keeps its title while you read it`).toBe('sticky');
      // A nested scroller is what pinned the title to the middle of the panel and made one
      // section cost two wheel gestures.
      expect(['visible', 'clip'], `${f.id} does not scroll inside the panel that scrolls`)
        .toContain(f.overflowY);
    }
  });

  test('S6 — scrolling inside one stage does not leave an earlier title above it', async (
    { pro: page },
  ) => {
    // The reported case exactly: regulations open above, floors open and being read.
    await page.getByTestId('code-settings-disclosure').locator('> summary').click();
    const floors = page.getByTestId('floor-families-disclosure');
    await floors.locator('> summary').click();
    await expect(floors).toHaveAttribute('open', '');

    await floors.locator('> summary').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => {
      document.querySelector('.rc-workflow')!.scrollBy(0, 120);
    });

    // Whatever is pinned at the top of the panel belongs to the section being read.
    const pinned = await page.evaluate(() => {
      const panel = document.querySelector('.rc-workflow')!;
      const box = panel.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 6);
      return hit?.closest('details[data-testid]')?.getAttribute('data-testid') ?? null;
    });

    expect(pinned, 'the regulations title does not outlive its own section')
      .not.toBe('code-settings-disclosure');
  });
});

test.describe('@smoke View 3-D model is reachable from the top', () => {
  test('S7 — it is offered up front, disabled, and says what is missing in TEXT', async (
    { pro: page },
  ) => {
    const btn = page.getByTestId('overview-open-3d');
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();

    // Not only a tooltip: a title attribute is invisible to a keyboard and gone on touch.
    const need = page.getByTestId('overview-open-3d-need');
    await expect(need).toBeVisible();
    expect((await need.innerText()).trim().length, 'the requirement is stated').toBeGreaterThan(0);
  });

  test('S8 — the top access and the contextual command are the same operation', async (
    { pro: page },
  ) => {
    // Both exist — point 7 asks for the contextual one to survive — and both are `openRebar3D`.
    await expect(page.getByTestId('overview-open-3d')).toHaveCount(1);
    await expect(page.getByTestId('cmd-open-3d')).toHaveCount(1);
    // Neither runs a design: both are disabled on a project that has none.
    await expect(page.getByTestId('overview-open-3d')).toBeDisabled();
    await expect(page.getByTestId('cmd-open-3d')).toBeDisabled();
  });
});

test.describe('the status section speaks the three languages', () => {
  for (const [locale, title] of [
    ['en', 'Project status'],
    ['es', 'Estado del proyecto'],
    ['pt', 'Estado do projeto'],
  ] as const) {
    test(`S9 ${locale} — the section is named in the interface's language`, async (
      { pro: page },
    ) => {
      await page.getByTestId('lang-select').selectOption(locale);
      await expect(page.getByTestId('design-overview-disclosure')).toContainText(title);
    });
  }
});
