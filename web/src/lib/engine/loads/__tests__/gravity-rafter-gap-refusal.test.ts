import { expect, it } from 'vitest';
import { buildLoadPlan, roofWeightFor } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { snowDriftRefusal } from '../snow-drift-loads';
import { snowLoadCases } from '../snow-loads';
import { offsetRoof, roofPlan, triangulateRoof } from './gravity-offset-roof-fixture';
import { input } from './gravity-width-mass-fixture';
import { snow } from './snow-roof-plane-fixture';

const witness = it.skipIf(process.env.STABILEO_REPLAY_2607 !== '1');
const options = { mode: 'panels', tributaryWidth: 3 } as const;
const snowConfig = { ...snow, roofKind: 'mono', slippery: false } as const;

witness.each(['gap used as cover', 'sheltered upper strip', 'detached shell spanning the gap'] as const)(
  '#2607 refuses a bounded gap with %s', finding => {
    for (const split of [false, true]) {
      const { model: quads } = offsetRoof(0.02, 0, 1, split, [4, 6]);
      const node = (x: number, y: number, z: number) => {
        const id = quads.nodes.size + 1;
        quads.nodes.set(id, { id, x, y, z });
        return id;
      };
      const appendMember = (a: number, b: number, rise: number) => {
        const id = quads.elements.size + 1;
        quads.elements.set(id, {
          ...quads.elements.get(1)!, id,
          nodeI: node(a, 0, 3 + a / 5 + rise), nodeJ: node(b, 0, 3 + b / 5 + rise),
        });
      };
      const appendShell = (a: number, b: number, lo: number, hi: number, rise: number) => {
        const nodes = [node(a, lo, 3 + a / 5 + rise), node(b, lo, 3 + b / 5 + rise),
          node(b, hi, 3 + b / 5 + rise), node(a, hi, 3 + a / 5 + rise)];
        quads.quads.set(3, { ...quads.quads.get(1)!, id: 3, nodes });
      };
      if (finding === 'gap used as cover') appendMember(4.5, 5.5, -1);
      if (finding === 'sheltered upper strip') {
        appendMember(4, 6, 1);
        appendShell(4, 6, -1.5, 1.5, 2);
      }
      if (finding === 'detached shell spanning the gap') appendShell(4, 6, 0.25, 1.75, 0);
      const model = split ? triangulateRoof(quads) : quads;
      const reason = { key: 'loadPlan.gravity.rafterGap', params: { members: split ? '1, 2, 3' : '1', gap: '4–6' } };
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
