import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_2d, solve_pdelta_2d, compute_diagrams_2d, solve_3d, solve_pdelta_3d, compute_diagrams_3d } from '../../wasm/dedaliano_engine.js';
import { computeElementDiagram } from '../../engine/diagrams';
import { computeDiagram3D, evaluateDiagramAt } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';
import { physicalRegion, transferRegionToCarriers } from '../../engine/loads/physical-region-loads';
import { regionModel } from '../../engine/loads/__tests__/physical-region-invariance';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { mapMoments } from '../../engine/member-moments';

beforeAll(async () => { await initSolver(); });
function fixture() {
  const s=JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json',import.meta.url),'utf8'))['2023'];
  Object.assign(s.materials['1'],{e:1000,nu:0}); Object.assign(s.sections['1'],{a:0.1,iy:0.001,iz:0.001,j:0.002});
  for(const k of ['cw','asY','asZ']) delete s.sections['1'][k];
  for(const k of ['releaseMyStart','releaseMyEnd','releaseMzStart','releaseMzEnd','releaseTStart','releaseTEnd']) s.elements['1'][k]=false;
  return s;
}
for(const axis of ['x','y','z'] as const) for(const sign of [1,-1]) for(const quadratic of [false,true]) it(`WASM and canvas report density extrema ${axis} sign=${sign} quadratic=${quadratic}`,()=>{
  const s=fixture();
  s.nodes={1:{id:1,x:0,y:0,z:0},2:{id:2,x:100,y:0,z:0}};
  s.elements={1:{...s.elements['1'],nodeI:1,nodeJ:2}};
  s.supports={1:{nodeId:1,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}};
  const moments=(v:number[])=>({x:[0,0,0],y:[0,0,0],z:[0,0,0],[axis]:v});
  const values=quadratic?[3*sign/16,-sign/16,3*sign/16]:[sign,sign,sign], cancel=quadratic?-sign/48:-sign;
  s.loads=[{a:1,b:2,moments:moments(values)},{a:2,b:3,moments:moments([cancel,cancel,cancel])}].map(d=>({type:'distributed',data:{elementId:1,qYI:0,qYJ:0,qZI:0,qZJ:0,...d}}));
  const kind=axis==='x'?'torsion':axis==='y'?'momentY':'momentZ', peak=quadratic?1/48:1;
  for(const result of [solve_3d(s),JSON.parse(solve_pdelta_3d(JSON.stringify(s),100,1e-10)).results] as AnalysisResults3D[]) {
    const wasm=JSON.parse(compute_diagrams_3d(JSON.stringify(result)))[kind][0];
    for(const d of [wasm,computeDiagram3D(result.elementForces[0]!,kind)]) {
      expect(d.maxValue).toBeCloseTo(sign>0?peak:0,10);
      expect(d.minValue).toBeCloseTo(sign<0?-peak:0,10);
      expect(d.maxAbsValue).toBeCloseTo(sign*peak,10);
      for(const x of quadratic?[1,1.25,1.75,2,3]:[1,2,3]) expect(d.points.some((p:{t:number})=>Math.abs(p.t-x/100)<1e-12)).toBe(true);
    }
    const tip=result.displacements.find(d=>d.nodeId===2)!;
    if(axis==='x') expect(tip.rx).toBeCloseTo(sign*(quadratic?-1/48:-1)/1000,10);
  }
});
for(const angle of [0,0.37]) for(const mirror of [1,-1]) for(const split of [false,true]) it(`notched carriers retain hand shear bending torsion and deflection angle=${angle} mirror=${mirror} split=${split}`,()=>{
  const transform=([x,y]:number[]):[number,number]=>[mirror*x!*Math.cos(angle)-y!*Math.sin(angle),mirror*x!*Math.sin(angle)+y!*Math.cos(angle)];
  const corners=[[0,0],[10,0],[10,10],[7,10],[5,9],[3,10],[0,10]];
  const ring=corners.flatMap((p,i)=>split?[p,p.map((v,j)=>(v+corners[(i+1)%corners.length]![j]!)/2)]:[p]).map(transform),m=regionModel([ring]);
  const patch=transferRegionToCarriers(m,physicalRegion([[4.99,8.89],[5.01,8.89],[5.01,8.91],[4.99,8.91]].map(transform)),[...m.elements.keys()]);
  const chains=split?[[3,4],[13,14]]:[[2],[7]],ids=chains.flat(),s=fixture();
  s.elements=Object.fromEntries(ids.map(id=>[id,{...s.elements['1'],...m.elements.get(id)}]));
  const nodes=new Set(ids.flatMap(id=>{const e=m.elements.get(id)!;return [e.nodeI,e.nodeJ];}));
  s.nodes=Object.fromEntries([...nodes].map(id=>[id,m.nodes.get(id)]));
  s.supports=Object.fromEntries(chains.map(chain=>m.elements.get(chain[0]!)!.nodeI).map(nodeId=>[nodeId,{nodeId,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}]));
  s.loads=patch.pieces.filter(p=>ids.includes(p.elementId)).map(p=>({type:'distributed',data:{elementId:p.elementId,a:p.a,b:p.b,qYI:0,qYJ:0,qZI:-p.wI,qZJ:-p.wJ}}));
  for(const p of patch.moments.filter(p=>ids.includes(p.elementId))) {
    const e=m.elements.get(p.elementId)!,axes=computeLocalAxes3D({...m.nodes.get(e.nodeI)!,z:3},{...m.nodes.get(e.nodeJ)!,z:3});
    const moments=mapMoments({x:p.first.map(v=>-v[1]) as [number,number,number],y:p.first.map(v=>v[0]) as [number,number,number],z:[0,0,0]},v=>[axes.ex,axes.ey,axes.ez].map(a=>v.reduce((sum,x,k)=>sum+x*a[k]!,0)) as [number,number,number]);
    s.loads.push({type:'distributed',data:{elementId:p.elementId,a:p.a,b:p.b,qYI:0,qYJ:0,qZI:0,qZJ:0,moments}});
  }
  for(const result of [solve_3d(s),JSON.parse(solve_pdelta_3d(JSON.stringify(s),100,1e-10)).results] as AnalysisResults3D[]) for(const [index,chain] of chains.entries()) {
    const [a,b]=index===0?[8.89,8.91]:[1.09,1.11],h=b!-a!,center=(a!+b!)/2;
    for(const [k,id] of chain.entries()) {
      const ef=result.elementForces.find(f=>f.elementId===id)!;
      const start=split?k*5:0;
      const stations=[0.1,0.4,0.7,0.9,...[a!+h/4,a!+h/2,a!+3*h/4].map(x=>(x-start)/ef.length).filter(t=>t>=0&&t<=1)];
      for(const t of stations) {
        const x=start+t*ef.length,u=Math.max(0,Math.min(x,b!)-a!);
        expect(evaluateDiagramAt(ef,'shearZ',t)).toBeCloseTo(0.01*(h-u),10);
        expect(evaluateDiagramAt(ef,'momentY',t)).toBeCloseTo(-0.01*h*center+0.01*h*x-0.01*(u*(x-a!)-u*u/2),10);
        expect(evaluateDiagramAt(ef,'torsion',t)).toBeCloseTo(mirror*0.04995*(h-u),10);
      }
    }
    const last=m.elements.get(chain.at(-1)!)!,tip=result.displacements.find(d=>d.nodeId===last.nodeJ)!,axes=computeLocalAxes3D({...m.nodes.get(last.nodeI)!,z:3},{...m.nodes.get(last.nodeJ)!,z:3});
    const deflection=-0.01*(10*(b!**3-a!**3)-(b!**4-a!**4)/4)/(6*1000);
    expect(tip.uz).toBeCloseTo(deflection,11);
    expect(tip.rx*axes.ex[0]+tip.ry*axes.ex[1]).toBeCloseTo(-mirror*0.04995*h*center/1000,11);
  }
});

it('plane member moments return a localized refusal through sync worker and combination solves',async()=>{
  const { modelStore }=await import('../../store/model.svelte');
  await import('../../store/index');
  const { validateAndSolve2D,validateAndSolve2DAsync,solveCombinations2D }=await import('../../engine/solver-service');
  modelStore.clear();
  const i=modelStore.addNode(0,0,0),j=modelStore.addNode(2,0,0),elementId=modelStore.addElement(i,j);
  modelStore.addSupport(i,'fixed');
  modelStore.addLoadEntry({type:'distributed3d',data:{id:1,elementId,qYI:0,qYJ:0,qZI:0,qZJ:0,moments:{x:[1,1,1],y:[0,0,0],z:[0,0,0]}}});
  for(const result of [validateAndSolve2D(modelStore.model),await validateAndSolve2DAsync(modelStore.model),solveCombinations2D(modelStore.model,[{id:1,name:'D',type:'D'}],[{id:1,name:'D',factors:[{caseId:1,factor:1}]}],false)]) expect(result).toContain(`Member ${elementId}: distributed member moments require a spatial frame solve`);
});

for(const sign of [1,-1]) it(`plane WASM and canvas report partial force extrema sign=${sign}`,()=>{
  const s=fixture();
  s.nodes={1:{id:1,x:0,z:0},2:{id:2,x:100,z:0}};
  s.elements={1:{id:1,type:'frame',nodeI:1,nodeJ:2,sectionId:1,materialId:1,releaseStart:false,releaseEnd:false}};
  s.supports={1:{id:1,nodeId:1,type:'fixed'}};
  s.loads=[{type:'distributed',data:{elementId:1,a:1,b:2,qI:sign,qJ:-sign}}];
  for(const results of [solve_2d(s),JSON.parse(solve_pdelta_2d(JSON.stringify(s),100,1e-10)).results]) {
    const ef=results.elementForces[0];
    for(const d of [JSON.parse(compute_diagrams_2d(JSON.stringify({input:s,results}))).shear[0],computeElementDiagram('shear',ef,0,0,100,0)]) {
      expect(d.maxValue-ef.vStart).toBeCloseTo(sign>0?0.25:0,10);
      expect(d.minValue-ef.vStart).toBeCloseTo(sign<0?-0.25:0,10);
      expect(d.points.some((p:{t:number})=>Math.abs(p.t-0.015)<1e-12)).toBe(true);
    }
  }
});
