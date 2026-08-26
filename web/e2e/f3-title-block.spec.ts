/**
 * Objective 8 — the rótulo: what the author writes, and what the project states back.
 *
 * ── Why it seeds ──────────────────────────────────────────────────
 *
 * The claim under test is about the TITLE BLOCK, not about geometry: that what is typed reaches
 * the sheet, that the regulations the run used cannot be typed over, and that an unnamed
 * project prints nothing rather than the word "Project". None of that needs a solver, and
 * `f3-bar-states.spec.ts` records what a designed building costs a suite.
 *
 * ── What is NOT here ──────────────────────────────────────────────
 *
 * The normalisation, the limits, the dedup and the verified-beats-declared rule. Those are a
 * pure function's and they live in `title-block-config.test.ts`. What is here is what only the
 * app can answer: that the field is persisted with the PROJECT, that the sheet is stamped from
 * it, and that the read-only half has no control that could edit it.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

type Json = Record<string, unknown>;

function bar(id: string, y: number): Json {
  return {
    id, diameterMm: 16, role: 'longitudinal',
    segments: [{
      kind: 'straight',
      start: { x: 0, y, z: 3 }, end: { x: 5, y, z: 3 }, length: 5,
    }],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 5, ownerElementIds: [50], source: 'generated', locked: false, refs: [],
  };
}

function assembly(): Json {
  return {
    id: 'ASM-1', kind: 'beamLine', label: 'Nivel +3,00 — pórtico A',
    elementIds: [50],
    bars: [bar('T-1', 0.1)],
    marks: [{
      mark: 'A1', diameterMm: 16, cuttingLength: 5, quantity: 1, shape: 'straight',
      massKg: 7.9, barIds: ['T-1'],
    }],
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
  await expect(page.getByTestId('rotulo')).toBeVisible();
}

/** The sheet as the drawing engine built it, title block included. */
function sheet(page: Page) {
  return page.evaluate(() =>
    (window.__stabileo as unknown as { detailingSheet(): unknown }).detailingSheet());
}

type Sheet = {
  title: {
    project?: string; subtitle?: string; office?: string;
    codes?: Array<{ text: string; source: string; qualifierKey: string | null }>;
  };
};

test.describe('@smoke the author’s half reaches the sheet', () => {
  test('T1 — an unnamed project says so, and stamps no name', async ({ pro: page }) => {
    await ready(page);

    await expect(page.getByTestId('rotulo-unnamed')).toBeVisible();
    // Not the word "Project". Nothing.
    expect((await sheet(page) as Sheet).title.project).toBeUndefined();
  });

  test('T2 — what is typed heads the sheet', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('rotulo-project').fill('Edificio Los Álamos — estructura');
    await page.getByTestId('rotulo-project').blur();

    await expect.poll(async () => (await sheet(page) as Sheet).title.project)
      .toBe('Edificio Los Álamos — estructura');
    await expect(page.getByTestId('rotulo-unnamed')).toHaveCount(0);
  });

  test('T3 — the stage and the office too', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('rotulo-subtitle').fill('Etapa 2 — torre norte');
    await page.getByTestId('rotulo-subtitle').blur();
    await page.getByTestId('rotulo-office').fill('Estudio Chesta');
    await page.getByTestId('rotulo-office').blur();

    await expect.poll(async () => (await sheet(page) as Sheet).title.subtitle)
      .toBe('Etapa 2 — torre norte');
    expect((await sheet(page) as Sheet).title.office).toBe('Estudio Chesta');
  });

  /*
   * The field is a PROJECT decision, not a browser one: the same project opened on another
   * machine is the same works. Asserted against the persisted model, which is what a reopened
   * project will contain.
   */
  test('T4 — the rótulo is persisted with the project', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('rotulo-project').fill('Obra 47');
    await page.getByTestId('rotulo-project').blur();

    await expect.poll(async () => page.evaluate(() =>
      (window.__stabileo as unknown as {
        detailingTitleBlock(): { project?: string } | null;
      }).detailingTitleBlock()?.project)).toBe('Obra 47');
  });

  /*
   * A newline in a DXF `TEXT` group breaks the entity and CAD refuses the file. The failure is
   * silent where it is typed and appears on somebody else's screen, so it is normalised on the
   * way IN — what is stored is what a reopened project carries.
   */
  test('T5 — a pasted multi-line name is stored as one line', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('rotulo-project').fill('Obra\n47');
    await page.getByTestId('rotulo-project').blur();

    await expect.poll(async () => (await sheet(page) as Sheet).title.project).toBe('Obra 47');
  });
});

test.describe('@smoke the project’s half is stated, not edited', () => {
  /*
   * The verification ran against the bound regulations. A control that could remove one would
   * let a sheet claim a provenance the run never had, on the one surface whose whole purpose is
   * stating that provenance.
   */
  test('T6 — a verified code has no control that could remove it', async ({ pro: page }) => {
    await ready(page);
    const verified = page.locator('[data-testid="rotulo-code-verified"]');
    expect(await verified.count()).toBeGreaterThan(0);
    await expect(verified.first().getByTestId('rotulo-code-remove')).toHaveCount(0);
  });

  test('T7 — and it reaches the sheet marked as verified', async ({ pro: page }) => {
    await ready(page);
    const codes = (await sheet(page) as Sheet).title.codes ?? [];
    expect(codes.length).toBeGreaterThan(0);
    expect(codes[0].source).toBe('verified');
    expect(codes[0].qualifierKey).toBeNull();
  });

  /* An author's own code IS removable, and is qualified where it stands. */
  test('T8 — a declared code is added, marked and removable', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('rotulo-code-input').fill('Ordenanza municipal 4711');
    await page.getByTestId('rotulo-code-add').click();

    const declared = page.locator('[data-testid="rotulo-code-declared"]');
    await expect(declared).toHaveCount(1);
    await expect(declared).toContainText('Ordenanza municipal 4711');
    await expect(declared).toContainText('not verified by this application');

    await declared.getByTestId('rotulo-code-remove').click();
    await expect(declared).toHaveCount(0);
  });

  test('T9 — and it reaches the sheet as declared, never as verified', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('rotulo-code-input').fill('Norma del cliente 9');
    await page.getByTestId('rotulo-code-add').click();

    await expect.poll(async () => {
      const codes = (await sheet(page) as Sheet).title.codes ?? [];
      return codes.find((c) => c.text === 'Norma del cliente 9')?.source;
    }).toBe('declared');
  });

  /*
   * Bounded at four. A form that accepts a fifth and stores nothing is the worst of the three
   * possible behaviours, so the control disables itself and says why.
   */
  test('T10 — the fifth declared code is refused in the control, not silently dropped', async ({ pro: page }) => {
    await ready(page);
    for (const n of [1, 2, 3, 4]) {
      await page.getByTestId('rotulo-code-input').fill(`Norma ${n}`);
      await page.getByTestId('rotulo-code-add').click();
    }
    await expect(page.getByTestId('rotulo-codes-full')).toBeVisible();
    await expect(page.getByTestId('rotulo-code-input')).toBeDisabled();
    await expect(page.getByTestId('rotulo-code-add')).toBeDisabled();
  });
});

test.describe('@smoke the rótulo reaches the drawing', () => {
  test('T11 — the works is printed on the sheet preview', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('rotulo-project').fill('Edificio Los Álamos');
    await page.getByTestId('rotulo-project').blur();

    await expect(page.getByTestId('sheet-preview')).toContainText('Edificio Los Álamos');
  });

  test('T12 — and so is the code, with its qualifier', async ({ pro: page }) => {
    await ready(page);
    await page.getByTestId('rotulo-code-input').fill('Ordenanza 4711');
    await page.getByTestId('rotulo-code-add').click();

    const preview = page.getByTestId('sheet-preview');
    await expect(preview).toContainText('Ordenanza 4711');
    /*
     * In SPANISH, while this suite runs the interface in English — and that is the sheet's own
     * convention, stated on `TitleBlock.provisionalNote`: "a drawing is a document; an Argentine
     * engineer wants it in Spanish even when reading the app in English". `sheetToSvg` takes an
     * explicit locale and the sheet path passes none, so the drawing is emitted in `es` while
     * the panel above it follows the interface. Asserting the English string here would have
     * pinned the opposite convention by accident.
     */
    await expect(preview).toContainText('no verificada por esta aplicación');
  });
});
