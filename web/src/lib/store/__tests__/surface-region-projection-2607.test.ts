import { beforeEach, describe, expect, it } from 'vitest';
import { caseMassLoads, withMassSource } from '../../engine/dynamics/mass-source-model';
import { buildSolverInput3D } from '../../engine/solver-service';
import { tp } from '../../i18n';
import type { AnalysisResults3D } from '../../engine/types-3d';
import type { ShellLoadSpec } from '../../engine/shell-load-integration';
import { historyStore, modelStore, uiStore } from '..';
import { deserializeProject, serializeProject } from '../file';

const footprint = (left: number, right: number): [number, number, number][] => [
  [left, -1, 0], [right, -1, 0], [right, 3, 0], [left, 3, 0],
];

function shell(kind: 'quad' | 'plate', rise = 0) {
  const nodes = [
    modelStore.addNode(0, 0, 0),
    modelStore.addNode(0, 2, 0),
    modelStore.addNode(rise, 2, 2),
    modelStore.addNode(rise, 0, 2),
  ] as [number, number, number, number];
  for (const node of nodes) modelStore.addSupport(node, 'fixed3d');
  return kind === 'quad' ? modelStore.addQuad(nodes, 1, 0.15) : modelStore.addPlate([nodes[0], nodes[1], nodes[2]], 1, 0.15);
}

const solveRoutes = ['case', 'case async', 'linear', 'linear async', 'pdelta', 'pdelta async', 'uplift', 'uplift async', 'notional', 'restored project'] as const;

describe('clipped shell pressure #2607', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; });

  it.each([
    ...solveRoutes.map(route => ({ kind: 'quad', route, rise: 0, frame: 'global' } as const)),
    { kind: 'plate', route: 'case', rise: 0, frame: 'global' },
    { kind: 'plate', route: 'case async', rise: 0, frame: 'local' },
    { kind: 'quad', route: 'case', rise: 0, frame: 'projected' },
    { kind: 'quad', route: 'case', rise: 1e-9, frame: 'global' },
  ] as const)('refuses an applicable $frame pressure on $kind through $route (offset $rise)', async ({
    kind, route, rise, frame,
  }) => {
    const id = shell(kind, rise);
    const caseId = modelStore.model.loadCases.find(c => c.type === 'L')!.id;
    const name = modelStore.model.loadCases.find(c => c.id === caseId)!.name;
    modelStore.addSurfaceLoad3D(id, 3, caseId, {
      ...(kind === 'plate' ? { on: 'plate' } : {}),
      frame, dir: frame === 'projected' ? [1, 0, 0] : [0, 0, -1],
      region: { normal: [0, 0, 1], points: footprint(-1, 1) },
    });
    for (const combo of modelStore.model.combinations) modelStore.removeCombination(combo.id);
    if (route === 'notional') {
      expect(modelStore.updateLoadCaseFields(caseId, { reference: true })).toBe(true);
      const notional = modelStore.addLoadCase('Notional from clipped pressure', 'L');
      expect(modelStore.updateLoadCaseFields(notional, { notional: { sourceCaseId: caseId, ratio: 0.002, dir: '+X' } })).toBe(true);
      modelStore.addCombination('Notional from clipped pressure', [{ caseId: notional, factor: 1 }]);
    } else {
      modelStore.addCombination('Clipped pressure', [{ caseId, factor: 2 }]);
    }
    if (route.startsWith('uplift')) modelStore.updateSupport(1, { uplift: true });
    modelStore.setAnalysis({ perCombination: route.startsWith('pdelta') ? 'pdelta' : 'linear' });
    if (route === 'restored project') {
      const saved = serializeProject();
      modelStore.clear();
      expect(deserializeProject(saved)).toBe(true);
    }

    const result = route === 'case' || route === 'restored project' ? modelStore.solve3D(false, false, true)
      : route === 'case async' ? await modelStore.solve3DAsync(false, false, true)
      : route.endsWith('async') ? await modelStore.solveCombinations3DParallel(false, false, true)
      : modelStore.solveCombinations3D(false, false, true);
    const refusal = tp('svc.accountingSurfaceProjection', { case: `#${caseId} (${name})`, id });
    const reactions = typeof result === 'object' && result
      ? ('reactions' in result ? result.reactions : result.perCase.get(caseId)?.reactions)
        ?.map(({ fx, fy, fz }) => [fx, fy, fz]) : undefined;
    expect(typeof result === 'string' ? result : JSON.stringify({ reactions, result: typeof result })).toBe(refusal);
  });

  it.each([false, true])('refuses singular pressure in mass extraction (input %s)', withInput => {
    const id = shell('quad');
    const model = modelStore.model;
    const live = model.loadCases.find(c => c.type === 'L')!;
    modelStore.addSurfaceLoad3D(id, 3, live.id, {
      region: { normal: [0, 0, 1], points: footprint(-1, 1) },
    });
    const input = buildSolverInput3D({ ...model, loads: [] }, false, false)!;
    const refusal = tp('svc.accountingSurfaceProjection', { case: `#${live.id} (${live.name})`, id });
    expect(() => withInput
      ? withMassSource(model, model.loadCases, { kind: 'custom', factors: [{ caseId: live.id, factor: 1 }] }, input)
      : caseMassLoads(model, [{ caseId: live.id, name: live.name, type: live.type, factor: 1, basis: 'stated' }], false)).toThrow(refusal);
  });

  it('keeps shell pressure on the spatial model path', async () => {
    const id = shell('quad');
    modelStore.addSurfaceLoad3D(id, 3, undefined, {
      region: { normal: [0, 0, 1], points: footprint(-1, 1) },
    });
    const refusal = tp('svc.shellsRequirePro3d');
    expect(modelStore.solve()).toBe(refusal);
    expect(await modelStore.solveAsync()).toBe(refusal);
    expect(modelStore.solveCombinations()).toBe(refusal);
  });

  it.each([
    { label: 'regular overlap', rise: 4e-9, points: footprint(-1, 1), loaded: true },
    { label: 'disjoint footprint', rise: 0, points: footprint(1, 2), loaded: false },
    { label: 'inside an opening', rise: 0, points: footprint(-2, 2), holes: [footprint(-1, 1)], loaded: false },
    { label: 'zero projected pressure', rise: 0, points: footprint(-1, 1), frame: 'projected', loaded: false },
  ] satisfies Array<{ label: string; rise: number; points: [number, number, number][]; holes?: [number, number, number][][]; frame?: ShellLoadSpec['frame']; loaded: boolean }>)(
    'solves $label for the authored region', ({ rise, points, holes, frame, loaded }) => {
      const id = shell('quad', rise);
      modelStore.addSurfaceLoad3D(id, 3, undefined, { frame, region: { normal: [0, 0, 1], points, holes } });
      const result = modelStore.solve3D(false, false, true);
      expect(result, String(result)).toEqual(expect.objectContaining({ reactions: expect.any(Array) }));
      const { reactions } = result as AnalysisResults3D;
      expect(reactions.reduce((sum, r) => sum + r.fz, 0)).toBeCloseTo(loaded ? 3 * 2 * Math.hypot(rise, 2) : 0, 10);
    },
  );
});
