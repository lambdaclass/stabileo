import { expect,it } from 'vitest';
import { floorLoad } from '../floor-loads';
const wrong2201 = process.env.RUN_KNOWN_WRONG === '2201' ? it : it.skip;
function run(poly:number[][], distribution:'twoWay'|'oneWay'='twoWay',zone?:number[][]){
 const nodes=new Map(poly.map(([x,y],k)=>[k+1,{x:x!,y:y!,z:3}]));
 const beams=poly.map((_,k)=>({id:k+1,nodeI:k+1,nodeJ:(k+1)%poly.length+1,type:'frame' as const,sectionId:1}));
 const out=floorLoad({nodes,beams,q:1,distribution,spanAxis:'x',zone:zone?{outer:zone.map(([x,y])=>[x!,y!,3])}:undefined});
 let f=0,x=0,y=0;
 for(const d of out.loads){const e=beams.find(b=>b.id===d.elementId)!,a=nodes.get(e.nodeI)!,b=nodes.get(e.nodeJ)!,L=Math.hypot(b.x-a.x,b.y-a.y),lo=d.a??0,hi=d.b??L;const F=(d.qI+d.qJ)*(hi-lo)/2;const s=lo+(hi-lo)*(d.qI+2*d.qJ)/(3*(d.qI+d.qJ));f+=F;x+=F*(a.x+(b.x-a.x)*s/L);y+=F*(a.y+(b.y-a.y)*s/L)}
 for(const n of out.nodal){const p=nodes.get(n.nodeId)!;f-=n.fz;const c=n as typeof n & { mx?:number; my?:number };x+=-n.fz*p.x+(c.my??0);y+=-n.fz*p.y-(c.mx??0)}
 return {f,x,y,out};
}
wrong2201('known wrong result: #2201 off-centre zone preserves force and both first moments',()=>{const r=run([[0,0],[10,0],[10,6],[0,6]],'twoWay',[[0,0],[1,0],[1,6],[0,6]]);expect(r.f).toBeCloseTo(6,8);expect(r.x).toBeCloseTo(3,8);expect(r.y).toBeCloseTo(18,8)});
