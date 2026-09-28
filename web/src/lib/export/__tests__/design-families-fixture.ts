/**
 * Shared set-up for the design-families tests.
 *
 * The suite is split across files because every heavy case loads and solves the
 * seven-storey example and designs it, and one file runs its cases one after
 * another: together they were 210 s on a CI runner, the longest file in the unit
 * pass by four times and the floor under its wall-clock time. Split, the files
 * run on separate workers.
 */
import { expect } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { designRunStore } from '../../store/design-run.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { isSolverReady } from '../../engine/wasm-solver';
import type { DesignFamily, DesignRunReport } from '../../engine/design/design-families';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

/** Load and solve, ready for a design run. */
export async function ready(example: string) {
  modelStore.clear();
  resultsStore.clear();
  detailingStore.clear();
  designRunStore.resetMarks();
  verificationStore.clear();
  await modelStore.loadExample(example);
  expect(isSolverReady()).toBe(true);
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  const r = solved as { perCase: Map<number, never>; perCombo: Map<number, never>; envelope: never };
  resultsStore.setCombinationResults3D(r.perCase as never, r.perCombo as never, r.envelope as never);
}

export function familyOf(report: DesignRunReport, f: DesignFamily) {
  return report.families.find((x) => x.family === f)!;
}

/** Every family that produced steel in the persisted detailing. */
export function familiesWithSteel(): Set<string> {
  const out = new Set<string>();
  for (const a of modelStore.model.detailing?.assemblies ?? []) {
    for (const rec of a.families ?? []) {
      if ((rec.barIds ?? []).length > 0) out.add(rec.family);
    }
  }
  return out;
}
