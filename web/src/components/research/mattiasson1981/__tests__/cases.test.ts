import { describe, expect, it } from 'vitest';
import { cases, compare, inputFor, runCases, viewerData, type Output } from '../cases';
import { editorSnapshot, editorURL } from '../editor';
import { prepareSharedSnapshot } from '../../../../lib/utils/share-snapshot';
import { buildSolverInput2D, type ModelData } from '../../../../lib/engine/solver-service';
import { initSolver, solveCorotational2D } from '../../../../lib/engine/wasm-solver';
import LZString from 'lz-string';

const c = cases.find(c => c.parameter === 1 && c.kind === 'force')!;
function output(): Output {
  return { converged: true, loadFactor: 1, results: { displacements: Object.values(c.input.nodes).map(n => ({ nodeId: n.id, ux: -c.reference![0] * c.length, uz: -c.reference![1] * c.length, ry: 0 })) } };
}
describe('Mattiasson evidence', () => {
  it('uses independently checked elliptic-integral references and separates intermediate and regression cases', () => {
    expect(cases.filter(c => c.reference).map(c => [c.parameter, c.reference])).toEqual([[1,[.056433,.301721]],[2,[.160642,.493457]],[5,[.387628,.713792]],[10,[.554996,.810609]]]);
    expect(cases.at(-1)!.input.loads[0].data.my).toBe(10000);
    expect(cases.at(-1)!.reference).toBeNull();
  });
  it('requires both signed components, complete loading and finite shape', () => {
    expect(compare(c, output()).pass).toBe(true);
    const wrong = output(); wrong.results.displacements.at(-1)!.ux *= -1;
    expect(compare(c, wrong).pass).toBe(false);
    const missing = output(); missing.results.displacements.pop();
    expect(() => compare(c, missing)).toThrow();
    const nonfinite = output(); nonfinite.results.displacements[0].uz = NaN;
    expect(() => compare(c, nonfinite)).toThrow();
    expect(() => compare(c, { ...output(), converged: false })).toThrow();
    expect(() => compare(c, { ...output(), loadFactor: .9 })).toThrow();
    expect(viewerData(c).displacement).toBeNull();
    expect(viewerData(c, compare(c, output())).cells).toHaveLength(32);
  });
  it('round trips the shared input through the editor without changing the solve', async () => {
    await initSolver();
    for (const c of [cases[1], cases.at(-1)!]) {
      const snap = editorSnapshot(c);
      expect(JSON.parse(LZString.decompressFromEncodedURIComponent(editorURL(c, '/app').split('#data=')[1]))).toEqual(snap);
      expect(prepareSharedSnapshot(snap)).not.toBeNull();
      expect(snap.includeSelfWeight).toBe(false);
      const model = { ...snap, connectors: new Map(), plates: new Map(), quads: new Map() } as unknown as ModelData;
      for (const key of ['nodes','materials','sections','elements','supports'] as const) (model as unknown as Record<string, unknown>)[key] = new Map(snap[key] as [number, unknown][]);
      const input = buildSolverInput2D(model, false)!;
      const args = [c.solver.maxIter, c.solver.tolerance, c.solver.nIncrements] as const;
      const direct = solveCorotational2D(inputFor(c), ...args);
      const shared = solveCorotational2D(input, ...args);
      expect(shared.converged).toBe(direct.converged);
      expect(shared.results.displacements).toEqual(direct.results.displacements);
    }
  });
  it('keeps failures visible and supports cancellation between solves', async () => {
    const rows = await runCases();
    expect(rows).toHaveLength(cases.length);
    expect(rows.filter(r => r.pass).map(r => r.id)).toEqual(['force-1', 'force-2', 'force-5']);
    expect(rows.find(r => r.id === 'force-1')!.u).toBeCloseTo(.055782721871, 9);
    expect(rows.every(r => r.failure ? r.pass === false && r.displacement === undefined : Number.isFinite(r.u) && Number.isFinite(r.v))).toBe(true);
    expect(await runCases(undefined, () => true)).toEqual([]);
  });
});
