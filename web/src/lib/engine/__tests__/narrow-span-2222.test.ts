import { beforeAll, expect, it } from 'vitest';
import { initSolver } from '../wasm-solver';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2222' ? it : it.skip;
let wasm: any;
beforeAll(async () => {
  await initSolver();
  wasm = await import('../../wasm/dedaliano_engine.js');
});

knownWrong('known wrong result: #2222 WASM keeps narrow loads in plane and space linear and nonlinear solves', async () => {
  for (const dim of [2, 3]) {
    const input: any = structuredClone(model);
    if (dim === 3) {
      for (const node of Object.values(input.nodes) as any[]) node.y = 0;
      for (const section of Object.values(input.sections) as any[]) Object.assign(section, { iy: 1, j: 1 });
      for (const support of Object.values(input.supports) as any[]) Object.assign(support, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
      for (const load of input.loads) Object.assign(load.data, { qYI: load.data.qI, qYJ: load.data.qJ, qZI: 0, qZJ: 0 });
    }
    for (const nonlinear of [false, true]) {
      const result = nonlinear ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input),20,1e-9)).linearResults : wasm[`solve_${dim}d`](input);
      const ef = result.elementForces.find((f: any) => f.elementId === 1);
      const actual = dim === 2 ? wasm.compute_diagram_value_at(JSON.stringify({ kind: 'shear', t: 0.9, elementForces: ef })) : wasm.compute_diagram_value_at_3d(JSON.stringify({ kind: 'shearY', t: 0.9, elementForces: ef }));
      expect(actual).toBeCloseTo((dim === 2 ? ef.vStart : ef.vyStart) - 1,10);
      expect(result.equilibrium.appliedForceSum[1]).toBeCloseTo(-1,10);
      const reaction = result.reactions.find((r: any) => r.nodeId === 1);
      expect(dim === 2 ? reaction.rz : reaction.fy).toBeCloseTo(27/32,10);
    }
  }
});
