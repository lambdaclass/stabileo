import { expect, it } from 'vitest';
import { gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
function model(w=4.76,angle=0) {
  const p=[[0,0],[10,0],[10,6],[0,6],[0,0],[w,0],[w,6],[0,6]];
  const nodes=new Map(p.map(([x,y],k)=>[k+1,{id:k+1,x:x!*Math.cos(angle)-y!*Math.sin(angle),y:x!*Math.sin(angle)+y!*Math.cos(angle),z:3}]));
  const elements=new Map([1,2,3,4].map((id,k)=>[id,{id,nodeI:k+1,nodeJ:(k+1)%4+1,sectionId:1,materialId:1}]));
  return {nodes,elements,quads:new Map([[1,{id:1,nodes:[5,6,7,8],thickness:0.1,materialId:1}]]),sections:new Map([[1,{id:1,a:0.1}]]),materials:new Map([[1,{id:1,rho:25}]]),loadCases:[]};
}
function totals(m:ReturnType<typeof model>,angle=0) {
  const l=gravityLayout(m,{mode:'panels',tributaryWidth:1,loadEveryPanel:true});
  const out=planAreaLoads({layout:l,tributaryWidth:1,floor:{dead:1,lo:0,liveOf:()=>0}});
  let force=0,first=0;
  for (const d of out.distributed) {
    const e=m.elements.get(d.elementId)!;const a=m.nodes.get(e.nodeI)!,b=m.nodes.get(e.nodeJ)!;
    const L=Math.hypot(b.x-a.x,b.y-a.y),lo=d.a??0,hi=d.b??L;
    const q0=-d.q,q1=-(d.qJ??d.q),f=(q0+q1)*(hi-lo)/2;
    const s=lo+(hi-lo)*(q0+2*q1)/(3*(q0+q1));
    const x=(a.x+(b.x-a.x)*s/L)*Math.cos(angle)+(a.y+(b.y-a.y)*s/L)*Math.sin(angle);
    force+=f;first+=f*x;
  }
  for(const s of out.surface){const q=m.quads.get(s.quadId)!;const pts=q.nodes.map(id=>m.nodes.get(id)!);const area=l.shellQuads.find(x=>x.quadId===s.quadId)!.area;force+=s.q*area;first+=s.q*area*pts.reduce((sum,p)=>sum+p.x*Math.cos(angle)+p.y*Math.sin(angle),0)/pts.length;}
  for (const n of out.nodal) { const p=m.nodes.get(n.nodeId)!; const c=n as typeof n & { mx?:number; my?:number }; force-=n.fz; first+=-n.fz*(p.x*Math.cos(angle)+p.y*Math.sin(angle))+(c.my??0)*Math.cos(angle)-(c.mx??0)*Math.sin(angle); }
  return {force,first};
}
it('known wrong result: #2199 partial shell coverage preserves total vertical area load',()=>{expect(totals(model()).force).toBeCloseTo(60,8)});
it('known wrong result: #2200 partial shell coverage preserves first moment',()=>{expect(totals(model(5)).first).toBeCloseTo(300,8)});
it('known wrong result: #2199 partial shell coverage is invariant to plan rotation',()=>{expect(totals(model(4.76,0.37),0.37).force).toBeCloseTo(totals(model()).force,8)});
it('full beam panel retains force and moment',()=>{const m=model();m.quads.clear();expect(totals(m)).toEqual({force:60,first:300})});
