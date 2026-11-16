import { expect, it } from 'vitest';
import { buildRepairEnvelope, type EnvelopeMember } from '../repair-envelope';
import type { BarPath } from '../../../codes/cirsoc201/bar-geometry';

for (const axis of ['x','y'] as const) for (const split of [false,true]) for (const side of [-1,1]) {
 const point = (s:number,z:number) => ({x:axis==='x'?s:0,y:axis==='y'?s:0,z});
 const members:EnvelopeMember[] = [
  {elementId:1,kind:'beam',start:point(0,0),end:point(1,0),b:0.35,h:0.65,cover:0.025,stirrupDiaMm:6},
  ...[0,1].map((s,i)=>({elementId:2+i,kind:'column' as const,start:point(s,-1),end:point(s,0),b:0.5,h:0.5,cover:0.025,stirrupDiaMm:8})),
 ];
 const start=point(-0.1,side*0.25), end=point(1.1,side*0.25), mid=point(0.5,side*0.25);
 const bar = {id:'run',diameterMm:16,role:'longitudinal',segments:split ? [{kind:'straight',start,end:mid,length:0.6},{kind:'straight',start:mid,end,length:0.6}] : [{kind:'straight',start,end,length:1.2}],ownerElementIds:[1]} as BarPath;
 const envelope=buildRepairEnvelope(members);
 it(`known wrong result: #2171 a beam run between two joints stays inside its section ${axis} ${split} ${side}`,()=>{
  expect(envelope.reject(bar,{x:0,y:0,z:side*0.05})?.reason).toBe('outsideSection');
 });
 it(`a run inside the cover boundary may move outward ${axis} ${split} ${side}`,()=>{
  expect(envelope.reject(bar,{x:0,y:0,z:side*0.01})).toBeNull();
 });
 const room=members[0]!.h/2-members[0]!.cover-members[0]!.stirrupDiaMm/1000-bar.diameterMm/2000;
 it(`the exact cover boundary is retained ${axis} ${split} ${side}`,()=>{
  expect(envelope.reject(bar,{x:0,y:0,z:side*(room-0.25)})).toBeNull();
 });
 it(`known wrong result: #2171 a run beyond the cover boundary is refused ${axis} ${split} ${side}`,()=>{
  expect(envelope.reject(bar,{x:0,y:0,z:side*(room-0.25+0.001)})?.reason).toBe('outsideSection');
 });

}
