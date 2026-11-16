import { expect, it } from 'vitest';
import { MIN_GRAVITY_MEMBER_SPAN, memberLoadSpans, plannedMemberLoadSpans } from '../member-load-spans';
import { planAreaLoads } from '../plan-area-loads';
import { gravityLayout } from '../plan-gravity';
import { regionModel, rectangle } from './physical-region-invariance';

for(const h of [MIN_GRAVITY_MEMBER_SPAN/2, MIN_GRAVITY_MEMBER_SPAN, 2*MIN_GRAVITY_MEMBER_SPAN]) it(`the gravity span boundary preserves the answer, h=${h}`,()=>{
  const load={elementId:1,a:0,b:h,qYI:0,qYJ:0,qZI:-1/h,qZJ:-1/h};
  const out=memberLoadSpans([load],()=>6);
  if(h<MIN_GRAVITY_MEMBER_SPAN) {
    expect(out.distributed).toHaveLength(0);expect(out.concentrated).toHaveLength(1);
    expect(out.concentrated[0]!.pz).toBe(-h*(1/h));expect(out.concentrated[0]!.a/h).toBeCloseTo(0.5,12);
  } else {expect(out.distributed).toEqual([load]);expect(out.concentrated).toEqual([]);}
});

it('a sign-changing force keeps its zero resultant and nonzero first moment',()=>{
  const h=0.5e-12,out=memberLoadSpans([{elementId:1,a:0,b:h,qYI:0,qYJ:0,qZI:1/h,qZJ:-1/h}],()=>6);
  expect(out.distributed).toEqual([]);expect(out.concentrated).toHaveLength(2);
  expect(out.concentrated.reduce((s,p)=>s+p.pz,0)).toBe(0);
  expect(out.concentrated.reduce((s,p)=>s+p.pz*p.a/h,0)).toBeCloseTo(-1/6,12);
});

it('a quadratic torque sliver acts at its own resultant position',()=>{
  const h=0.5e-12,out=memberLoadSpans([{elementId:1,a:0,b:h,qYI:0,qYJ:0,qZI:0,qZJ:0,moments:{x:[0,1/h,4/h] as [number,number,number],y:[0,0,0] as [number,number,number],z:[0,0,0] as [number,number,number]}}],()=>6);
  expect(out.distributed).toEqual([]);expect(out.concentrated).toHaveLength(1);
  expect(out.concentrated[0]!.mx).toBeCloseTo(4/3,12);
  expect(out.concentrated[0]!.a/h).toBeCloseTo(3/4,12);
});

it('projected slivers use the physical projection and refuse missing geometry',()=>{
  const h=0.5e-12,loads=[{elementId:1,a:0,b:h,q:-1/h,frame:'projected' as const}];
  const model={nodes:new Map([[1,{x:0,y:0,z:0}],[2,{x:3,y:0,z:4}]]),elements:new Map([[1,{nodeI:1,nodeJ:2}]])};
  const result=plannedMemberLoadSpans(loads,model);
  expect(result.distributed).toEqual([]);expect(result.concentrated[0]!.frame).toBe('global');
  expect(result.concentrated[0]!.pz).toBeCloseTo(-3/5,12);
  expect(()=>plannedMemberLoadSpans(loads)).toThrow('requires member geometry');
  expect(plannedMemberLoadSpans([{...loads[0]!,b:2e-9}]).distributed).toHaveLength(1);
});

it('planned area forces and eccentric moments share the span boundary',()=>{
  const model=regionModel([rectangle(0,0,6,4)]),layout=gravityLayout(model,{mode:'panels',tributaryWidth:1}),a=1.5,b=a+0.5e-12,h=b-a;
  layout.pieces=[{elementId:1,a,b,wI:1/h,wJ:1/h,roof:false,panel:0}];
  layout.moments=[{elementId:1,a,b,moments:{x:[-0.5/h,-0.5/h,-0.5/h],y:[0,0,0],z:[0,0,0]},roof:false,panel:0}];
  layout.concentrated=[];layout.points=[];layout.couples=[];layout.widthMembers=[];layout.shellQuads=[];
  const out=planAreaLoads({layout,model,tributaryWidth:1,floor:{dead:1,lo:0,liveOf:()=>0}});
  expect(out.distributed).toEqual([]);
  expect(out.concentrated.reduce((s,p)=>s+p.pz,0)).toBeCloseTo(-1,12);
  expect(out.concentrated.reduce((s,p)=>s+(p.mx??0),0)).toBeCloseTo(-0.5,12);
  for(const p of out.concentrated) expect(p.a).toBeCloseTo(a+h/2,12);
});
