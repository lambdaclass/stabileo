/**
 * The discretization store: estimates only 3D base solves with shells, keeps the estimate
 * labelled uncertified, keys the element map as the viewport keys shells, and scales the map
 * from zero to at least twice the threshold.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estimate = {
  certified: false, method: 'zz-spr', relativeError: 0.08, errorNorm: 1, solutionNorm: 12, threshold: 0.05,
  exceedsThreshold: true, frameMembers: 0, notes: ['notCertified'],
  elements: [
    { kind: 'quad', elementId: 3, eta: 0.5, energyNorm: 2, localPercent: 14 },
    { kind: 'plate', elementId: 4, eta: 0.1, energyNorm: 2, localPercent: 2 },
    { kind: 'curvedShell', elementId: 5, eta: 0.1, energyNorm: 2, localPercent: 3 },
  ],
};
const runCertify = vi.fn(async () => estimate);
let wire: Record<string, unknown> = {};

vi.mock('../../engine/certify-jobs', () => ({ runCertify: (...a: unknown[]) => runCertify(...(a as [])), hasCertify: () => true }));
vi.mock('../../engine/solver-service', () => ({ estimableInputOf: () => ({ dim: '3d', wire: () => wire }) }));

const { discretizationStore, discretizationClaims, isInconclusive, viewportShellKey, approxPercent, percentText, thresholdTick, studyUnit } = await import('../discretization.svelte');
const { resultsStore } = await import('../results.svelte');

async function settle() {
  await vi.advanceTimersByTimeAsync(1000);
}

describe('discretization store', () => {
  beforeEach(() => { vi.useFakeTimers(); runCertify.mockClear(); });

  it('estimates a 3D solve with shells, and labels it uncertified', async () => {
    wire = { quads: { 3: {} }, plates: { 4: {} } };
    discretizationStore.track({}, '3d');
    expect(discretizationStore.estimate.status).toBe('pending');
    await settle();
    const s = discretizationStore.estimate;
    expect(s.status).toBe('done');
    if (s.status !== 'done') return;
    expect(s.estimate.certified).toBe(false);
    // The curved quad (sent to the engine as a curved shell) is painted on its quad mesh.
    expect([...discretizationStore.elementMap()]).toEqual([['q3', 14], ['p4', 2], ['q5', 3]]);
    expect(discretizationStore.mapRange()).toEqual({ min: 0, max: 14 });
  });

  it('leaves models without shells, and 2D solves, alone', async () => {
    wire = { quads: {}, plates: {} };
    discretizationStore.track({}, '3d');
    await settle();
    expect(discretizationStore.estimate.status).toBe('idle');
    discretizationStore.track({}, '2d');
    await settle();
    expect(discretizationStore.estimate.status).toBe('idle');
    expect(runCertify).not.toHaveBeenCalled();
  });

  it('applies only while the estimated base result is the one on screen', async () => {
    wire = { quads: { 3: {} } };
    const base = { displacements: [], reactions: [], elementForces: [] } as never;
    discretizationStore.track(base, '3d');
    resultsStore.setResults3D(base);
    await settle();
    expect(discretizationStore.applies()).toBe(true);
    expect(discretizationStore.canRunStudy()).toBe(true);
    // A P-Δ result replaces the results on screen: the linear estimate no longer describes them.
    resultsStore.setPDeltaResult3D({ results: { displacements: [], reactions: [], elementForces: [] }, iterations: 1, converged: true } as never);
    expect(discretizationStore.applies()).toBe(false);
    expect(discretizationStore.canRunStudy()).toBe(false);
  });

  it('never shows 0 % for an estimate that could not be made, nor maps it', async () => {
    const unest = { ...estimate, relativeError: undefined, unestimableReason: 'noStrainEnergy', exceedsThreshold: true };
    const c = discretizationClaims(unest as never, 0);
    expect(c.percent).toBeNull();
    expect(c.unestimable).toBe('noStrainEnergy');
    expect(c.warnUnestimable).toBe('discretization.warningUnestimable');
    expect(discretizationClaims({ ...unest, unestimableReason: 'tooCoarse' } as never, 0).warnUnestimable).toBe('discretization.warningTooCoarse');
    expect(discretizationClaims({ ...unest, unestimableReason: 'unloaded', exceedsThreshold: false } as never, 0).warnUnestimable).toBeNull();
    runCertify.mockImplementationOnce(async () => unest as never);
    wire = { quads: { 3: {} } };
    discretizationStore.track({}, '3d');
    await settle();
    expect(discretizationStore.elementMap().size).toBe(0);
  });

  it('claims exact members only when every member is, and none was cut into pieces', () => {
    const exact = { ...estimate, notes: ['notCertified', 'framesExact'], frameMembers: 3, inexactMembers: [] };
    expect(discretizationClaims(exact as never, 0).framesExact).toBe(true);
    // A member of variable section is solved as prismatic pieces: not exact.
    const tapered = discretizationClaims(exact as never, 1);
    expect(tapered.framesExact).toBe(false);
    expect(tapered.variableMembers).toBe(1);
    // Warping members: the engine withholds the claim and lists them.
    const warping = { ...estimate, notes: ['notCertified', 'warpingMembersNotEstimated'], frameMembers: 3, inexactMembers: [2] };
    const w = discretizationClaims(warping as never, 0);
    expect(w.framesExact).toBe(false);
    expect(w.warpingMembers).toBe(1);
    // Curved beams.
    const curved = { ...estimate, notes: ['notCertified', 'curvedBeamsSegmented'], frameMembers: 1 };
    expect(discretizationClaims(curved as never, 0).framesExact).toBe(false);
    expect(discretizationClaims(curved as never, 0).curvedBeams).toBe(true);
  });

  it('leaves elements that were not estimated off the map, and counts them', async () => {
    const partial = {
      ...estimate,
      isolatedElements: [9],
      elements: [...estimate.elements, { kind: 'quad', elementId: 9, eta: 0, energyNorm: 1, localPercent: undefined }],
    };
    expect(discretizationClaims(partial as never, 0).isolatedElements).toBe(1);
    runCertify.mockImplementationOnce(async () => partial as never);
    wire = { quads: { 3: {}, 9: {} } };
    discretizationStore.track({}, '3d');
    await settle();
    expect(discretizationStore.elementMap().has('q9')).toBe(false);
    expect(discretizationStore.elementMap().get('q3')).toBe(14);
  });

  it('treats oscillating, non-converging, implausible and incomplete sequences as inconclusive', () => {
    for (const s of ['oscillating', 'notConverging', 'irregularOrder', 'incomplete'] as const) expect(isInconclusive(s)).toBe(true);
    for (const s of ['converging', 'converged', 'assumedOrder', 'zero'] as const) expect(isInconclusive(s)).toBe(false);
  });

  it('turns the map off when a later solve cannot be estimated, so it never holds the viewport', async () => {
    wire = { quads: { 3: {} } };
    const base = { displacements: [], reactions: [], elementForces: [] } as never;
    discretizationStore.track(base, '3d');
    resultsStore.setResults3D(base);
    await settle();
    discretizationStore.showMap = true;
    expect(discretizationStore.mapActive()).toBe(true);
    const unest = { ...estimate, relativeError: undefined, unestimableReason: 'noStrainEnergy' };
    runCertify.mockImplementationOnce(async () => unest as never);
    const next = { displacements: [], reactions: [], elementForces: [] } as never;
    discretizationStore.track(next, '3d');
    resultsStore.setResults3D(next);
    await settle();
    expect(discretizationStore.showMap).toBe(false);
    expect(discretizationStore.mapActive()).toBe(false);
  });

  it('maps every element family to the key the viewport draws it under', () => {
    expect(viewportShellKey('plate', 7)).toBe('p7');
    expect(viewportShellKey('quad', 7)).toBe('q7');
    expect(viewportShellKey('curvedShell', 7)).toBe('q7');
    // No web element: nothing to paint, rather than a key that matches nothing.
    expect(viewportShellKey('quad9', 7)).toBeNull();
    expect(viewportShellKey('solidShell', 7)).toBeNull();
  });

  it('keeps one convergence check at a time: a superseded one still running holds the button', async () => {
    wire = { quads: { 3: {} } };
    const base = { displacements: [], reactions: [], elementForces: [] } as never;
    discretizationStore.track(base, '3d');
    resultsStore.setResults3D(base);
    await settle();
    let finish!: (v: unknown) => void;
    runCertify.mockImplementationOnce(() => new Promise((r) => { finish = r; }) as never);
    const running = discretizationStore.runStudy();
    expect(discretizationStore.study.status).toBe('running');

    // A re-solve supersedes it: its result will be discarded, but the worker job runs on.
    const next = { displacements: [], reactions: [], elementForces: [] } as never;
    discretizationStore.track(next, '3d');
    resultsStore.setResults3D(next);
    await settle();
    expect(discretizationStore.study.status).toBe('idle');
    expect(discretizationStore.studyFinishing).toBe(true);
    expect(discretizationStore.canRunStudy()).toBe(false);
    const calls = runCertify.mock.calls.length;
    await discretizationStore.runStudy();
    expect(runCertify.mock.calls.length).toBe(calls);

    finish({ certified: false, levels: [], quantities: [], threshold: 0.05, exceedsThreshold: false, caveats: [] });
    await running;
    expect(discretizationStore.study.status).toBe('idle');
    expect(discretizationStore.studyFinishing).toBe(false);
    expect(discretizationStore.canRunStudy()).toBe(true);
  });

  it('prints a percentage below 0.01 % as such, never as ~0.00 %', () => {
    expect(approxPercent(1e-7)).toBe('< 0.01 %');
    expect(approxPercent(0.00009)).toBe('< 0.01 %');
    expect(approxPercent(0.0005)).toBe('~0.05 %');
    expect(approxPercent(0.0123)).toBe('~1.2 %');
    expect(approxPercent(0.25)).toBe('~25 %');
    expect(approxPercent(0)).toBe('0 %');
    expect(approxPercent(null)).toBe('—');
    expect(percentText(0.05)).toBe('5.0');
  });

  it('puts the threshold label where its colour is on the legend bar', () => {
    // Threshold 5 % on a 0–14 % bar: at 5/14 of it, not in the middle.
    expect(thresholdTick(5, 14).at).toBeCloseTo(100 * 5 / 14);
    expect(thresholdTick(5, 14).label).toBe(true);
    expect(thresholdTick(5, 10).at).toBe(50);
    // Too close to an end label to be read: the mark stays, its text does not.
    expect(thresholdTick(5, 200)).toEqual({ at: 2.5, label: false });
    expect(thresholdTick(5, 5.2).label).toBe(false);
    expect(thresholdTick(5, 4).at).toBe(100);
    expect(thresholdTick(5, 0)).toEqual({ at: 0, label: false });
  });

  it('shows the study quantities in the reader\'s units', () => {
    expect(studyUnit('maxDisplacement', 'SI')).toEqual({ factor: 1, unit: 'm' });
    expect(studyUnit('maxDisplacement', 'SImm')).toEqual({ factor: 1000, unit: 'mm' });
    expect(studyUnit('maxMoment', 'SI')).toEqual({ factor: 1, unit: 'kN·m/m' });
    const imp = studyUnit('maxMoment', 'Imperial');
    expect(imp.unit).toBe('kip·ft/ft');
    expect(imp.factor).toBeCloseTo(0.224809);
    expect(studyUnit('maxMoment', 'MKS').unit).toBe('tf·m/m');
    expect(studyUnit('maxStress', 'SI')).toEqual({ factor: 1, unit: 'kN/m²' });
    expect(studyUnit('maxStress', 'Imperial').unit).toBe('psf');
    expect(studyUnit('reaction', 'MKS').unit).toBe('tf');
    expect(studyUnit('maxFrameMoment', 'Imperial').unit).toBe('kip·ft');
  });
});
