/**
 * The load generator behind the code-family interfaces: the plan asks the module bound to each
 * role, never a code by name; what it writes says which code, rule and action it is; and a
 * "replace" takes back only what the generator wrote for the actions it regenerates.
 *
 * The family registered here exists only in this file: it is the generator's contract with a
 * family nobody has implemented yet.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../../../engine/loads/load-plan';
import { describePlanDelta } from '../../../engine/loads/load-plan-delta';
import { defaultRegulations, withAllRoles, validateStack, REGULATION_ROLES, type ProjectRegulations } from '../../roles';
import { registerLoadCodes, resolveLoadCodes, loadCodeFor, loadFamilyOf, hasLoadModule, withOrigin } from '..';
import { CIRSOC101_BASIS, CIRSOC101_LOADS } from '../cirsoc';
import type { CombinationCode, ImposedLoadCode, AnyLoadCode } from '../load-codes';
import { replacedByPlan } from '../../../store/apply-load-plan';
import { activeComboIds } from '../../../engine/result-scopes';
import type { Load } from '../../../store/model.svelte';

/** A two-bay frame at one level, 3 m high: enough for the gravity loads and a combination. */
function frame(): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>([
    [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }], [3, { id: 3, x: 10, y: 0, z: 0 }],
    [4, { id: 4, x: 0, y: 0, z: 3 }], [5, { id: 5, x: 5, y: 0, z: 3 }], [6, { id: 6, x: 10, y: 0, z: 3 }],
  ]);
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>([
    [1, { id: 1, nodeI: 1, nodeJ: 4, sectionId: 1, materialId: 1 }], [2, { id: 2, nodeI: 2, nodeJ: 5, sectionId: 1, materialId: 1 }],
    [3, { id: 3, nodeI: 3, nodeJ: 6, sectionId: 1, materialId: 1 }],
    [4, { id: 4, nodeI: 4, nodeJ: 5, sectionId: 1, materialId: 1 }], [5, { id: 5, nodeI: 5, nodeJ: 6, sectionId: 1, materialId: 1 }],
  ]);
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [] };
}
const applied = (reg: ProjectRegulations): ProjectRegulations => {
  const out = { ...reg };
  for (const k of Object.keys(out) as Array<keyof ProjectRegulations>) if (out[k].adapterId) out[k] = { ...out[k], configComplete: true, state: 'applied' };
  return out;
};
const input = (over: Partial<LoadPlanInput> = {}): LoadPlanInput => ({
  regulations: applied(defaultRegulations()), model: frame(), dead: [{ labelKey: 'a', q: 2 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, ...over,
});

/** A family of its own: one combination, 1,4 D + 1,7 L, and every occupancy at 3 kN/m². */
const FAKE_BASIS: CombinationCode = {
  adapterId: CIRSOC101_BASIS.adapterId, role: 'basis', family: 'test-family', edition: 'T1', title: 'Test basis',
  strength: () => ({
    combinations: [{ id: 'T-1', label: '1.4 D + 1.7 L', terms: [{ symbol: 'D', factor: 1.4 }, { symbol: 'L', factor: 1.7 }], refs: [], notes: [] }],
    refs: [], notes: [],
  }),
  service: () => [{ id: 'T-S', label: '1 D + 1 L', terms: [{ symbol: 'D', factor: 1 }, { symbol: 'L', factor: 1 }], refs: [], notes: [], purpose: 'service' }],
  categoryOf: (s) => (s === 'D' ? 'permanent' : s === 'L' ? 'imposed' : 'other'),
};
const FAKE_LOADS: ImposedLoadCode = {
  ...CIRSOC101_LOADS, family: 'test-family', edition: 'T1', title: 'Test loads',
  occupancy: (key) => { const o = CIRSOC101_LOADS.occupancy(key); return o ? { ...o, uniformKNm2: 3 } : undefined; },
};

let unregister: (() => void) | null = null;
afterEach(() => { unregister?.(); unregister = null; });

describe('the plan dispatches to the bound modules', () => {
  it('a family registered only here writes the combinations and the live load, with its origin', () => {
    unregister = registerLoadCodes([FAKE_BASIS, FAKE_LOADS]);
    const p = buildLoadPlan(input({ combinationSet: 'both' }));
    expect(p.outcome).not.toBe('BLOCKED');
    const strength = p.combinations.filter((c) => c.purpose !== 'service');
    expect(strength.map((c) => c.label)).toEqual(['1.4 D + 1.7 L']);
    expect(strength[0]!.origin).toEqual({ code: CIRSOC101_BASIS.adapterId, family: 'test-family', edition: 'T1', rule: 'T-1', purpose: 'strength' });
    expect(p.combinations.find((c) => c.id === 'T-S')?.origin?.purpose).toBe('service');
    // The occupancy's 3 kN/m² over a 3 m tributary width: 9 kN/m on the beams.
    const live = p.distributed.filter((d) => d.caseType === 'L');
    expect(live.length).toBeGreaterThan(0);
    expect(Math.abs(live[0]!.q)).toBeCloseTo(9, 6);
    // Each case says what it is, as the module reads its symbol.
    expect(p.cases.find((c) => c.type === 'D')?.category).toBe('permanent');
    expect(p.cases.find((c) => c.type === 'L')?.category).toBe('imposed');
  });

  it('the CIRSOC family gives its own rules, each saying so', () => {
    const p = buildLoadPlan(input());
    expect(p.combinations.length).toBeGreaterThan(1);
    for (const c of p.combinations) {
      expect(c.origin?.code).toBe('cirsoc101-2025-basis');
      expect(c.origin?.family).toBe('cirsoc');
      expect(c.origin?.rule).toBe(c.id);
    }
  });

  it('a role bound to an adapter whose module is not of that role blocks the plan by name', () => {
    const wrong = { ...FAKE_LOADS, adapterId: CIRSOC101_BASIS.adapterId } as unknown as AnyLoadCode;
    unregister = registerLoadCodes([wrong]);
    const r = resolveLoadCodes(applied(defaultRegulations()));
    expect('missing' in r && r.missing).toEqual(['basis']);
    const p = buildLoadPlan(input());
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.some((m) => m.key === 'loadPlan.blocked.noCodeModule')).toBe(true);
  });

  it('removing a test family puts back the module it stood in for', () => {
    const remove = registerLoadCodes([FAKE_BASIS]);
    expect(loadCodeFor(CIRSOC101_BASIS.adapterId)).toBe(FAKE_BASIS);
    remove();
    expect(loadCodeFor(CIRSOC101_BASIS.adapterId)).toBe(CIRSOC101_BASIS);
    expect(hasLoadModule('cirsoc102-2025')).toBe(true);
    expect(hasLoadModule('no-such-code')).toBe(false);
  });

  it('a project typed in its own rules says so, in the basis family', () => {
    const own = withOrigin({ id: 'P1', label: '1.3 D', terms: [{ symbol: 'D', factor: 1.3 }], refs: [], notes: [] }, CIRSOC101_BASIS, true);
    expect(own.origin).toEqual({ code: 'project', family: 'cirsoc', edition: '', rule: 'P1', purpose: 'strength' });
    // A combination that already says is kept.
    expect(withOrigin(own, FAKE_BASIS).origin?.code).toBe('project');
  });
});

describe('the roles', () => {
  it('a project saved before the thermal role reads it as bound to the code in force', () => {
    const old = defaultRegulations() as Partial<ProjectRegulations>;
    delete old.thermal;
    const full = withAllRoles(old);
    expect(Object.keys(full).sort()).toEqual([...REGULATION_ROLES].sort());
    expect(full.thermal.adapterId).toBe('cirsoc101-2025-thermal');
    expect(loadFamilyOf(applied(full))).toBe('cirsoc');
  });

  it('a load role of another family than the basis is an error', () => {
    const reg = applied(defaultRegulations());
    const v = validateStack({ ...reg, wind: { ...reg.wind, adapterId: 'en1991-1-4' } });
    expect(v.problems.some((p) => p.key === 'regulations.problem.loadFamilyMismatch' && p.severity === 'error')).toBe(true);
  });
});

describe('replace acts per action', () => {
  const plan = buildLoadPlan(input({ generateCombinations: false }));
  const cases = [{ id: 1, type: 'D' }, { id: 2, type: 'L' }, { id: 3, type: 'W' }];
  const load = (id: number, caseId: number, generatedBy?: string): Load =>
    ({ type: 'distributed3d', data: { id, elementId: 4, qYI: 0, qYJ: 0, qZI: -1, qZJ: -1, caseId, ...(generatedBy ? { generatedBy } : {}) } }) as unknown as Load;

  it('takes the generated loads of the actions it regenerates and the code combinations, nothing typed', () => {
    const loads = [load(1, 1, 'cirsoc101-2025-basis'), load(2, 1), load(3, 2, 'cirsoc101-2025-basis'), load(4, 3, 'cirsoc101-2025-basis')];
    const combos = [{ id: 10, origin: { code: 'cirsoc101-2025-basis' } }, { id: 11 }];
    const gone = replacedByPlan(plan, loads, cases, combos);
    // D and L are regenerated; the hand-typed D load stays, and so does the wind the plan does not touch.
    expect(gone.loads.sort()).toEqual([1, 3]);
    expect(gone.combinations).toEqual([10]);
  });

  it('the preview counts the same', () => {
    const current = {
      distributed: 4, nodal: 0, combinations: 2, caseTypes: ['D', 'L', 'W'],
      generated: { byType: { D: { distributed: 1, nodal: 0 }, L: { distributed: 1, nodal: 0 }, W: { distributed: 1, nodal: 0 } }, combinations: 1 },
    };
    const d = describePlanDelta(plan, current, { replaceExisting: true });
    expect(d.after.distributed).toBe(4 - 2 + plan.distributed.length);
    expect(d.after.combinations).toBe(1);
    // The wind case is kept, not cleared.
    expect(d.dispositions.find((x) => x.caseType === 'W')?.action).toBe('retained');
  });
});

describe('the design reads the code combinations it owns', () => {
  it('"all" leaves out the combinations a code wrote for service', () => {
    const combos = [
      { id: 1, origin: { purpose: 'strength' } }, { id: 2, origin: { purpose: 'service' } }, { id: 3 },
    ];
    expect(activeComboIds(undefined, combos)).toEqual([1, 3]);
    expect(activeComboIds({ active: [2] } as never, combos)).toEqual([2]);
  });
});
