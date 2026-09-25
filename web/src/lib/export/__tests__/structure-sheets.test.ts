/**
 * The four sheet kinds, on a real building.
 *
 * They are built from the `SceneModel` — the same projection the 3-D view renders — so a plan
 * and the viewport cannot show different steel. These tests are what makes that checkable, and
 * what stops a level plan quietly gathering two storeys.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { designRunStore } from '../../store/design-run.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { isSolverReady } from '../../engine/wasm-solver';
import { buildSceneModel, type SceneModel } from '../../engine/detailing/scene-model';
import { membersFromModel } from '../../engine/detailing/member-geometry';
import { reportElementStatus, type DesignOutcomeSummary } from '../../engine/detailing/element-status';
import {
  drawColumnDetail, drawGeneralPlan, drawHorizontalSection, drawLevelPlan, levelsOf,
  STRUCTURE_LAYERS,
} from '../../engine/detailing/structure-drawings';
import { sheetToDxf, sheetToSvg, buildTitleBlock, LAYERS } from '../../engine/detailing/drawings';
import type { DetailingAssembly } from '../../engine/detailing/assembly';
import { plainDeepCopy } from '../../utils/plain-deep-copy';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';
import { applyVariant, ROLLED_BEAMS, type Variant } from '../../engine/detailing/__tests__/helpers/workspace-scene';

let scene: SceneModel;
let statusOf: (id: number) => ReturnType<typeof reportElementStatus>['entries'][number]['status'] | undefined;
let title: ReturnType<typeof buildTitleBlock>;

async function build7p(variant?: Variant) {
  modelStore.clear(); resultsStore.clear(); detailingStore.clear();
  designRunStore.resetMarks(); verificationStore.clear();
  await modelStore.loadExample('pro-edificio-7p');
  expect(isSolverReady()).toBe(true);
  if (variant) applyVariant(variant);
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  const r = solved as { perCase: Map<number, never>; perCombo: Map<number, never>; envelope: never };
  resultsStore.setCombinationResults3D(r.perCase as never, r.perCombo as never, r.envelope as never);
  designRunStore.designFamilies(['column', 'beam', 'slab', 'wall'],
    { verifierId: 'cirsoc201.provided.v2.2025' });
  const doc = detailingStore.buildDocument({ author: 's', at: '2026-08-09T00:00:00Z' })!;
  const { members } = membersFromModel({
    elementIds: [...modelStore.model.elements.keys()],
    nodes: [...modelStore.model.nodes.values()],
    elements: [...modelStore.model.elements.values()],
    sections: [...modelStore.model.sections.values()],
  });
  scene = buildSceneModel(doc, { members });
  const outcomes = new Map<number, DesignOutcomeSummary>();
  for (const id of modelStore.model.elements.keys()) {
    const o = verificationStore.outcomeFor(id);
    if (o) {
      outcomes.set(id, {
        outcome: o.outcome, limiting: o.limiting ?? [], reasonKey: o.reasons?.[0]?.key,
      });
    }
  }
  const report = reportElementStatus(scene, outcomes);
  const byId = new Map(report.entries.map((e) => [e.elementId, e.status]));
  statusOf = (id) => byId.get(id);
  // A real assembly: the title block reads its provenance, its revision and its review state,
  // and a stub would produce a sheet whose header does not describe the document it belongs to.
  title = buildTitleBlock({
    sheetNumber: 'R1-1', title: 'Audit',
    assembly: doc.assemblies[0].source as DetailingAssembly,
    clauses: doc.refs,
  });
}

let prepared: { scene: SceneModel; title: ReturnType<typeof buildTitleBlock>; statusOf: typeof statusOf };
beforeAll(async () => {
  await build7p();
  // `statusOf` is a closure over the build's report, kept by reference: a test that rebuilds
  // (the provisional one below, on a variant) must not leave its statuses to the next.
  prepared = { ...plainDeepCopy({ scene, title }), statusOf };
}, 300_000);
beforeEach(() => {
  // Both suites use one real design, with independent drawing inputs for each test.
  ({ scene, title } = plainDeepCopy({ scene: prepared.scene, title: prepared.title }));
  statusOf = prepared.statusOf;
});

describe('the four sheet kinds exist and carry real geometry', () => {
  it('a general plan shows the whole footprint, with grid and ids', () => {
    const sheet = drawGeneralPlan({ scene, title, statusOf });
    expect(sheet.kind).toBe('generalPlan');
    // Every piece of concrete in the model, not a sample.
    const outlines = sheet.polylines.filter((p) => p.layer === LAYERS.outline);
    expect(outlines.length).toBe(scene.solids.length);
    expect(sheet.polylines.some((p) => p.layer === STRUCTURE_LAYERS.grid)).toBe(true);
    // Member ids, so the plan can be read against the 3-D view and the model.
    expect(sheet.texts.some((t) => /^E\d+$/.test(t.text))).toBe(true);
    // And it is a real drawing, not an empty frame.
    expect(sheetToDxf(sheet).length).toBeGreaterThan(2000);
    expect(sheetToSvg(sheet)).toContain('<svg');
  }, 300_000);

  it('a level plan carries its own storey and no other', () => {
    const levels = levelsOf(scene);
    expect(levels.length).toBeGreaterThan(3);
    const own = new Set(levels[2].elementIds);
    const sheet = drawLevelPlan({ scene, title, statusOf, level: levels[2] });
    expect(sheet.kind).toBe('levelPlan');

    /**
     * The assertion that matters. A plan gathering two storeys is a drawing nobody can build
     * from, and its title would still look right — so the check is that every outline on the
     * sheet belongs to a member of THIS level.
     */
    const drawn = scene.solids.filter((s) => s.elementIds.some((id) => own.has(id)));
    expect(sheet.polylines.filter((p) => p.layer === LAYERS.outline).length)
      .toBe(drawn.length);
    expect(drawn.length).toBeGreaterThan(0);
    const foreign = scene.solids.filter((s) => !s.elementIds.some((id) => own.has(id)));
    expect(foreign.length, 'other levels exist to be excluded').toBeGreaterThan(0);
    expect(sheet.notes.some((n) => n.includes('Nivel'))).toBe(true);
  }, 300_000);

  it('every member belongs to exactly one level', () => {
    // Overlapping levels would put a member on two plans and double its steel on the order.
    const levels = levelsOf(scene);
    const seen = new Set<number>();
    for (const l of levels) {
      for (const id of l.elementIds) {
        expect(seen.has(id), `member ${id} on two levels`).toBe(false);
        seen.add(id);
      }
    }
  }, 300_000);

  it('a horizontal section tells cut bars from projected ones', () => {
    const z = 3.4;
    const sheet = drawHorizontalSection({ scene, title, statusOf, atZ: z });
    expect(sheet.kind).toBe('horizontalSection');

    const cut = sheet.polylines.filter((p) => p.layer === STRUCTURE_LAYERS.cutBar);
    const projected = sheet.polylines.filter((p) => p.layer === STRUCTURE_LAYERS.projectedBar);
    // A section that drew both the same way would be indistinguishable from a plan, and a
    // section's whole value is saying what is actually there at that elevation.
    expect(cut.length).toBeGreaterThan(0);
    expect(projected.length).toBeGreaterThan(0);

    // The crossings are exactly the bars whose extent spans the plane.
    const spanning = scene.bars.filter((b) => {
      const zs = b.polyline.map((p) => p.z);
      return Math.min(...zs) <= z && Math.max(...zs) >= z;
    }).length;
    expect(cut.length / 2).toBe(spanning);
    expect(sheet.notes[0]).toContain('Corte horizontal');
  }, 300_000);

  it('a column detail shows longitudinals AND transverse pieces', () => {
    const column = scene.solids.find((s) => s.kind === 'column' && s.reinforced)!;
    const id = column.elementIds[0];
    const sheet = drawColumnDetail({ scene, title, statusOf, elementId: id });
    expect(sheet.kind).toBe('columnDetail');

    // Longitudinals are dots in section; transverse pieces are drawn whole. A sheet with only
    // the perimeter hoop would omit the crossties §25.7.2.3 requires.
    expect(sheet.circles.length).toBeGreaterThan(3);
    expect(sheet.polylines.filter((p) => p.layer === LAYERS.stirrup).length)
      .toBeGreaterThan(0);
    expect(sheet.polylines.some((p) => p.layer === LAYERS.outline)).toBe(true);
    expect(sheet.notes.join(' ')).toContain(`Elemento ${id}`);
  }, 300_000);

  it('a member that is not finished is named on the sheet, never shown as approved', async () => {
    // A beam that carries a proposal rather than a certified design. A plan that drew it
    // exactly like the verified ones is the failure the status model exists to prevent — and
    // worse on paper, because the sheet outlives the session. The building as committed has
    // none any more, so five beams are turned about their axis to produce some (`ROLLED_BEAMS`).
    await build7p(ROLLED_BEAMS);
    const sheet = drawGeneralPlan({ scene, title, statusOf });
    expect(sheet.notes.some((n) => /PROVISIONAL|UNSUPPORTED|REFUSED|NOT_EVALUATED/.test(n)))
      .toBe(true);
    // And the note says what the state COSTS, not only what it is called. A reader who does
    // not already know what "PROVISIONAL" means must still not issue the sheet.
    expect(sheet.notes.some((n) => /NO APTO PARA EMISIÓN CONSTRUCTIVA/.test(n))).toBe(true);
  }, 300_000);

  it('a column with no steel says so instead of showing an empty box', () => {
    const bare = scene.solids.find((s) => s.kind === 'column' && !s.reinforced);
    if (!bare) return;
    const sheet = drawColumnDetail({
      scene, title, statusOf, elementId: bare.elementIds[0],
    });
    expect(sheet.notes.join(' ')).toMatch(/Sin armadura|0 longitudinal/);
  }, 300_000);
});

describe('the sheets reconcile with the 3-D view', () => {
  it('a level plan draws each of its bars once', () => {
    // Semantic, not geometric: two bars at different depths project onto the same line in plan
    // by design, so uniqueness of polylines would fail on every correct drawing.
    const level = levelsOf(scene)[2];
    const own = new Set(level.elementIds);
    const sheet = drawLevelPlan({ scene, title, statusOf, level });
    const bars = scene.bars.filter((b) => b.elementIds.some((id) => own.has(id)));
    const barLines = sheet.polylines.filter(
      (p) => p.layer === LAYERS.bar || p.layer === LAYERS.stirrup);
    expect(barLines.length).toBe(bars.length);
  }, 300_000);

  it('carries the marks the 3-D view carries', () => {
    const level = levelsOf(scene)[2];
    const own = new Set(level.elementIds);
    const sheet = drawLevelPlan({ scene, title, statusOf, level });
    const marks = new Set(scene.bars
      .filter((b) => b.elementIds.some((id) => own.has(id)))
      .map((b) => b.mark).filter(Boolean) as string[]);
    const text = sheet.texts.map((t) => t.text).join(' ');
    for (const m of marks) expect(text, `${m} on the level plan`).toContain(m);
  }, 300_000);
});
