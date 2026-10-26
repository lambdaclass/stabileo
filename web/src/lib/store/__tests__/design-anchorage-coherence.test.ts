/**
 * The design and the detailing read one anchorage: the span fixture end to end, on columns that
 * hold the beams' hooks and on columns that do not.
 *
 * Each bar end in a column is checked by the design as the detailing lays it
 * (`end-support-anchorage.ts` over `engine/detailing/support-anchorage.ts`): the same column face,
 * the same cage (the columns' designed bars, or the project's largest where a column has none),
 * the same hook plane behind the column's bars with §25.2.3's clearance, clear of the crossing
 * beams' corner bars, at the row the bar lies in, with ℓd, ℓdh and the 150 mm of §9.7.3.8.
 *
 *   Feasible — 40×40 columns: every span is designed, every bar end the detailing builds is the
 *   end the design verified (same length available, same length required, same disposition), on
 *   every slab mesh, and no document holds a beam for its anchorage.
 *
 *   Exhausted — the fixture's 30×30 columns: a top bar's standard hook stops 17,8 cm past the face,
 *   short of ℓdh of every admissible bar at H-30 (Ø10: 18,4 cm), so no span has an arrangement
 *   among the ones the design implements (straight or standard hook, the columns' cage as
 *   designed) that anchors at its end columns. That is not a proof that no anchorage exists:
 *   headed or mechanically anchored bars (§25.4.4, §25.4.5) and another column cage are not
 *   tried. The design refuses all 14 as SEARCH_EXHAUSTED, says why and what was not tried, and
 *   nothing downstream states them as satisfying anything.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import { building, designAndDocument, beamOnAxis1AtN1 } from './span-fixture';
import { anchorageCoherence } from './anchorage-coherence';
import { memoriaInput } from '../memoria-inputs';
import { projectIfcInput } from '../ifc-export';
import { designSheets } from '../design-exchange';
import { readinessBanner } from '../../engine/detailing/document-render';
import { planSupportEnd } from '../../engine/detailing/support-anchorage';
import { deriveHookedDevelopment } from '../../codes/cirsoc201/anchorage';
import { STANDARD_LONG_DIAS } from '../../engine/design/objective';
import type { DocumentModel } from '../../engine/detailing/document-model';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const tr = (k: string) => k;
const beamCtxs = () => [...verificationStore.contexts.values()].filter((c) => c.elementType === 'beam');
const columnCtxs = () => [...verificationStore.contexts.values()].filter((c) => c.elementType === 'column');

describe('feasible: the span fixture on 40×40 columns', () => {
  const MESHES = [1, 0.5, 2, 6] as const;
  const runs = new Map<number, { coherence: ReturnType<typeof anchorageCoherence>; recorded: number; refused: number; columns: number }>();
  beforeAll(() => {
    for (const mesh of MESHES) {
      building(mesh, { columnSide: 0.4 });
      const doc = designAndDocument();
      const bars = doc.assemblies.flatMap((a) => a.bars);
      runs.set(mesh, {
        coherence: anchorageCoherence(bars),
        // Every bar end in a support the detailing recorded on the beams' bars.
        recorded: bars.filter((b) => b.role === 'longitudinal' && b.ownerElementIds.some((id) => verificationStore.contextFor(id)?.elementType === 'beam'))
          .reduce((n, b) => n + (b.anchorage?.start ? 1 : 0) + (b.anchorage?.end ? 1 : 0), 0),
        refused: beamCtxs().filter((c) => verificationStore.outcomeFor(c.elementId)?.outcome !== 'VERIFIED').length,
        columns: columnCtxs().filter((c) => verificationStore.outcomeFor(c.elementId)?.outcome === 'VERIFIED').length,
      });
    }
  }, 600_000);

  it('designs every span and every column on every mesh', () => {
    for (const mesh of MESHES) expect([mesh, runs.get(mesh)!.refused, runs.get(mesh)!.columns]).toEqual([mesh, 0, 12]);
  });

  it('builds every bar end in a support as the design verified it: same lengths, same rule, same disposition', () => {
    for (const mesh of MESHES) {
      const { coherence, recorded } = runs.get(mesh)!;
      if (process.env.COHERENCE_PRINT) console.log(`mesh ${mesh}: ${coherence.compared} ends compared, ${coherence.atEnds} at end supports, ${coherence.mismatches.length} differ`);
      expect(coherence.mismatches, `mesh ${mesh}`).toEqual([]);
      expect(coherence.compared, `mesh ${mesh}`).toBe(recorded);
      expect(coherence.atEnds, `mesh ${mesh}`).toBeGreaterThan(100);
    }
  });

  it('holds no beam for its anchorage in the document, the memoria, the IFC or the workbook', () => {
    // The last mesh built is 6 m; read the 1 m one, V2 the beam the trace follows.
    building(1, { columnSide: 0.4 });
    const doc = designAndDocument();
    expect((doc.openIssues ?? []).filter((i) => i.key === 'detailing.anchorage.unresolved' || i.key === 'detailing.cover.violated')).toEqual([]);
    const memo = memoriaInput(tr, 'es');
    for (const c of beamCtxs()) {
      const el = memo.elements.find((e) => e.id === `e${c.elementId}`)!;
      expect(el.rows.filter((r) => r.titleKey === 'check.detailing.anchorage' || (r.titleKey === 'check.rc.anchorage' && r.status !== 'ok')), `e${c.elementId}`).toEqual([]);
    }
    const v2 = beamOnAxis1AtN1();
    const ifc = projectIfcInput(tr, 'es', 'coherence');
    for (const key of ['span-32', 'span-49']) expect(ifc.members.find((m) => m.id === key)!.props?.DesignState, key).not.toBe('fails');
    const wb = designSheets(tr, 'es').find((s) => s.rows[0]?.[0] === 'element')!;
    for (const id of v2.elements) {
      const name = memo.elements.find((e) => e.id === `e${id}`)!.name;
      for (const row of wb.rows.filter((r) => r[0] === name)) expect(row[6], name).not.toBe('memo.state.fail');
    }
  });
});

describe('exhausted: the span fixture on its 30×30 columns', () => {
  let doc: DocumentModel;
  beforeAll(() => {
    building(1);
    doc = designAndDocument();
  }, 600_000);

  it('refuses every span for its anchorage, the columns designed', () => {
    const spans = new Map<string, string>();
    for (const c of beamCtxs()) {
      const o = verificationStore.outcomeFor(c.elementId)!;
      spans.set(c.span?.key ?? `e${c.elementId}`, `${o.outcome} ${o.limiting.join(',')}`);
    }
    expect(spans.size).toBe(14);
    // Every one on its anchorage. Since the design reads the column cages, the spans whose
    // layouts that anchor do not pass the columns' bars either name both (before: all 14
    // 'SEARCH_EXHAUSTED anchorage'; then some 'SECTION_INADEQUATE anchorage,congestion').
    // Every one is an exhausted search: shown for every admissible diameter, hooked or straight,
    // against the cages as designed, and not for headed bars, mechanical anchorage or another
    // column cage, which nothing here implements. No bound proves the section inadequate.
    // Since the columns are checked on the engine's load contour (main's concrete in the engine),
    // columns 14, 15, 22 and 24 take 8Ø12 where they had 12Ø10: fewer bars a face, and the spans
    // that reach them (beams 71–82) find room through the cage, so «congestion» goes and their
    // anchorage still refuses them, as it does every other span.
    expect([...new Set(spans.values())].sort()).toEqual(['SEARCH_EXHAUSTED anchorage']);
    for (const c of beamCtxs()) {
      const o = verificationStore.outcomeFor(c.elementId)!;
      expect([o.insufficiency, o.exhaustion?.scope], `e${c.elementId}`).toEqual([undefined, 'implementedAlternatives']);
      expect(o.exhaustion!.notImplemented, `e${c.elementId}`).toEqual(expect.arrayContaining(['headedBars', 'mechanicalAnchorage', 'columnCageChange']));
    }
    expect(columnCtxs().every((c) => verificationStore.outcomeFor(c.elementId)?.outcome === 'VERIFIED')).toBe(true);
  });

  it('V2 at A and C: no admissible bar hooks into the column, which the design says with its numbers', () => {
    const v2 = beamOnAxis1AtN1();
    for (const id of [v2.elements[0]!, v2.elements[v2.elements.length - 1]!]) {
      const o = verificationStore.outcomeFor(id)!;
      const verdicts = o.provisional!.verdict.supportAnchorage!;
      const open = verdicts.filter((v) => v.solution === 'unresolved');
      expect(open.length, `e${id}`).toBeGreaterThan(0);
      for (const v of open) {
        expect([v.support, v.rule, v.cause, v.cage.source], `e${id}`).toEqual(['end', 'ldh', 'noRoomStraightOrHooked', 'designedCage']);
        expect(v.available).toBeLessThan(v.required);
        // The same column read for every bar the project admits: none develops there.
        for (const dia of STANDARD_LONG_DIAS) {
          const ldh = deriveHookedDevelopment({ diameterMm: dia, fy: 420, fc: 30, edition: '2025' }).ldhM;
          const plan = planSupportEnd(v.cage, { diameterMm: dia, need: 'develop', hook: 'allowed', inboard: 0, ld: 10, ldh, ldc: 0, stress: 'tension' })!;
          expect(plan.record.solution, `Ø${dia}: ${plan.availableHooked.toFixed(3)} vs ${ldh.toFixed(3)}`).toBe('unresolved');
        }
      }
    }
  });

  it('is blocked everywhere: no beam in the document, a draft, and «fails» in the memoria, the IFC and the workbook', () => {
    const v2 = beamOnAxis1AtN1();
    expect(doc.assemblies.some((a) => a.elementIds.some((id) => v2.elements.includes(id)))).toBe(false);
    expect((doc.openIssues ?? []).filter((i) => i.key === 'detailing.anchorage.unresolved')).toEqual([]);
    expect(doc.readiness).toBe('REVIEW_DRAFT');
    expect(readinessBanner(doc, 'es')).toMatch(/NO APTO PARA CONSTRUCCI/);
    const memo = memoriaInput(tr, 'es');
    for (const id of v2.elements) {
      expect(verificationStore.getDisplayStatus(id), `desk e${id}`).not.toMatch(/^(ok|warn)$/);
      const el = memo.elements.find((e) => e.id === `e${id}`)!;
      const row = el.rows.find((r) => r.titleKey === 'check.design.alternativesExhausted')!;
      expect([row.status, row.clause, row.formula], `memoria e${id}`).toEqual(['fail', '25.4.3.1', 'ℓ ≥ ldh']);
    }
    const ifc = projectIfcInput(tr, 'es', 'coherence');
    for (const key of ['span-32', 'span-49']) {
      const props = ifc.members.find((m) => m.id === key)!.props!;
      expect([props.DesignState, props.DesignOutcome], key).toEqual(['fails', 'implemented alternatives exhausted, insufficiency not shown']);
    }
    const wb = designSheets(tr, 'es').find((s) => s.rows[0]?.[0] === 'element')!;
    for (const id of v2.elements) {
      const name = memo.elements.find((e) => e.id === `e${id}`)!.name;
      const rows = wb.rows.filter((r) => r[0] === name);
      expect(rows.length, name).toBeGreaterThan(0);
      for (const row of rows) expect(row[6], name).toBe('memo.state.fail');
    }
    void modelStore;
  });
});
