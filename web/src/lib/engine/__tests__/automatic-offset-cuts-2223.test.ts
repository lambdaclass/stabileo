import { beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore, historyStore } from '../../store';
import type { ModelData } from '../solver-service';
import { buildSolverInput2D, buildSolverInput3D, shouldEmbedFlat2DModelIn3D } from '../solver-service';
import { subdivideForAnalysis } from '../../model/edit/analysis-subdivision';
import { expandVariableMembers, variableExpansionFor } from '../variable-members';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { initSolver, solve, solve3D, solvePDelta, solvePDelta3D, solveCorotational2D, solveCorotational3D } from '../wasm-solver';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const wrong = process.env.RUN_KNOWN_WRONG === '2223' ? it : it.skip;
type Entry = 'analysis' | 'variable' | 'pointCut';

function fixture(entry: Entry, offset: number, spatial = false, frame: 'global' | 'local' = 'global', a = 0, b = spatial ? 6 - 2 * offset : 6) {
  const i = modelStore.addNode(0, 0), j = modelStore.addNode(6, 0);
  const id = modelStore.addElement(i, j, 'frame');
  modelStore.addSupport(i, spatial ? 'fixed3d' : 'fixed');
  modelStore.updateElement(id, { offset: { frame, i: { x: offset, y: 0, z: 0 }, j: { x: -offset, y: 0, z: 0 } } });
  if (entry === 'variable') {
    const sections = [0.3, 0.5].map(h => {
      const params = { b: 0.3, h };
      return modelStore.addSection(toSectionFields({ kind: 'built', name: `offset-${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
    });
    modelStore.updateElement(id, { sectionId: sections[0], variableSection: { sectionJ: sections[1], segments: 2 } });
  }
  modelStore.model.loads = [spatial
    ? { type: 'distributed3d', data: { id: 1, elementId: id, qYI: 0, qYJ: 0, qZI: -2, qZJ: -4, a, b } }
    : { type: 'distributed', data: { id: 1, elementId: id, qI: -2, qJ: -4, a, b } }];
  if (entry === 'pointCut') modelStore.model.loads.push(spatial
    ? { type: 'pointOnElement3d', data: { id: 2, elementId: id, a: 3 - offset, px: 1, py: 0, pz: 0 } }
    : { type: 'pointOnElement', data: { id: 2, elementId: id, a: 3, p: 1, angle: 90 } });
  return { i, id, a, b };
}

function transform(entry: Entry): ModelData {
  return entry === 'analysis' ? subdivideForAnalysis(modelStore.model, 2).model : expandVariableMembers(modelStore.model);
}

for (const offset of [0, 0.25]) for (const partial of [false, true]) for (const frame of ['global', 'local'] as const) for (const entry of ['analysis', 'variable', 'pointCut'] as const) {
  const check = offset === 0 ? it : wrong;
  check(`known wrong result: #2223 ${entry} ${frame} offset=${offset} partial=${partial} preserves planar loads through 2D and embedded 3D linear and nonlinear solves`, () => {
    const { i, id, a, b } = fixture(entry, offset, false, frame, partial ? 1 : 0, partial ? 5 : 6);
    expect(shouldEmbedFlat2DModelIn3D(modelStore.model)).toBe(true);
    const before = JSON.stringify(modelStore.snapshot());
    const child = transform(entry);
    expect(child.elements.size).toBe(2);
    expect([...child.elements.values()].find(e => e.nodeI === i)!.offset?.i?.x ?? 0).toBe(offset);
    if (entry !== 'analysis') {
      const member = variableExpansionFor(modelStore.model)!.members.get(id)!;
      expect(member.length).toBe(6);
      expect(member.pieces.map(p => [p.x0, p.x1])).toEqual([[0, 3], [3, 6]]);
    }
    const force = (-2 - 4) * (b - a) / 2;
    const moment = force * a + (-2 - 2 * 4) * (b - a) ** 2 / 6;
    for (const dimension of [2, 3]) for (const mode of ['linear', 'pdelta', 'corotational']) {
      const input2D = buildSolverInput2D(child, false)!;
      const input3D = buildSolverInput3D(child, false)!;
      const nonlinear = mode === 'corotational'
        ? dimension === 2 ? solveCorotational2D(input2D, 50, 1e-12, 10) : solveCorotational3D(input3D, 50, 1e-12, 10)
        : null;
      if (nonlinear) expect(nonlinear.converged).toBe(true);
      const result = nonlinear?.results ?? (dimension === 2
        ? mode === 'linear' ? solve(input2D) : solvePDelta(input2D).linearResults
        : mode === 'linear' ? solve3D(input3D) : solvePDelta3D(input3D).linearResults);
      const reaction = result.reactions.find((r: { nodeId: number }) => r.nodeId === i)!;
      expect('rz' in reaction ? reaction.rz : reaction.fz).toBeCloseTo(-force, 10);
      expect('rx' in reaction ? reaction.rx : reaction.fx).toBeCloseTo(entry === 'pointCut' ? -1 : 0, 10);
      if (mode === 'linear' || entry !== 'pointCut' && mode === 'pdelta') expect(Math.abs(reaction.my)).toBeCloseTo(-moment, 10);
    }
    expect(JSON.stringify(modelStore.snapshot())).toBe(before);
  });
}

for (const entry of ['analysis', 'variable', 'pointCut'] as const) for (const partial of [false, true]) it(`#2223 ${entry} true 3D retains flexible offsets partial=${partial}`, () => {
  const offset = 0.25, length = 6 - 2 * offset;
  const { i, id, a, b } = fixture(entry, offset, true, 'global', partial ? 1 : 0, partial ? 5 : length);
  expect(shouldEmbedFlat2DModelIn3D(modelStore.model)).toBe(false);
  const child = transform(entry);
  const force = (-2 - 4) * (b - a) / 2;
  const moment = force * (offset + a) + (-2 - 2 * 4) * (b - a) ** 2 / 6;
  if (entry !== 'analysis') {
    const member = variableExpansionFor(modelStore.model)!.members.get(id)!;
    expect(member.length).toBe(length);
    expect(member.pieces.map(p => [p.x0, p.x1])).toEqual([[0, length / 2], [length / 2, length]]);
  }
  const input = buildSolverInput3D(child, false)!;
  for (const mode of ['linear', 'pdelta', 'corotational']) {
    const nonlinear = mode === 'corotational' ? solveCorotational3D(input, 50, 1e-12, 10) : null;
    if (nonlinear) expect(nonlinear.converged).toBe(true);
    const result = nonlinear?.results ?? (mode === 'linear' ? solve3D(input) : solvePDelta3D(input).linearResults);
    const reaction = result.reactions.find((r: { nodeId: number }) => r.nodeId === i)!;
    expect(reaction.fz).toBeCloseTo(-force, 10);
    expect(reaction.fx).toBeCloseTo(entry === 'pointCut' ? -1 : 0, 10);
    if (mode === 'linear' || entry !== 'pointCut' && mode === 'pdelta') expect(Math.abs(reaction.my)).toBeCloseTo(-moment, 10);
  }
});

for (const entry of ['analysis', 'variable'] as const) for (const b of [5.5 - 2 ** -50, 5.5, 5.5 + 2 ** -50, 6, 6 + 2 ** -50]) {
  const check = b <= 6 ? wrong : it;
  check(`known wrong result: #2223 ${entry} embedded load endpoint ${b} uses the node-to-node boundary`, () => {
    fixture(entry, 0.25, false, 'global', 0, b);
    const before = JSON.stringify(modelStore.snapshot());
    if (b > 6) expect(() => transform(entry)).toThrow(/interval/);
    else {
      const child = transform(entry);
      const input = buildSolverInput2D(child, false)!;
      expect(solve(input).reactions[0].rz).toBeCloseTo(3 * b, 10);
    }
    expect(JSON.stringify(modelStore.snapshot())).toBe(before);
  });
}
