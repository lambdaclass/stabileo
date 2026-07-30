/**
 * The full production chain, end to end, from the committed .ded project.
 *
 *   deserializeProject() -> modelStore.restore()
 *     -> modelStore.solveCombinations3DParallel()    real WASM
 *     -> resultsStore.setCombinationResults3D()
 *     -> designRunStore.computeDemands()             production command 1
 *     -> designRunStore.runCodeCheck()               production command 2
 *     -> designRunStore.designAll()                  production command 3 -> provided reinforcement
 *     -> detailingStore.generate()                   beam/column detailing
 *     -> detailingStore.generateFloors()             footing detailing
 *     -> non-empty footing DetailingAssembly
 *
 * Nothing is seeded: no forces, no reinforcement, no candidates, no bars. Every case restores
 * and clears first, so no state leaks between them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { designRunStore } from '../../store/design-run.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { deserializeProject } from '../../store/file';
import { isSolverReady } from '../../engine/wasm-solver';
import type { DetailingAssembly } from '../../engine/detailing/assembly';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';

const FIXTURE = new URL('../__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url);

interface ChainResult {
  footing: { id: number; nodeId: number; columnElementId?: number | null; cover: number };
  designed: boolean;
  designError: string | null;
  columnOutcome: unknown;
  floorAssemblies: DetailingAssembly[];
  footingRunTrace: string[];
  unsupportedKeys: string[];
}

/** Restore and run the real chain. `withDesign` toggles the column-design commands. */
async function runChain(withDesign: boolean): Promise<ChainResult> {
  // Isolation: every case starts from a clean store set.
  modelStore.clear();
  resultsStore.clear();
  detailingStore.clear();
  designRunStore.resetMarks();

  expect(deserializeProject(readFileSync(FIXTURE, 'utf8'))).toBe(true);
  const footing = [...modelStore.model.footings.values()][0];
  expect(footing, 'restored footing').toBeTruthy();

  expect(isSolverReady(), 'real WASM solver, not the Vite stub').toBe(true);
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  expect(typeof solved).not.toBe('string');
  const r = solved as { perCase: Map<number, never>; perCombo: Map<number, never>; envelope: never };
  resultsStore.setCombinationResults3D(r.perCase as never, r.perCombo as never, r.envelope as never);

  let designed = false;
  let designError: string | null = null;
  if (withDesign) {
    const d = designRunStore.computeDemands();
    if (!d.ok) designError = `computeDemands: ${designRunStore.lastError ?? 'failed'}`;
    if (!designError) {
      const c = designRunStore.runCodeCheck();
      if (!c.ok) designError = `runCodeCheck: ${designRunStore.lastError ?? 'failed'}`;
    }
    if (!designError) {
      const a = designRunStore.designAll();
      if (!a.ok) designError = `designAll: ${designRunStore.lastError ?? 'failed'}`;
      else designed = true;
    }
    if (designed) detailingStore.generate({ verifierId: 'cirsoc201.provided.v2.2025' });
  }

  const floorRun = detailingStore.generateFloors({ verifierId: 'cirsoc201.provided.v2.2025' });
  const floorAssemblies = (floorRun as { assemblies?: DetailingAssembly[] } | null)?.assemblies ?? [];
  const fr = detailingStore.lastFootingRun;

  return {
    footing: footing as never,
    designed,
    designError,
    columnOutcome: footing.columnElementId != null
      ? verificationStore.outcomeFor(footing.columnElementId)
      : null,
    floorAssemblies,
    footingRunTrace: fr?.trace ?? [],
    unsupportedKeys: (fr?.outcomes ?? []).flatMap(
      (o) => o.unsupported.map((m) => String((m as { key?: string }).key ?? '')),
    ),
  };
}

describe('production chain: restored project -> column design -> non-empty footing assembly', () => {
  beforeEach(() => { modelStore.clear(); });

  it('WITHOUT column design the existing structured blocker still appears', async () => {
    const c = await runChain(false);
    const bars = c.floorAssemblies.flatMap((a) => a.bars);
    expect(bars.length, 'no column steel means no dowels').toBe(0);
    expect(c.unsupportedKeys, 'and the reason is explicit, never silent')
      .toContain('footing.run.noColumnBars');
  });

  it('the production design commands run on the restored project', async () => {
    const c = await runChain(true);
    console.log('CHAIN designed=', c.designed, 'error=', c.designError);
    console.log('CHAIN trace=', JSON.stringify(c.footingRunTrace));
    console.log('CHAIN unsupported=', JSON.stringify([...new Set(c.unsupportedKeys)]));
    expect(c.designError, 'the production design commands must succeed').toBeNull();
    expect(c.designed).toBe(true);
  });

  it('the footing’s referenced column receives provided reinforcement', async () => {
    const c = await runChain(true);
    const colId = c.footing.columnElementId;
    expect(colId, 'the fixture references a column').toBeTruthy();
    const o = c.columnOutcome as { accepted?: unknown; kind?: string } | null;
    console.log('CHAIN columnElementId=', colId, 'outcomeKind=', o?.kind, 'hasAccepted=', !!o?.accepted);
    console.log('CHAIN accepted=', JSON.stringify(o?.accepted ?? null).slice(0, 400));
    expect(o, 'the designed column has an outcome').toBeTruthy();
    expect(o!.accepted, 'and provided reinforcement').toBeTruthy();
  });

  it('the footing assembly is non-empty and production-derived', async () => {
    const c = await runChain(true);
    const summary = c.floorAssemblies.map((a) => ({
      id: a.id, elements: a.elementIds.length, bars: a.bars.length, marks: a.marks.length,
      conflicts: a.conflicts.length, state: a.state, maturity: a.maturity,
      detRev: a.detailingRevision, demRev: a.demandRevision, unsupported: a.unsupported.length,
    }));
    console.log('CHAIN assemblies=', JSON.stringify(summary, null, 2));
    const bars: BarPath[] = c.floorAssemblies.flatMap((a) => a.bars);
    const marks = c.floorAssemblies.flatMap((a) => a.marks);
    console.log('CHAIN barRoles=', JSON.stringify([...new Set(bars.map((b) => b.role))]));
    console.log('CHAIN barCount=', bars.length, 'markCount=', marks.length);

    expect(c.floorAssemblies.length, 'at least one floor assembly').toBeGreaterThan(0);
    expect(bars.length, 'the footing assembly carries reinforcement').toBeGreaterThan(0);
    expect(marks.length, 'and marks').toBeGreaterThan(0);

    for (const b of bars) {
      expect(b.id).toBeTruthy();
      expect(b.diameterMm).toBeGreaterThan(0);
      expect(b.role).toBeTruthy();
      expect(b.ownerElementIds.length).toBeGreaterThan(0);
      expect(b.segments.length).toBeGreaterThan(0);
      expect(b.cuttingLength).toBeGreaterThan(0);
      for (const s of b.segments) {
        expect(['straight', 'arc']).toContain(s.kind);
        for (const p of [s.start, s.end]) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
        }
        if (s.kind === 'arc') {
          expect(s.radius).toBeGreaterThan(0);
          // Exactness may only be claimed when the centre is present.
          if (s.centre) {
            expect(Number.isFinite(s.centre.x)).toBe(true);
          }
        }
      }
    }
    const arcs = bars.flatMap((b) => b.segments.filter((s) => s.kind === 'arc'));
    console.log('CHAIN arcs=', arcs.length, 'withCentre=', arcs.filter((s) => !!s.centre).length);
  });

  it('regenerating the chain reproduces the same bar and mark counts', async () => {
    const a = await runChain(true);
    const b = await runChain(true);
    const count = (c: ChainResult) => ({
      bars: c.floorAssemblies.flatMap((x) => x.bars).length,
      marks: c.floorAssemblies.flatMap((x) => x.marks).length,
      assemblies: c.floorAssemblies.length,
    });
    expect(count(a)).toEqual(count(b));
  });
});
