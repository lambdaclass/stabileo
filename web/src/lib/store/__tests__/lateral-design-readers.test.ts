/**
 * A beam whose role in the lateral-force-resisting system is not declared is designed as part of
 * the system (§9.7.3.8.2, `model/lateral-system.ts`): its positive steel develops fy at the face,
 * and every reader of the design says that assumption was made. The span fixture at 1 m on 40×40
 * columns (`span-fixture.ts`), designed and detailed through the production commands, read on
 * the desk, in the memoria, in the IFC and in the workbook; then the same building with its beams
 * declared outside the system, which reads the 150 mm.
 *
 *   Not declared: 10 of the 14 spans designed, every bottom bar end in a column hooked to ℓdh
 *   (never cut at 150 mm), the design and the detailing reading the same ends. Two spans refuse
 *   on their anchorage and two on torsion: the bars that develop fy at a 40 cm column's face are
 *   smaller than the torsion's longitudinal steel asks. No designed piece is held by the reading.
 *   Declared outside the system: the 14 designed, the bottom ends cut 150 mm past the face.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { verificationStore } from '../verification.svelte';
import { building, designAndDocument } from './span-fixture';
import { anchorageCoherence } from './anchorage-coherence';
import { memoriaInput } from '../memoria-inputs';
import { projectIfcInput } from '../ifc-export';
import { designSheets } from '../design-exchange';
import { lateralReadingFor } from '../lateral-system';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';
import type { DocumentModel } from '../../engine/detailing/document-model';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const tr = (k: string) => k;
const beamCtxs = () => [...verificationStore.contexts.values()].filter((c) => c.elementType === 'beam');
const spanOutcomes = () => {
  const by = new Map<string, string>();
  for (const c of beamCtxs()) {
    const o = verificationStore.outcomeFor(c.elementId)!;
    by.set(c.span?.key ?? `e${c.elementId}`, `${o.outcome}${o.limiting.length ? ` ${o.limiting.join(',')}` : ''}`);
  }
  const counts: Record<string, number> = {};
  for (const v of by.values()) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
};
/** The rule every bottom bar end of the designed beams was held to, at a column the line ends at. */
const bottomRules = () => new Set(beamCtxs().flatMap((c) => (verificationStore.providedFor(c.elementId)?.supportAnchorage ?? [])
  .filter((v) => v.position === 'bottom' && v.support === 'end').map((v) => v.rule)));

/** Every reader's statement of a designed beam's role, by element: each document built once. */
function readersOf() {
  const memo = memoriaInput(tr, 'es');
  const ifc = projectIfcInput(tr, 'es', 'lateral').members;
  const wb = designSheets(tr, 'es').find((s) => s.name === 'Design checks')!;
  return (id: number) => {
    const el = memo.elements.find((e) => e.id === `e${id}`)!;
    const row = el.rows.find((r) => r.titleKey === 'check.rc.lateralAnchorage')!;
    const ctx = verificationStore.contextFor(id)!;
    const member = ifc.find((m) => m.id === (ctx.span?.key ?? String(id)))!;
    const wbRow = wb.rows.find((r) => r[0] === el.name && r[2] === 'check.rc.lateralAnchorage')!;
    return {
      desk: [lateralReadingFor(id).role, verificationStore.getDisplayStatus(id)],
      memoria: [el.data.find(([k]) => k === 'lateral.symbol')?.[1], row.clause, row.formula, row.location, row.status],
      ifc: [member.props?.LateralSystem, member.props?.DesignState],
      workbook: [wbRow[4], wbRow[5], wbRow[10], wbRow[12]],
    };
  };
}

describe('the span fixture at 40×40, its beams\' role not declared', () => {
  let doc: DocumentModel;
  beforeAll(() => {
    building(1, { columnSide: 0.4, lateral: null });
    doc = designAndDocument();
  }, 600_000);

  it('designs them as part of the system: 10 spans of 14, every bottom end in a column developing fy', () => {
    expect(beamCtxs().every((c) => c.lateral?.role === 'undeclared')).toBe(true);
    expect(spanOutcomes()).toEqual({ VERIFIED: 10, 'SEARCH_EXHAUSTED anchorage': 2, 'SEARCH_EXHAUSTED torsion': 2 });
    expect([...bottomRules()].sort()).toEqual(['ldh']);
  });

  it('the detailing builds every bar end the design verified', () => {
    const c = anchorageCoherence(doc.assemblies.flatMap((a) => a.bars));
    expect(c.mismatches).toEqual([]);
    expect(c.compared).toBeGreaterThan(50);
  });

  it('every designed beam states the assumption: desk, memoria, IFC, workbook', () => {
    const designed = beamCtxs().filter((c) => verificationStore.outcomeFor(c.elementId)?.outcome === 'VERIFIED' && verificationStore.providedFor(c.elementId)?.supportAnchorage?.some((v) => v.position === 'bottom' && v.support === 'end'));
    expect(designed.length).toBeGreaterThan(0);
    const readers = readersOf();
    for (const c of designed) {
      const r = readers(c.elementId);
      expect(r.desk[0], `e${c.elementId}`).toBe('undeclared');
      expect(r.memoria, `e${c.elementId}`).toEqual(['lateral.reading.undeclared', '9.7.3.8.2', 'ℓ ≥ ℓd, ℓdh (fy)', 'lateral.reading.undeclared', 'ok']);
      expect(r.ifc[0]).toBe('not declared: designed as part of the lateral-force-resisting system, fy developed at the face (CIRSOC 201-2025 9.7.3.8.2)');
      expect(r.workbook).toEqual(['9.7.3.8.2', 'ℓ ≥ ℓd, ℓdh (fy)', 'ok', 'lateral.reading.undeclared']);
    }
  });

  it('the conservative design conforms where nothing else holds it; where it does not, the detailing says why', () => {
    // Pieces of the designed spans, by what the desk reads and the memoria rows that are not ok.
    // Before (the beams read outside the system, silently): 73 ok and 5 near the limit, no clash.
    const memo = memoriaInput(tr, 'es');
    const census: Record<string, number> = {};
    for (const c of beamCtxs()) {
      if (verificationStore.outcomeFor(c.elementId)?.outcome !== 'VERIFIED') continue;
      const open = memo.elements.find((e) => e.id === `e${c.elementId}`)!.rows
        // The slab-column joint indicator (`analysis-validity.ts`) is read by its own suite, not here.
        .filter((r) => r.status !== 'ok' && r.titleKey !== 'check.slabColumnJoint').map((r) => r.titleKey);
      // The section's LOCAL reading with the detailing's: the 1 m mesh's point joint holds every
      // member's verdict (`member-verdict.ts`), which its own suite reads.
      const word = verificationStore.getDisplayStatus(c.elementId) === 'fail' ? 'fail' : verificationStore.localStatus(c.elementId);
      const k = `${word}:${[...new Set(open)].join('+')}`;
      census[k] = (census[k] ?? 0) + 1;
    }
    // No designed piece is held by the reading itself: the bars it asked for anchor where they
    // are laid. Measured 15 ok, 5 near the limit (minimum steel) and 34 failing on clashes the
    // coordination left at the corner joints (`detailing.clash.unresolved`), then, once the
    // detailing separated those hooks, 49 and 5 with no clash: those rows are the detailing's.
    if (process.env.LATERAL_PRINT) console.log(census);
    for (const k of Object.keys(census)) expect(k, k).not.toMatch(/check\.rc\.(lateralAnchorage|anchorage)/);
    expect(census['ok:'] ?? 0).toBeGreaterThan(0);
    const ok = beamCtxs().find((c) => verificationStore.localStatus(c.elementId) === 'ok' && verificationStore.providedFor(c.elementId)?.supportAnchorage?.some((v) => v.position === 'bottom' && v.support === 'end'))!;
    // Its local checks pass; its verdict is held by the analysis, never read as approval.
    expect(verificationStore.memberVerdict(ok.elementId).holds.map((h) => h.kind)).toContain('analysis');
    expect(verificationStore.getDisplayStatus(ok.elementId)).toBe('unavailable');
    const ifc = readersOf()(ok.elementId).ifc;
    expect(ifc[0]).toBe('not declared: designed as part of the lateral-force-resisting system, fy developed at the face (CIRSOC 201-2025 9.7.3.8.2)');
    expect(ifc[1]).not.toBe('fails');
  });

  it('a refused beam says it was refused under that assumption', () => {
    const refused = beamCtxs().filter((c) => verificationStore.outcomeFor(c.elementId)?.outcome !== 'VERIFIED');
    expect(refused.length).toBeGreaterThan(0);
    const memo = memoriaInput(tr, 'es');
    for (const c of refused) {
      const el = memo.elements.find((e) => e.id === `e${c.elementId}`)!;
      expect(el.data.find(([k]) => k === 'lateral.symbol')?.[1]).toBe('lateral.reading.undeclared');
      expect(verificationStore.getDisplayStatus(c.elementId)).not.toMatch(/^(ok|warn)$/);
    }
  });
});

describe('the same building, its beams declared outside the system', () => {
  beforeAll(() => {
    building(1, { columnSide: 0.4, lateral: 'gravity' });
    designAndDocument();
  }, 600_000);

  it('designs the 14 spans, every bottom end cut 150 mm past the face, and every reader says it was declared', () => {
    expect(beamCtxs().every((c) => c.lateral?.role === 'gravity' && c.lateral.source === 'project')).toBe(true);
    expect(spanOutcomes()).toEqual({ VERIFIED: 14 });
    expect([...bottomRules()]).toEqual(['9.7.3.8.2']);
    const c = beamCtxs().find((x) => verificationStore.providedFor(x.elementId)?.supportAnchorage?.some((v) => v.position === 'bottom' && v.support === 'end'))!;
    const r = readersOf()(c.elementId);
    expect(r.memoria).toEqual(['lateral.reading.gravity', '9.7.3.8.2', 'ℓ ≥ 150 mm', 'lateral.reading.gravity', 'ok']);
    expect(r.ifc[0]).toBe('not part of the lateral-force-resisting system (declared)');
    expect(r.workbook).toEqual(['9.7.3.8.2', 'ℓ ≥ 150 mm', 'ok', 'lateral.reading.gravity']);
  });
});
