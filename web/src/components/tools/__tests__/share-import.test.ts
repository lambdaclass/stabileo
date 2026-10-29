import { afterEach, expect, it } from 'vitest';
import { decompressSnapshot } from '../../../lib/utils/url-sharing';
import { modelStore } from '../../../lib/store/model.svelte';
import { solve, solveBuckling, initSolver } from '../../../lib/engine/wasm-solver';
import { editorUrl } from '../share';
import { buildModel, EXAMPLE, TOOL_IDS, workedExamples } from '../calculators';

afterEach(() => modelStore.clear());
for (const id of TOOL_IDS) it(`imports ${id} into the editor with the same forces and displacements`, async () => {
  await initSolver();
  for (const p of workedExamples(id)) {
    const original = buildModel(id, { ...p, e: EXAMPLE.e / 2 });
    const snapshot = decompressSnapshot(editorUrl(original, id).split('#data=')[1]);
    expect(snapshot).not.toBeNull();
    modelStore.restore(snapshot!);
    const imported = modelStore.buildSolverInput(false)!;
    expect(imported).not.toBeNull();
    expect([...imported.materials.values()][0].e).toBe(EXAMPLE.e / 2);
    const a = solve(original), b = solve(imported);
    expect(b.displacements).toEqual(a.displacements);
    expect(b.reactions).toEqual(a.reactions);
    if (id === 'column-buckling') expect(solveBuckling(imported, 1).modes[0].loadFactor).toBe(solveBuckling(original, 1).modes[0].loadFactor);
  }
});
