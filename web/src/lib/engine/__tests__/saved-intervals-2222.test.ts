import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../wasm-solver';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';
import overflow from '../../../../../engine/tests/fixtures/combination-overflow-2222.json';

let wasm: any;
beforeAll(async () => {
  await initSolver();
  wasm = await import('../../wasm/dedaliano_engine.js');
});

const section = { shape: 'rect', a: 1, iy: 1, iz: 1, h: 1, b: 1 };

describe('known wrong result: #2222 — saved-result boundaries', () => {
  for (const dim of [2, 3]) for (const entry of ['envelope', 'combination', 'diagrams', 'value', 'section', 'stations', 'grouped']) {
    it(`${dim}D ${entry} refuses invalid intervals before the kernel`, () => {
      const input: any = structuredClone(model);
      input.loads = [{ type: 'distributed', data: dim === 2
        ? { elementId: 1, qI: -2, qJ: -2 }
        : { elementId: 1, qXI: 1, qXJ: 1, qYI: -2, qYJ: -2, qZI: 3, qZJ: 3 } }];
      if (dim === 3) {
        for (const n of Object.values(input.nodes) as any[]) n.y = 0;
        for (const s of Object.values(input.sections) as any[]) Object.assign(s, { iy: 1, j: 1 });
        for (const s of Object.values(input.supports) as any[]) Object.assign(s, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
      }
      const base = wasm[`solve_${dim}d`](input);
      const run = (results: any) => {
        const ef = results.elementForces[0];
        const request = entry === 'envelope' ? [results]
          : entry === 'combination' ? { factors: [{ caseId: 1, factor: 1 }], cases: [{ caseId: 1, results }] }
          : entry === 'diagrams' ? dim === 2 ? { input, results } : results
          : entry === 'value' ? { elementForces: ef, kind: dim === 2 ? 'shear' : 'shearY', t: 0.5 }
          : entry === 'section' ? { elementForces: ef, section, t: 0.5 }
          : { members: [{ elementId: ef.elementId, materialId: 1, sectionId: 1, length: 3 }], combinations: [{ comboId: 1, results }], numStations: 3 };
        const fn = entry === 'envelope' ? `compute_envelope_${dim}d`
          : entry === 'combination' ? `combine_results_${dim}d`
          : entry === 'diagrams' ? `compute_diagrams_${dim}d`
          : entry === 'value' ? `compute_diagram_value_at${dim === 3 ? '_3d' : ''}`
          : entry === 'section' ? `compute_section_stress_${dim}d`
          : `extract_beam_stations${entry === 'grouped' ? '_grouped' : ''}${dim === 3 ? '_3d' : ''}`;
        return entry === 'envelope' || entry === 'combination' ? wasm[fn](request) : JSON.parse(wasm[fn](JSON.stringify(request)));
      };
      expect(run(base)).toBeDefined();
      for (const axis of dim === 2 ? ['distributedLoads', 'distributedLoadsX'] : ['distributedLoadsX', 'distributedLoadsY', 'distributedLoadsZ']) {
        for (const [a, b] of [[-1, 1], [2, 4], [0, 0], [0, 1e-11], [0, 3e-10], [0, 3]]) {
          const results = structuredClone(base);
          const ef = results.elementForces[0];
          for (const key of dim === 2 ? ['distributedLoads', 'distributedLoadsX'] : ['distributedLoadsX', 'distributedLoadsY', 'distributedLoadsZ']) ef[key] = [];
          ef[axis] = [{ qI: -2, qJ: -2, a, b }];
          if (a < 0 || b > 3 || b < 3e-10) expect(() => run(results)).toThrow(/Element 1.*interval/);
          else expect(run(results)).toBeDefined();
        }
      }
    });
  }
});

describe.skip('known wrong result: #2222 — combination overflow remains a refusal', () => {
  for (const dim of [2, 3]) for (const perCase of [false, true]) it(`${dim}D settlement=${perCase} never returns an incomplete combination set`, () => {
    const input: any = structuredClone(overflow);
    if (dim === 2) {
      for (const n of Object.values(input.solver.nodes) as any[]) delete n.y;
      for (const c of input.loadCases) { delete c.loads[0].data.fy; delete c.loads[0].data.mz; }
    }
    if (perCase) {
      input.solver.supports['1'].dx = 1e-4;
      input.solver.constraints = [{ type: 'equalDOF', masterNode: 2, slaveNode: 3, dofs: [1] }];
    }
    input.combinations.unshift({ name: 'safe', factors: { A: 1, B: 1 } });
    for (const entry of ['solve', 'certify']) expect(() => wasm[`${entry}_multi_case_${dim}d`](input)).toThrow(/non-finite number/);
    input.combinations[1].factors = { A: 1, B: 1 };
    const answer = wasm[`solve_multi_case_${dim}d`](input);
    expect(answer.combinationResults).toHaveLength(2);
    expect(answer.combinationResults.map((c: any) => c.name)).toEqual(['safe', 'A+B']);
  });
  for (const dim of [2, 3]) it(`${dim}D saved-result combination reports overflow before recovery`, () => {
    const input: any = structuredClone(overflow.solver);
    input.loads = structuredClone(overflow.loadCases[0].loads);
    if (dim === 2) {
      for (const n of Object.values(input.nodes) as any[]) delete n.y;
      delete input.loads[0].data.fy; delete input.loads[0].data.mz;
    }
    const results = wasm[`solve_${dim}d`](input);
    const run = (factor: number) => wasm[`combine_results_${dim}d`]({ factors: [{ caseId: 1, factor }, { caseId: 1, factor }], cases: [{ caseId: 1, results }] });
    expect(() => run(Number.MAX_VALUE / 4)).toThrow(/non-finite number/);
    expect(run(1).elementForces).toHaveLength(2);
  });
});
