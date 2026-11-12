import { RESULT_CHANGES } from '../full-registry';
import { describe, it, expect } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

/**
 * The entries of each results version on main, as it shipped. Every merge to main is deployed
 * (`deploy-gh-pages.yml`) and stamps what it solves with `currentResultsVersion`, so a version on
 * main is released: an entry added to it later is never shown to a project that build solved.
 *
 * These are the frozen versions of `result-changes/numbered.json`. A change added since is a file
 * of its own, numbered by main's merge order (`result-changes/README.md`), and is not listed here.
 */
const RELEASED: Record<number, string[]> = {
  // #328 (2026-10-21), the first build that stamps its solves.
  1: [
    'spectral-cqc-and-participation', 'torsional-buckling-3d', 'mirrored-moments-2d-in-3d', 'inclined-member-loads',
    'springs-on-fixed-supports', 'shb8-thickness-locking', 'diaphragm-rigid-rotation', 'dead-load-default-2.52',
    'cirsoc301-tension-needs-connection', 'cirsoc301-ltb-top-flange', 'cirsoc301-biaxial-h11b', 'cirsoc301-member-checks',
    'steel-ratio-above-one-fails', 'ec3-aisc-ltb-and-slender', 'weld-groups-end-loaded', 'cirsoc201-strain-compatibility',
    'aci318-strain-and-axial', 'footing-shear-lambda-s', 'constraints-on-supported-slaves', 'constraints-at-inclined-supports',
    'multiple-supports-one-node', 'inclined-supports-every-analysis', 'buckling-2d-linear-stiffness',
    'buckling-axial-from-elongation', 'ground-motion-coupled-mass', 'modal-massless-and-pivot', 'connectors-shear-and-dofs',
    'plastic-collapse-corrected', 'nonlinear-solvers-as-given', 'solid-shell-and-mitc4-warping',
    'shell-rigid-motions-and-signs', 'shell-edge-load-sign', 'certificate-solver-fixes', 'cirsoc-combinations-and-loads',
    'section-properties-asymmetric', 'feature-matrix-refusals', 'aisi-cold-formed',
  ],
  // The fixes merged with 0.3.0 (#530) after version 1 was deployed, and the first entries added
  // under the bump rule after it (#581, #593), which took version 2 on main before this branch.
  2: [
    'curved-shell-moments-and-thermal', 'arc-member-local-axes', 'plastic-3d-element-order', 'cable-tension-chord-law',
    'soil-curves-references', 'frame-thermal-alpha-depth', 'free-roof-wind-minimum', 'earth-pressure-dead-load-resisting',
  ],
  // D4-01: RC columns checked for both signs of the moment (SA-2026-023); W2-01: footings and
  // joints not designed for the unfactored loads (SA-2026-024). Merged together (#590, #588).
  3: ['column-capacity-both-signs', 'design-on-unfactored-results'],
  // The design chain: #460 and #461 reached main on 2026-10-25 without entries (their builds
  // stamped 3), and #462–#475 entered with the design switch (#624) in one merge. Written up in
  // docs/results-changes/2026-10-design-chain.md.
  4: [
    'dynamic-analyses-refuse-eccentricities', 'cirsoc301-refused-limit-state-holds',
    'cirsoc301-undeclared-fabrication-and-load-height', 'cirsoc301-concurrent-forces-and-lengths',
    'cold-formed-not-checked-by-cirsoc301', 'other-materials-not-checked-as-steel',
    'rc-beams-lateral-role-shear-minimum-torsion', 'rc-flanged-beams-designed-about-depth',
    'strip-footings-under-walls-whole-strip',
  ],
  5: ['solid-shell-local-stress-axes'],
  6: ['buckling-certificate-rejects-outside-factor'],
  7: ['cirsoc201-column-design-axes'],
  8: ['ec2-flexure-strain-compatibility'],
  9: ['modal-repeated-eigenspace-completeness'],
  10: ['static-modal-runtime-self-checks'],
  11: ['shell-envelope-per-component'],
  12: ['cirsoc301-q-nonpositive-refused'],
  13: ['time-history-massless-start', 'modal-mechanism-refused'],
  14: [
    'basic-plastic-closes-unloading-hinges', 'basic-second-order-split-members',
    'basic-influence-line-moment-sign',
  ],
  15: [
    'basic-plastic-unloading-hinges-withdrawn', 'basic-second-order-split-members-withdrawn',
    'basic-influence-line-moment-sign-withdrawn',
  ],
  16: ['aluminium-weak-axis-shear'],
  17: ['joint-weak-axis-moment'],
  18: ['rc-other-codes-torsion-unchecked'],
  19: ['rc-column-least-compression'],
  20: ['generated-area-loads-headroom'],
  21: ['shell-figures-paint-the-screen-field'],
  22: ['hidden-mechanism-2d-refused'],
  23: ['buckling-2d-varying-axial-force'],
  24: ['corotational-3d-rotations'],
  25: ['constraint-cut-plane'],
  26: ['governing-envelope-true-peak'],
  27: ['basic-influence-line-moment-sign-returns'],
  28: ['basic-second-order-split-members-returns'],
  29: ['basic-plastic-closes-unloading-hinges-returns'],
  30: ['connector-mechanism-2d-refused'],
  32: ['harmonic-modal-residual-checked'],
  39: ['plastic-3d-member-without-capacity-refused'],
  38: ['example-cantilever-small-rotations'],
  37: ['example-torsion-beam-closed-section'],
  36: ['linear-small-displacement-warning'],
  33: ['soft-rotation-not-orphan'],
  31: ['safety-containment-diagnostics'],
  34: ['fail-closed-ratios'],
  35: ['buckling-3d-varying-axial-force'],
};

describe('results versions', () => {
  it('keeps the entries each released version shipped with', () => {
    const byVersion: Record<number, string[]> = {};
    const frozen = Math.max(...Object.keys(RELEASED).map(Number));
    for (const c of RESULT_CHANGES.changes) if (c.resultsVersion <= frozen) (byVersion[c.resultsVersion] ??= []).push(c.id);
    const sorted = (r: Record<number, string[]>) => Object.fromEntries(Object.entries(r).map(([v, ids]) => [v, [...ids].sort()]));
    expect(sorted(byVersion)).toEqual(sorted(RELEASED));
    expect(RESULT_CHANGES.currentResultsVersion).toBeGreaterThanOrEqual(frozen);
  });

  it('tells a modal frame about modal completeness up to version 8, self-checks up to 9, the mechanism refusal up to 12, the 3D co-rotational rotations up to 23 and the containment diagnostics up to 29, until it is re-solved', () => {
    const frame: FeatureSnapshot = {
      analysisMode: 'pro',
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]],
    };
    const stamp = { resultsVersion: 4, analyses: ['modal'] } as unknown as SolveStamp;
    const ids = (resultsVersion: number) => assessProject(frame, { ...stamp, resultsVersion }, 'pro').changes.map((c) => c.id).sort();
    for (const version of [4, 5, 6, 7, 8]) {
      expect(ids(version)).toEqual(['corotational-3d-rotations', 'harmonic-modal-or-direct-per-frequency', 'harmonic-modal-residual-checked', 'harmonic-omitted-modes', 'linear-pin-coupling', 'linear-second-order-warning', 'linear-small-displacement-warning', 'linear-span-rotation-warning', 'linear-stability-refusals', 'material-nonlinear-3d-orphan-dofs', 'modal-basis-entrywise-rounding', 'modal-mechanism-refused', 'modal-repeated-eigenspace-completeness', 'plastic-3d-member-without-capacity-refused', 'safety-containment-diagnostics', 'soft-rotation-not-orphan', 'span-check-shear-thermal', 'staged-history-forces-unavailable', 'static-modal-runtime-self-checks']);
    }
    expect(ids(9)).toEqual(['corotational-3d-rotations', 'harmonic-modal-or-direct-per-frequency', 'harmonic-modal-residual-checked', 'harmonic-omitted-modes', 'linear-pin-coupling', 'linear-second-order-warning', 'linear-small-displacement-warning', 'linear-span-rotation-warning', 'linear-stability-refusals', 'material-nonlinear-3d-orphan-dofs', 'modal-basis-entrywise-rounding', 'modal-mechanism-refused', 'plastic-3d-member-without-capacity-refused', 'safety-containment-diagnostics', 'soft-rotation-not-orphan', 'span-check-shear-thermal', 'staged-history-forces-unavailable', 'static-modal-runtime-self-checks']);
    for (const version of [10, 11, 12]) expect(ids(version)).toEqual(['corotational-3d-rotations', 'harmonic-modal-or-direct-per-frequency', 'harmonic-modal-residual-checked', 'harmonic-omitted-modes', 'linear-pin-coupling', 'linear-second-order-warning', 'linear-small-displacement-warning', 'linear-span-rotation-warning', 'linear-stability-refusals', 'material-nonlinear-3d-orphan-dofs', 'modal-basis-entrywise-rounding', 'modal-mechanism-refused', 'plastic-3d-member-without-capacity-refused', 'safety-containment-diagnostics', 'soft-rotation-not-orphan', 'span-check-shear-thermal', 'staged-history-forces-unavailable']);
    expect(ids(13)).toEqual(['corotational-3d-rotations', 'harmonic-modal-or-direct-per-frequency', 'harmonic-modal-residual-checked', 'harmonic-omitted-modes', 'linear-pin-coupling', 'linear-second-order-warning', 'linear-small-displacement-warning', 'linear-span-rotation-warning', 'linear-stability-refusals', 'material-nonlinear-3d-orphan-dofs', 'modal-basis-entrywise-rounding', 'plastic-3d-member-without-capacity-refused', 'safety-containment-diagnostics', 'soft-rotation-not-orphan', 'span-check-shear-thermal', 'staged-history-forces-unavailable']);
    expect(ids(26)).toEqual(['harmonic-modal-or-direct-per-frequency', 'harmonic-modal-residual-checked', 'harmonic-omitted-modes', 'linear-pin-coupling', 'linear-second-order-warning', 'linear-small-displacement-warning', 'linear-span-rotation-warning', 'linear-stability-refusals', 'material-nonlinear-3d-orphan-dofs', 'modal-basis-entrywise-rounding', 'plastic-3d-member-without-capacity-refused', 'safety-containment-diagnostics', 'soft-rotation-not-orphan', 'span-check-shear-thermal', 'staged-history-forces-unavailable']);
    expect(ids(RESULT_CHANGES.currentResultsVersion)).toEqual([]);
  });

  it('tells a project solved with version 1 about the changes added after it shipped', () => {
    // A 3D steel frame, solved by a build that stamped version 1 after a linear and a plastic run.
    const frame: FeatureSnapshot = {
      analysisMode: 'pro',
      materials: [[1, { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 }]] as never,
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]] as never,
      supports: [[1, { nodeId: 1, type: 'fixed3d' }]] as never,
      loads: [],
      loadCases: [{ id: 1, type: 'D' }],
    };
    const v1 = { resultsVersion: 1, analyses: ['linear', 'plastic'] } as unknown as SolveStamp;
    const a = assessProject(frame, v1, 'pro');
    expect(a.older).toBe(true);
    const ids = a.changes.map((c) => c.id);
    for (const id of ['plastic-3d-element-order', 'cable-tension-chord-law', 'soil-curves-references']) {
      expect(ids, id).toContain(id);
    }
    // Nothing from version 1 again.
    expect(ids.filter((id) => RELEASED[1].includes(id))).toEqual([]);
  });
});
