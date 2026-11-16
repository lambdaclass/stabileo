import { beforeAll, expect, it } from 'vitest';
import { initSolver } from '../wasm-solver';
import fiberCases from '../../../../../engine/tests/fixtures/fiber-balance-2222.json';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';

let wasm: any;
beforeAll(async () => {
  await initSolver();
  wasm = await import('../../wasm/dedaliano_engine.js');
});

for (const dim of [2, 3]) {
  it(`#2222 ${dim}D WASM refuses near-full intervals outside the member`, () => {
    for (const axis of dim === 2 ? ['y', 'x'] : ['y', 'z', 'x']) {
      const base: any = structuredClone(model);
      base.loads = [];
      if (dim === 3) {
        for (const node of Object.values(base.nodes) as any[]) node.y = 0;
        for (const section of Object.values(base.sections) as any[]) Object.assign(section, {iy:1, j:1});
        for (const support of Object.values(base.supports) as any[]) Object.assign(support, {rx:true, ry:true, rz:true, rrx:true, rry:true, rrz:true});
      }
      const session = new wasm[`LoadSession${dim}D`](base);
      const solve = (input: any, mode: string) => mode === 'linear' ? wasm[`solve_${dim}d`](input)
        : mode === 'session' ? session.solve(input.loads)
        : mode === 'fiber' ? JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({solver:input, fiberSections:{}, nIntegrationPoints:5, maxIter:40, tolerance:1e-9, nIncrements:1}))).results
        : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input),20,1e-9)).linearResults
        : JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input),40,1e-9,1)).results;
      try {
        for (const [a,b,valid] of [
          [-5e-13,3,false], [0,3+5e-13,false], [-Number.MIN_VALUE,3,false], [0,3+2*Number.EPSILON,false],
          [-1e-12,3,false], [0,3+1e-12,false], [0,3,true], [Number.MIN_VALUE,3,true],
          [0,3-2*Number.EPSILON,true], [5e-13,3-5e-13,true], [1,2,true], [1,1-Number.EPSILON/2,false],
        ] as Array<[number,number,boolean]>) {
          const input = structuredClone(base);
          input.loads = [{type:dim === 2 && axis === 'x' ? 'axialDistributed' : 'distributed', data:dim === 2
            ? {elementId:1,qI:-2,qJ:-2,a,b}
            : {elementId:1,qXI:axis === 'x' ? -2 : 0,qXJ:axis === 'x' ? -2 : 0,qYI:axis === 'y' ? -2 : 0,qYJ:axis === 'y' ? -2 : 0,qZI:axis === 'z' ? -2 : 0,qZJ:axis === 'z' ? -2 : 0,a,b}}];
          for (const mode of ['linear','session','pdelta','corotational','fiber']) {
            if (!valid) expect(() => solve(input,mode), `${dim}D ${axis} ${mode}: [${a},${b}]`).toThrow(/invalid distributed load interval/);
            else {
              const result = solve(input,mode);
              const key = dim === 2 ? axis === 'x' ? 'rx' : 'rz' : axis === 'x' ? 'fx' : axis === 'y' ? 'fy' : 'fz';
              expect(result.reactions.reduce((sum: number,r: any) => sum+r[key],0)).toBeCloseTo(2*(b-a),10);
            }
          }
        }
      } finally { session.free(); }
    }
  });

  it(`#2222 ${dim}D WASM fiber increments satisfy independent balance`, () => {
    for (const [dimension, original] of fiberCases as Array<[number,any]>) {
      if (dimension !== dim) continue;
      for (const elastic of [false,true]) for (const tolerance of [1e-3,1e-6,1e-9]) {
        const input = structuredClone(original);
        input.tolerance = tolerance;
        if (elastic) input.fiberSections['1'].materials = [{type:'elastic',e:200000}];
        const result = JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify(input)));
        expect(result.converged).toBe(true);
        expect(result.lastConvergedLoadFactor).toBe(1);
        const eq = result.results.equilibrium;
        expect(eq.residualOk && eq.equilibriumOk).toBe(true);
        for (let k=0;k<dim;k++) expect(Math.abs(eq.appliedForceSum[k]+eq.reactionForceSum[k])).toBeLessThan(1e-6*Math.max(1,...eq.appliedForceSum.slice(0,dim).map(Math.abs),...eq.reactionForceSum.slice(0,dim).map(Math.abs)));
      }
    }
  });
}
