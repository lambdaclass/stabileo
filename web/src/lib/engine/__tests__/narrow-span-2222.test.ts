import { beforeAll, expect, it } from 'vitest';
import { initSolver, input2DToWireObject } from '../wasm-solver';
import { modelStore, uiStore } from '../../store';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';

let wasm: any;
beforeAll(async () => {
  await initSolver();
  wasm = await import('../../wasm/dedaliano_engine.js');
});

it('#2222 WASM keeps narrow loads in plane and space linear and nonlinear solves', async () => {
  for (const dim of [2, 3]) for (const axis of dim === 2 ? ['y'] : ['y', 'z']) {
    const input: any = structuredClone(model);
    if (dim === 3) {
      for (const node of Object.values(input.nodes) as any[]) node.y = 0;
      for (const section of Object.values(input.sections) as any[]) Object.assign(section, { iy: 1, j: 1 });
      for (const support of Object.values(input.supports) as any[]) Object.assign(support, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
      for (const load of input.loads) Object.assign(load.data, { qYI: axis === 'y' ? load.data.qI : 0, qYJ: axis === 'y' ? load.data.qJ : 0, qZI: axis === 'z' ? load.data.qI : 0, qZJ: axis === 'z' ? load.data.qJ : 0 });
    }
    const solve = (i: any, mode: string) => mode === 'linear' ? wasm[`solve_${dim}d`](i) : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(i),20,1e-9)).linearResults : JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(i),40,1e-9,1)).results;
    const point: any = structuredClone(input);
    point.loads = [{ type: 'pointOnElement', data: dim === 2 ? { elementId: 1, a: 1.5, p: -1 } : { elementId: 1, a: 1.5, py: axis === 'y' ? -1 : 0, pz: axis === 'z' ? -1 : 0 } }];
    const bad = structuredClone(input);
    Object.assign(bad.loads[0].data, {a:0,b:3});
    const keys = dim === 2 ? ['qI','qJ'] : axis === 'y' ? ['qYI','qYJ'] : ['qZI','qZJ'];
    for (const key of keys) bad.loads[0].data[key] = Number.MAX_VALUE;
    for (const mode of ['linear', 'pdelta', 'corotational']) expect(() => solve(bad,mode)).toThrow(/resultant/);
    for (const width of [0,1e-15,0.5e-12,1e-12,1.5e-12,1e-10,1e-8,1e-6]) for (const a of [0,1.5,3-width]) for (const ratio of [0,1]) {
      const b=a+width, span=b-a, qi=span === 0 ? -7 : -1/span, qj=qi*ratio;
      const total=qi*span/2+qj*span/2;
      const at=a+span*(ratio === 1 ? 1/2 : 1/3);
      const load=structuredClone(input);
      Object.assign(load.loads[0].data, {a,b,[keys[0]]:qi,[keys[1]]:qj});
      const reference=structuredClone(point);
      Object.assign(reference.loads[0].data, {a:at,...(dim === 2 ? {p:total} : axis === 'y' ? {py:total} : {pz:total})});
      const r=solve(load,'linear'), ref=solve(reference,'linear');
      const key=dim === 2 ? 'rz' : axis === 'y' ? 'fy' : 'fz';
      for (const reaction of r.reactions) expect(reaction[key]).toBeCloseTo(ref.reactions.find((x: any) => x.nodeId === reaction.nodeId)[key],10);
      const ef=r.elementForces.find((x: any) => x.elementId === 1), rf=ref.elementForces.find((x: any) => x.elementId === 1);
      const evaluate=dim === 2 ? wasm.compute_diagram_value_at : wasm.compute_diagram_value_at_3d;
      const kind=dim === 2 ? 'shear' : axis === 'y' ? 'shearY' : 'shearZ';
      expect(evaluate(JSON.stringify({kind,t:1.00001,elementForces:ef}))).toBeCloseTo(evaluate(JSON.stringify({kind,t:1.00001,elementForces:rf})),10);
    }
    for (const mode of ['linear', 'pdelta', 'corotational']) {
      const result = solve(input, mode), reference = solve(point, mode);
      const ef = result.elementForces.find((f: any) => f.elementId === 1);
      const rf = reference.elementForces.find((f: any) => f.elementId === 1);
      for (const kind of dim === 2 ? ['shear','moment'] : ['shearY','shearZ','momentY','momentZ']) {
        const evaluate = dim === 2 ? wasm.compute_diagram_value_at : wasm.compute_diagram_value_at_3d;
        expect(evaluate(JSON.stringify({kind,t:0.9,elementForces:ef}))).toBeCloseTo(evaluate(JSON.stringify({kind,t:0.9,elementForces:rf})),10);
      }
      if (result.equilibrium) expect(result.equilibrium.appliedForceSum[axis === 'y' ? 1 : 2]).toBeCloseTo(-1,10);
      const reaction = result.reactions.find((r: any) => r.nodeId === 1);
      const expected = reference.reactions.find((r: any) => r.nodeId === 1);
      const key = dim === 2 ? 'rz' : axis === 'y' ? 'fy' : 'fz';
      expect(reaction[key]).toBeCloseTo(expected[key],10);
    }
  }
  for (const space of ['planar','spatial']) {
    const a=1.5,b=a+0.5e-12,span=b-a,q=6/span/span;
    const recovered=JSON.parse(wasm.recover_member(JSON.stringify({space,length:3,ei:1000,gas:1700,vI:0,rI:0,vJ:0,rJ:0,positions:[0.5-1e-10,0.5+1e-10],dist:[{qI:-q,qJ:q,a,b}]})));
    expect(recovered[1].v-recovered[0].v).toBeCloseTo(1/1700,10);
  }
  uiStore.analysisMode = '2d'; modelStore.clear();
  const a = modelStore.addNode(0,0), b = modelStore.addNode(3,0), c = modelStore.addNode(6,0);
  const member = modelStore.addElement(a,b); modelStore.addElement(b,c);
  modelStore.addSupport(a,'fixed'); modelStore.addSupport(c,'fixed');
  const start = 1.5, end = start + 0.5e-12, q = -1/(end-start);
  modelStore.addDistributedLoad(member,q,q,undefined,undefined,undefined,start,end);
  const saved = JSON.parse(JSON.stringify(modelStore.snapshot()));
  modelStore.clear(); modelStore.restore(saved);
  const built = modelStore.buildSolverInput(false)!;
  const load = built.loads.find((l) => l.type === 'distributed')!;
  expect(load.data).toMatchObject({a:start,b:end,qI:q,qJ:q});
  const result = wasm.solve_2d(input2DToWireObject(built));
  expect(result.equilibrium.appliedForceSum[1]).toBeCloseTo(-1,10);
  modelStore.clear();
});


it.skipIf(process.env.REPRO_2222_ENDPOINTS !== '1')('known wrong result: #2222: WASM diagrams include collapsed loads at exact member endpoints', () => {
  for (const dim of [2, 3]) for (const axis of dim === 2 ? ['y'] : ['y', 'z']) {
    for (const [a, b] of [[3 - 5e-13, 3], [0, 5e-13]]) {
      const input: any = structuredClone(model);
      const q = -1 / (b - a);
      Object.assign(input.loads[0].data, {a, b, qI:q, qJ:q});
      if (dim === 3) {
        for (const node of Object.values(input.nodes) as any[]) node.y = 0;
        for (const section of Object.values(input.sections) as any[]) Object.assign(section, {iy:1, j:1});
        for (const support of Object.values(input.supports) as any[]) Object.assign(support, {rx:true, ry:true, rz:true, rrx:true, rry:true, rrz:true});
        Object.assign(input.loads[0].data, {qYI:axis === 'y' ? q : 0, qYJ:axis === 'y' ? q : 0, qZI:axis === 'z' ? q : 0, qZJ:axis === 'z' ? q : 0});
      }
      for (const mode of ['linear', 'pdelta', 'corotational']) {
        const result = mode === 'linear' ? wasm[`solve_${dim}d`](input) : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input),20,1e-9)).linearResults : JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input),40,1e-9,1)).results;
        const f = result.elementForces.find((f: any) => f.elementId === 1);
        const evaluate = (kind: string, t: number) => (dim === 2 ? wasm.compute_diagram_value_at : wasm.compute_diagram_value_at_3d)(JSON.stringify({kind,t,elementForces:f}));
        const shear = dim === 2 ? 'shear' : axis === 'y' ? 'shearY' : 'shearZ';
        const moment = dim === 2 ? 'moment' : axis === 'y' ? 'momentZ' : 'momentY';
        const v = dim === 2 ? f.vStart : axis === 'y' ? f.vyStart : f.vzStart;
        const m = dim === 2 ? f.mStart : axis === 'y' ? f.mzStart : f.myStart;
        const sign = axis === 'z' ? 1 : -1;
        expect(evaluate(shear,0)).toBeCloseTo(v,10);
        expect(evaluate(moment,0)).toBeCloseTo(m,10);
        expect(evaluate(shear,1)).toBeCloseTo(v-1,10);
        expect(evaluate(shear,b/3)).toBeCloseTo(v-1,10);
        expect(evaluate(moment,1)).toBeCloseTo(m+sign*(v*3-3+a+(b-a)/2),10);
      }
    }
  }
});
