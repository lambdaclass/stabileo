import { describe, it, expect } from 'vitest';
import { assessProject, conditionHolds } from '../applicability';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { RESULT_CHANGES, RESULTS_VERSION, type ResultChangeRegistry } from '../registry';
import { stampSolve, unknownStamp, type SolveStamp } from '../solve-stamp';

const STEEL = { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 };
const CONCRETE = { id: 2, name: 'H-25', e: 30000, nu: 0.2, rho: 25, fy: 25 };
const node = (id: number, x: number, z = 0) => [id, { id, x, y: 0, z }] as [number, { id: number; x: number; y: number; z: number }];
const member = (id: number, materialId: number, type: 'frame' | 'truss', extra: Record<string, unknown> = {}) =>
  [id, { id, type, nodeI: 1, nodeJ: 2, materialId, sectionId: 1, releaseI: {}, releaseJ: {}, ...extra }] as [number, never];

function model(over: Partial<FeatureSnapshot> = {}): FeatureSnapshot {
  return {
    analysisMode: 'pro',
    materials: [[1, STEEL], [2, CONCRETE]] as never,
    elements: [],
    supports: [[1, { nodeId: 1, type: 'fixed3d' }]] as never,
    loads: [],
    loadCases: [{ id: 1, type: 'D' }],
    ...over,
  };
}

const ids = (s: FeatureSnapshot, stamp: SolveStamp | null = null) => assessProject(s, stamp, s.analysisMode).changes.map((c) => c.id);

describe('which registered changes concern a model', () => {
  it('shows the CIRSOC 301 tension note only for steel members without connection data under CIRSOC 301', () => {
    const steelTruss = model({ elements: [member(1, 1, 'truss')] });
    expect(ids(steelTruss)).toContain('cirsoc301-tension-needs-connection');

    const concreteOnly = model({ elements: [member(1, 2, 'frame')] });
    expect(ids(concreteOnly)).not.toContain('cirsoc301-tension-needs-connection');
    expect(ids(concreteOnly)).not.toContain('cirsoc301-ltb-top-flange');
    expect(ids(concreteOnly)).toContain('cirsoc201-strain-compatibility');

    const connected = model({ elements: [member(1, 1, 'truss', { tensionConnection: { i: { kind: 'welded' }, j: { kind: 'welded' } } })] });
    expect(ids(connected)).not.toContain('cirsoc301-tension-needs-connection');
    expect(ids(connected)).toContain('cirsoc301-ltb-top-flange');

    const ec3 = model({
      elements: [member(1, 1, 'truss')],
      regulations: { roles: { steel: { adapterId: 'eurocode3' } } },
    });
    expect(ids(ec3)).not.toContain('cirsoc301-tension-needs-connection');
    expect(ids(ec3)).not.toContain('cirsoc301-biaxial-h11b');
    expect(ids(ec3)).toContain('ec3-aisc-ltb-and-slender');
  });

  it('shows the arc local-axes change only for models with members drawn as an arc (#418)', () => {
    const spec = { start: { x: -5, y: 0, z: 0 }, through: { x: 0, y: 0, z: 5 }, end: { x: 5, y: 0, z: 0 }, segments: 8 };
    const arch = model({ elements: [member(1, 1, 'frame', { arc: { id: 1, spec } })] });
    expect(modelFeatures(arch).has('arcMembers')).toBe(true);
    expect(ids(arch)).toContain('arc-member-local-axes');
    const straight = model({ elements: [member(1, 1, 'frame')] });
    expect(modelFeatures(straight).has('arcMembers')).toBe(false);
    expect(ids(straight)).not.toContain('arc-member-local-axes');
  });

  it('shows the member thermal change only for models with temperature loads on members (#407)', () => {
    const heated = model({ elements: [member(1, 1, 'frame')], loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: 0, dtGradient: 20, caseId: 1 } }] });
    expect(ids(heated)).toContain('frame-thermal-alpha-depth');
    const shellOnly = model({ quads: [[1, {}]] as never, loads: [{ type: 'thermalQuad3d', data: { quadId: 1, caseId: 1 } }] });
    expect(ids(shellOnly)).not.toContain('frame-thermal-alpha-depth');
    expect(ids(model({ elements: [member(1, 1, 'frame')] }))).not.toContain('frame-thermal-alpha-depth');
  });

  it('shows the unfactored-design change only for models with footings or joint designs and combinations (W2-01)', () => {
    const combos = { combinations: [{ id: 1, name: '1.2D', factors: [{ caseId: 1, factor: 1.2 }] }] } as Partial<FeatureSnapshot>;
    const frame = { elements: [member(1, 2, 'frame')] };
    expect(ids(model({ ...frame, ...combos, footings: [[1, { nodeId: 1 }]] as never }))).toContain('design-on-unfactored-results');
    expect(ids(model({ ...frame, ...combos, jointDesigns: { 1: { nodeId: 1 } } }))).toContain('design-on-unfactored-results');
    expect(ids(model({ ...frame, footings: [[1, { nodeId: 1 }]] as never }))).not.toContain('design-on-unfactored-results');
    expect(ids(model({ ...frame, ...combos }))).not.toContain('design-on-unfactored-results');
  });

  it('names the ACI change for an ACI-bound concrete model and not the CIRSOC 201 one', () => {
    const aci = model({ elements: [member(1, 2, 'frame')], regulations: { roles: { concrete: { adapterId: 'aci-aisc' } } } });
    expect(ids(aci)).toContain('aci318-strain-and-axial');
    expect(ids(aci)).not.toContain('cirsoc201-strain-compatibility');
  });

  it('shows the constraint change only when a constraint slave is supported', () => {
    const base = { elements: [member(1, 2, 'frame')], nodes: [node(1, 0), node(2, 5)] };
    const onSupported = model({ ...base, constraints: [{ type: 'rigidLink', masterNode: 2, slaveNode: 1 }] });
    const free = model({ ...base, constraints: [{ type: 'rigidLink', masterNode: 1, slaveNode: 2 }] });
    expect(ids(onSupported)).toContain('constraints-on-supported-slaves');
    expect(ids(free)).not.toContain('constraints-on-supported-slaves');
  });

  it('shows the dead-load default only for models with floor (area) dead loads', () => {
    const withFloor = model({ loads: [{ type: 'surface3d', data: { quadId: 1, q: -2.32, caseId: 1 } }], quads: [[1, {}]] as never });
    expect(ids(withFloor)).toContain('dead-load-default-2.52');
    expect(ids(model({ elements: [member(1, 2, 'frame')] }))).not.toContain('dead-load-default-2.52');
  });

  it('lists nothing for a project solved with the current version, and every applicable change for an unknown one', () => {
    const steel = model({ elements: [member(1, 1, 'truss')] });
    const current = stampSolve('linear', null);
    expect(current.resultsVersion).toBe(RESULTS_VERSION);
    expect(assessProject(steel, current).changes).toEqual([]);
    expect(assessProject(steel, current).older).toBe(false);
    const unknown = assessProject(steel, unknownStamp());
    expect(unknown.older).toBe(true);
    expect(unknown.solvedVersion).toBe(0);
    expect(unknown.changes.length).toBeGreaterThan(3);
    // No stamp at all reads the same as the explicit unknown stamp.
    expect(assessProject(steel, null).changes.map((c) => c.id)).toEqual(unknown.changes.map((c) => c.id));
  });

  it('flags a project solved with a newer version than this build', () => {
    const newer = { ...stampSolve('linear', null), resultsVersion: RESULTS_VERSION + 1 };
    const a = assessProject(model(), newer);
    expect(a.newer).toBe(true);
    expect(a.changes).toEqual([]);
  });

  it('tells prior buckling runs about certificate refusals in both dimensions and on shells', () => {
    const change = 'buckling-certificate-rejects-outside-factor';
    for (const analysisMode of ['2d', '3d', 'pro']) {
      const frame = model({ analysisMode, elements: [member(1, 1, 'frame')] });
      expect(ids(frame, { resultsVersion: 4, analyses: ['buckling'] } as SolveStamp)).toContain(change);
      expect(ids(frame, { resultsVersion: 4, analyses: ['linear'] } as SolveStamp)).not.toContain(change);
      expect(ids(frame, { resultsVersion: 5, analyses: ['buckling'] } as SolveStamp)).not.toContain(change);
      expect(ids(frame)).toContain(change);
    }
    expect(ids(model({ quads: [[1, {}]] as never }))).toContain(change);
  });

  it('an empty model is concerned by nothing', () => {
    expect(ids(model({ supports: [], loadCases: [] }))).toEqual([]);
  });
});

describe('versions and recorded analyses (a later registry)', () => {
  // The version after this build's, holding two made-up changes.
  const next = RESULTS_VERSION + 1;
  const later: ResultChangeRegistry = {
    ...RESULT_CHANGES,
    currentResultsVersion: next,
    changes: [
      ...RESULT_CHANGES.changes,
      { ...RESULT_CHANGES.changes[0], id: 'next-modal', resultsVersion: next, when: { all: ['members', 'analysis:modal'] } },
      { ...RESULT_CHANGES.changes[0], id: 'next-all', resultsVersion: next, when: {} },
    ],
  };
  const steel = model({ elements: [member(1, 1, 'truss')] });
  const solvedHere = (analyses: SolveStamp['analyses']) => ({ ...stampSolve('linear', null), analyses });

  it('lists only changes after the version the project was solved with', () => {
    const got = assessProject(steel, solvedHere(['linear', 'modal']), 'pro', later).changes.map((c) => c.id);
    expect(got).toEqual(['next-all', 'next-modal'].sort());
  });

  it('gates on the analyses the stamp recorded, and counts every analysis as run when it records none', () => {
    expect(assessProject(steel, solvedHere(['linear']), 'pro', later).changes.map((c) => c.id)).toEqual(['next-all']);
    expect(assessProject(steel, null, 'pro', later).changes.map((c) => c.id)).toContain('next-modal');
  });

  it('counts the analyses the stamp cannot see as run', () => {
    const f = modelFeatures(steel, { analysesRun: ['linear'] });
    expect(f.has('analysis:timeHistory')).toBe(true);
    // Soil-structure interaction is solved in the PRO panel from springs a file never carries.
    expect(f.has('analysis:ssi')).toBe(true);
    expect(f.has('analysis:modal')).toBe(false);
  });
});

describe('conditionHolds', () => {
  it('needs every group, and any feature within a group', () => {
    const f = new Set(['a', 'c']);
    expect(conditionHolds({ any: ['a', 'b'] }, f)).toBe(true);
    expect(conditionHolds({ all: ['a', 'b'] }, f)).toBe(false);
    expect(conditionHolds({ allOf: [['a'], ['b', 'c']] }, f)).toBe(true);
    expect(conditionHolds({}, f)).toBe(true);
  });
});
