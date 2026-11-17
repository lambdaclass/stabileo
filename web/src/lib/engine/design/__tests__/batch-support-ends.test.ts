import { expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { applyPatch, planBatchEdit } from '../rebar-batch';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { solveFixture } from './helpers';
import type { ProvidedReinforcement, StirrupDef } from '../../../design-contract/reinforcement';

const solved = solveFixture(qa8);
const ctx = [...solved.contexts.values()].find(c => c.elementType === 'beam')!;
const base: StirrupDef = { diameter: 8, legs: 2, secondaryLegs: 2, spacing: 0.15 };
const fmt = (c: StirrupDef) => `eØ${c.diameter} ${c.legs}/${c.secondaryLegs ?? 2}L c/${(c.spacing * 100).toFixed(0)}`;
const current = (ends: Partial<NonNullable<ProvidedReinforcement['regions']>>): ProvidedReinforcement => ({
  regions: {
    bottomSpan: { count: 4, diameter: 16 }, topStart: { count: 4, diameter: 16 }, topEnd: { count: 4, diameter: 16 },
    stirrupsSupport: { ...base }, stirrupsSpan: { ...base }, ...ends,
  },
});

for (const end of ['stirrupsStart', 'stirrupsEnd'] as const) {
  for (const [field, value] of [['diameter', 10], ['legs', 4], ['secondaryLegs', 4], ['spacing', 0.1]] as const) {
    it(`known wrong result: #2198 reports ${end} ${field} overwritten despite unchanged support default`, () => {
      const before = { ...base, [field]: value };
      const provided = current({ [end]: before });
      const snapshot = structuredClone(provided);
      const patch = { stirrupsSupport: { [field]: base[field] } };
      const direct = applyPatch(ctx, provided, patch);
      expect(direct.blocks).toEqual([]);
      expect(direct.candidate!.regions![end]).toEqual(base);
      expect(direct.changes).toEqual([{ field: end === 'stirrupsStart' ? 'stirrups start' : 'stirrups end', before: fmt(before), after: fmt(base) }]);
      const plan = planBatchEdit(cirsoc201Adapter, [ctx.elementId], solved.contexts, () => provided, patch);
      expect(plan.changeCount).toBe(1);
      expect(plan.unchangedCount).toBe(0);
      expect(plan.rows[0].willChange).toBe(true);
      expect(plan.rows[0].changes).toEqual(direct.changes);
      expect(plan.rows[0].candidate).toEqual(direct.candidate);
      expect(provided).toEqual(snapshot);
    });
  }
}

it('known wrong result: #2198 reports both end overrides and retains their unselected fields', () => {
  const start = { ...base, diameter: 10, spacing: 0.1 };
  const end = { ...base, legs: 4, spacing: 0.075 };
  const result = applyPatch(ctx, current({ stirrupsStart: start, stirrupsEnd: end }), { stirrupsSupport: { spacing: base.spacing } });
  expect(result.blocks).toEqual([]);
  expect(result.candidate!.regions!.stirrupsStart).toEqual({ ...start, spacing: base.spacing });
  expect(result.candidate!.regions!.stirrupsEnd).toEqual({ ...end, spacing: base.spacing });
  expect(result.changes).toHaveLength(2);
  expect(result.changes.map(c => c.field)).toEqual(['stirrups start', 'stirrups end']);
});

for (const ends of [{}, { stirrupsStart: base }, { stirrupsEnd: base }, { stirrupsStart: base, stirrupsEnd: base }]) {
  it(`identical support and ${Object.keys(ends).join('/')} end cages remain unchanged`, () => {
    const provided = current(ends);
    const plan = planBatchEdit(cirsoc201Adapter, [ctx.elementId], solved.contexts, () => provided, { stirrupsSupport: base });
    expect(plan.changeCount).toBe(0);
    expect(plan.unchangedCount).toBe(1);
    expect(plan.rows[0].willChange).toBe(false);
    expect(plan.rows[0].changes).toEqual([]);
    expect(plan.rows[0].candidate).toEqual(provided);
  });
}

it('a span edit leaves the support and end cages unchanged', () => {
  const provided = current({ stirrupsStart: { ...base, spacing: 0.1 }, stirrupsEnd: { ...base, spacing: 0.075 } });
  const result = applyPatch(ctx, provided, { stirrupsSpan: { spacing: 0.2 } });
  expect(result.candidate!.regions!.stirrupsStart).toEqual(provided.regions!.stirrupsStart);
  expect(result.candidate!.regions!.stirrupsEnd).toEqual(provided.regions!.stirrupsEnd);
  expect(result.changes.map(c => c.field)).toEqual(['stirrups span']);
});
