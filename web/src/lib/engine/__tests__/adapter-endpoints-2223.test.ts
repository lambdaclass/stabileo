import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore } from '../../store';
import { buildSolverInput2D, buildSolverInput3D } from '../solver-service';
import { initSolver, input2DToWireObject, input3DToWireObject } from '../wasm-solver';
import { generatedMemberBounds, remapSpanInterval } from '../member-span-loads';
import { ALL_DICTS } from '../../i18n/locales/all';
import { ensureLocale, OFFERED_LOCALES, setLocale, tp } from '../../i18n';

const knownWrong = import.meta.env.VITE_RUN_KNOWN_WRONG ? it : it.skip;
let wasm: any;
beforeAll(async () => { await initSolver(); wasm = await import('../../wasm/dedaliano_engine.js'); });
afterEach(() => { modelStore.clear(); setLocale('en'); });

for (const dim of [2, 3]) for (const loadKind of dim === 2 ? ['distributed'] : ['distributed', 'distributed3d']) {
  knownWrong(`known wrong result: #2223 — ${dim}D ${loadKind} web adapter accepts coincident wind endpoints`, () => {
    const i = modelStore.addNode(1000.1, 0, ...(dim === 3 ? [0] as const : []));
    const j = modelStore.addNode(1004.1, 0, ...(dim === 3 ? [0] as const : []));
    const id = modelStore.addElement(i, j, 'frame');
    modelStore.addSupport(i, 'fixed');
    for (const b of [4.000000000000001, 4, 4 + 2 ** -48, 4 + 5 * 2 ** -50]) {
      modelStore.model.loads = [loadKind === 'distributed'
        ? { type: 'distributed', data: { id: 1, elementId: id, qI: -2, qJ: -4, a: 0, b } }
        : { type: 'distributed3d', data: { id: 1, elementId: id, qXI: -2, qXJ: -4, qYI: -2, qYJ: -4, qZI: 0, qZJ: 0, a: 0, b } }];
      const build = () => dim === 2 ? buildSolverInput2D(modelStore.model, false)! : buildSolverInput3D(modelStore.model, false, false);
      if (b > 4 + 2 ** -48) { expect(build).toThrow(/interval/); continue; }
      const built = build();
      const input = dim === 2 ? input2DToWireObject(built as never) : input3DToWireObject(built as never);
      const base = { ...input, loads: [] };
      const session = new wasm[`LoadSession${dim}D`](base);
      try {
        for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
          const result = mode === 'linear' ? wasm[`solve_${dim}d`](input)
            : mode === 'session' ? session.solve(input.loads)
            : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input), 20, 1e-9)).results
            : mode === 'corotational' ? JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input), 40, 1e-12, 1)).results
            : JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({ solver: input, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results;
          const sum = (key: string) => result.reactions.reduce((s: number, r: any) => s + r[key], 0);
          expect(Math.hypot(...(dim === 2 ? ['rx', 'rz'] : ['fx', 'fy', 'fz']).map(sum)), mode).toBeCloseTo(3 * b * (loadKind === 'distributed3d' ? Math.sqrt(2) : 1), 10);
        }
      } finally { session.free(); }
    }
  });
}

const geometryCases: Array<[string, () => unknown, Record<string, number>]> = [
  ['geometryOrdering', () => generatedMemberBounds(2, [1, 1], [[0, 0], [3, 0], [2, 0]]), {}],
  ['geometryLine', () => generatedMemberBounds(2, [1, 1], [[0, 0], [1, 1], [2, 0]]), {}],
  ['invalidGeometry', () => generatedMemberBounds(2, [0, 2]), {}],
  ['geometryPartition', () => generatedMemberBounds(2, [1]), {}],
  ['invalidPiece', () => remapSpanInterval(17, 0, 1, 1, 0, 1), {}],
  ['geometrySpan', () => remapSpanInterval(17, 0, 1, 0, 1, 2), { id: 17, span: 1, length: 2 }],
];
for (const [locale, dict] of Object.entries(ALL_DICTS)) knownWrong(`known wrong result: #2223 — ${locale} localizes every generated member refusal`, async () => {
  for (const [name] of geometryCases) expect(dict[`engine.memberLoad.${name}`]).toBeTypeOf('string');
  if (!(OFFERED_LOCALES as readonly string[]).includes(locale)) return;
  await ensureLocale(locale); setLocale(locale);
  for (const [name, run, params] of geometryCases) expect(run).toThrow(tp(`engine.memberLoad.${name}`, params));
});

for (const dim of [2, 3]) knownWrong(`known wrong result: #2223 — ${dim}D synchronous and asynchronous solves report invalid intervals`, async () => {
  const svc = await import('../solver-service');
  const i = modelStore.addNode(0, 0, ...(dim === 3 ? [0] as const : []));
  const j = modelStore.addNode(3, 0, ...(dim === 3 ? [0] as const : []));
  const id = modelStore.addElement(i, j, 'frame'); modelStore.addSupport(i, 'fixed');
  for (const [a, b] of [[0, 0], [-Number.MIN_VALUE, 3], [0, 3 + 2 ** -51], [0, 3e-10 - 2 ** -84]]) {
    modelStore.model.loads = [{ type: 'distributed', data: { id: 1, elementId: id, qI: -2, qJ: -2, a, b } }];
    for (const async of [false, true]) {
      const solve = dim === 2 ? async ? svc.validateAndSolve2DAsync : svc.validateAndSolve2D : async ? svc.validateAndSolve3DAsync : svc.validateAndSolve3D;
      const refusal = await solve(modelStore.model, false);
      expect(refusal, `[${a},${b}] async=${async}`).toBeTypeOf('string'); expect(refusal).toMatch(/interval/);
    }
  }
  modelStore.model.loads = [{ type: 'distributed', data: { id: 1, elementId: id, qI: -2, qJ: -2, a: 0, b: 3 } }];
  const solve = dim === 2 ? svc.validateAndSolve2D : svc.validateAndSolve3D;
  const result = solve(modelStore.model, false);
  expect(result).toBeTypeOf('object');
  const reactions = (result as any).reactions;
  const sum = (key: string) => reactions.reduce((s: number, r: any) => s + r[key], 0);
  expect(Math.hypot(...(dim === 2 ? ['rx', 'rz'] : ['fx', 'fy', 'fz']).map(sum))).toBeCloseTo(6, 10);
});

for (const dim of [2, 3]) it(`${dim}D WASM saved-interval boundaries reject malformed cases and retain valid answers`, () => {
  const model = { nodes: { '1': { id: 1, x: 0, z: 0, ...(dim === 3 ? { y: 0 } : {}) }, '2': { id: 2, x: 3, z: 0, ...(dim === 3 ? { y: 0 } : {}) } }, elements: { '1': { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame' } }, materials: { '1': { id: 1, e: 200000, nu: 0.3 } }, sections: { '1': { id: 1, a: 1, iz: 1, ...(dim === 3 ? { iy: 1, j: 1 } : {}) } }, supports: { '1': { id: 1, nodeId: 1, type: 'fixed', ...(dim === 3 ? { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true } : {}) } }, loads: [] };
  const original = wasm[`solve_${dim}d`](model);
  for (const channel of dim === 2 ? ['distributedLoads', 'distributedLoadsX'] : ['distributedLoadsX', 'distributedLoadsY', 'distributedLoadsZ']) {
    for (const [a, b, valid] of [[-Number.MIN_VALUE, 3, false], [0, 0, false], [0, Number.NaN, false], [0, Infinity, false], [0, 3e-10 - 2 ** -84, false], [0, 3e-10, true], [0, 3e-10 + 2 ** -84, true], [0, 3, true], [0, 3 + 2 ** -51, false]] as const) {
      const result = structuredClone(original);
      result.elementForces[0][channel] = [{ qI: -2, qJ: -2, a, b }];
      const combine = () => wasm[`combine_results_${dim}d`]({ factors: [{ caseId: 1, factor: 1 }], cases: [{ caseId: 1, results: result }] });
      const envelope = () => wasm[`compute_envelope_${dim}d`]([result]);
      for (const run of [combine, envelope]) {
        if (valid) expect(run().elementForces ?? run().moment ?? run().momentY).toBeDefined();
        else expect(run, `${channel} [${a},${b}] ${run.name}`).toThrow();
      }
    }
  }
});
