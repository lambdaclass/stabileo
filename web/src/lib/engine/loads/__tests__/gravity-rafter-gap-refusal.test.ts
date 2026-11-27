import { expect, it } from 'vitest';
import { teAt } from '../../../i18n/engine-text';
import { buildLoadPlan, roofWeightFor } from '../load-plan';
import { gravityLayout, hasBoundedRafterGap } from '../plan-gravity';
import { driftAndSlidingLoads, snowDriftRefusal } from '../snow-drift-loads';
import { snowLoadCases } from '../snow-loads';
import { offsetRoof, roofPlan, triangulateRoof } from './gravity-offset-roof-fixture';
import { input } from './gravity-width-mass-fixture';
import { snow } from './snow-roof-plane-fixture';

const options = { mode: 'panels', tributaryWidth: 3 } as const;
const snowConfig = { ...snow, roofKind: 'mono', slippery: false } as const;

it.each([
  'gap used as cover',
  'sheltered upper strip',
  'detached shell spanning the gap',
  'detached offset shell spanning the gap',
] as const)(
  '#2607 refuses a bounded gap with %s', finding => {
    for (const split of [false, true]) {
      const { model: quads } = offsetRoof(0.02, 0, 1, split, [4, 6]);
      const node = (x: number, y: number, z: number) => {
        const id = quads.nodes.size + 1;
        quads.nodes.set(id, { id, x, y, z });
        return id;
      };
      const appendMember = (a: number, b: number, y: number, rise: number) => {
        const id = quads.elements.size + 1;
        quads.elements.set(id, {
          ...quads.elements.get(1)!, id,
          nodeI: node(a, y, 3 + a / 5 + rise), nodeJ: node(b, y, 3 + b / 5 + rise),
        });
      };
      const appendShell = (a: number, b: number, lo: number, hi: number, rise: number) => {
        const nodes = [node(a, lo, 3 + a / 5 + rise), node(b, lo, 3 + b / 5 + rise),
          node(b, hi, 3 + b / 5 + rise), node(a, hi, 3 + a / 5 + rise)];
        quads.quads.set(3, { ...quads.quads.get(1)!, id: 3, nodes });
      };
      if (finding === 'gap used as cover') appendMember(4.5, 5.5, 1, -1);
      if (finding === 'sheltered upper strip') {
        appendMember(4, 6, 2.25, 1);
        appendShell(4, 6, 2.125, 2.375, 2);
      }
      if (finding === 'detached shell spanning the gap') appendShell(4, 6, 0.25, 1.75, 0);
      if (finding === 'detached offset shell spanning the gap') appendShell(4, 6, 0.25, 1.75, -0.02);
      const model = split ? triangulateRoof(quads) : quads;
      const reason = { key: 'loadPlan.gravity.rafterGap', params: { members: split ? '1, 2, 3' : '1', gap: '4–6' } };
      expect.soft(teAt(reason, 'en')).toContain('plan stations 4–6 m');
      const refused = { outcome: 'BLOCKED', blockedKeys: [reason], cases: [], distributed: [], nodal: [], surface: [], levels: [] };
      expect.soft(roofPlan(model)).toMatchObject(refused);
      expect.soft(buildLoadPlan(input(model, {
        gravity: options,
        snow: { ...snowConfig, enabled: true, source: 'site' },
      }))).toMatchObject(refused);
      expect.soft(() => gravityLayout(model, options)).toThrow(expect.objectContaining(reason));
      expect.soft(() => gravityLayout(model, { ...options, loadEveryPanel: true, uniformPressure: true })).toThrow(expect.objectContaining(reason));
      expect.soft(() => roofWeightFor(model, options, options.tributaryWidth, 1)).toThrow(expect.objectContaining(reason));
      expect.soft(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
      expect.soft(() => snowLoadCases({ model, tributaryWidth: 3, snow: snowConfig })).toThrow(expect.objectContaining(reason));
      const widthLayout = gravityLayout(model, { ...options, mode: 'width' });
      expect.soft(() => driftAndSlidingLoads(model, widthLayout, {
        pg: snowConfig.pg, pf: 1, balanced: 1, slippery: false, tributaryWidth: 3,
      })).toThrow(expect.objectContaining(reason));
      expect.soft(roofPlan(model, 'width').outcome).toBe('READY');
    }
  },
);

it.each([false, true])('#2607 a continuous attached deck retains shell gravity (subdivided %s)', split => {
  const { model: quads } = offsetRoof(0.02, 0, 1, split);
  const model = split ? triangulateRoof(quads) : quads;
  const plan = roofPlan(model);
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed).toEqual([]);
  expect(plan.surface.filter(load => load.caseType === 'D')).toHaveLength(split ? 4 : 1);
  expect(plan.levels.reduce((sum, level) => sum + level.planAreaM2, 0)).toBeCloseTo(40, 10);
});

it('#2607 refuses a positive opening and accepts meeting deck edges', () => {
  const { model: touching } = offsetRoof(0.02, 0, 1, false, [4, 4]);
  const plan = roofPlan(touching);
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed).toEqual([]);
  expect(plan.surface.filter(load => load.caseType === 'D')).toHaveLength(2);
  expect(plan.levels.reduce((sum, level) => sum + level.planAreaM2, 0)).toBeCloseTo(40, 10);

  const { model: open } = offsetRoof(0.02, 0, 1, false, [4, 4.000001]);
  expect(roofPlan(open)).toMatchObject({
    outcome: 'BLOCKED',
    blockedKeys: [{ key: 'loadPlan.gravity.rafterGap', params: { members: '1', gap: '4–4.000001' } }],
    distributed: [], nodal: [], surface: [],
  });
});

it.each([false, true])('#2607 detached coplanar infill cannot bound a rafter gap (%s)', split => {
  const { model: quads } = offsetRoof(0.02, 0, 1, false, [4, 6]);
  for (const [index, from, to] of [[1, 4, -2], [2, 6, 12]] as const) {
    for (const id of quads.quads.get(index)!.nodes) {
      const node = quads.nodes.get(id)!;
      if (node.x !== from) continue;
      node.x = to;
      node.z = 3 + to / 5;
    }
  }
  const infill = [[0, 0], [10, 0], [10, 4], [0, 4]].map(([x, y]) => {
    const id = quads.nodes.size + 1;
    quads.nodes.set(id, { id, x: x!, y: y!, z: 3 + x! / 5 });
    return id;
  });
  quads.quads.set(3, { ...quads.quads.get(1)!, id: 3, nodes: infill });
  const model = split ? triangulateRoof(quads) : quads;
  const reason = { key: 'loadPlan.gravity.offsetRafter', params: { id: 1 } };
  expect(hasBoundedRafterGap(model)).toBe(false);
  expect(roofPlan(model)).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [reason], cases: [], surface: [], distributed: [], nodal: [] });
  expect(() => gravityLayout(model, options)).toThrow(expect.objectContaining(reason));
  expect(() => roofWeightFor(model, options, options.tributaryWidth, 1)).toThrow(expect.objectContaining(reason));
  expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
  expect(() => snowLoadCases({ model, tributaryWidth: 3, snow: snowConfig })).toThrow(expect.objectContaining(reason));
});
