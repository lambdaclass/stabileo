/**
 * PR18 — slabs, walls and foundations in the browser.
 *
 * Floor assemblies are `DetailingAssembly` values, so they flow through exactly the UI
 * PR17 built. These scenarios prove that: a floor with slab, wall and foundation content
 * gets the same sheet, schedule, conflict navigation and review gate, and each family's
 * unsupported conditions surface with their own message.
 */

import { test, expect } from './fixtures';

type Json = Record<string, unknown>;

function slabBar(id: string, y: number, z: number, dia = 10): Json {
  return {
    id, diameterMm: dia, role: 'longitudinal',
    segments: [{
      kind: 'straight',
      start: { x: -0.15, y, z }, end: { x: 5.15, y, z }, length: 5.3,
    }],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 5.3, ownerElementIds: [50], source: 'generated', locked: false, refs: [],
  };
}

/** A floor assembly carrying slab bars and dowels, as buildFloorAssembly writes it. */
function floor(over: Json = {}): Json {
  const bars = [
    slabBar('P1-bx-0', 0.1, 2.92), slabBar('P1-bx-1', 0.3, 2.92),
    slabBar('F1-dowel-0', 0.0, 0.5, 20),
  ];
  return {
    id: 'FLOOR-1', kind: 'beamLine', label: 'Nivel +3,00 — losas, tabiques y fundaciones',
    elementIds: [1, 50, 60],
    bars,
    marks: [
      {
        mark: 'F1', diameterMm: 10, cuttingLength: 5.3, quantity: 2, shape: 'straight',
        massKg: 6.54, barIds: ['P1-bx-0', 'P1-bx-1'],
      },
      {
        mark: 'F2', diameterMm: 20, cuttingLength: 5.3, quantity: 1, shape: 'straight',
        massKg: 13.07, barIds: ['F1-dowel-0'],
      },
    ],
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

async function seedInto(page: import('@playwright/test').Page, assemblies: Json[]) {
  await page.evaluate((a) => {
    (window.__stabileoActions as unknown as { seedDetailing(x: unknown): void }).seedDetailing(a);
  }, assemblies);
}

async function openPanel(page: import('@playwright/test').Page) {
  const d = page.getByTestId('detailing-disclosure');
  await expect(d).toBeVisible();
  // Direct child only: the detailing panel now nests disclosures of its own
  // (the longitudinal bar list), so a descendant match is ambiguous.
  await d.locator('> summary').click();
}

/**
 * Open the Documents stage.
 *
 * The professional review — the engineer's name, the notes, the provisional acknowledgements,
 * `Record review` and `Issue for construction` — moved out of the coordinated-detailing panel and
 * into a stage of its own. These assertions are unchanged; what changed is which disclosure holds
 * the controls, so they open that one too.
 */
async function openDocuments(page: import('@playwright/test').Page) {
  const d = page.getByTestId('documents-disclosure');
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
}

test.describe('@smoke floor design', () => {
  test('F1 — a floor assembly appears alongside beam lines', async ({ pro: page }) => {
    await seedInto(page, [floor()]);
    await openPanel(page);
    await expect(page.getByTestId('assembly-FLOOR-1')).toBeVisible();
    await expect(page.getByTestId('assembly-FLOOR-1')).toContainText('losas, tabiques y fundaciones');
  });

  test('F2 — slab and foundation bars share one schedule', async ({ pro: page }) => {
    await seedInto(page, [floor()]);
    await openPanel(page);
    const schedule = page.getByTestId('schedule');
    await expect(schedule).toContainText('F1');
    await expect(schedule).toContainText('F2');
    // Ø10 slab bars and the Ø20 dowel, totalled together.
    await expect(page.getByTestId('schedule-mass')).toHaveText('19.6');
  });

  test('F3 — the floor sheet draws slab and dowel bars from real geometry', async ({ pro: page }) => {
    await seedInto(page, [floor()]);
    await openPanel(page);
    const sheet = page.getByTestId('sheet-preview');
    await expect(sheet).toBeVisible();
    expect(await sheet.locator('svg path').count()).toBeGreaterThanOrEqual(3);
  });

  test('F4 — a provisional floor is badged and carries the note', async ({ pro: page }) => {
    // The slab and wall engines are clause-grounded but not externally benchmarked, so
    // the floor inherits IMPLEMENTED_PROVISIONAL rather than reading as validated.
    await seedInto(page, [floor()]);
    await openPanel(page);
    await expect(page.getByTestId('assembly-maturity')).toHaveText('Provisional');
    await expect(page.getByTestId('sheet-preview')).toContainText('CÁLCULO PROVISORIO');
  });
});

test.describe('@smoke unsupported conditions by family', () => {
  test('F5 — a slab opening surfaces with its own message', async ({ pro: page }) => {
    await seedInto(page, [floor({
      state: 'COORDINATED',
      unsupported: [{
        key: 'slab', scope: { elementIds: [50] },
        message: 'El panel tiene 1 abertura(s). El refuerzo de bordes no se genera automáticamente.',
        refs: [],
      }],
    })]);
    await openPanel(page);
    await expect(page.getByTestId('unsupported-list')).toContainText('abertura');
  });

  test('F6 — a seismic wall says which regulation governs, and blocks the review', async ({ pro: page }) => {
    await seedInto(page, [floor({
      state: 'COORDINATED',
      unsupported: [{
        key: 'wall', scope: { elementIds: [60] },
        message: 'El proyecto requiere diseño sismorresistente. Los elementos de borde se ' +
          'rigen por INPRES-CIRSOC 103 Parte II, que no está implementado en esta rama.',
        refs: [],
      }],
    })]);
    await openPanel(page);
    await expect(page.getByTestId('unsupported-list')).toContainText('INPRES-CIRSOC 103 Parte II');

    await openDocuments(page);
    await page.getByTestId('review-engineer').fill('Ing. R. Pérez');
    await page.getByTestId('review-submit').click();
    await expect(page.getByTestId('review-error')).toBeVisible();
  });

  test('F7 — an unsupported foundation type produces no numbers to mistake for a check', async ({ pro: page }) => {
    await seedInto(page, [floor({
      state: 'COORDINATED', bars: [], marks: [],
      unsupported: [{
        key: 'foundation', scope: { elementIds: [1] },
        message: 'Zapatas combinadas no están implementadas.', refs: [],
      }],
      maturity: 'UNSUPPORTED',
    })]);
    await openPanel(page);
    await expect(page.getByTestId('unsupported-list')).toContainText('Zapatas combinadas');
    await expect(page.getByTestId('assembly-maturity')).toHaveText('Not supported');
  });

  test('F8 — several families list side by side without hiding each other', async ({ pro: page }) => {
    await seedInto(page, [floor({
      state: 'COORDINATED',
      unsupported: [
        { key: 'slab', scope: {}, message: 'Abertura en losa.', refs: [] },
        { key: 'wall', scope: {}, message: 'Momento fuera del plano.', refs: [] },
        { key: 'foundation', scope: {}, message: 'Resultante fuera del núcleo central.', refs: [] },
      ],
    })]);
    await openPanel(page);
    const list = page.getByTestId('unsupported-list');
    await expect(list).toContainText('Abertura en losa');
    await expect(list).toContainText('Momento fuera del plano');
    await expect(list).toContainText('núcleo central');
  });
});

test.describe('@smoke floor conflicts and review', () => {
  test('F9 — a slab/dowel clash is navigable like any other', async ({ pro: page }) => {
    await seedInto(page, [floor({
      state: 'COORDINATED',
      conflicts: [{
        severity: 'clearance', barA: 'F1-dowel-0', barB: 'P1-bx-0',
        at: { x: 0, y: 0, z: 2.9 }, clearance: 0.011, required: 0.025,
        shortfall: 0.014, elementIds: [1, 50],
      }],
    })]);
    await openPanel(page);
    await expect(page.getByTestId('conflict-counter')).toContainText('1');
    await expect(page.getByTestId('conflict-detail')).toContainText('F1-dowel-0 / P1-bx-0');
  });

  test('F10 — a clean floor can be reviewed once the provisional work is accepted', async ({ pro: page }) => {
    await seedInto(page, [floor()]);
    await openPanel(page);

    // Provisional, so a bare review is refused.
    await openDocuments(page);
    await page.getByTestId('review-engineer').fill('Ing. R. Pérez');
    await page.getByTestId('review-submit').click();
    // In ENGLISH, because this spec runs in the default `en` locale. It used to assert the
    // Spanish word "provisorios" and pass — which is the proof that the refusal was a Spanish
    // literal built inside a pure module and shown to an English-locale user unchanged.
    const error = page.getByTestId('review-error');
    await expect(error).toContainText('provisional calculations without express acceptance');
    // And it names WHICH one, so the refusal is actionable.
    await expect(error).toContainText('assembly');

    await page.getByTestId('ack-assembly').check();
    await page.getByTestId('review-submit').click();
    await expect(page.getByTestId('review-error')).toBeHidden();
    await expect(page.getByTestId('assembly-state')).toContainText('Reviewed');
  });

  test('F11 — a floor and a beam line coexist and switch cleanly', async ({ pro: page }) => {
    await seedInto(page, [
      floor(),
      floor({ id: 'L1-B', label: 'Eje B — viga', kind: 'beamLine' }),
    ]);
    await openPanel(page);
    await expect(page.getByTestId('detailing-count')).toHaveText('2');
    await page.getByTestId('assembly-L1-B').click();
    await expect(page.getByTestId('sheet-preview')).toContainText('Eje B');
    await page.getByTestId('assembly-FLOOR-1').click();
    await expect(page.getByTestId('sheet-preview')).toContainText('Nivel +3,00');
  });
});
