import { expect, it } from 'vitest';
import { MIN_GRAVITY_MEMBER_SPAN, MIN_NATIVE_MEMBER_LOAD_SPAN, retainMemberLoadSpan, memberLoadSpans, plannedMemberLoadSpans } from '../member-load-spans';
import { planAreaLoads } from '../plan-area-loads';
import { gravityLayout } from '../plan-gravity';
import { regionModel, rectangle } from './physical-region-invariance';

for (const h of [0.5e-12, 1e-12, 1.5e-12, MIN_GRAVITY_MEMBER_SPAN / 2, MIN_GRAVITY_MEMBER_SPAN, MIN_NATIVE_MEMBER_LOAD_SPAN, 2 * MIN_GRAVITY_MEMBER_SPAN]) it.skip(`known wrong result: #2219 intermediate loading retains the exact density, h=${h}`, () => {
  const load = { elementId: 1, a: 0, b: h, qYI: 0, qYJ: 0, qZI: -1 / h, qZJ: -1 / h };
  if (h < MIN_NATIVE_MEMBER_LOAD_SPAN) { expect(() => memberLoadSpans([load], () => 6)).toThrow(/native supported minimum/); return; }
  const out = memberLoadSpans([load], () => 6);
  expect(out.distributed).toEqual([load]); expect(out.concentrated).toEqual([]);
});

it.skip('known wrong result: #2219 a sign-changing force retains its exact member density', () => {
  const h = 0.5e-12;
  const load = { elementId: 1, a: 0, b: h, qYI: 0, qYJ: 0, qZI: 1 / h, qZJ: -1 / h };
  expect(() => memberLoadSpans([load], () => 6)).toThrow(/native supported minimum/);
});

it.skip('known wrong result: #2219 a quadratic torque sliver retains its exact member density', () => {
  const h = 0.5e-12;
  const load = { elementId: 1, a: 0, b: h, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [0, 1 / h, 4 / h] as [number, number, number], y: [0, 0, 0] as [number, number, number], z: [0, 0, 0] as [number, number, number] } };
  expect(() => memberLoadSpans([load], () => 6)).toThrow(/native supported minimum/);
});

it.skip('known wrong result: #2219 projected slivers retain distributed loading and require source geometry', () => {
  const h = 0.5e-12, loads = [{ elementId: 1, a: 0, b: h, q: -1 / h, frame: 'projected' as const }];
  const model = { nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 3, y: 0, z: 4 }]]), elements: new Map([[1, { nodeI: 1, nodeJ: 2 }]]) };
  expect(() => plannedMemberLoadSpans(loads, model)).toThrow(/native supported minimum/);
  expect(() => plannedMemberLoadSpans(loads)).toThrow(/member geometry/);
  expect(plannedMemberLoadSpans([{ ...loads[0]!, b: 2e-9 }], model).distributed).toHaveLength(1);
});

it.skip('known wrong result: #2219 planned area forces and eccentric moments share the span boundary',()=>{
  const model=regionModel([rectangle(0,0,6,4)]),layout=gravityLayout(model,{mode:'panels',tributaryWidth:1}),a=1.5,b=a+0.5e-12,h=b-a;
  layout.pieces=[{elementId:1,a,b,wI:1/h,wJ:1/h,roof:false,panel:0}];
  layout.moments=[{elementId:1,a,b,moments:{x:[-0.5/h,-0.5/h,-0.5/h],y:[0,0,0],z:[0,0,0]},roof:false,panel:0}];
  layout.concentrated=[];layout.points=[];layout.couples=[];layout.widthMembers=[];layout.shellQuads=[];
  expect(() => planAreaLoads({layout,model,tributaryWidth:1,floor:{dead:1,lo:0,liveOf:()=>0}})).toThrow(/native supported minimum/);
});

it('empty-interval normalization cannot discard invalid density or support data', () => {
  for (const a of [-1, 2, NaN, Infinity]) expect(() => retainMemberLoadSpan(1, a, a, 1, [-2, -3])).toThrow();
  for (const q of [NaN, Infinity, -Infinity]) expect(() => retainMemberLoadSpan(1, 0.5, 0.5, 1, [q, -3])).toThrow();
  expect(retainMemberLoadSpan(1, 0.5, 0.5, 1, [-2, -3])).toBe(false);
  expect(retainMemberLoadSpan(1, 0, 1, 1, [-2, -3])).toBe(true);
  expect(retainMemberLoadSpan(1, 0.5, 0.5, 1, [-2, -3], { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] })).toBe(false);
});

for (const entry of ['member', 'planned'] as const) for (const dimension of [2, 3]) for (const [a, b] of [[-1, 1], [0, 6], [2, 1], [0, 0], [NaN, 1], [0, Infinity], [0, 0.5e-12]]) it.skip(`known wrong result: #2219 generated span refuses ${entry} ${dimension}D [${a}, ${b}]`, () => {
  const model = { nodes: new Map([[1, { x: 0, y: 0 }], [2, dimension === 2 ? { x: 3, y: 4 } : { x: 3, y: 0, z: 4 }]]), elements: new Map([[1, { nodeI: 1, nodeJ: 2 }]]) };
  const load = { elementId: 1, a, b, q: -1 };
  expect(() => entry === 'member' ? memberLoadSpans([load], () => 5) : plannedMemberLoadSpans([load], model)).toThrow();
});

for (const h of [1e-12, 1.5e-12, 5]) it('valid generated spans keep their exact densities at width '+h, () => {
  const load = { elementId: 1, a: 0, b: h, q: -1 / h };
  expect(memberLoadSpans([load], () => 5)).toEqual({ distributed: [load], concentrated: [] });
});
