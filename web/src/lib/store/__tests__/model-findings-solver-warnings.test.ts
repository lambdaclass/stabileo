/**
 * What the engine warns about beyond the pre-solve gates still reaches the panels,
 * once, and the findings survive a combination view reached without a single solve.
 *
 * The 2D solver reports a probable mechanism and ill-conditioning only in
 * `structuredDiagnostics` — its `solverDiagnostics` is empty — so keeping only the
 * gates' phases hid them. The 3D solver repeats its conditioning warnings in the
 * legacy list, without a code, so keeping them must not list them twice.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve, solve3D } from '../../engine/wasm-solver';
import { resultsStore } from '../results.svelte';
import { mergeFindings } from '../../engine/model-findings';
import type { SolverInput } from '../../engine/types';
import type { SolverInput3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });

/** A 6 m cantilever under a load large enough to move its tip thousands of spans. */
function flexibleCantilever2D(): SolverInput {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 6, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -1e9, my: 0 } }],
  } as unknown as SolverInput;
}

/** A 3D cantilever whose bending and torsion stiffness are negligible beside its axial stiffness. */
function illConditioned3D(): SolverInput3D {
  const frame = (id: number, i: number, j: number) => ({
    id, type: 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId: 1,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
  });
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 1e3, iy: 1e-12, iz: 1e-12, j: 1e-12 }]]),
    elements: new Map([[1, frame(1, 1, 2)]]),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0 } }],
  } as unknown as SolverInput3D;
}

describe('solver warnings reach the panels', () => {
  it('2D: a probable mechanism the engine flags is shown', () => {
    const res: any = solve(flexibleCantilever2D());
    expect((res.structuredDiagnostics ?? []).map((d: any) => d.code)).toContain('excessive_displacement');
    expect(res.solverDiagnostics ?? []).toEqual([]); // the 2D solver says it nowhere else
    resultsStore.setResults(res);
    const shown = resultsStore.structuredDiagnostics.find((d) => d.code === 'excessive_displacement');
    expect(shown?.severity).toBe('warning');
    expect(shown?.source).toBe('model');
    // And the run's own notes still stay out.
    expect(resultsStore.structuredDiagnostics.map((d) => d.code)).not.toContain('dense_lu');
  });

  it('3D: a conditioning warning the legacy list repeats in other words is listed once', () => {
    const res: any = solve3D(illConditioned3D());
    resultsStore.setResults3D(res);
    const merged = mergeFindings(resultsStore.solverDiagnostics3D, resultsStore.structuredDiagnostics3D);
    // The engine reports the near-zero diagonals in both lists, in different words.
    expect((res.solverDiagnostics ?? []).some((d: any) => d.category === 'conditioning')).toBe(true);
    expect((res.structuredDiagnostics ?? []).some((d: any) => d.phase === 'conditioning')).toBe(true);
    const conditioning = merged.filter((d) => /near-zero diagonal/i.test(d.message));
    expect(conditioning.length).toBe(1);
  });
});
