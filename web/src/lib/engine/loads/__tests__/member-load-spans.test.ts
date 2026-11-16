import { expect, it } from 'vitest';
import { MIN_GRAVITY_MEMBER_SPAN, memberLoadSpans, plannedMemberLoadSpans } from '../member-load-spans';
import { planAreaLoads } from '../plan-area-loads';
import { gravityLayout } from '../plan-gravity';
import { regionModel, rectangle } from './physical-region-invariance';

for (const h of [0.5e-12, 1e-12, 1.5e-12, MIN_GRAVITY_MEMBER_SPAN / 2, MIN_GRAVITY_MEMBER_SPAN, 2 * MIN_GRAVITY_MEMBER_SPAN]) it(`intermediate loading retains the exact density, h=${h}`, () => {
  const load = { elementId: 1, a: 0, b: h, qYI: 0, qYJ: 0, qZI: -1 / h, qZJ: -1 / h };
  const out = memberLoadSpans([load], () => 6);
  expect(out.distributed).toEqual([load]); expect(out.concentrated).toEqual([]);
});

it('a sign-changing force retains its exact member density', () => {
  const h = 0.5e-12;
  const load = { elementId: 1, a: 0, b: h, qYI: 0, qYJ: 0, qZI: 1 / h, qZJ: -1 / h };
  expect(memberLoadSpans([load], () => 6)).toEqual({ distributed: [load], concentrated: [] });
});

it('a quadratic torque sliver retains its exact member density', () => {
  const h = 0.5e-12;
  const load = { elementId: 1, a: 0, b: h, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [0, 1 / h, 4 / h] as [number, number, number], y: [0, 0, 0] as [number, number, number], z: [0, 0, 0] as [number, number, number] } };
  expect(memberLoadSpans([load], () => 6)).toEqual({ distributed: [load], concentrated: [] });
});

it('projected slivers retain distributed loading and require source geometry', () => {
  const h = 0.5e-12, loads = [{ elementId: 1, a: 0, b: h, q: -1 / h, frame: 'projected' as const }];
  const model = { nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 3, y: 0, z: 4 }]]), elements: new Map([[1, { nodeI: 1, nodeJ: 2 }]]) };
  const out = plannedMemberLoadSpans(loads, model);
  expect(out.concentrated).toEqual([]);
  expect(out.distributed).toEqual(loads);
  expect(plannedMemberLoadSpans(loads).distributed).toEqual(loads);
  expect(plannedMemberLoadSpans([{ ...loads[0]!, b: 2e-9 }]).distributed).toHaveLength(1);
});

it('planned area forces and eccentric moments share the span boundary',()=>{
  const model=regionModel([rectangle(0,0,6,4)]),layout=gravityLayout(model,{mode:'panels',tributaryWidth:1}),a=1.5,b=a+0.5e-12,h=b-a;
  layout.pieces=[{elementId:1,a,b,wI:1/h,wJ:1/h,roof:false,panel:0}];
  layout.moments=[{elementId:1,a,b,moments:{x:[-0.5/h,-0.5/h,-0.5/h],y:[0,0,0],z:[0,0,0]},roof:false,panel:0}];
  layout.concentrated=[];layout.points=[];layout.couples=[];layout.widthMembers=[];layout.shellQuads=[];
  const out = planAreaLoads({layout,model,tributaryWidth:1,floor:{dead:1,lo:0,liveOf:()=>0}});
  expect(out.concentrated).toEqual([]);
  expect(out.distributed).toHaveLength(2);
  for (const load of out.distributed) { expect(load.a).toBe(a); expect(load.b).toBe(b); }
  expect(out.distributed.find(l => !l.moments)!.q).toBe(-1 / h);
  expect(out.distributed.find(l => l.moments)!.moments!.x).toEqual([-0.5 / h, -0.5 / h, -0.5 / h]);
});
