/**
 * Four projections of one document, reconciled on real buildings.
 *
 * ── What this adds over `projections-agree` ────────────────────────
 *
 * That file cross-examines a hand-built document and pins the RULE. This one runs the
 * production chain on the 7-storey building and on a small control, and asks the same
 * questions of 20 917 bars, 128 sheets and a schedule — where a family can go missing without
 * any rule being broken, because the rule never mentioned it.
 *
 * Every assertion compares one projection against another. A hard-coded expectation would
 * pass while all four drifted together.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { designRunStore } from '../../store/design-run.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { isSolverReady } from '../../engine/wasm-solver';
import {
  renderDrawings, renderSchedule, MISSING_SHEET_KINDS,
} from '../../engine/detailing/document-render';
import { buildSceneModel, type SceneModel } from '../../engine/detailing/scene-model';
import { LAYERS } from '../../engine/detailing/drawings';
import { membersFromModel } from '../../engine/detailing/member-geometry';
import { SLAB_BAR_ANCHOR_ALLOWANCE } from '../../engine/detailing/floor-design';
import type { DocumentModel } from '../../engine/detailing/document-model';
import { plainDeepCopy } from '../../utils/plain-deep-copy';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

const OPTS = { locale: 'es', projectName: 'Reconcile' };

interface Built { doc: DocumentModel; scene: SceneModel }

async function compute(example: string): Promise<Built> {
  modelStore.clear(); resultsStore.clear(); detailingStore.clear();
  designRunStore.resetMarks(); verificationStore.clear();
  await modelStore.loadExample(example);
  expect(isSolverReady()).toBe(true);
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  const r = solved as { perCase: Map<number, never>; perCombo: Map<number, never>; envelope: never };
  resultsStore.setCombinationResults3D(r.perCase as never, r.perCombo as never, r.envelope as never);
  designRunStore.designFamilies(['column', 'beam', 'slab', 'wall', 'footing'],
    { verifierId: 'cirsoc201.provided.v2.2025' });
  const doc = detailingStore.buildDocument({ author: 'r', at: '2026-08-09T00:00:00Z' })!;
  expect(doc).toBeTruthy();
  const { members } = membersFromModel({
    elementIds: [...modelStore.model.elements.keys()],
    nodes: [...modelStore.model.nodes.values()],
    elements: [...modelStore.model.elements.values()],
    sections: [...modelStore.model.sections.values()],
  });
  return plainDeepCopy({ doc, scene: buildSceneModel(doc, { members }) });
}

const examples = new Map<string, Promise<Built>>();

/** Preserve this suite's designFamilies path, once per example and per file. */
async function build(example: string): Promise<Built> {
  let pending = examples.get(example);
  if (!pending) {
    pending = compute(example);
    examples.set(example, pending);
  }
  // beforeEach copies the result so a test cannot mutate another test's starting point.
  return plainDeepCopy(await pending);
}

for (const example of ['pro-edificio-7p', 'rc-qa-diagnostic']) {
  describe(`${example}: the document, the scene, the sheets and the schedule agree`, () => {
    let b: Built;
    beforeEach(async () => { b = await build(example); }, 300_000);

    it('every mark in the 3-D view is on a sheet AND on the schedule', () => {
      const marks = new Set(b.scene.bars.map((x) => x.mark).filter(Boolean) as string[]);
      expect(marks.size).toBeGreaterThan(0);
      const svg = renderDrawings(b.doc, OPTS).sheets.map((s) => s.svg).join('\n');
      const sched = renderSchedule(b.doc, OPTS)
        .flatMap(({ aoa }) => aoa.map((row) => String(row[0] ?? '').trim()));
      for (const m of marks) {
        expect(svg, `${m} drawn`).toContain(m);
        expect(sched, `${m} billed`).toContain(m);
      }
    }, 300_000);

    it('draws each assembly’s bars once — no more and no fewer', () => {
      /**
       * Not a geometric uniqueness check. An ELEVATION projects three dimensions onto two, so
       * two bars side by side at different depths land on identical polylines by design;
       * asserting they differ would fail every correct drawing of a beam.
       *
       * What a duplicate would actually be is one bar emitted twice, and that is a COUNT: the
       * elevation draws one polyline per bar plus one per member outline. Double steel on the
       * order superimposes perfectly on the sheet, so the count is the only place it shows.
       */
      const sheets = renderDrawings(b.doc, OPTS).sheets;
      for (const a of b.doc.assemblies) {
        const elevation = sheets.find((s) => s.name === `${a.id}-elevation`);
        if (!elevation || a.bars.length === 0) continue;
        const barLines = elevation.sheet.polylines.filter((p) => p.layer !== LAYERS.outline);
        expect(barLines.length, `${a.id} elevation draws every bar exactly once`)
          .toBe(a.bars.length);
      }
    }, 300_000);

    it('every sheet states whether it may be built from', () => {
      // A conflicted document must not produce a sheet that reads as issued.
      for (const { name, svg } of renderDrawings(b.doc, OPTS).sheets) {
        // The banner is localised, and this suite runs in Spanish. Matching only the English
        // wording would have passed on an empty sheet in any other locale.
        expect(svg, `${name} states its readiness`)
          .toMatch(/CONSTRUCCIÓN|REVISIÓN|REVISADO|BORRADOR/i);
      }
    }, 300_000);

    it('declares the sheet kinds it does not produce', () => {
      /**
       * The gap this exists to stop being silent. 128 sheets arrive, every mark reconciles,
       * and no sheet frames a whole storey or details one column. Without this the reviewer's
       * only way to find out is to look for a drawing that was never going to be there.
       */
      /**
       * A set built WITHOUT a scene cannot produce the four structure-wide sheets, and says
       * which four rather than letting their absence pass for "this model has none".
       */
      const withoutScene = renderDrawings(b.doc, OPTS);
      expect(withoutScene.coverage.missingSheetKinds).toContain('levelPlan');
      expect(withoutScene.coverage.missingSheetKinds).toContain('columnDetail');

      // Given the scene, it produces them and declares nothing missing.
      const withScene = renderDrawings(b.doc, { ...OPTS, scene: b.scene });
      expect(withScene.coverage.missingSheetKinds).toEqual([...MISSING_SHEET_KINDS]);
      expect(withScene.coverage.missingSheetKinds).toEqual([]);
      const kinds = new Set(withScene.sheets.map((s) => s.sheet.kind));
      expect(kinds.has('generalPlan')).toBe(true);
      expect(kinds.has('levelPlan')).toBe(true);
      expect(kinds.has('horizontalSection')).toBe(true);
      expect(kinds.has('columnDetail')).toBe(true);
    }, 300_000);

    it('reports each family’s presence against the document', () => {
      const { coverage } = renderDrawings(b.doc, OPTS);
      for (const f of coverage.families) {
        // Never claims more drawn than exist — the failure mode a coverage report can have.
        expect(f.drawn, `${f.family} drawn ≤ inDocument`).toBeLessThanOrEqual(f.inDocument);
        if (f.inDocument === 0) expect(f.drawn, `${f.family} invents nothing`).toBe(0);
      }
    }, 300_000);
  });
}

describe('the 7-storey building specifically', () => {
  let b: Built;
  beforeEach(async () => { b = await build('pro-edificio-7p'); }, 300_000);

  it('draws its slabs and its walls, not only its frame', () => {
    // 11 340 slab bars and 234 wall bars exist in the scene. A drawing set that showed only
    // the frame would reconcile on marks and still be missing two families.
    const { coverage } = renderDrawings(b.doc, OPTS);
    const slab = coverage.families.find((f) => f.family === 'slab')!;
    const wall = coverage.families.find((f) => f.family === 'wall')!;
    expect(slab.inDocument).toBeGreaterThan(10);
    expect(slab.drawn).toBeGreaterThan(10);
    expect(wall.inDocument).toBeGreaterThan(5);
    expect(wall.drawn).toBeGreaterThan(5);
  }, 300_000);

  it('shows a family the model does not contain as absent, not as drawn', () => {
    // This building has no footings. A coverage row claiming otherwise would be the report
    // inventing what it is meant to police.
    const { coverage } = renderDrawings(b.doc, OPTS);
    const footing = coverage.families.find((f) => f.family === 'footing')!;
    expect(footing.inDocument).toBe(0);
    expect(footing.drawn).toBe(0);
  }, 300_000);

  it('carries the slab anchorage allowance identically in 3-D and in the schedule', () => {
    /**
     * The extension that leaves the concrete has to be the SAME length everywhere, or the bar
     * ordered is not the bar drawn. The scene's cutting length and the schedule's mark length
     * are computed independently and must agree within the 10 mm the shop cuts to.
     */
    const slabBars = b.scene.bars.filter((x) => x.family === 'slab');
    expect(slabBars.length).toBeGreaterThan(1000);
    const lengthOfMark = new Map<string, number>();
    for (const a of b.doc.assemblies) {
      for (const m of a.source.marks) lengthOfMark.set(m.mark, m.cuttingLength);
    }
    for (const bar of slabBars.slice(0, 300)) {
      if (!bar.mark) continue;
      expect(Math.abs(bar.cuttingLength - lengthOfMark.get(bar.mark)!), bar.barId)
        .toBeLessThanOrEqual(0.005 + 1e-9);
    }
    // And the allowance is declared, so the extra length on the order has a stated reason.
    expect(b.doc.assemblies.flatMap((a) => a.assumptions).map((m) => m.key))
      .toContain('detailing.slab.anchorAllowance');
    expect(SLAB_BAR_ANCHOR_ALLOWANCE).toBeGreaterThan(0);
  }, 300_000);

  it('keeps every sheet inside one assembly, so levels do not mix', () => {
    /**
     * Each sheet is named for the assembly it draws, and assemblies are per level in this
     * model. A sheet gathering two levels would be a drawing nobody can build from — and the
     * name would still look right.
     */
    const ids = b.doc.assemblies.map((a) => a.id);
    for (const { name } of renderDrawings(b.doc, OPTS).sheets) {
      const owners = ids.filter((id) => name.startsWith(id));
      expect(owners.length, `${name} belongs to exactly one assembly`).toBe(1);
    }
  }, 300_000);
});
