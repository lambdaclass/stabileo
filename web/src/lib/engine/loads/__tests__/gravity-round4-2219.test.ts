import { describe, expect, it } from 'vitest';
import { evaluateDiagramAt, computeDiagram3D } from '../../diagrams-3d';
import type { ElementForces3D } from '../../types-3d';
import { buildSolverLoads3D, memberRef3D, type ModelData } from '../../solver-service';
import { reframedDistributed } from '../../../model/loads/load-frame';
import { physicalRegion, transferRegionToCarriers, positionallyCollinear } from '../physical-region-loads';
import { regionModel } from './physical-region-invariance';

describe('known wrong result: #2219 round4', () => {
  for (const density of [undefined,0,0.2]) for (const couple of [-0.5,0.5,0]) it(`torque steps coexist with density=${density}, couple=${couple}`, () => {
    const start=-couple*4.5/6-(density??0)*3;
    const ef={elementId:1,length:6,mxStart:start,mxEnd:start+couple+(density??0)*6,pointTorques:[{a:1.5,p:couple}],pointLoadsY:[],pointLoadsZ:[],memberMoments:density===undefined?[]:[{a:0,b:6,moments:{x:[density,density,density],y:[1,1,1],z:[0,0,0]}}]} as unknown as ElementForces3D;
    for(const x of [0,1.5-1e-6,1.5,1.5+1e-6,3,6]) expect(evaluateDiagramAt(ef,'torsion',x/6)).toBeCloseTo(start+(density??0)*x+(x>1.5?couple:0),10);
    if(couple) {
      const ts=computeDiagram3D(ef,'torsion').points.map(p=>p.t);
      expect(ts.some(t=>t<0.25&&t>0.24999)).toBe(true);
      expect(ts.some(t=>t>0.25&&t<0.25001)).toBe(true);
    }
  });

  for(const height of [0,1,10]) for(const frame of ['projected','global','local'] as const) for(const leftHand of [false,true]) it(`moment frame scaling height=${height}, frame=${frame}, leftHand=${leftHand}`,()=>{
    const model=regionModel([[[0,0,0],[1,0,height],[1,1,height],[0,1,0]]]) as unknown as ModelData;
    model.supports=new Map();
    const axes=memberRef3D(model,1,false)!.axes;
    const d={elementId:1,qYI:0,qYJ:0,qZI:0,qZJ:0,frame,moments:{x:[1,2,3],y:[2,3,4],z:[3,4,5]}} as const;
    const load={...d,moments:{x:[...d.moments.x],y:[...d.moments.y],z:[...d.moments.z]}} as import('../../member-loads').DistributedLoad3DLike;
    model.loads=[{type:'distributed3d',data:load}] as ModelData['loads'];
    const local=buildSolverLoads3D(model,model.loads,false,leftHand).flatMap(l=>l.type==='distributed'&&l.data.moments?[l.data]:[])[0]!;
    const global=reframedDistributed(load,axes,'global',leftHand).moments!;
    const expected=[1,2,3].map((v,k)=>frame==='projected'?v*Math.sqrt(1-axes.ex[k]!**2):v);
    const actual=([axes.ex,axes.ey,axes.ez] as number[][]).reduce<number[]>((g,axis,k)=>g.map((v,j)=>v+axis[j]!*local.moments![(['x','y','z'] as const)[k]!][0]) as number[],[0,0,0]);
    if(frame!=='local') for(let k=0;k<3;k++) {
      expect(actual[k]).toBeCloseTo(expected[k]!,10);
      expect(global[(['x','y','z'] as const)[k]!][0]).toBeCloseTo(expected[k]!,10);
    }
    const again=reframedDistributed({...load,...reframedDistributed(load,axes,'local',leftHand)},axes,'global',leftHand).moments!;
    for(const axis of ['x','y','z'] as const) for(let sample=0;sample<3;sample++) expect(again[axis][sample]).toBeCloseTo(global[axis][sample]!,10);
  });

  for(const epsilon of [0,1e-7,-1e-7,1e-5]) for(const angle of [0,0.37]) for(const mirror of [1,-1]) for(const split of [false,true]) it(`positional carrier collinearity epsilon=${epsilon}, angle=${angle}, mirror=${mirror}, split=${split}`,()=>{
    const transform=([x,y]:number[]):[number,number]=>[mirror*x!*Math.cos(angle)-y!*Math.sin(angle),mirror*x!*Math.sin(angle)+y!*Math.cos(angle)];
    const original=[[0,0],[1,0],[2,epsilon],[2,1],[1,1],[0,1+epsilon]];
    const ring=original.map(transform);
    const divided=split?ring.flatMap((p,k)=>{const q=ring[(k+1)%ring.length]!;return [p,[(p[0]+q[0])/2,(p[1]+q[1])/2]];}):ring;
    const m=regionModel([divided]);
    const out=transferRegionToCarriers(m,physicalRegion(ring),[...m.elements.keys()]);
    let area=0,firstX=0,firstY=0;
    for(let k=0;k<ring.length;k++) {const p=ring[k]!,q=ring[(k+1)%ring.length]!,c=p[0]*q[1]-q[0]*p[1];area+=c/2;firstX+=(p[0]+q[0])*c/6;firstY+=(p[1]+q[1])*c/6;}
    let force=0,x=0,y=0;
    for(const p of out.pieces) {const e=m.elements.get(p.elementId)!,a=m.nodes.get(e.nodeI)!,b=m.nodes.get(e.nodeJ)!,L=Math.hypot(b.x-a.x,b.y-a.y),h=p.b-p.a,f=h*(p.wI+p.wJ)/2,s=p.a*f+h*h*(p.wI+2*p.wJ)/6;force+=f;x+=a.x*f+(b.x-a.x)/L*s;y+=a.y*f+(b.y-a.y)/L*s;}
    for(const p of out.moments) {const h=p.b-p.a;x+=h*(p.first[0][0]+4*p.first[1][0]+p.first[2][0])/6;y+=h*(p.first[0][1]+4*p.first[1][1]+p.first[2][1])/6;}
    expect(Math.abs(force-Math.abs(area))).toBeLessThan(1e-12);
    expect(Math.abs(x-firstX*Math.sign(area))).toBeLessThan(1e-12);
    expect(Math.abs(y-firstY*Math.sign(area))).toBeLessThan(1e-12);
    const ids=split?[1,2]:[1];
    let intensity=0,eccentric=0;
    for(const id of ids) {
      const e=m.elements.get(id)!,a=m.nodes.get(e.nodeI)!,s=0.75-Math.hypot(a.x-ring[0]![0],a.y-ring[0]![1]);
      for(const p of out.pieces.filter(p=>p.elementId===id&&s>p.a&&s<p.b)) intensity+=p.wI+(p.wJ-p.wI)*(s-p.a)/(p.b-p.a);
      for(const p of out.moments.filter(p=>p.elementId===id&&s>p.a&&s<p.b)) {const t=(s-p.a)/(p.b-p.a),v=p.first.map(v=>(-Math.sin(angle)*v[0]+Math.cos(angle)*v[1]));eccentric+=2*(t-.5)*(t-1)*v[0]!+4*t*(1-t)*v[1]!+2*t*(t-.5)*v[2]!;}
    }
    const depth=(1+epsilon*0.25)/(1+Math.hypot(1,epsilon));
    expect(Math.abs(intensity-depth)).toBeLessThan(1e-12);
    expect(Math.abs(eccentric-depth*depth/2)).toBeLessThan(1e-12);
  });
});

for(const [offset,accepted] of [[0,true],[1e-15,true],[1e-12,false],[1e-7,false]] as const) it(`positional collinearity roundoff boundary ${offset}`,()=>{
  expect(positionallyCollinear([0,0],[1,0],[1,0],[2,offset])).toBe(accepted);
  expect(positionallyCollinear([1,0],[0,0],[2,offset],[1,0])).toBe(accepted);
});
