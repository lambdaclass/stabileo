/**
 * The production chain, as a helper the CAD-handoff tests share.
 *
 * Not a spec file — Vitest collects only `*.test.ts`, so this is imported rather than run.
 *
 * It exists because every manifest assertion needs the SAME starting point: the committed
 * `.ded` project, restored through `deserializeProject` → `modelStore.restore`, solved by the
 * real WASM solver, then designed and detailed by the production commands. Nothing is seeded:
 * no forces, no reinforcement, no candidates, no bars, and above all no assembly and no
 * manifest. A test that injected a completed assembly would prove the exporter can serialise a
 * literal, which is not the claim being made.
 */

import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { designRunStore } from '../../store/design-run.svelte';
import { deserializeProject } from '../../store/file';
import { isSolverReady } from '../../engine/wasm-solver';
import type { DetailingAssembly } from '../../engine/detailing/assembly';

export const FIXTURE_URL = new URL('../__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url);

/** The fixture bytes, so a test can checksum exactly what it restored. */
export function fixtureText(): string {
  return readFileSync(FIXTURE_URL, 'utf8');
}

/** A translator that renders the key and its parameters, so a test can assert on the key. */
export const keyTranslate = (k: string, params?: Record<string, unknown>): string =>
  params && Object.keys(params).length > 0 ? `${k} ${JSON.stringify(params)}` : k;

export interface ChainOutcome {
  /** The floor assemblies the production run produced. */
  assemblies: DetailingAssembly[];
  /** The persisted assemblies, which is what the export adapter reads. */
  persisted: DetailingAssembly[];
}

/**
 * Restore the fixture and run the full production chain.
 *
 * Every call clears first, so no state leaks between cases.
 */
export async function runProductionChain(): Promise<ChainOutcome> {
  modelStore.clear();
  resultsStore.clear();
  detailingStore.clear();
  designRunStore.resetMarks();

  expect(deserializeProject(fixtureText()), 'the committed .ded project restores').toBe(true);
  expect(isSolverReady(), 'real WASM solver, not the Vite stub').toBe(true);

  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  expect(typeof solved, 'the solver returned results rather than an error string').not.toBe('string');
  const r = solved as { perCase: never; perCombo: never; envelope: never };
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);

  expect(designRunStore.computeDemands().ok, 'computeDemands').toBe(true);
  expect(designRunStore.runCodeCheck().ok, 'runCodeCheck').toBe(true);
  expect(designRunStore.designAll().ok, 'designAll').toBe(true);

  detailingStore.generate({ verifierId: 'cirsoc201.provided.v2.2025' });
  const floorRun = detailingStore.generateFloors({ verifierId: 'cirsoc201.provided.v2.2025' });

  return {
    assemblies: (floorRun as { assemblies?: DetailingAssembly[] } | null)?.assemblies ?? [],
    // Read the persisted store, not the `$derived` view: a `$derived` does not recompute
    // inside the synchronous call that wrote it, which is the same hazard `generateFloors`
    // documents at its own merge.
    persisted: modelStore.model.detailing?.assemblies ?? [],
  };
}
