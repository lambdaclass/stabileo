import { expect, it } from 'vitest';
import { scaledLoad, editLeavesNothing } from '../../../model/loads/load-magnitudes';
import { splitElementLoads } from '../../../model/edit/member-split';
import { reframedDistributed } from '../../../model/loads/load-frame';
import { carriedLoad } from '../../../model/edit/transform-fields';
import { reflection } from '../../../model/edit/affine';
import { reverseElementInModel } from '../../../store/reverse-element';
import { materializeStandingPlaneModel } from '../../../store/materialize-space';
import { modelStore, type Load } from '../../../store/model.svelte';
import '../../../store/index';
import { flipMembers } from '../../../model/edit/flip-members';
import { quadraticAt } from '../../member-moments';

const load = (): Extract<Load,{type:'distributed3d'}> => ({ type:'distributed3d', data:{ id:1, elementId:1, a:1, b:5, qYI:0, qYJ:0, qZI:0, qZJ:0, moments:{x:[1,9,25],y:[2,18,50],z:[-1,-9,-25]} } });

it('scaling and zero-load editing retain a pure member moment load',()=>{
  const original=load(),scaled=scaledLoad(original,-2);
  expect(scaled.data.moments).toEqual({x:[-2,-18,-50],y:[-4,-36,-100],z:[2,18,50]});
  expect(original.data.moments!.x).toEqual([1,9,25]);
  expect(editLeavesNothing(original,{qZI:0})).toBe(false);
  expect(editLeavesNothing(scaledLoad(original,0),{qZI:0})).toBe(true);
});

it('unequal member cuts keep the quadratic moment at its physical station',()=>{
  let id=10;
  const result=splitElementLoads([load()],1,[0,2,4.5,6],[2,3,4],()=>id++);
  expect(result.kept).toHaveLength(0);
  expect(result.added).toHaveLength(3);
  result.added.forEach((l,k)=>{
    if(l.type!=='distributed3d') throw new Error('Wrong member load kind');
    const offset=[0,2,4.5][k]!,L=[2,2.5,1.5][k]!,a=l.data.a??0,b=l.data.b??L;
    for(const t of [0,0.25,0.5,0.75,1]) {
      const x=offset+a+t*(b-a);
      expect(quadraticAt(l.data.moments!.x,t)).toBeCloseTo(x*x,12);
      expect(quadraticAt(l.data.moments!.y,t)).toBeCloseTo(2*x*x,12);
    }
  });
});

for(const leftHand of [false,true]) it(`reframing a member density preserves the global moment, leftHand=${leftHand}`,()=>{
  const axes={ex:[0,1,0] as [number,number,number],ey:[-1,0,0] as [number,number,number],ez:[0,0,1] as [number,number,number],L:6};
  const original=load().data,global={...original,...reframedDistributed(original,axes,'global',leftHand)};
  expect(global.moments!.x).toEqual((leftHand?[2,18,50]:[-2,-18,-50]));
  expect(global.moments!.y).toEqual([1,9,25]);
  expect(global.moments!.z).toEqual([-1,-9,-25]);
  expect(reframedDistributed(global,axes,'local',leftHand).moments).toEqual(original.moments);
});

it('reflection carries global moment density as an axial vector',()=>{
  const original=load();original.data.frame='global';
  const reflected=carriedLoad(reflection([0,0,0],[1,0,0]),original,new Map(),new Map([[1,2]]),new Map(),()=>({sy:-1,sz:1}))!.load;
  if(reflected?.type!=='distributed3d') throw new Error('Missing reflected load');
  expect(reflected.data.moments).toEqual({x:[1,9,25],y:[-2,-18,-50],z:[1,9,25]});
});

for(const operation of ['reverse','flip'] as const) it(`${operation} retains the physical member moment profile`,()=>{
  modelStore.clear();
  const a=modelStore.addNode(0,0,0),b=modelStore.addNode(6,0,0),e=modelStore.addElement(a,b);
  modelStore.addLoadEntry({...load(),data:{...load().data,elementId:e}});
  if(operation==='reverse') expect(reverseElementInModel(modelStore.model,e,true)).toBe(true);
  else expect(flipMembers([e]).flipped).toEqual([e]);
  const d=modelStore.loads[0]!;
  if(d.type!=='distributed3d') throw new Error('Missing member load');
  expect(d.data.a).toBe(1);expect(d.data.b).toBe(5);
  expect(d.data.moments!.x).toEqual([-25,-9,-1]);
  expect(d.data.moments!.y).toEqual(operation==='reverse'?[-50,-18,-2]:[50,18,2]);
  expect(d.data.moments!.z).toEqual(operation==='reverse'?[-25,-9,-1]:[25,9,1]);
});

it('spatial moment loading prevents plane materialization and retains its density',()=>{
  modelStore.clear();
  const a=modelStore.addNode(0,0),b=modelStore.addNode(6,0),e=modelStore.addElement(a,b);
  modelStore.addLoadEntry({...load(),data:{...load().data,elementId:e}});
  expect(materializeStandingPlaneModel(modelStore.model,()=>100)).toBe(false);
  const d=modelStore.loads[0]!;
  if(d.type!=='distributed3d') throw new Error('Missing member load');
  expect(d.data.moments).toEqual(load().data.moments);
});

for(const h of [0.5e-12,1.5e-12,0.5e-9,1.5e-9]) it(`member subdivision retains slivers adjacent to a cut, width=${h}`,()=>{
  const a=2,b=a+h,original=load();
  original.data.a=a;original.data.b=4;original.data.qZI=-1;original.data.qZJ=-1;
  original.data.moments={x:[-1,-1,-1],y:[0,0,0],z:[0,0,0]};
  let id=10;
  const part=splitElementLoads([original],1,[0,b,6],[2,3],()=>id++).added.filter(l=>'elementId' in l.data && l.data.elementId===2);
  const force=part.reduce((s,l)=>s+(l.type==='pointOnElement3d'?l.data.pz:l.type==='distributed3d'?(l.data.qZI+l.data.qZJ)*((l.data.b??b)-(l.data.a??0))/2:0),0);
  const torque=part.reduce((s,l)=>s+(l.type==='pointOnElement3d'?(l.data.mx??0):l.type==='distributed3d'?((l.data.b??b)-(l.data.a??0))*l.data.moments!.x[0]:0),0);
  expect(force/(b-a)).toBeCloseTo(-1,12);
  expect(torque/(b-a)).toBeCloseTo(-1,12);
  expect(part).toHaveLength(1);
  expect(part[0]!.type).toBe('distributed3d');
  expect(part[0]!.data).toMatchObject({ a, qZI: -1, qZJ: -1, moments: original.data.moments });
});
