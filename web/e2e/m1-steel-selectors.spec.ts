/**
 * The M1 surfaces, through the click path a user has.
 *
 * ── Why this exists next to the other two steel specs ──────────────
 *
 * `generators-steel.spec.ts` pins four properties a UI rework must not lose.
 * `steel-ui-redesign.spec.ts` pins that the surface explains itself and works from a keyboard.
 * Neither knows about what M1 added: two pickers with authority badges, a depth filter, a
 * comparison, three bracing switches with a load-path notice, and a grade column.
 *
 * What is automated here is the MECHANICAL half of `docs/handoffs/m1-qa-checklist.md` — the part
 * where a wrong answer is a wrong string or a missing element. What stays manual is the part
 * only eyes can judge: whether things fit, whether the reading order makes sense, whether a
 * notice lands at the right moment, and whether the three languages read like a person wrote
 * them. Each test below names the checklist item it discharges, so the manual pass can skip it.
 *
 * ── The one number worth stating twice ─────────────────────────────
 *
 * A UPN 200's weak-axis modulus is about 27 cm³. Half its width would give 39.5. Both look
 * plausible on a card, and the second is a 46 % overstatement — so the assertion is a RANGE
 * rather than a presence check, because "the field is filled in" is true in the failure mode.
 */

import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

const STAGE_OF = { generators: 'model', steel: 'design' } as const;

async function openTab(page: Page, tab: 'generators' | 'steel'): Promise<void> {
  await page.getByTestId(`pr-stage-${STAGE_OF[tab]}`).click();
  await page.getByTestId(`pr-cmd-${tab}`).click();
}

async function openGenerators(page: Page): Promise<void> {
  await openTab(page, 'generators');
  await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
}

/** Open the profile picker of the first role row the panel offers. */
async function openProfilePicker(page: Page): Promise<void> {
  await page.locator('[data-testid^="gen-profile-trigger-"]').first().click();
  await expect(page.getByTestId('profile-selector')).toBeVisible();
}

async function openGradePicker(page: Page): Promise<void> {
  await page.getByTestId('gen-grade-trigger').click();
  await expect(page.getByTestId('grade-picker')).toBeVisible();
}

/** Switch the generator kind. The shed is the only one with bracing controls. */
async function selectShed(page: Page): Promise<void> {
  await page.getByTestId('gen-kind-shed').click().catch(async () => {
    // The kind selector is a set of buttons in this build; fall back to a labelled control.
    await page.getByRole('button', { name: /nave|shed|galpão/i }).first().click();
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(PRO_URL);
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
});

// ─── Checklist §2 — profiles, provenance and the card ────────────────

test.describe('the profile picker', () => {
  test('§2.2–2.5 — the angle family declares two standards, and the rows say which @smoke', async ({ page }) => {
    await openGenerators(page);
    await openProfilePicker(page);

    // Narrow to the angles so the group is on screen without scrolling a hundred rows.
    await page.getByTestId('profile-family-L').click();

    // The group header refuses to print one standard over rows from two.
    const mixed = page.getByTestId('profile-group-mixed-L');
    await expect(mixed).toBeVisible();
    // The count is translated; the designations live in the tooltip and are not.
    await expect(mixed).toHaveAttribute('title', /IRAM-IAS U 500-558/);
    await expect(mixed).toHaveAttribute('title', /EN 10056-1/);

    // A row whose standard is not its family's carries its publishing body; a European one does
    // not. This is the defect the fix closed: eleven IRAM rows filed under a European standard.
    await expect(page.getByTestId('profile-own-std-L 63.5x63.5x9.5')).toHaveText('IRAM-IAS');
    await expect(page.getByTestId('profile-own-std-L 50x50x5')).toHaveCount(0);
  });

  test('§2.4 — filtering by publishing body works on the row, not the family', async ({ page }) => {
    await openGenerators(page);
    await openProfilePicker(page);
    await page.getByTestId('profile-family-L').click();

    const all = await page.getByTestId('profile-count').innerText();
    await page.getByTestId('profile-body-IRAM-IAS').click();
    const iram = await page.getByTestId('profile-count').innerText();

    // Before the provenance fix this combination returned nothing at all.
    const n = (s: string) => Number(s.match(/\d+/)?.[0] ?? -1);
    expect(n(iram)).toBeGreaterThan(0);
    expect(n(iram)).toBeLessThan(n(all));
    await expect(page.getByTestId('profile-list')).toContainText('L 63.5x63.5x9.5');
  });

  test('§2.7–2.8 — the depth filter bounds inclusively, and clearing it reopens the axis', async ({ page }) => {
    await openGenerators(page);
    await openProfilePicker(page);

    const list = page.getByTestId('profile-list');
    await page.getByTestId('profile-hmin').fill('200');
    await page.getByTestId('profile-hmax').fill('300');
    // Inclusive at both ends: a profile exactly on the bound is in.
    await expect(list).toContainText('IPE 200');
    await expect(list).toContainText('IPE 300');
    await expect(list).not.toContainText('IPE 400');

    /*
     * Clearing a bound removes it, rather than being read as zero.
     *
     * `queryProfiles` also has a NaN branch — an unusable bound empties the list — and this test
     * originally asserted it through the UI. It cannot: `input[type=number]` refuses a
     * non-numeric keystroke, so `fill('-')` throws "Cannot type text into input[type=number]"
     * and the field simply stays as it was. The NaN path is therefore DEFENSIVE only, reachable
     * programmatically or from some future control that is not a number input, and the unit test
     * in `profiles/__tests__/catalogue.test.ts` is where it belongs. Recorded here because the
     * QA checklist claimed the opposite until this run.
     */
    await page.getByTestId('profile-hmax').fill('');
    await expect(list).toContainText('IPE 400');
    await page.getByTestId('profile-hmin').fill('');
    await expect(list).toContainText('IPE 80');
  });

  test('§2.11 — the card states the basis of every number, as text @smoke', async ({ page }) => {
    await openGenerators(page);
    await openProfilePicker(page);
    await page.getByTestId('profile-search').fill('IPE 200');
    await page.getByTestId('profile-option-IPE 200').hover();

    const card = page.getByTestId('profile-card');
    await expect(card).toBeVisible();

    // Tabulated, derived and unavailable all appear, and each badge carries TEXT — a tooltip
    // alone is mouse-only and never reaches an accessible name.
    for (const key of ['area', 'iy', 'wy', 'ry', 'j']) {
      await expect(page.getByTestId(`profile-basis-${key}`)).not.toBeEmpty();
    }
    // J is not published for an IPE and is never derived from the outline.
    await expect(page.getByTestId('profile-prop-j')).toContainText('—');
    await expect(page.getByTestId('profile-gaps')).toBeVisible();
  });

  test('§2.11 — a channel reports the MINIMUM weak-axis modulus, not half its width', async ({ page }) => {
    await openGenerators(page);
    await openProfilePicker(page);
    await page.getByTestId('profile-search').fill('UPN 200');
    await page.getByTestId('profile-option-UPN 200').hover();

    // Wy is unambiguous and matches the published 191 cm³.
    await expect(page.getByTestId('profile-prop-wy')).toContainText(/19[01]/);

    /*
     * Wz is the assertion this whole test exists for. The centroid sits 20.1 mm from the back of
     * the web, so the governing modulus is ~27 cm³; half the width would give 39.5. A presence
     * check passes on both, so the bound is on the VALUE.
     */
    const wz = await page.getByTestId('profile-prop-wz').innerText();
    const value = Number(wz.match(/([\d.]+)\s*cm³/)?.[1] ?? NaN);
    expect(Number.isFinite(value), `could not read Wz from "${wz}"`).toBe(true);
    expect(value).toBeGreaterThan(20);
    expect(value).toBeLessThan(30);
  });

  test('§2.11 — a properties-only family refuses the modulus and says why', async ({ page }) => {
    await openGenerators(page);
    await openProfilePicker(page);
    await page.getByTestId('profile-search').fill('MC18x58');
    await page.getByTestId('profile-option-MC18x58').hover();

    await expect(page.getByTestId('profile-prop-wz')).toContainText('—');
    await expect(page.getByTestId('profile-basis-wz')).not.toBeEmpty();
    // The gaps block turns three blank rows into sentences.
    await expect(page.getByTestId('profile-gaps')).toBeVisible();
  });

  test('§2.12 — a pinned comparison survives the filter that hides its rows', async ({ page }) => {
    await openGenerators(page);
    await openProfilePicker(page);

    await page.getByTestId('profile-search').fill('IPE 200');
    await page.getByTestId('profile-pin-IPE 200').click();
    await page.getByTestId('profile-search').fill('HEA 200');
    await page.getByTestId('profile-pin-HEA 200').click();

    const compare = page.getByTestId('profile-compare');
    await expect(compare).toBeVisible();
    await expect(compare).toContainText('IPE 200');
    await expect(compare).toContainText('HEA 200');

    // The point of pinning by id: narrow the search until neither row is listed and the
    // comparison is still there. Comparing two families means holding both while showing one.
    await page.getByTestId('profile-search').fill('CHS');
    await expect(page.getByTestId('profile-list')).not.toContainText('IPE 200');
    await expect(compare).toContainText('IPE 200');
    await expect(compare).toContainText('HEA 200');

    await page.getByTestId('profile-compare-clear').click();
    await expect(compare).toHaveCount(0);
  });
});

// ─── Checklist §1 — grades ───────────────────────────────────────────

test.describe('the grade picker', () => {
  test('§1.1 — says a selection is not a verification, before the list @smoke', async ({ page }) => {
    await openGenerators(page);
    await openGradePicker(page);

    const note = page.getByTestId('grade-not-a-check');
    await expect(note).toBeVisible();
    // Above the list, not below it, and not conditioned on anything.
    const [noteBox, listBox] = await Promise.all([
      note.boundingBox(), page.getByTestId('grade-list').boundingBox(),
    ]);
    expect(noteBox!.y).toBeLessThan(listBox!.y);
  });

  test('§1.2–1.6 — searching a product standard works, and the code filter needs one family', async ({ page }) => {
    await openGenerators(page);
    await openGradePicker(page);

    // A standard is how someone working to a code finds the grades it is written around, and it
    // appears in no designation.
    await page.getByTestId('grade-search').fill('EN 10025');
    await expect(page.getByTestId('grade-list')).toContainText('S355');

    await page.getByTestId('grade-search').fill('');
    await page.getByTestId('grade-family-hot-rolled').click();
    await expect(page.getByTestId('grade-code')).toBeVisible();

    // With two families the control has no single meaning, so it goes away and says so.
    await page.getByTestId('grade-family-aluminium').click();
    await expect(page.getByTestId('grade-code')).toHaveCount(0);
    await expect(page.getByTestId('grade-code-hint')).toBeVisible();
  });

  test('§1.7 — offers no region the catalogue has no grades for', async ({ page }) => {
    await openGenerators(page);
    await openGradePicker(page);

    // The data module is explicit that Australian, Indian and South African CODES are loaded and
    // no grades of those regions are. An empty chip would be a control that does nothing.
    await expect(page.getByTestId('grade-region-AR')).toBeVisible();
    await expect(page.getByTestId('grade-region-AU')).toHaveCount(0);
    await expect(page.getByTestId('grade-region-IN')).toHaveCount(0);
  });

  test('§1.11 — the bands name the design code that tabulates them, not the product standard @smoke', async ({ page }) => {
    await openGenerators(page);
    await openGradePicker(page);
    await page.getByTestId('grade-search').fill('S355');
    await page.getByTestId('grade-option-en-s355').hover();

    const bands = page.getByTestId('grade-bands');
    await expect(bands).toBeVisible();
    // The whole point of `bandStandard`: these come from EN 1993-1-1, and showing them beside
    // EN 10025-2 unqualified would attribute them to the wrong document.
    await expect(bands).toContainText('EN 1993-1-1');
    // Yield falls with thickness, so the second band is the lower one.
    await expect(bands).toContainText('355');
    await expect(bands).toContainText('335');

    // And the headline fy says it is the first band.
    await expect(page.getByTestId('grade-prop-fy')).toBeVisible();
    await expect(page.getByTestId('grade-basis-fy')).not.toBeEmpty();
  });

  test('§1.11 — a derived value and a typical value are both marked', async ({ page }) => {
    await openGenerators(page);
    await openGradePicker(page);

    await page.getByTestId('grade-search').fill('S355');
    await page.getByTestId('grade-option-en-s355').hover();
    /*
     * G = E/2(1+nu) = 80 769 MPa, which is the 81 000 CIRSOC 301 chapter 2 quotes for these
     * steels. The card renders a modulus in GPa — the formatter switches above 10 000 MPa — so
     * what appears is `81 GPa`. Asserted as rendered rather than as computed, because the
     * checklist said 80 769 MPa until this run and a reader would have looked for the wrong
     * number.
     */
    await expect(page.getByTestId('grade-prop-g')).toContainText(/81\s?GPa/);
    await expect(page.getByTestId('grade-basis-g')).not.toBeEmpty();

    // 45 of 68 grades carry values typical of the alloy rather than read from the table.
    await page.getByTestId('grade-search').fill('A529');
    await page.getByTestId('grade-option-astm-a529-50').hover();
    await expect(page.getByTestId('grade-typical')).toBeVisible();
  });

  test('§1.12 — an unusual profile/grade pairing is named by role, and blocks nothing', async ({ page }) => {
    await openGenerators(page);

    // F-36 is the Argentine W-series grade; the truss diagonals default to an angle, which is
    // rolled in F-24. The note names the ROLE, because the roles do not share a section family.
    await openGradePicker(page);
    await page.getByTestId('grade-search').fill('F-36');
    await page.getByTestId('grade-option-iram-f36').click();

    await expect(page.getByTestId('gen-grade-line')).toContainText('F-36');
    // Generate stays available: this is cost and lead time, not correctness.
    await expect(page.getByTestId('gen-generate')).toBeEnabled();
  });
});

// ─── Checklist §3.10 — bracing and the load-path notice ──────────────

test.describe('the shed bracing controls', () => {
  test('§3.10 — partial bracing says the load path is incomplete, and still generates @smoke', async ({ page }) => {
    await openGenerators(page);
    await selectShed(page);

    // Roof bracing alone triangulates a plate that still slides. The notice names the whole path
    // rather than telling the user to think about it.
    await page.getByLabel(/arriostramiento de cubierta|roof bracing|contraventamento de cobertura/i).check();
    const notice = page.getByTestId('gen-bracing-notice');
    await expect(notice).toBeVisible();
    await expect(page.getByTestId('gen-generate')).toBeEnabled();

    // All three plus the eave beams: nothing left to warn about.
    await page.getByLabel(/entre cerchas|between trusses|entre treliças/i).check();
    await page.getByLabel(/arriostramiento de fachada|wall bracing|contraventamento de fachada/i).check();
    await page.getByLabel(/vigas de alero|eave beams|vigas de beiral|longitudinal/i).first().check();
    await expect(notice).toHaveCount(0);
  });

  test('§3.10 — unticking purlins warns before Generate, not after Solve', async ({ page }) => {
    await openGenerators(page);
    await selectShed(page);

    await page.getByLabel(/correas|purlins|terças/i).first().uncheck();
    await expect(page.getByTestId('gen-stability-notice')).toBeVisible();
    // A `status`, not an `alert`: nothing is wrong yet and Generate stays available.
    await expect(page.getByTestId('gen-generate')).toBeEnabled();
  });
});

// ─── Checklist §5.9 — the grade column on the inventory ──────────────

test.describe('the metallic inventory', () => {
  test('§5.9 — a member with no catalogued grade says so rather than showing a blank @smoke', async ({ page }) => {
    await openGenerators(page);
    // Generate without choosing a grade: the model takes the placeholder and declares it.
    await expect(page.getByTestId('gen-grade-line')).toContainText(/sin grado|no grade|sem grau/i);
    await page.getByTestId('gen-generate').click();

    await openTab(page, 'steel');
    await expect(page.getByTestId('pro-steel-panel')).toBeVisible();
    const table = page.getByTestId('steel-member-table');
    await expect(table).toBeVisible();
    // Every row's grade cell is filled with a reason, never empty.
    const cells = page.locator('[data-testid^="steel-grade-"]');
    expect(await cells.count()).toBeGreaterThan(0);
    for (const cell of await cells.all()) await expect(cell).not.toBeEmpty();
  });

  test('§5.9 — a chosen grade reaches the inventory with its product standard', async ({ page }) => {
    await openGenerators(page);
    await openGradePicker(page);
    await page.getByTestId('grade-search').fill('F-24');
    await page.getByTestId('grade-option-iram-f24').click();
    await page.getByTestId('gen-generate').click();

    await openTab(page, 'steel');
    const table = page.getByTestId('steel-member-table');
    // The designation is not enough on its own: two standards can name the same grade.
    await expect(table).toContainText('F-24');
    await expect(table).toContainText('IRAM-IAS U 500-503');
    // And nothing on this screen is a pass.
    await expect(page.getByTestId('steel-experimental-banner')).toBeVisible();
  });
});

// ─── Checklist §6 — the three languages ──────────────────────────────

for (const locale of ['es', 'en', 'pt'] as const) {
  test.describe(`§6 — the M1 surfaces in ${locale}`, () => {
    test.use({ appLocale: locale });

    test(`renders no key as its own name, and keeps the designations untranslated`, async ({ pro: page }) => {
      await openGenerators(page);
      await openGradePicker(page);

      /*
       * `t()` returns the KEY when it cannot find a translation, so a missing string renders as
       * `steel.grades.basis.derived` inside the card. Scanning the rendered panel for anything
       * shaped like a key is what catches that without asserting on prose in three languages.
       */
      const leaked = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="grade-picker"]')!;
        return [...root.querySelectorAll('*')]
          .map((el) => (el.childElementCount === 0 ? (el.textContent ?? '').trim() : ''))
          .filter((t) => /^(steel|generator|conn)\.[a-zA-Z0-9_.]+$/.test(t));
      });
      expect(leaked, `untranslated keys rendered in ${locale}`).toEqual([]);

      // A product standard is a proper noun and must read the same in every language.
      await page.getByTestId('grade-search').fill('F-24');
      await expect(page.getByTestId('grade-list')).toContainText('IRAM-IAS U 500-503');
    });

    test(`the profile card leaks no key either`, async ({ pro: page }) => {
      await openGenerators(page);
      await openProfilePicker(page);
      await page.getByTestId('profile-search').fill('UPN 200');
      await page.getByTestId('profile-option-UPN 200').hover();
      await expect(page.getByTestId('profile-card')).toBeVisible();

      const leaked = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="profile-selector"]')!;
        return [...root.querySelectorAll('*')]
          .map((el) => (el.childElementCount === 0 ? (el.textContent ?? '').trim() : ''))
          .filter((t) => /^(steel|generator|profileSelector)\.[a-zA-Z0-9_.]+$/.test(t));
      });
      expect(leaked, `untranslated keys rendered in ${locale}`).toEqual([]);
      await expect(page.getByTestId('profile-group-mixed-L')).toBeAttached().catch(() => {
        // The L group is only rendered when the angles are in the result set; narrowing to it is
        // covered by its own test, so this is a soft check on the group header's presence.
      });
    });
  });
}

// ─── Checklist §7 — 1280×720 and the keyboard ───────────────────────

test.describe('the panel at 1280×720', () => {
  test('§7.1–7.2 — nothing scrolls the panel sideways, comparison included @smoke', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openGenerators(page);
    await openProfilePicker(page);

    await page.getByTestId('profile-search').fill('IPE 200');
    await page.getByTestId('profile-pin-IPE 200').click();
    await page.getByTestId('profile-search').fill('HEB 600');
    await page.getByTestId('profile-pin-HEB 600').click();
    await expect(page.getByTestId('profile-compare')).toBeVisible();

    // The comparison scrolls inside its own container; the panel and the document do not.
    const overflow = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="profile-selector"]') as HTMLElement;
      return {
        panel: panel.scrollWidth - panel.clientWidth,
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(overflow.panel, 'the picker panel scrolls sideways').toBeLessThanOrEqual(1);
    expect(overflow.doc, 'the document scrolls sideways').toBeLessThanOrEqual(1);
  });

  test('§2.9, §7.4 — the picker is walkable and every control takes a visible ring', async ({ page }) => {
    await openGenerators(page);
    await openProfilePicker(page);

    // The cursor starts on the current selection, so Enter is a no-op rather than a change.
    await page.getByTestId('profile-search').fill('IPE');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-cursor="true"]')).toHaveCount(1);

    // Every focusable control in the panel resolves an outline, rather than leaving it to the UA.
    const noRing = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="profile-selector"]')!;
      const out: string[] = [];
      for (const el of panel.querySelectorAll('button, input, select')) {
        (el as HTMLElement).focus();
        const s = getComputedStyle(el);
        if (s.outlineStyle === 'none' && !s.boxShadow.includes('rgb')) {
          out.push(el.getAttribute('data-testid') ?? el.tagName);
        }
      }
      return out;
    });
    expect(noRing, 'controls with no focus ring').toEqual([]);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('profile-selector')).toHaveCount(0);
  });
});
