/**
 * «Size» iterates until it verifies (QA of 20-oct: «al dimensionar… lo que uno hace es iterar las
 * armaduras hasta que verifiquen, no existe dimensionar sin verificar»): the span fixture on its
 * 30×30 columns refuses every span for its anchorage (`design-anchorage-coherence.test.ts`), no
 * bar hooking to ℓdh behind the column's cage. Sized with its sections free to grow, the columns
 * the beams anchor in grow along them, the structure is solved and designed again, and the nominal anchorage refusals clear. Final detailing still has blockers, which the
 * run must report rather than certifying the building; each physical column keeps one section from bottom to top; the changes are
 * reported with their reason; and one undo puts every section back.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import { building } from './span-fixture';
import { designWithResizing, plannedGrowth, RESIZE_STEP_M } from '../design-resize';
import { physicalGroups } from '../physical';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const sectionOf = (id: number) => modelStore.sections.get(modelStore.elements.get(id)!.sectionId)!;
const outcomes = () => [...verificationStore.contexts.values()].map((c) => verificationStore.outcomeFor(c.elementId)?.outcome);

describe('«Size» on the span fixture at 30×30', () => {
  it('clears nominal anchorage refusals but reports the remaining final blockers, as one undo step', async () => {
    building(1);
    const before = new Map([...modelStore.elements.values()].map((e) => [e.id, e.sectionId]));
    const phases: string[] = [];
    const run = await designWithResizing({ edited: 'overwrite', steel: false }, { progress: (p) => phases.push(`${p.phase}${p.round}`) });

    expect(run.stopped).toBe('blocked');
    expect(run.report.levels.some(l => l.counts.fail + l.counts.provisional + l.counts.unavailable + l.counts.stale > 0)).toBe(true);
    expect(run.rounds).toBeGreaterThan(0);
    expect(phases[0]).toBe('design0');
    expect(phases).toContain('resize1');
    // No nominal section refusal remains; this does not certify the final detail.
    expect(outcomes().every((o) => o === 'VERIFIED' || o === 'PROVISIONAL_BIAXIAL')).toBe(true);
    expect(plannedGrowth()).toEqual([]);

    // The changes: columns, for the anchorage of the beams framing in, 5 cm a round.
    expect(run.changes.length).toBeGreaterThan(0);
    for (const c of run.changes) {
      expect(c.kind).toBe('column');
      expect(c.reason).toBe('anchorage');
      expect(Math.max(c.to.b - c.from.b, c.to.h - c.from.h)).toBeCloseTo(RESIZE_STEP_M, 6);
    }
    // A physical column holds one section from bottom to top.
    for (const g of physicalGroups().filter((x) => x.physical.kind === 'column')) {
      expect(new Set((g.members.elements ?? []).map((id) => modelStore.elements.get(id)!.sectionId)).size, g.name).toBe(1);
    }
    const grown = [...new Set(run.changes.flatMap((c) => c.elementIds))];
    expect(grown.every((id) => (sectionOf(id).b ?? 0) > 0.3 || (sectionOf(id).h ?? 0) > 0.3)).toBe(true);

    // One undo: every section as it was.
    historyStore.undo();
    for (const [id, s] of before) expect(modelStore.elements.get(id)?.sectionId, `e${id}`).toBe(s);
  }, 900_000);

  it('runs once, growing nothing, where it is told to keep the sections', async () => {
    building(1);
    const run = await designWithResizing({ edited: 'overwrite', steel: false, resize: false });
    expect(run.rounds).toBe(0);
    expect(run.changes).toEqual([]);
    expect(run.stopped).toBe('maxRounds');
    expect(outcomes().some((o) => o === 'SEARCH_EXHAUSTED')).toBe(true);
  }, 900_000);
});
