import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore, historyStore } from '../../store';
import { splitAtNodes, splitAllAtNodes, intersectMembers } from '../../model/edit/cut-members';
import { subdivideForAnalysis } from '../../model/edit/analysis-subdivision';
import { expandVariableMembers } from '../variable-members';
import { refineInput } from '../second-order/refine';
import { buildSolverInput2D, buildSolverInput3D, solveCombinations2D, validateAndSolve2D, validateAndSolve2DAsync } from '../solver-service';
import { finiteObjectWire, initSolver, input2DToWireObject, input3DToWireObject } from '../wasm-solver';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { splitElementLoads } from '../../model/edit/member-split';
import { generatedMemberBounds, remapSpanInterval } from '../member-span-loads';

let wasm: any;
beforeAll(async () => { await initSolver(); wasm = await import('../../wasm/dedaliano_engine.js'); });
afterEach(() => { modelStore.clear(); historyStore.clear(); });

function setVariableSection(id: number) {
  const sections = [0.3, 0.5].map(h => {
    const params = { b: 0.3, h };
    return modelStore.addSection(toSectionFields({ kind: 'built', name: `density-${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
  });
  modelStore.updateElement(id, { sectionId: sections[0], variableSection: { sectionJ: sections[1], segments: 20 } });
}

for (const dim of [2, 3]) for (const kind of dim === 2 ? ['distributed'] : ['distributed', 'distributed3d']) {
  for (const entry of ['direct', 'point', 'subdivide', 'nodes', 'allNodes', 'intersection', 'analysis', 'variable', ...(dim === 2 ? ['refine'] : [])]) {
    it(`known wrong result: #2223 — ${dim}D ${kind} ${entry} keeps dense diagonal load densities exact`, () => {
      const unit = entry === 'point' ? 0.15 : 0.0015;
      const i = modelStore.addNode(0, 0, ...(dim === 3 ? [0] as const : []));
      const j = modelStore.addNode(unit, unit, ...(dim === 3 ? [unit] as const : []));
      const midpoint = modelStore.addNode(unit / 2, unit / 2, ...(dim === 3 ? [unit / 2] as const : []));
      const id = modelStore.addElement(i, j, 'frame');
      modelStore.model.loads = [kind === 'distributed'
        ? { type: 'distributed', data: { id: 1, elementId: id, qI: -10, qJ: -10 } }
        : { type: 'distributed3d', data: { id: 1, elementId: id, qXI: -10, qXJ: -10, qYI: -10, qYJ: -10, qZI: -10, qZJ: -10 } }];
      const ts = Array.from({ length: 19 }, (_, k) => (k + 1) / 20);
      let model = modelStore.model;
      if (entry === 'direct') modelStore.splitMember(id, ts, { reuseNodeTol: 1e-12 });
      if (entry === 'point') modelStore.splitElementAtPoint(id, 0.3);
      if (entry === 'subdivide') modelStore.subdivideElement(id, 20);
      if (entry === 'nodes' || entry === 'allNodes') {
        for (const t of ts) if (t !== 0.5) modelStore.addNode(t * 0.0015, t * 0.0015, ...(dim === 3 ? [t * 0.0015] as const : []));
        if (entry === 'nodes') splitAtNodes([id], [...model.nodes.keys()]);
        else splitAllAtNodes();
      }
      if (entry === 'intersection') {
        const cross = ts.map(t => modelStore.addElement(
          modelStore.addNode((t - 1) * unit, (t + 1) * unit, ...(dim === 3 ? [t * unit] as const : [])),
          modelStore.addNode((t + 1) * unit, (t - 1) * unit, ...(dim === 3 ? [t * unit] as const : [])), 'frame'));
        expect(intersectMembers([id, ...cross]).cut).toHaveLength(20);
        for (const e of [...model.elements.values()]) if ([e.nodeI, e.nodeJ].some(id => { const p = model.nodes.get(id)!; return p.x !== p.y; })) modelStore.removeElement(e.id);
      }
      if (entry === 'analysis') model = subdivideForAnalysis(model, 20).model as typeof model;
      if (entry === 'variable') {
        setVariableSection(id);
        model = expandVariableMembers(model) as typeof model;
      }
      const count = entry === 'point' ? 2 : 20;
      const attached = new Set([...model.elements.values()].flatMap(e => [e.nodeI, e.nodeJ]));
      for (const n of model.nodes.values()) if (!attached.has(n.id)) model.nodes.delete(n.id);
      for (const nodeId of [i, j]) model.supports.set(nodeId, { id: nodeId, nodeId, type: dim === 2 ? 'fixed' : 'fixed3d' } as never);
      const built = dim === 2 ? buildSolverInput2D(model, false)! : buildSolverInput3D(model, false)!;
      const wire = dim === 2 ? input2DToWireObject(entry === 'refine' ? refineInput(built as never, 20).input : built as never) : input3DToWireObject(built as never);
      const input = finiteObjectWire(wire);
      expect(Object.keys(input.elements)).toHaveLength(count);
      if (['direct', 'subdivide', 'nodes', 'allNodes'].includes(entry)) {
        expect([...model.elements.values()].filter(e => e.nodeI === midpoint || e.nodeJ === midpoint)).toHaveLength(2);
      }
      for (const load of entry === 'refine' ? input.loads : model.loads) {
        const d = load.data as any;
        for (const key of kind === 'distributed3d' ? ['qXI', 'qXJ', 'qYI', 'qYJ', 'qZI', 'qZJ'] : ['qI', 'qJ']) expect(d[key], key).toBe(-10);
      }
      for (const key of Object.keys(input.nodes)) input.supports[key] = dim === 2
        ? { id: Number(key), nodeId: Number(key), type: Number(key) === j ? 'pinned' : 'fixed' }
        : { id: Number(key), nodeId: Number(key), rx: true, ry: true, rz: true, rrx: Number(key) !== j, rry: true, rrz: true };
      const session = new wasm[`LoadSession${dim}D`]({ ...input, loads: [] });
      try {
        for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
          const result = mode === 'linear' ? wasm[`solve_${dim}d`](input)
            : mode === 'session' ? session.solve(input.loads)
            : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input), 20, 1e-9)).results
            : mode === 'corotational' ? JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input), 40, 1e-12, 1)).results
            : JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({ solver: input, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results;
          const sums = (dim === 2 ? ['rx', 'rz'] : ['fx', 'fy', 'fz']).map(key => result.reactions.reduce((sum: number, r: any) => sum + r[key], 0));
          expect(Math.hypot(...sums), mode).toBeCloseTo(10 * Math.sqrt(dim) * unit * (kind === 'distributed3d' ? Math.sqrt(3) : 1), 12);
        }
      } finally { session.free(); }
    });
  }
}

for (const type of ['distributed', 'distributed3d'] as const) {
  it(`known wrong result: #2223 — ${type} measures additive stations without changing density`, () => {
    const lengths = Array.from({ length: 20 }, (_, k) => Math.sqrt(3 * (((k + 1) * 0.0015 / 20 - k * 0.0015 / 20) ** 2)));
    const L = Math.sqrt(3 * 0.0015 ** 2), bounds = generatedMemberBounds(L, lengths);
    const ids = lengths.map((_, k) => k + 1);
    const values = type === 'distributed' ? { qI: -10, qJ: -10 } : { qXI: -10, qXJ: -10, qYI: -10, qYJ: -10, qZI: -10, qZJ: -10 };
    let nextId = 1;
    const loads = splitElementLoads([{ type, data: { id: 1, elementId: 1, ...values } } as never], 1, bounds, ids, () => nextId++, lengths).added;
    expect(loads).toHaveLength(20);
    for (const load of loads) {
      expect(load.data).toMatchObject(values);
      expect(load.data).not.toHaveProperty('a');
      expect(load.data).not.toHaveProperty('b');
    }
  });
}

it('known wrong result: #2223 — member-defined density is distinct from an explicit interval remap', () => {
  const length = 0.1, start = 0.3, end = start + length;
  for (const explicit of [false, true]) {
    let nextId = 2;
    const loads = splitElementLoads([{ type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10, ...(explicit ? { a: 0, b: end } : {}) } }], 1, [0, start, end], [1, 2], () => nextId++, [start, length]).added;
    expect(loads[1].data).toMatchObject({ qI: explicit ? -10 * ((end - start) / length) : -10, qJ: explicit ? -10 * ((end - start) / length) : -10 });
  }
  const shiftedEnd = 2 + Number.EPSILON * 2;
  expect(remapSpanInterval(1, 1, shiftedEnd, 1, shiftedEnd, 1)).toEqual({ lo: 1, hi: shiftedEnd, scale: shiftedEnd - 1, a: undefined, b: undefined });
  expect(remapSpanInterval(1, 0, 1, 0, 1, 1)).toEqual({ lo: 0, hi: 1, scale: 1, a: undefined, b: undefined });
  for (const direction of [-1, 1]) {
    const view = new DataView(new ArrayBuffer(8));
    const adjacent = (x: number) => { view.setFloat64(0, x); view.setBigUint64(0, view.getBigUint64(0) + BigInt(direction)); return view.getFloat64(0); };
    let accepted = 1, refused = adjacent(accepted);
    while (Math.abs(1 - refused) <= Number.EPSILON * 4 * Math.max(1, refused)) { accepted = refused; refused = adjacent(refused); }
    expect(() => remapSpanInterval(1, 0, 1, 0, 1, accepted)).not.toThrow();
    const split = (length: number) => splitElementLoads([{ type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10 } }], 1, [0, 1], [1], () => 2, [length]);
    expect(split(accepted).added[0].data).toMatchObject({ qI: -10, qJ: -10 });
    expect(() => split(refused)).toThrow(/geometry/);
    expect(() => remapSpanInterval(1, 0, 1, 0, 1, refused)).toThrow(/geometry/);
  }
});


it('known wrong result: #2223 — planar variable loads reach single and factored solves', async () => {
  const unit = 0.0015, q = 10;
  const i = modelStore.addNode(0, 0), j = modelStore.addNode(unit, unit);
  const member = modelStore.addElement(i, j, 'frame');
  setVariableSection(member);
  modelStore.addSupport(i, 'fixed');
  modelStore.addSupport(j, 'fixed');
  modelStore.model.loads = [{ type: 'distributed', data: { id: 1, elementId: member, qI: -q, qJ: -q } }];
  const factor = 0.25;
  const id = modelStore.addCombination('Factored line', [{ caseId: 1, factor }]);
  const model = expandVariableMembers(modelStore.model);
  const check = (result: ReturnType<typeof validateAndSolve2D>, scale: number, entry: string) => {
    expect.soft(result, entry).toMatchObject({ reactions: expect.any(Array) });
    if (!result || typeof result === 'string') return;
    const rx = result.reactions.reduce((sum, r) => sum + r.rx, 0);
    const rz = result.reactions.reduce((sum, r) => sum + r.rz, 0);
    expect(Math.hypot(rx, rz), entry).toBeCloseTo(scale * q * Math.SQRT2 * unit, 12);
  };
  check(validateAndSolve2D(model), 1, 'sync');
  check(await validateAndSolve2DAsync(model), 1, 'async');
  const combinations = model.combinations.filter(combo => combo.id === id);
  const batch = solveCombinations2D(model, model.loadCases, combinations);
  check(batch && typeof batch === 'object' ? batch.perCombo.get(id) ?? null : batch, factor, 'batch combination');
  const fallback = solveCombinations2D(model, model.loadCases, [...combinations, { ...combinations[0]!, id: id + 1 }]);
  check(fallback && typeof fallback === 'object' ? fallback.perCombo.get(id) ?? null : fallback, factor, 'per-case combination');
});
