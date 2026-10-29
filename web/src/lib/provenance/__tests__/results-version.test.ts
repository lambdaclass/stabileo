import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../registry';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

/**
 * The entries of each results version on main, as it shipped. Every merge to main is deployed
 * (`deploy-gh-pages.yml`) and stamps what it solves with `currentResultsVersion`, so a version on
 * main is released: an entry added to it later is never shown to a project that build solved.
 *
 * Adding a change? Do not add its id to a set below: give it `currentResultsVersion + 1`, bump
 * `currentResultsVersion`, and add the new version's set here (changes merged together share it).
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
};

describe('results versions', () => {
  it('keeps the entries each released version shipped with', () => {
    const byVersion: Record<number, string[]> = {};
    for (const c of RESULT_CHANGES.changes) (byVersion[c.resultsVersion] ??= []).push(c.id);
    const sorted = (r: Record<number, string[]>) => Object.fromEntries(Object.entries(r).map(([v, ids]) => [v, [...ids].sort()]));
    expect(sorted(byVersion)).toEqual(sorted(RELEASED));
    expect(RESULT_CHANGES.currentResultsVersion).toBe(Math.max(...Object.keys(RELEASED).map(Number)));
  });

  it('stamps the committed project fixture with the current version', () => {
    // The e2e specs open it as a project of this build; an older stamp raises the re-check notice
    // over them. Restamping it moves its sha256 in the rc-cad-handoff golden and manifest tests.
    const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../export/__fixtures__/rc-footing-cad-poc.ded.json'), 'utf8'));
    expect(fixture.snapshot.solvedWith.resultsVersion).toBe(RESULT_CHANGES.currentResultsVersion);
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
