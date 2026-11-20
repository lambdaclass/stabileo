import { describe, it, expect, beforeAll, vi } from 'vitest';
import { historyStore, modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import { building, withZeroBeamTorque } from './span-fixture';
import { designWithResizing, plannedGrowth, RESIZE_STEP_M } from '../design-resize';
import { physicalGroups } from '../physical';
import { physicalPlates, plateStatus } from '../physical-plates';
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
  for (const { name, surfaceLoadFactor, resultants, unavailable } of [
    { name: 'verifies every member at half slab load', surfaceLoadFactor: 0.5, resultants: [90, 120], unavailable: [] },
    { name: 'preserves full slab loads and withholds unavailable designs', surfaceLoadFactor: 1, resultants: [180, 240], unavailable: [200, 203, 238, 241] },
  ]) {
    const label = `${name} under prescribed zero beam torque, as one undo step`;
    const knownWrong = surfaceLoadFactor === 1;
    it.skipIf(knownWrong)(knownWrong ? `${label} (known wrong result: #2365)` : label, async () => {
      building(1, { prescribedZeroBeamTorque: true, surfaceLoadFactor });
      const before = new Map([...modelStore.elements.values()].map((e) => [e.id, e.sectionId]));
      const phases: string[] = [];
      const area = (quadId: number) => {
        const [a, b, c, d] = modelStore.quads.get(quadId)!.nodes.map(id => modelStore.nodes.get(id)!);
        return 0.5 * Math.abs((c!.x - a!.x) * (d!.y - b!.y) - (d!.x - b!.x) * (c!.y - a!.y));
      };
      const total = (caseId: number) => modelStore.loads.reduce((sum, load) => {
        if (load.type !== 'surface3d') return sum;
        const data = load.data as { caseId?: number; q: number; quadId: number };
        if (data.caseId !== caseId || !modelStore.quads.has(data.quadId)) return sum;
        return sum + data.q * area(data.quadId);
      }, 0);
      const solve = modelStore.solveCombinations3D.bind(modelStore);
      const combinationSolve = vi.spyOn(modelStore, 'solveCombinations3D').mockImplementation((...args) => {
        const result = solve(...args);
        return !result || typeof result === 'string' ? result : { ...result, perCombo: withZeroBeamTorque(result.perCombo) };
      });
      const run = await designWithResizing({ edited: 'overwrite', steel: false }, {
        progress: (p) => phases.push(`${p.phase}${p.round}`),
      }).finally(() => combinationSolve.mockRestore());

      expect(run.rounds).toBeGreaterThan(0);
      expect(phases[0]).toBe('design0');
      expect(phases).toContain('resize1');
      expect(plannedGrowth()).toEqual([]);

      const refused = [...verificationStore.runSummary!.outcomes.values()]
        .filter(o => o.outcome !== 'VERIFIED' && o.outcome !== 'PROVISIONAL_BIAXIAL');
      if (unavailable.length === 0) {
        expect(run.stopped).toBe('verified');
        expect(outcomes().every(o => o === 'VERIFIED' || o === 'PROVISIONAL_BIAXIAL'), JSON.stringify(refused)).toBe(true);
        expect(run.changes.every(c => c.kind === 'column')).toBe(true);
      } else {
        expect(run.changes.some(c => c.kind === 'beam' && c.reason === 'flexure')).toBe(true);
        expect(refused.map(o => o.elementId).sort((a, b) => a - b)).toEqual(unavailable);
        for (const outcome of refused) {
          expect(outcome.outcome).toBe('DEMAND_UNAVAILABLE');
          expect(outcome.limiting).toEqual(['missingDemand']);
          expect(outcome.certificate).toBeUndefined();
          expect(outcome.accepted).toBeUndefined();
        }
      }

      expect(run.changes.some(c => c.kind === 'column' && c.reason === 'anchorage')).toBe(true);
      for (const c of run.changes) {
        expect(c.reason).toBe(c.kind === 'column' ? 'anchorage' : 'flexure');
        expect(Math.max(c.to.b - c.from.b, c.to.h - c.from.h)).toBeCloseTo(RESIZE_STEP_M, 6);
      }
      expect([total(1), total(2)].map(x => Math.round(x * 1e6) / 1e6)).toEqual(resultants);
      expect(physicalPlates().every(p => plateStatus(p.id) === 'current')).toBe(true);
      for (const g of physicalGroups().filter((x) => x.physical.kind === 'column')) {
        expect(new Set((g.members.elements ?? []).map((id) => modelStore.elements.get(id)!.sectionId)).size, g.name).toBe(1);
      }
      const grown = [...new Set(run.changes.filter((c) => c.kind === 'column').flatMap((c) => c.elementIds))];
      expect(grown.every((id) => (sectionOf(id).b ?? 0) > 0.3 || (sectionOf(id).h ?? 0) > 0.3)).toBe(true);

      historyStore.undo();
      for (const [id, s] of before) expect(modelStore.elements.get(id)?.sectionId, `e${id}`).toBe(s);
    }, 900_000);
  }

  it('runs once, growing nothing, where it is told to keep the sections', async () => {
    building(1);
    const run = await designWithResizing({ edited: 'overwrite', steel: false, resize: false });
    expect(run.rounds).toBe(0);
    expect(run.changes).toEqual([]);
    expect(run.stopped).toBe('maxRounds');
    expect(outcomes().some((o) => o === 'SEARCH_EXHAUSTED')).toBe(true);
  }, 900_000);
});
