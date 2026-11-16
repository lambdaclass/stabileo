import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_2d, solve_pdelta_2d, compute_diagrams_2d, solve_3d, solve_pdelta_3d, compute_diagrams_3d, compute_envelope_3d, compute_envelope_2d } from '../../wasm/dedaliano_engine.js';
import { computeElementDiagram } from '../../engine/diagrams';
import { computeDiagram3D } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });
function fixture() {
  const s=JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json',import.meta.url),'utf8'))['2023'];
  Object.assign(s.materials['1'],{e:1000,nu:0}); Object.assign(s.sections['1'],{a:0.1,iy:0.001,iz:0.001,j:0.002});
  for(const k of ['cw','asY','asZ']) delete s.sections['1'][k];
  for(const k of ['releaseMyStart','releaseMyEnd','releaseMzStart','releaseMzEnd','releaseTStart','releaseTEnd']) s.elements['1'][k]=false;
  return s;
}
for(const axis of ['x','y','z'] as const) for(const sign of [1,-1]) for(const quadratic of [false,true]) it(`envelopes retain WASM density extrema ${axis} sign=${sign} quadratic=${quadratic}`,()=>{
  const s=fixture();
  s.nodes={1:{id:1,x:0,y:0,z:0},2:{id:2,x:100,y:0,z:0}};
  s.elements={1:{...s.elements['1'],nodeI:1,nodeJ:2}};
  s.supports={1:{nodeId:1,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}};
  const moments=(v:number[])=>({x:[0,0,0],y:[0,0,0],z:[0,0,0],[axis]:v});
  const values=quadratic?[3*sign/16,-sign/16,3*sign/16]:[sign,sign,sign], cancel=quadratic?-sign/48:-sign;
  s.loads=[{a:1,b:2,moments:moments(values)},{a:2,b:3,moments:moments([cancel,cancel,cancel])}].map(d=>({type:'distributed',data:{elementId:1,qYI:0,qYJ:0,qZI:0,qZJ:0,...d}}));
  const kind=axis==='x'?'torsion':axis==='y'?'momentY':'momentZ', peak=quadratic?1/48:1;
  for(const result of [solve_3d(s),JSON.parse(solve_pdelta_3d(JSON.stringify(s),100,1e-10)).results] as AnalysisResults3D[]) {
    const envelope=compute_envelope_3d([result])[kind].elements[0];
    const wasm=JSON.parse(compute_diagrams_3d(JSON.stringify(result)))[kind][0];
    for(const d of [wasm,computeDiagram3D(result.elementForces[0]!,kind)]) {
      expect(d.maxValue).toBeCloseTo(sign>0?peak:0,10);
      expect(d.minValue).toBeCloseTo(sign<0?-peak:0,10);
      expect(d.maxAbsValue).toBeCloseTo(sign*peak,10);
      for(const x of quadratic?[1,1.25,1.75,2,3]:[1,2,3]) expect(d.points.some((p:{t:number})=>Math.abs(p.t-x/100)<1e-12)).toBe(true);
    }
    expect(Math.max(...envelope.posValues)).toBeCloseTo(sign>0?peak:0,10);
    expect(Math.min(...envelope.negValues)).toBeCloseTo(sign<0?-peak:0,10);
    for(const x of quadratic?[1,1.25,1.75,2,3]:[1,2,3]) expect(envelope.tPositions.some((t:number)=>Math.abs(t-x/100)<1e-12)).toBe(true);
    const tip=result.displacements.find(d=>d.nodeId===2)!;
    if(axis==='x') expect(tip.rx).toBeCloseTo(sign*(quadratic?-1/48:-1)/1000,10);
  }
});
for(const sign of [1,-1]) it(`plane envelopes retain partial force extrema sign=${sign}`,()=>{
  const s=fixture();
  s.nodes={1:{id:1,x:0,z:0},2:{id:2,x:100,z:0}};
  s.elements={1:{id:1,type:'frame',nodeI:1,nodeJ:2,sectionId:1,materialId:1,releaseStart:false,releaseEnd:false}};
  s.supports={1:{id:1,nodeId:1,type:'fixed'}};
  s.loads=[{type:'distributed',data:{elementId:1,a:1,b:2,qI:sign,qJ:-sign}}];
  for(const results of [solve_2d(s),JSON.parse(solve_pdelta_2d(JSON.stringify(s),100,1e-10)).results]) {
    const ef=results.elementForces[0];
    const envelope=compute_envelope_2d([results]).shear.elements[0];
    expect(Math.max(...envelope.posValues)).toBeCloseTo(Math.max(0,ef.vStart+(sign>0?0.25:0)),10);
    expect(Math.min(...envelope.negValues)).toBeCloseTo(Math.min(0,ef.vStart+(sign<0?-0.25:0)),10);
    expect(envelope.tPositions.some((t:number)=>Math.abs(t-0.015)<1e-12)).toBe(true);
    for(const d of [JSON.parse(compute_diagrams_2d(JSON.stringify({input:s,results}))).shear[0],computeElementDiagram('shear',ef,0,0,100,0)]) {
      expect(d.maxValue-ef.vStart).toBeCloseTo(sign>0?0.25:0,10);
      expect(d.minValue-ef.vStart).toBeCloseTo(sign<0?-0.25:0,10);
      expect(d.points.some((p:{t:number})=>Math.abs(p.t-0.015)<1e-12)).toBe(true);
    }
  }
});
