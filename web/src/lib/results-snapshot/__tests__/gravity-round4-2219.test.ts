import { buildSolverLoads3D, type ModelData } from '../../engine/solver-service';
import { floorLoad } from '../../engine/loads/floor-loads';
import { physicalRegion, transferRegionToCarriers } from '../../engine/loads/physical-region-loads';
import { regionModel } from '../../engine/loads/__tests__/physical-region-invariance';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { mapMoments } from '../../engine/member-moments';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_3d, solve_pdelta_3d, compute_diagram_value_at_3d, compute_diagrams_3d } from '../../wasm/dedaliano_engine.js';
import { collapseVariableResults } from '../../engine/variable-members';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async()=>{await initSolver();});
describe('known wrong result: #2219 round4 WASM',()=>{
  for(const density of [undefined,0,0.2]) for(const nonlinear of [false,true]) it(`recovery preserves torque stations, density=${density}, nonlinear=${nonlinear}`,()=>{
    const input=JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json',import.meta.url),'utf8'))['2023'];
    const e={...input.elements['1'],nodeI:1,nodeJ:2};
    for(const k of ['releaseMyStart','releaseMyEnd','releaseMzStart','releaseMzEnd','releaseTStart','releaseTEnd']) e[k]=false;
    input.nodes={1:{id:1,x:0,y:0,z:0},2:{id:2,x:1.5,y:0,z:0},3:{id:3,x:6,y:0,z:0}};
    input.elements={1:e,2:{...e,id:2,nodeI:2,nodeJ:3}};
    input.supports={1:{nodeId:1,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true},3:{nodeId:3,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}};
    input.loads=[{type:'nodal',data:{nodeId:2,fx:0,fy:0,fz:0,mx:-0.5,my:0,mz:0}}];
    if(density!==undefined) for(const elementId of [1,2]) input.loads.push({type:'distributed',data:{elementId,qYI:0,qYJ:0,qZI:0,qZJ:0,moments:{x:[density,density,density],y:[0.01,0.01,0.01],z:[0,0,0]}}});
    const r:AnalysisResults3D=nonlinear?JSON.parse(solve_pdelta_3d(JSON.stringify(input),100,1e-10)).results:solve_3d(input);
    const first=r.elementForces.find(f=>f.elementId===1)!;
    const start=0.375-(density??0)*3;
    expect(first.mxStart).toBeCloseTo(start,8);
    const joined=collapseVariableResults(r,{members:new Map([[1,{parentId:1,length:6,innerNodes:[2],pieces:[{id:1,sectionId:1,x0:0,x1:1.5,nodeI:1,nodeJ:2},{id:2,sectionId:1,x0:1.5,x1:6,nodeI:2,nodeJ:3}]}]]),innerNodes:new Set([2])}).elementForces[0]!;
    const ef={...joined,pieces:undefined};
    for(const x of [0,1.5-1e-6,1.5,1.5+1e-6,3,6]) {
      const expected=start+(density??0)*x+(x>1.5?-0.5:0);
      expect(compute_diagram_value_at_3d(JSON.stringify({elementForces:ef,kind:'torsion',t:x/6}))).toBeCloseTo(expected,8);
      expect(evaluateDiagramAt(ef,'torsion',x/6)).toBeCloseTo(expected,8);
    }
    const diagrams=JSON.parse(compute_diagrams_3d(JSON.stringify({...r,elementForces:[ef]})));
    expect(diagrams.torsion[0].points.some((p:{t:number})=>p.t>0.25&&p.t<0.25001)).toBe(true);
  });
});

function depthHand(profile: number[][], x: number, mirror: number) {
  const choose=[[1],[1,1],[1,2,1],[1,3,3,1]];
  const integral=(at:number,power:number,torque=false)=>profile.reduce((sum,[a,b,qa,qb])=>{
    const h=Math.max(0,Math.min(at,b!)-a!),k=(qb!-qa!)/(b!-a!);
    const polynomial=torque?[qa!*qa!/2,qa!*k,k*k/2]:[qa!,k];
    let value=0;
    for(let i=0;i<polynomial.length;i++) for(let j=0;j<=power;j++) value+=polynomial[i]!*choose[power]![j]!*Math.pow(at-a!,power-j)*(-1)**j*Math.pow(h,i+j+1)/(i+j+1);
    return sum+value;
  },0);
  const R=3*integral(1,2)-2*integral(1,3),M0=(integral(1,2)-R)/2,T0=integral(1,1,true);
  return {shear:R-integral(x,0),moment:M0+R*x-integral(x,1),torque:mirror*(T0-integral(x,0,true)),deflection:(M0*x*x/2+R*x**3/6-integral(x,3)/6)/1000,twist:-mirror*(T0*x-integral(x,1,true))/1000};
}

for(const source of ['floor','region']) for(const epsilon of [0,1e-7]) for(const angle of [0,0.37]) for(const mirror of [1,-1]) for(const split of [false,true]) it(`near-collinear carrier hand solution ${source}, epsilon=${epsilon}, angle=${angle}, mirror=${mirror}, split=${split}`,()=>{
  const transform=([x,y]:number[]):[number,number]=>[mirror*x!*Math.cos(angle)-y!*Math.sin(angle),mirror*x!*Math.sin(angle)+y!*Math.cos(angle)];
  const corners=[[0,0],[1,0],[2,epsilon],[2,1],[1,1],[0,1+epsilon]].map(transform),fractions=split?[0,0.3,0.5]:[0,0.5];
  const ring=corners.flatMap((p,k)=>k===0?fractions.map(t=>{const q=corners[1]!;return [p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])];}):[p]);
  const m=regionModel([ring]),ids=fractions.map((_,k)=>k+1);
  const floor=floorLoad({nodes:m.nodes,beams:[...m.elements.values()].map(e=>({...e,type:'frame' as const})),q:1,distribution:'twoWay'});
  const region=transferRegionToCarriers(m,physicalRegion(corners),[...m.elements.keys()]);
  const s=JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json',import.meta.url),'utf8'))['2023'];
  const elements=ids.map(id=>m.elements.get(id)!),nodeIds=[elements[0]!.nodeI,...elements.map(e=>e.nodeJ)];
  s.nodes=Object.fromEntries(nodeIds.map(id=>[id,m.nodes.get(id)]));
  s.elements=Object.fromEntries(elements.map(e=>[e.id,{...s.elements['1'],...e}]));
  for(const e of Object.values(s.elements) as Record<string,unknown>[]) for(const key of ['releaseMyStart','releaseMyEnd','releaseMzStart','releaseMzEnd','releaseTStart','releaseTEnd']) e[key]=false;
  Object.assign(s.materials['1'],{e:1000,nu:0});Object.assign(s.sections['1'],{a:0.1,iy:0.001,iz:0.001,j:0.002});
  for(const key of ['cw','asY','asZ']) delete s.sections['1'][key];
  s.supports=Object.fromEntries([nodeIds[0]!,nodeIds.at(-1)!].map(nodeId=>[nodeId,{nodeId,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}]));
  s.loads=source==='floor'?floor.loads.filter(l=>ids.includes(l.elementId)).map(l=>({type:'distributed',data:l})):region.pieces.filter(l=>ids.includes(l.elementId)).map(l=>({type:'distributed',data:{elementId:l.elementId,a:l.a,b:l.b,qYI:0,qYJ:0,qZI:-l.wI,qZJ:-l.wJ}}));
  if(source==='region') for(const l of region.moments.filter(l=>ids.includes(l.elementId))) {
    const e=m.elements.get(l.elementId)!,axes=computeLocalAxes3D({...m.nodes.get(e.nodeI)!,z:3},{...m.nodes.get(e.nodeJ)!,z:3});
    const moments=mapMoments({x:l.first.map(v=>-v[1]) as [number,number,number],y:l.first.map(v=>v[0]) as [number,number,number],z:[0,0,0]},v=>[axes.ex,axes.ey,axes.ez].map(axis=>v.reduce((sum,x,i)=>sum+x*axis[i]!,0)) as [number,number,number]);
    s.loads.push({type:'distributed',data:{elementId:l.elementId,a:l.a,b:l.b,qYI:0,qYJ:0,qZI:0,qZJ:0,moments}});
  }
  const norm=Math.hypot(1,epsilon),r=epsilon/(norm+1),left=(1+epsilon)/(1+norm+epsilon),rightY=1/(1+norm-epsilon*r),right=1-r*rightY;
  const profile=[[0,left,0,left],[left,right,left,rightY],...(epsilon?[[right,1,rightY,0]]:[])];
  for(const result of [solve_3d(s),JSON.parse(solve_pdelta_3d(JSON.stringify(s),100,1e-10)).results] as AnalysisResults3D[]) {
    for(const [k,id] of ids.entries()) {const ef=result.elementForces.find(f=>f.elementId===id)!;for(const t of [0.1,0.4,0.7,0.9]) {
      const x=fractions[k]!+t*ef.length,hand=depthHand(profile,x,mirror);
      expect(evaluateDiagramAt(ef,'shearZ',t)).toBeCloseTo(hand.shear,10);
      expect(evaluateDiagramAt(ef,'momentY',t)).toBeCloseTo(hand.moment,10);
      expect(evaluateDiagramAt(ef,'torsion',t)).toBeCloseTo(hand.torque,10);
    }}
    const d=result.displacements.find(d=>d.nodeId===nodeIds[fractions.indexOf(0.5)])!,hand=depthHand(profile,0.5,mirror);
    expect(d.uz).toBeCloseTo(hand.deflection,12);
    expect(d.rx*mirror*Math.cos(angle)+d.ry*mirror*Math.sin(angle)).toBeCloseTo(hand.twist,12);
  }
});

for(const frame of ['projected','global'] as const) it(`sloped moment density retains its hand-solved torque and twist, ${frame}`,()=>{
  const m=regionModel([[[0,0,0],[0.5,0,0.5],[1,0,1],[1,1,1],[0,1,0]]]) as unknown as ModelData;
  m.supports=new Map();m.loads=[1,2].map(elementId=>({type:'distributed3d',data:{id:elementId,elementId,qYI:0,qYJ:0,qZI:0,qZJ:0,frame,moments:{x:[1,1,1],y:[0,0,0],z:[0,0,0]}}}));
  const s=JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json',import.meta.url),'utf8'))['2023'];
  s.nodes=Object.fromEntries([...m.nodes].filter(([id])=>id<=3));
  s.elements=Object.fromEntries([1,2].map(id=>[id,{...s.elements['1'],...m.elements.get(id)}]));
  for(const e of Object.values(s.elements) as Record<string,unknown>[]) for(const key of ['releaseMyStart','releaseMyEnd','releaseMzStart','releaseMzEnd','releaseTStart','releaseTEnd']) e[key]=false;
  Object.assign(s.materials['1'],{e:1000,nu:0});Object.assign(s.sections['1'],{a:0.1,iy:0.001,iz:0.001,j:0.002});
  for(const key of ['cw','asY','asZ']) delete s.sections['1'][key];
  s.supports=Object.fromEntries([1,3].map(nodeId=>[nodeId,{nodeId,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}]));
  s.loads=buildSolverLoads3D(m,m.loads,false,false);
  const L=Math.sqrt(2),q=frame==='projected'?0.5:1/Math.sqrt(2);
  for(const result of [solve_3d(s),JSON.parse(solve_pdelta_3d(JSON.stringify(s),100,1e-10)).results] as AnalysisResults3D[]) {
    for(const ef of result.elementForces) for(const t of [0,0.25,0.5,0.75,1]) {
      const x=(ef.elementId-1)*L/2+t*L/2;
      expect(evaluateDiagramAt(ef,'torsion',t)).toBeCloseTo(q*(x-L/2),10);
    }
    const d=result.displacements.find(d=>d.nodeId===2)!;
    expect((d.rx+d.rz)/Math.sqrt(2)).toBeCloseTo(q*L*L/(8*1000),12);
  }
});
