import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_3d, solve_pdelta_3d, compute_diagram_value_at_3d, compute_diagrams_3d } from '../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async()=>{await initSolver();});
describe.skipIf(!process.env.STABILEO_KNOWN_WRONG_2219)('known wrong result: #2219 round4 WASM',()=>{
  for(const density of [undefined,0,0.2]) for(const nonlinear of [false,true]) it(`recovery preserves torque stations, density=${density}, nonlinear=${nonlinear}`,()=>{
    const input=JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json',import.meta.url),'utf8'))['2023'];
    const e={...input.elements['1'],nodeI:1,nodeJ:2};
    for(const k of ['releaseMyStart','releaseMyEnd','releaseMzStart','releaseMzEnd','releaseTStart','releaseTEnd']) e[k]=false;
    input.nodes={1:{id:1,x:0,y:0,z:0},2:{id:2,x:1.5,y:0,z:0},3:{id:3,x:6,y:0,z:0}};
    input.elements={1:e,2:{...e,id:2,nodeI:2,nodeJ:3}};
    input.supports={1:{nodeId:1,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true},3:{nodeId:3,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}};
    input.loads=[{type:'nodal',data:{nodeId:2,fx:0,fy:0,fz:0,mx:-0.5,my:0,mz:0}}];
    if(density!==undefined) for(const elementId of [1,2]) input.loads.push({type:'distributed',data:{elementId,qYI:0,qYJ:0,qZI:0,qZJ:0,moments:{x:[density,density,density],y:[0.01,0.01,0.01],z:[0,0,0]}}});
    const r:AnalysisResults3D=nonlinear?JSON.parse(solve_pdelta_3d(JSON.stringify(input),100,1e-10)).results:JSON.parse(solve_3d(JSON.stringify(input)));
    const first=r.elementForces.find(f=>f.elementId===1)!,last=r.elementForces.find(f=>f.elementId===2)!;
    const start=0.375-(density??0)*3;
    expect(first.mxStart).toBeCloseTo(start,8);
    const ef={...first,length:6,mxEnd:last.mxEnd,pointTorques:[{a:1.5,p:-0.5}],memberMoments:density===undefined?[]:[{a:0,b:6,moments:{x:[density,density,density] as [number,number,number],y:[0.01,0.01,0.01] as [number,number,number],z:[0,0,0] as [number,number,number]}}]};
    for(const x of [0,1.5-1e-6,1.5,1.5+1e-6,3,6]) {
      const expected=start+(density??0)*x+(x>1.5?-0.5:0);
      expect(compute_diagram_value_at_3d(JSON.stringify({elementForces:ef,kind:'torsion',t:x/6}))).toBeCloseTo(expected,8);
      expect(evaluateDiagramAt(ef,'torsion',x/6)).toBeCloseTo(expected,8);
    }
    const diagrams=JSON.parse(compute_diagrams_3d(JSON.stringify({...r,elementForces:[ef]})));
    expect(diagrams.torsion[0].points.some((p:{t:number})=>p.t>0.25&&p.t<0.25001)).toBe(true);
  });
});
