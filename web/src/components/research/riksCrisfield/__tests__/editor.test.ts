import { initSolver, solveArcLength } from '../../../../lib/engine/wasm-solver';
import { beforeAll, describe, expect, it } from 'vitest';
import caseData from '../../../../../../engine/tests/benchmarks/arc_length_snap_through.json';
import { codeShareUrl, readCodeFragment } from '../../../../lib/model/code/share';
import { DEFAULT_PARAMETERS, inputFor, type CaseFile } from '../benchmark';
import { editorSnapshot } from '../editor';

const data = caseData as CaseFile;

describe('Riks–Crisfield editor sharing', () => {
  beforeAll(async () => { await initSolver(); });
  it('round-trips the production case through the existing model-code link', () => {
    const c = data.cases[0];
    const parameters = { ...DEFAULT_PARAMETERS(c), riseSpan: 0.04, direction: 'upward' as const };
    const snapshot = editorSnapshot(c, parameters);
    const { url } = codeShareUrl(snapshot, 'https://stabileo.test/app/basic');
    expect(url).toContain('#code=');
    const restored = readCodeFragment(url.slice(url.indexOf('#'))).snapshot!;
    expect(restored.analysisMode).toBe('2d');
    expect(restored.nodes).toHaveLength(3);
    expect(restored.elements).toHaveLength(2);
    expect(restored.nodes!.find(([id]) => id === c.apex.nodeId)![1].y).toBeCloseTo(0.16, 12);
    expect(restored.loads![0].data.fz).toBe(50);
    expect(restored.materials![0][1].e).toBe(200_000);
    expect(restored.supports).toHaveLength(2);
    const original = inputFor(c, parameters);
    const restoredSolver = {
      nodes: Object.fromEntries(restored.nodes!.map(([id, n]) => [id, { id, x: n.x, z: n.y }])),
      materials: Object.fromEntries(restored.materials!.map(([id, m]) => [id, { id, e: m.e, nu: m.nu }])),
      sections: Object.fromEntries(restored.sections!.map(([id, v]) => [id, { id, a: v.a, iz: v.iz }])),
      elements: Object.fromEntries(restored.elements!.map(([id, e]) => [id, { id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ, materialId: e.materialId, sectionId: e.sectionId, hingeStart: e.releaseI?.mz === true, hingeEnd: e.releaseJ?.mz === true }])),
      supports: Object.fromEntries(restored.supports!.map(([id, v]) => [id, { id, nodeId: v.nodeId, type: v.type }])),
      loads: restored.loads!.map((l) => ({ type: l.type, data: { nodeId: l.data.nodeId, fx: l.data.fx, fz: l.data.fz, my: l.data.my } })),
      constraints: [], connectors: {},
    };
    expect(restoredSolver).toEqual(original.solver);
    const before = solveArcLength(original);
    const after = solveArcLength({ ...original, solver: restoredSolver });
    expect(after.steps).toEqual(before.steps);
    expect(after.results.displacements).toEqual(before.results.displacements);
    expect(after.results.displacements.some((d: { uz: number }) => Math.abs(d.uz) > 0)).toBe(true);
  });
});
