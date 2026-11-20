import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { solveCombinations2D, validateAndSolve2D, type ModelData } from '../../engine/solver-service';
import type { AnalysisResults } from '../../engine/types';
import { NO_RELEASE } from '../../store/model.svelte';
import { inspectMember, inspectNode } from '../draw-despiece';
import { freeBodyActions2D } from '../free-body-2d';

beforeEach(() => vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production')));
afterEach(() => vi.unstubAllGlobals());

function cantilever(length: number): ModelData {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: length, y: 0 }]]),
    elements: new Map([[1, {
      id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
      releaseI: NO_RELEASE, releaseJ: NO_RELEASE,
    }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    materials: new Map([[1, { id: 1, name: 'Replay material', e: 200_000_000, nu: 0.3, rho: 20 }]]),
    sections: new Map([[1, { id: 1, name: 'Replay section', a: 0.01, iz: 1e-4 }]]),
    loads: [],
  };
}

function solved<T>(result: T | string | null): T {
  if (!result || typeof result === 'string') throw new Error(`Solve failed: ${result}`);
  return result;
}

function diagnostics(result: AnalysisResults) {
  return {
    assembly: result.diagnostics ?? [],
    solver: result.solverDiagnostics ?? [],
    structured: (result.structuredDiagnostics ?? []).map(({ code, severity }) => ({ code, severity })),
  };
}

it.each(['transverse load and tip couple', 'pure axial control'])('SA-2026-094: %s', scenario => {
  const length = 4;
  const model = cantilever(length);
  const axial = scenario === 'pure axial control';
  const tip = { id: 1, nodeId: 2, fx: axial ? 10 : 0, fz: axial ? 0 : -10, my: axial ? 0 : 3 };
  model.loads = [{ type: 'nodal', data: tip }];
  const answer = solved(validateAndSolve2D(model));
  const args = {
    elements: [...model.elements.values()],
    getNode: (id: number) => model.nodes.get(id),
    getElementForces: (id: number) => answer.elementForces.find(f => f.elementId === id),
    basis: 'global' as const,
  };
  const inspected = inspectMember(args, 1)!.ends;
  const [atI, atJ] = inspected.map(end => end.components);
  const drawn = freeBodyActions2D({ ...args, reactions: new Map(), resultant: false, showReactions: false });
  const moment = (nodeId: number) => {
    const end = drawn.ends.find(e => e.nodeId === nodeId && e.side === 'member');
    const glyph = end?.actions.find(a => a.kind === 'moment');
    return glyph ? glyph.magnitude * (glyph.ccw ? 1 : -1) : 0;
  };
  const residual = atI![2]!.value + atJ![2]!.value + length * atJ![1]!.value;
  const nodeInspector = [1, 2].map(nodeId => inspectNode(args, nodeId).actions[0]!.components);
  const glyphMoments = [moment(1), moment(2)];
  console.log('SA-2026-094', JSON.stringify({
    scenario, length, tip, inspector: inspected.map(end => end.components), nodeInspector, glyphMoments,
    residual, reactions: answer.reactions, elementForces: answer.elementForces, diagnostics: diagnostics(answer),
  }));
  expect(nodeInspector).toEqual([atI, atJ]);
  expect(answer.reactions[0]!.my).toBeCloseTo(-(length * tip.fz + tip.my), 6);
  expect(glyphMoments[0]).toBeCloseTo(-(length * tip.fz + tip.my), 6);
  expect(glyphMoments[1]).toBeCloseTo(tip.my, 6);
  expect.soft(atI![2]!.value, 'I end').toBeCloseTo(glyphMoments[0]!, 6);
  expect.soft(atJ![2]!.value, 'J end').toBeCloseTo(glyphMoments[1]!, 6);
  expect(residual).toBeCloseTo(0, 6);
});

it.each(['signed and scoped', 'legacy gravity toggle control'])('SA-2026-095: %s', scenario => {
  const length = 5;
  const model = cantilever(length);
  const legacy = scenario === 'legacy gravity toggle control';
  const rule = { caseId: 1, direction: 'Z' as const, factor: 2, elements: [1] };
  const dead = { id: 1, name: 'Dead', type: 'D' as const };
  const combination = { id: 1, name: 'Dead only', factors: [{ caseId: dead.id, factor: 1 }] };
  if (!legacy) model.analysis = { selfWeight: [rule] };
  const standalone = solved(validateAndSolve2D(model, legacy));
  const results = solved(solveCombinations2D(model, [dead], [combination], legacy));
  const perCase = results.perCase.get(dead.id)!;
  const combined = results.perCombo.get(combination.id)!;
  const summary = (result: AnalysisResults) => ({ rz: result.reactions[0]!.rz, diagnostics: diagnostics(result) });
  const rho = model.materials.get(1)!.rho!;
  const area = model.sections.get(1)!.a;
  const expectedRz = -(legacy ? -1 : rule.factor) * rho * area * length;
  console.log('SA-2026-095', JSON.stringify({
    scenario, length, rho, area, tipLoads: model.loads, includeSelfWeight: legacy,
    selfWeight: model.analysis?.selfWeight ?? null, dead, combination,
    standalone: summary(standalone), perCase: summary(perCase), combined: summary(combined), expectedRz,
  }));
  for (const [path, result] of Object.entries({ standalone, perCase, combined })) {
    const reported = diagnostics(result);
    expect(reported.assembly).toEqual([]);
    expect(reported.solver).toEqual([]);
    expect(reported.structured.every(d => d.severity === 'info')).toBe(true);
    expect.soft(result.reactions[0]!.rz, path).toBeCloseTo(expectedRz, 10);
  }
});
