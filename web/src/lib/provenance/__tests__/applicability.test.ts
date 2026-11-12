import frozenArchA from '../../../../results-frozen/solve_arc_length-0015ab84c3baa36f.json';
import frozenArchB from '../../../../results-frozen/solve_arc_length-022317310499426d.json';
import reactionRecoveryChange from '../result-changes/arc-length-reactions.json';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';
import { RESULT_CHANGES } from '../full-registry';
import { describe, it, expect } from 'vitest';
import { assessProject, conditionHolds } from '../applicability';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { RESULTS_VERSION, type ResultChangeRegistry } from '../registry';
import { analysesContext, readStamp, stampSolve, unknownStamp, type SolveStamp } from '../solve-stamp';

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
  it('scopes generator stability guidance to recorded generated structures', () => {
    const ordinary = model({ elements: [member(1, 1, 'frame')] });
    const generated = { ...ordinary, groups: [[1, { kind: 'generated' }]] } as FeatureSnapshot;
    expect(modelFeatures(generated)).toContain('generatedStructures');
    expect(ids(generated)).toContain('generated-structure-stability');
    expect(ids(ordinary)).not.toContain('generated-structure-stability');
    expect(ids({ ...ordinary, groups: [[1, { kind: 'floorLoad' }]] })).not.toContain('generated-structure-stability');
    expect(ids({ ...generated, elements: [] })).not.toContain('generated-structure-stability');
    expect(ids({ ...generated, analysisMode: '2d' })).not.toContain('generated-structure-stability');
    const current = stampSolve('linear', null);
    expect(ids(generated, current)).not.toContain('generated-structure-stability');
  });

  it('shows one complete harmonic correction notice for PR #1922', () => {
    const entry = RESULT_CHANGES.changes.find((change) => change.id === 'harmonic-omitted-modes')!;
    const snapshot = model({ elements: [member(1, 1, 'frame')] });
    const before = entry.resultsVersion - 1;
    for (const stamp of [null, { ...stampSolve('harmonic', null), resultsVersion: before }]) {
      const notices = assessProject(snapshot, stamp).changes.filter((change) => change.prs.includes(1922));
      expect(notices.map((change) => change.id)).toEqual(['harmonic-omitted-modes']);
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
        expect(notices[0].explanation[locale]).toContain('#1434');
        expect(notices[0].explanation[locale]).toContain('PR #1922');
      }
    }
    const linear = { ...stampSolve('linear', null), resultsVersion: before };
    expect(assessProject(snapshot, linear).changes.filter((change) => change.prs.includes(1922))).toEqual([]);
  });

  it('scopes the omitted harmonic mode correction to harmonic structural models, including spring-only models', () => {
    const entry = RESULT_CHANGES.changes.find((change) => change.id === 'harmonic-omitted-modes');
    expect(entry).toBeDefined();
    for (const structure of ['members', 'shells', 'curvedShells', 'connectors', 'springs']) {
      expect(conditionHolds(entry!.when ?? {}, new Set([structure, 'analysis:harmonic']))).toBe(true);
      expect(conditionHolds(entry!.when ?? {}, new Set([structure, 'analysis:linear']))).toBe(false);
    }
    expect(conditionHolds(entry!.when ?? {}, new Set(['analysis:harmonic']))).toBe(false);
  });

  it('keeps the omitted harmonic notice for legacy unknown analyses and excludes a recorded linear-only solve', () => {
    const snapshot = model({ elements: [member(1, 1, 'frame')] });
    const harmonic = stampSolve('harmonic', null);
    const linear = stampSolve('linear', null);
    const before = RESULT_CHANGES.changes.find((change) => change.id === 'harmonic-omitted-modes')!.resultsVersion - 1;
    expect(ids(snapshot, { ...harmonic, resultsVersion: before })).toContain('harmonic-omitted-modes');
    expect(ids(snapshot, { ...linear, resultsVersion: before })).not.toContain('harmonic-omitted-modes');
    const { recorded: _recorded, ...legacy } = linear;
    expect(ids(snapshot, { ...legacy, resultsVersion: before })).toContain('harmonic-omitted-modes');
  });

  it('scopes exact plastic resource refusals to frame projects after plastic analysis', () => {
    const entry = RESULT_CHANGES.changes.find((change) => change.id === 'plastic-exact-resource-budget-refused');
    expect(entry).toBeDefined();
    for (const dimension of ['space3D', 'plane2D']) {
      expect(conditionHolds(entry!.when ?? {}, new Set([dimension, 'frameMembers', 'analysis:plastic']))).toBe(true);
      expect(conditionHolds(entry!.when ?? {}, new Set([dimension, 'frameMembers', 'analysis:modal']))).toBe(false);
      expect(conditionHolds(entry!.when ?? {}, new Set([dimension, 'trussMembers', 'analysis:plastic']))).toBe(false);
    }
  });

  it('scopes the checked 3D certified lower bound to space frames after plastic analysis', () => {
    const entry = RESULT_CHANGES.changes.find((change) => change.id === 'plastic-3d-certified-lower-bound');
    expect(entry).toBeDefined();
    const features = ['space3D', 'frameMembers', 'analysis:plastic'];
    expect(conditionHolds(entry!.when ?? {}, new Set(features))).toBe(true);
    for (const omitted of features) {
      expect(conditionHolds(entry!.when ?? {}, new Set(features.filter((feature) => feature !== omitted)))).toBe(false);
    }
  });

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

  it('shows the Cb segment-ends change only for CIRSOC 301 steel with a declared unbraced length', () => {
    expect(ids(model({ elements: [member(1, 1, 'frame')] }))).not.toContain('cb-segment-ends');
    expect(ids(model({ elements: [member(1, 1, 'frame', { unbracedLength: 2 })] }))).toContain('cb-segment-ends');
    expect(ids(model({ elements: [member(1, 1, 'frame', { bracing: { top: [1.5] } })] }))).toContain('cb-segment-ends');
    expect(ids(model({ elements: [member(1, 2, 'frame', { unbracedLength: 2 })] }))).not.toContain('cb-segment-ends');
    expect(ids(model({
      elements: [member(1, 1, 'frame', { unbracedLength: 2 })],
      regulations: { roles: { steel: { adapterId: 'eurocode3' } } },
    }))).not.toContain('cb-segment-ends');
  });

  it('shows the net-area chain change only for CIRSOC 301 steel with a staggered or web-less "all" bolted end', () => {
    const bolted = (extra: Record<string, unknown>) => ({ kind: 'bolted', connected: 'legH', holeKind: 'standard', ...extra });
    const id = 'net-area-chains-and-web-lines';
    expect(ids(model({ elements: [member(1, 1, 'truss', { tensionConnection: { i: bolted({}) } })] }))).not.toContain(id);
    expect(ids(model({ elements: [member(1, 1, 'truss', { tensionConnection: { j: bolted({ stagger: { sMm: 40, gMm: 60 } }) } })] }))).toContain(id);
    expect(ids(model({ elements: [member(1, 1, 'truss', { tensionConnection: { i: bolted({ connected: 'all', webLines: 0 }) } })] }))).toContain(id);
    expect(ids(model({ elements: [member(1, 1, 'truss', { tensionConnection: { i: bolted({ connected: 'all', webLines: 1 }) } })] }))).not.toContain(id);
    expect(ids(model({ elements: [member(1, 1, 'truss', { tensionConnection: { i: bolted({ stagger: {} }) } })] }))).not.toContain(id);
    expect(ids(model({ elements: [member(1, 1, 'truss', { tensionConnection: { i: bolted({ stagger: { sMm: 40 } }) } })] }))).not.toContain(id);
    expect(ids(model({ elements: [member(1, 2, 'truss', { tensionConnection: { i: bolted({ stagger: {} }) } })] }))).not.toContain(id);
    expect(ids(model({
      elements: [member(1, 1, 'truss', { tensionConnection: { i: bolted({ stagger: {} }) } })],
      regulations: { roles: { steel: { adapterId: 'eurocode3' } } },
    }))).not.toContain(id);
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

  it('tells projects with concrete members about the EN 1992-1-1 flexure fix, whatever their bound code', () => {
    const change = 'ec2-flexure-strain-compatibility';
    for (const concrete of [undefined, 'cirsoc201', 'aci-aisc', 'eurocode2']) {
      const beam = model({
        elements: [member(1, 2, 'frame')],
        ...(concrete ? { regulations: { roles: { concrete: { adapterId: concrete } } } } : {}),
      });
      expect(ids(beam, { resultsVersion: 5, analyses: ['linear'] } as SolveStamp)).toContain(change);
      expect(ids(beam, { resultsVersion: 7, analyses: ['linear'] } as SolveStamp)).toContain(change);
      expect(ids(beam, { resultsVersion: 8, analyses: ['linear'] } as SolveStamp)).not.toContain(change);
    }
    expect(ids(model({ elements: [member(1, 1, 'frame')] }))).not.toContain(change);
    const entry = RESULT_CHANGES.changes.find((c) => c.id === change) as unknown as { title: Record<string, string>; explanation: Record<string, string> };
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      expect(entry.title[locale]?.trim(), `title.${locale}`).toBeTruthy();
      expect(entry.explanation[locale]?.trim(), `explanation.${locale}`).toBeTruthy();
    }
  });

  it('tells models with generated loads about SA-2026-033, and no other model', () => {
    const frame = model({ elements: [member(1, 1, 'frame')] });
    const generated = model({ elements: [member(1, 1, 'frame')], loads: [{ type: 'distributed3d', data: { caseId: 1, generatedBy: 'cirsoc-101' } }] });
    const v19 = { resultsVersion: 19, analyses: ['linear'] } as SolveStamp;
    expect(ids(generated, v19)).toContain('generated-area-loads-headroom');
    expect(ids(frame, v19)).not.toContain('generated-area-loads-headroom');
    const v20 = { resultsVersion: 20, analyses: ['linear'] } as SolveStamp;
    const basis = (resultsVersion?: number) => ({ designData: { loadBasis: resultsVersion === undefined ? {} : { resultsVersion } } });
    expect(ids({ ...generated, ...basis(19) }, v20)).toContain('generated-area-loads-headroom');
    expect(ids({ ...generated, ...basis() }, v20)).toContain('generated-area-loads-headroom');
    expect(ids({ ...generated, ...basis(20) }, v20)).not.toContain('generated-area-loads-headroom');
    expect(ids({ ...frame, ...basis(19) }, v20)).toContain('generated-area-loads-headroom');
    expect(ids({ ...frame, ...basis(20) }, v20)).not.toContain('generated-area-loads-headroom');
    expect(ids(generated, v20)).toContain('generated-area-loads-headroom');
    const stair = model({ elements: [member(1, 1, 'frame')], loads: [{ type: 'distributed3d', data: { caseId: 1, generatedBy: 'stair:1' } }] });
    expect(ids(stair, v19)).not.toContain('generated-area-loads-headroom');
    expect(ids(stair, v20)).not.toContain('generated-area-loads-headroom');
    const plane = { ...generated, analysisMode: '2d', ...basis() };
    expect(ids(plane, { resultsVersion: 14, analyses: ['linear'] } as SolveStamp)).toContain('basic-influence-line-moment-sign-withdrawn');
    expect(ids(plane, v20)).toContain('generated-area-loads-headroom');
    expect(ids(plane, v20)).not.toContain('basic-influence-line-moment-sign-withdrawn');
    expect(ids(plane, v20)).toContain('safety-containment-diagnostics');
    const entry = RESULT_CHANGES.changes.find((c) => c.id === 'generated-area-loads-headroom') as unknown as { title: Record<string, string>; explanation: Record<string, string> };
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      expect(entry.title[locale]?.trim(), `title.${locale}`).toBeTruthy();
      expect(entry.explanation[locale]?.trim(), `explanation.${locale}`).toBeTruthy();
    }
  });

  it('tells shell models solved before #1255 that their shell figures now paint the screen\'s field', () => {
    const fig = 'shell-figures-paint-the-screen-field';
    const shell = model({ quads: [[1, { id: 1, nodes: [1, 2, 3, 4], materialId: 2, thickness: 0.2 }]] as never });
    expect(ids(shell, { resultsVersion: 20, analyses: ['linear'] } as SolveStamp)).toContain(fig);
    expect(ids(shell, { resultsVersion: 21, analyses: ['linear'] } as SolveStamp)).not.toContain(fig);
    expect(ids(model({ elements: [member(1, 1, 'frame')] }), { resultsVersion: 20, analyses: ['linear'] } as SolveStamp)).not.toContain(fig);
    const entry = RESULT_CHANGES.changes.find((c) => c.id === fig) as unknown as { title: Record<string, string>; explanation: Record<string, string> };
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      expect(entry.title[locale]?.trim(), `title.${locale}`).toBeTruthy();
      expect(entry.explanation[locale]?.trim(), `explanation.${locale}`).toBeTruthy();
    }
  });

  it('tells prior buckling runs about certificate refusals in both dimensions and on shells', () => {
    const change = 'buckling-certificate-rejects-outside-factor';
    for (const analysisMode of ['2d', '3d', 'pro']) {
      const frame = model({ analysisMode, elements: [member(1, 1, 'frame')] });
      expect(ids(frame, { resultsVersion: 5, analyses: ['buckling'] } as SolveStamp)).toContain(change);
      expect(ids(frame, { resultsVersion: 5, analyses: ['linear'] } as SolveStamp)).not.toContain(change);
      expect(ids(frame, { resultsVersion: 6, analyses: ['buckling'] } as SolveStamp)).not.toContain(change);
      expect(ids(frame)).toContain(change);
    }
    expect(ids(model({ quads: [[1, {}]] as never }))).toContain(change);
  });

  it('tells only 3D frames about the 3D co-rotational fix, never a plane model (#426)', () => {
    const change = 'corotational-3d-rotations';
    for (const analysisMode of ['3d', 'pro']) {
      const frame = model({ analysisMode, elements: [member(1, 1, 'frame')] });
      expect(modelFeatures(frame).has('space3D')).toBe(true);
      expect(ids(frame)).toContain(change);
    }
    const plane = model({ analysisMode: '2d', elements: [member(1, 1, 'frame')] });
    expect(modelFeatures(plane).has('space3D')).toBe(false);
    expect(ids(plane)).not.toContain(change);
    expect(ids(model({ analysisMode: '3d', elements: [member(1, 1, 'truss')] }))).not.toContain(change);
  });

  it('tells 3D frames solved before version 39 about the 3D plastic refusal of a member without capacity, never a plane model or a truss (#1525)', () => {
    const change = 'plastic-3d-member-without-capacity-refused';
    const v38 = { resultsVersion: 38, analyses: ['linear'] } as SolveStamp;
    expect(ids(model({ analysisMode: 'pro', elements: [member(1, 1, 'frame')] }), v38)).toContain(change);
    expect(ids(model({ analysisMode: '3d', elements: [member(1, 1, 'frame')] }), v38)).toContain(change);
    expect(ids(model({ analysisMode: 'pro', elements: [member(1, 1, 'frame')] }), { resultsVersion: 39, analyses: ['linear'] } as SolveStamp)).not.toContain(change);
    expect(ids(model({ analysisMode: '2d', elements: [member(1, 1, 'frame')] }), v38)).not.toContain(change);
    expect(ids(model({ analysisMode: 'pro', elements: [member(1, 1, 'truss')] }), v38)).not.toContain(change);
  });

  it('tells CIRSOC 301 steel models solved before the Q ≤ 0 refusal about it', () => {
    const change = 'cirsoc301-q-nonpositive-refused';
    const steel = model({ elements: [member(1, 1, 'frame')] });
    expect(ids(steel, { resultsVersion: 11, analyses: ['linear'] } as SolveStamp)).toContain(change);
    expect(ids(steel, { resultsVersion: 12, analyses: ['linear'] } as SolveStamp)).not.toContain(change);
    expect(ids(model({ elements: [member(1, 2, 'frame')] }))).not.toContain(change);
    const ec3 = model({ elements: [member(1, 1, 'frame')], regulations: { roles: { steel: { adapterId: 'eurocode3' } } } });
    expect(ids(ec3)).not.toContain(change);
    const entry = RESULT_CHANGES.changes.find((c) => c.id === change) as unknown as { title: Record<string, string>; explanation: Record<string, string> };
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      expect(entry.title[locale]?.trim(), `title.${locale}`).toBeTruthy();
      expect(entry.explanation[locale]?.trim(), `explanation.${locale}`).toBeTruthy();
    }
  });

  it('tells models with a time history or modal analysis about the dynamics fixes of SA-2026-031 and SA-2026-032', () => {
    const frame = model({ elements: [member(1, 1, 'frame')] });
    const linearOnly = { resultsVersion: 12, analyses: ['linear'] } as SolveStamp;
    expect(ids(frame, linearOnly)).not.toContain('time-history-massless-start');
    const forced = model({ elements: [member(1, 1, 'frame')], dynamics: { timeHistory: { forces: [{ nodeId: 2, dir: 'x', kind: 'step', amplitude: 1 }] } } });
    expect(ids(forced, linearOnly)).toContain('time-history-massless-start');
    expect(ids(model({ elements: [member(1, 1, 'frame')], dynamics: { timeHistory: { forces: [] } } }), linearOnly)).toContain('time-history-massless-start');
    expect(ids(forced, { resultsVersion: 13, analyses: ['linear'] } as SolveStamp)).not.toContain('time-history-massless-start');
    expect(ids(frame, linearOnly)).not.toContain('modal-mechanism-refused');
    expect(ids(frame, { resultsVersion: 12, analyses: ['modal'] } as SolveStamp)).toContain('modal-mechanism-refused');
    expect(ids(frame, { resultsVersion: 13, analyses: ['modal'] } as SolveStamp)).not.toContain('modal-mechanism-refused');
    for (const change of ['time-history-massless-start', 'modal-mechanism-refused']) {
      const entry = RESULT_CHANGES.changes.find((c) => c.id === change) as unknown as { title: Record<string, string>; explanation: Record<string, string> };
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
        expect(entry.title[locale]?.trim(), `${change} title.${locale}`).toBeTruthy();
        expect(entry.explanation[locale]?.trim(), `${change} explanation.${locale}`).toBeTruthy();
      }
    }
  });

  it('unknown analysis history without stiffness elements has no linear result to re-check', () => {
    expect(ids(model({ supports: [], loadCases: [] }))).toEqual([]);
  });

  it('concerns a 3D steel truss solved before the containment diagnostics, and not the same supports and nodal load without members one version old (the re-check e2e relies on it)', () => {
    const previous = { resultsVersion: RESULTS_VERSION - 1, analyses: ['linear'] } as SolveStamp;
    const loads = [{ type: 'nodal3d', data: { caseId: 1, nodeId: 3, fz: -20 } }];
    expect(ids(model({ loads, elements: [member(1, 1, 'truss')] }), { resultsVersion: 30, analyses: ['linear'] } as SolveStamp)).toContain('safety-containment-diagnostics');
    expect(ids(model({ loads, elements: [member(1, 1, 'truss')] }), { resultsVersion: 30, analyses: ['linear'] } as SolveStamp)).toContain('fail-closed-ratios');
    expect(ids(model({ loads }), previous)).toEqual([]);
  });

  it('tells a truss-only model with a support spring about the orphan-rotation fix, and not one without', () => {
    const v32 = { resultsVersion: 32, analyses: ['linear'] } as SolveStamp;
    const springs = [[1, { nodeId: 1, type: 'fixed3d' }], [2, { nodeId: 2, type: 'spring3d', krz: 1e-13 }]] as never;
    expect(ids(model({ elements: [member(1, 1, 'truss')], supports: springs }), v32)).toContain('soft-rotation-not-orphan');
    expect(ids(model({ elements: [member(1, 1, 'truss')] }), v32)).not.toContain('soft-rotation-not-orphan');
    expect(ids(model({ elements: [member(1, 1, 'frame')] }), v32)).toContain('soft-rotation-not-orphan');
  });

  it('tells every model that can rotate past 0.1 rad about the small-displacement warning (#1446), and not one with supports and loads only', () => {
    const change = 'linear-small-displacement-warning';
    const v35 = { resultsVersion: 35, analyses: ['linear'] } as SolveStamp;
    const loads = [{ type: 'nodal3d', data: { caseId: 1, nodeId: 1, my: 5 } }];
    expect(ids(model({ loads, elements: [member(1, 1, 'frame')] }), v35)).toContain(change);
    expect(ids(model({ loads, elements: [member(1, 1, 'truss')] }), v35)).toContain(change);
    const spring = model({ loads, supports: [[1, { nodeId: 1, type: 'spring3d', kry: 1e-6 }]] as never });
    expect(modelFeatures(spring).has('springs')).toBe(true);
    expect(ids(spring, v35)).toContain(change);
    expect(ids(model({ loads, elements: [member(1, 1, 'frame')] }), { resultsVersion: 36, analyses: ['linear'] } as SolveStamp)).not.toContain(change);
    expect(ids(model({ loads }), v35)).not.toContain(change);
  });

  it('never tells a saved model about a change of bundled examples only, whatever it was solved with', () => {
    const change = 'example-torsion-beam-closed-section';
    expect(RESULT_CHANGES.changes.find((c) => c.id === change)?.scope).toBe('examples');
    const loads = [{ type: 'nodal3d', data: { caseId: 1, nodeId: 2, fz: -20, mx: 8 } }];
    const torsionBeam = model({ analysisMode: '3d', loads, elements: [member(1, 1, 'frame')] });
    for (const stamp of [null, { resultsVersion: 1, analyses: ['linear'] } as SolveStamp, { resultsVersion: RESULTS_VERSION - 1, analyses: ['linear'] } as SolveStamp]) {
      expect(ids(torsionBeam, stamp)).not.toContain(change);
    }
    const everything = { ...RESULT_CHANGES, changes: RESULT_CHANGES.changes.map((c) => (c.id === change ? { ...c, scope: undefined, when: {} } : c)) } as ResultChangeRegistry;
    expect(assessProject(torsionBeam, null, '3d', everything).changes.map((c) => c.id)).toContain(change);
  });

  it('tells plane frames with combinations and member loads about the true-peak governing value and envelope', () => {
    const change = 'governing-envelope-true-peak';
    const combos = { combinations: [{ id: 1, name: '1.2D', factors: [{ caseId: 1, factor: 1.2 }] }] } as Partial<FeatureSnapshot>;
    const loaded = model({ analysisMode: '2d', elements: [member(1, 1, 'frame')], loads: [{ type: 'distributed', data: { caseId: 1, elementId: 1 } }] as never, ...combos });
    const v25 = { resultsVersion: 25, analyses: ['linear'] } as SolveStamp;
    expect(ids(loaded, v25)).toContain(change);
    expect(ids(loaded, { resultsVersion: 26, analyses: ['linear'] } as SolveStamp)).not.toContain(change);
    expect(ids(model({ analysisMode: '2d', elements: [member(1, 1, 'frame')], ...combos }), v25)).not.toContain(change);
    expect(ids(model({ analysisMode: '3d', elements: [member(1, 1, 'frame')], loads: [{ type: 'distributed', data: { caseId: 1, elementId: 1 } }] as never, ...combos }), v25)).not.toContain(change);
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
      { ...RESULT_CHANGES.changes[0], scope: undefined, examples: undefined, id: 'next-modal', resultsVersion: next, when: { all: ['members', 'analysis:modal'] } },
      { ...RESULT_CHANGES.changes[0], scope: undefined, examples: undefined, id: 'next-all', resultsVersion: next, when: {} },
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

  it('counts the analyses a stamp written before #1658 cannot see as run', () => {
    const f = modelFeatures(steel, { analysesRun: ['linear'] });
    for (const k of ['timeHistory', 'nonlinear', 'harmonic', 'ssi']) expect(f.has(`analysis:${k}` as never), k).toBe(true);
    expect(f.has('analysis:modal')).toBe(false);
  });

  it('counts an analysis a stamp records as run only when it ran', () => {
    const stamp = solvedHere(['linear']);
    const f = modelFeatures(steel, { analysesRun: stamp.analyses, analysesRecorded: stamp.recorded });
    for (const k of ['timeHistory', 'nonlinear', 'harmonic', 'ssi', 'modal']) expect(f.has(`analysis:${k}` as never), k).toBe(false);
    const harmonic = stampSolve('harmonic', stamp);
    expect(harmonic.analyses).toEqual(['harmonic', 'linear']);
    expect(modelFeatures(steel, { analysesRun: harmonic.analyses, analysesRecorded: harmonic.recorded }).has('analysis:harmonic')).toBe(true);
  });

  it('a solve in another build never makes an analysis that ran under the previous stamp read as not run', () => {
    const before = { ...stampSolve('harmonic', solvedHere(['linear'])), resultsVersion: 1, commit: 'old' };
    expect(before.analyses).toEqual(['harmonic', 'linear']);
    const solved = stampSolve('linear', before);
    expect(solved.analyses).toEqual(['linear']);
    expect(solved.recorded).not.toContain('harmonic');
    expect(modelFeatures(steel, analysesContext(solved)).has('analysis:harmonic')).toBe(true);
    expect(modelFeatures(steel, analysesContext(solved)).has('analysis:nonlinear')).toBe(false);
    const fromUnknown = stampSolve('linear', unknownStamp());
    expect(fromUnknown.recorded).toEqual(['linear']);
  });

  it('a solve on top of a stamp written before #1658 keeps the analyses it did not record counted as run', () => {
    const { recorded: _all, ...legacy } = { ...solvedHere(['linear', 'harmonic']), resultsVersion: 1, commit: 'old' };
    const solved = stampSolve('linear', legacy);
    expect(solved.analyses).toEqual(['linear']);
    expect(solved.recorded).not.toContain('harmonic');
    const reread = readStamp(JSON.parse(JSON.stringify(solved)))!;
    expect(reread.recorded).toEqual(solved.recorded);
    const f = modelFeatures(steel, analysesContext(reread));
    for (const k of ['timeHistory', 'nonlinear', 'harmonic', 'ssi']) expect(f.has(`analysis:${k}` as never), k).toBe(true);
    const ran = stampSolve('harmonic', reread);
    expect(ran.recorded).toContain('harmonic');
    expect(modelFeatures(steel, analysesContext(ran)).has('analysis:nonlinear')).toBe(true);
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

it('shows moving-load changes for saved vehicle position cases and excludes ordinary frames', () => {
  const frame = model({ elements: [member(1, 1, 'frame')] });
  const moving = { ...frame, loadCases: [{ id: 1, type: 'Tr', alternatives: 'move:vehicle' }] };
  expect(modelFeatures(frame).has('movingLoads')).toBe(false);
  expect(modelFeatures(moving).has('movingLoads')).toBe(true);
  expect(ids(frame)).not.toContain('moving-loads-3d');
  expect(ids(frame)).not.toContain('moving-load-endpoint-forces');
  expect(ids(moving)).toContain('moving-loads-3d');
  for (const analysisMode of ['2d', 'pro']) {
    expect(ids({ ...moving, analysisMode })).toContain('moving-load-endpoint-forces');
  }
  expect(ids({ ...frame, loadCases: [{ id: 1, alternatives: 'other:group' }] })).not.toContain('moving-load-endpoint-forces');
  expect(ids(moving)).not.toContain('moving-axial-patch-boundaries');
  for (const analysisMode of ['2d', 'pro']) {
    expect(ids({ ...moving, analysisMode, loads: [{ type: 'distributed', data: { a: 1.10, b: 1.15 } }] })).toContain('moving-axial-patch-boundaries');
  }
  expect(ids({ ...moving, analysisMode: '2d' })).not.toContain('moving-loads-3d');
  expect(ids({ ...frame, loadCases: [{ id: 1, type: 'Tr' }] })).not.toContain('moving-loads-3d');
  expect(ids({ ...frame, loadCases: [{ id: 1, alternatives: 'other:group' }] })).not.toContain('moving-loads-3d');
});

it('scopes contact and cable validity to affected models', () => {
  const id = 'contact-and-cable-validity';
  for (const analysisMode of ['2d', '3d', 'pro']) {
    for (const elements of [[], [member(1, 1, 'frame')], [member(1, 1, 'truss')]]) {
      expect(ids(model({ analysisMode, elements }))).not.toContain(id);
    }
    for (const behaviour of ['cable', 'tensionOnly', 'compressionOnly']) {
      expect(ids(model({ analysisMode, elements: [member(1, 1, 'truss', { behaviour })] }))).toContain(id);
    }
    for (const type of ['cable', 'gap', 'contact']) {
      expect(ids(model({ analysisMode, elements: [member(1, 1, 'truss', { type })] }))).toContain(id);
    }
    expect(ids(model({ analysisMode, supports: [[1, { nodeId: 1, uplift: true }]] }))).toContain(id);
    expect(ids(model({ analysisMode, gapElements: [{ id: 1 }] }))).toContain(id);
    expect(ids(model({ analysisMode, nodeToSurfacePairs: [{ slaveNode: 1 }] }))).toContain(id);
    expect(ids(model({ analysisMode, upliftSupports: [1] }))).toContain(id);
  }
});

it('classifies native cables as axial members and contacts without frame claims (#1921)', () => {
  for (const type of ['cable', 'gap', 'contact']) {
    const features = modelFeatures(model({ elements: [member(1, 1, 'truss', { type })] }));
    expect(features.has('frameMembers'), type).toBe(false);
    expect(features.has('trussMembers'), type).toBe(type === 'cable');
  }
});

it('scopes frozen member validation to one-way behaviour even without gaps (#1921)', () => {
  const id = 'frozen-one-way-members';
  for (const analysisMode of ['2d', '3d', 'pro']) {
    for (const behaviour of ['tensionOnly', 'compressionOnly']) {
      expect(ids(model({ analysisMode, elements: [member(1, 1, 'truss', { behaviour })] }))).toContain(id);
    }
    expect(ids(model({ analysisMode, elements: [member(1, 1, 'truss')] }))).not.toContain(id);
    expect(ids(model({ analysisMode, elements: [member(1, 1, 'frame')] }))).not.toContain(id);
  }
});


describe('reaction recovery saved-model scope (#1949)', () => {
  const change = 'arc-length-reactions';
  const entry = RESULT_CHANGES.changes.find((c) => c.id === change)!;
  const before = (analysis: 'linear' | 'pdelta' | 'nonlinear' | 'timeHistory') => ({
    ...stampSolve(analysis, null), resultsVersion: entry.resultsVersion - 1,
  });

  it('excludes unchanged linear and unconstrained nonlinear results in every workspace', () => {
    for (const analysisMode of ['2d', '3d', 'pro']) {
      const structures: Partial<FeatureSnapshot>[] = [
        { elements: [member(1, 1, 'frame')] },
        { elements: [member(1, 1, 'truss')] },
        { quads: [[1, {}]] },
        { supports: [[1, { nodeId: 1, type: 'spring3d', kx: 1 }]] },
        { connectors: [[1, { kShear: 1 }]] },
      ];
      for (const structure of structures) {
        const snapshot = model({ ...structure, analysisMode });
        for (const analysis of ['linear', 'nonlinear'] as const) {
          expect(ids(snapshot, before(analysis)), `${analysisMode} ${analysis} ${JSON.stringify(structure)}`).not.toContain(change);
        }
      }
      const constrained = model({ analysisMode, constraints: [{ type: 'equalDof', masterNode: 1, slaveNode: 2 }] });
      expect(ids(constrained, before('linear'))).not.toContain(change);
    }
  });

  it('requires recoverable structure even when analyses are unknown or a time history is configured', () => {
    for (const analysisMode of ['2d', '3d', 'pro']) {
      for (const dynamics of [undefined, { timeHistory: { forces: [] } }]) {
        const snapshot = model({ analysisMode, dynamics, supports: [], loadCases: [] });
        for (const stamp of [null, before('linear'), before('pdelta'), before('timeHistory')]) {
          expect(ids(snapshot, stamp)).not.toContain(change);
        }
      }
    }
  });

  it('covers P-Delta equilibrium fields without covering unrelated static output', () => {
    const features = ['members', 'analysis:linear', 'analysis:pdelta'];
    expect(fieldCovered(reactionRecoveryChange, 'pdelta.results.equilibrium.equilibriumOk', features)).toBe(true);
    for (const path of ['base.reactions[n1].rz', 'base.elementForces[e1].mStart', 'base.displacements[n1].uz', 'solve.ok', 'pdelta.results.displacements[n1].uz']) {
      expect(fieldCovered(reactionRecoveryChange, path, features), path).toBe(false);
    }
  });

  it('includes changed P-Delta metadata, constrained nonlinear recovery and configured dynamic results', () => {
    for (const analysisMode of ['2d', '3d', 'pro']) {
      for (const structure of [
        { elements: [member(1, 1, 'frame')] },
        { elements: [member(1, 1, 'truss')] },
        { quads: [[1, {}]] as never },
        { supports: [[1, { nodeId: 1, type: 'spring3d', kx: 1 }]] as never },
      ]) {
        const snapshot = model({ ...structure, analysisMode });
        expect(ids(snapshot, before('pdelta'))).toContain(change);
        expect(ids(snapshot, stampSolve('pdelta', null))).not.toContain(change);
        const dynamic = { ...snapshot, dynamics: { timeHistory: { forces: [] } } };
        expect(ids(dynamic, before('timeHistory'))).toContain(change);
        expect(ids(dynamic, before('linear'))).toContain(change);
        expect(ids(dynamic)).toContain(change);
      }
      const constrained = model({ analysisMode, constraints: [{ type: 'equalDof', masterNode: 1, slaveNode: 2 }] });
      expect(ids(constrained, before('nonlinear'))).toContain(change);
      expect(ids(constrained)).toContain(change);
    }
  });
});

describe.skip('path reaction recovery registry regressions (#1952)', () => {
  for (const [name, fixture] of [['0015ab84c3baa36f', frozenArchA], ['022317310499426d', frozenArchB]] as const) {
    it(`covers the actual frozen path result ${name}`, () => {
      expect(conditionHolds(reactionRecoveryChange.when, new Set([...fixture.features, 'pathAnalysis']))).toBe(true);
      expect(fixture.features).toContain('pathAnalysis');
      expect(conditionHolds(reactionRecoveryChange.when, new Set(fixture.features))).toBe(true);
      for (const path of Object.keys(fixture.values).filter(p => p.includes('.reactions['))) {
        expect(fieldCovered(reactionRecoveryChange, path, fixture.features), path).toBe(true);
      }
      expect(fieldCovered(reactionRecoveryChange, 'nonlinear.results.elementForces[0].mStart', fixture.features)).toBe(true);
      expect(fieldCovered(reactionRecoveryChange, 'nonlinear.results.displacements[0].ux', fixture.features)).toBe(false);
      expect(fieldCovered(reactionRecoveryChange, 'base.reactions[n1].rz', [...fixture.features, 'analysis:linear'])).toBe(false);
      expect(conditionHolds(reactionRecoveryChange.when, new Set(fixture.features.filter(f => f !== 'pathAnalysis')))).toBe(false);
    });
  }
});
