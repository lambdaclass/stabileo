/**
 * Results version 4: the design chain's changes (#460, #461 and #462–#475), told to the projects
 * they concern (`docs/results-changes/2026-10-design-chain.md`).
 *
 * #460 and #461 reached main without entries, so a project solved by their builds carries
 * version 3 and must still be told; a project stamped 4 was solved with every change and is not.
 */
import { describe, it, expect } from 'vitest';
import { assessProject } from '../applicability';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { RESULT_CHANGES } from '../registry';
import type { SolveStamp } from '../solve-stamp';

const STEEL = { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 };
const CONCRETE = { id: 2, name: 'H-25', e: 30000, nu: 0.2, rho: 25, fy: 25 };
const TIMBER = { id: 3, name: 'C24', gradeId: 'en338-c24', e: 11000, nu: 0.3, rho: 4.2, fy: 24 };
const member = (id: number, materialId: number, extra: Record<string, unknown> = {}) =>
  [id, { id, type: 'frame', nodeI: 1, nodeJ: 2, materialId, sectionId: 1, releaseI: {}, releaseJ: {}, ...extra }] as [number, never];
const quad = (id: number, extra: Record<string, unknown> = {}) => [id, { id, nodes: [1, 2, 3, 4], materialId: 2, thickness: 0.15, ...extra }] as [number, never];

function model(over: Partial<FeatureSnapshot> = {}): FeatureSnapshot {
  return {
    analysisMode: 'pro',
    materials: [[1, STEEL], [2, CONCRETE], [3, TIMBER]] as never,
    elements: [],
    supports: [[1, { nodeId: 1, type: 'fixed3d' }]] as never,
    loads: [],
    loadCases: [{ id: 1, type: 'D' }],
    ...over,
  };
}

const stamp = (resultsVersion: number, analyses: string[] = ['linear']) => ({ resultsVersion, analyses }) as unknown as SolveStamp;
const ids = (s: FeatureSnapshot, st: SolveStamp) => assessProject(s, st, s.analysisMode).changes.map((c) => c.id);
const V4 = RESULT_CHANGES.changes.filter((c) => c.resultsVersion === 4).map((c) => c.id);
const STEEL_461 = [
  'cirsoc301-refused-limit-state-holds', 'cirsoc301-undeclared-fabrication-and-load-height',
  'cirsoc301-concurrent-forces-and-lengths', 'cold-formed-not-checked-by-cirsoc301',
];

describe('results version 4: the design chain', () => {
  it('is a released version, and every entry links its write-up', () => {
    expect(RESULT_CHANGES.currentResultsVersion).toBeGreaterThanOrEqual(4);
    for (const c of RESULT_CHANGES.changes.filter((x) => x.resultsVersion === 4)) {
      expect(c.changelog.file, c.id).toBe('docs/results-changes/2026-10-design-chain.md');
    }
  });

  it('tells a steel project solved by a build with #461 (stamped 3) about its steel changes', () => {
    const frame = model({ elements: [member(1, 1)] });
    const seen = ids(frame, stamp(3));
    for (const id of STEEL_461) expect(seen, id).toContain(id);
    // Nothing of concrete, footings or eccentricities for a plain steel frame.
    expect(seen).not.toContain('rc-beams-lateral-role-shear-minimum-torsion');
    expect(seen).not.toContain('strip-footings-under-walls-whole-strip');
    expect(seen).not.toContain('dynamic-analyses-refuse-eccentricities');
  });

  it('tells a project solved with the current version nothing', () => {
    const frame = model({ elements: [member(1, 1), member(2, 2)], quads: [quad(1)] as never, footings: [[1, {}]] as never });
    expect(ids(frame, stamp(RESULT_CHANGES.currentResultsVersion))).toEqual([]);
  });

  it('tells a concrete project about the beam entries, and the flange one only with shells', () => {
    const frame = model({ elements: [member(1, 2)] });
    expect(ids(frame, stamp(3))).toContain('rc-beams-lateral-role-shear-minimum-torsion');
    expect(ids(frame, stamp(3))).not.toContain('rc-flanged-beams-designed-about-depth');
    const withSlab = model({ elements: [member(1, 2)], quads: [quad(1)] as never });
    expect(ids(withSlab, stamp(3))).toContain('rc-flanged-beams-designed-about-depth');
    // A steel-only model hears nothing of concrete.
    expect(ids(model({ elements: [member(1, 1)] }), stamp(3)).filter((id) => id.startsWith('rc-'))).toEqual([]);
  });

  it('reads member insertions and shell offsets as eccentricities', () => {
    const plain = model({ elements: [member(1, 1)] });
    expect(modelFeatures(plain).has('eccentricities')).toBe(false);
    const inserted = model({ elements: [member(1, 1, { offset: { frame: 'global', i: { x: 0, y: 0, z: -0.25 } } })] });
    expect(modelFeatures(inserted).has('eccentricities')).toBe(true);
    const zeroOffset = model({ elements: [member(1, 1, { offset: { frame: 'global', i: { x: 0, y: 0, z: 0 } } })] });
    expect(modelFeatures(zeroOffset).has('eccentricities')).toBe(false);
    const shellOffset = model({ quads: [quad(1, { offset: { frame: 'local', x: 0, y: 0, z: 0.1 } })] as never });
    expect(modelFeatures(shellOffset).has('eccentricities')).toBe(true);
  });

  it('tells every eccentric model about the dynamic refusal, and no model without eccentricities', () => {
    // Time histories are solved outside the stamp (`UNTRACKED_ANALYSES`), so a stamp can never say
    // one was not run: the entry errs towards present, as the registry's rule asks.
    const inserted = model({ elements: [member(1, 1, { offset: { frame: 'global', i: { x: 0, y: 0, z: -0.25 } } })] });
    expect(ids(inserted, stamp(3, ['linear']))).toContain('dynamic-analyses-refuse-eccentricities');
    expect(ids(inserted, stamp(3, ['linear', 'modal']))).toContain('dynamic-analyses-refuse-eccentricities');
    const plain = model({ elements: [member(1, 1)], loadCases: [{ id: 1, type: 'D' }, { id: 2, type: 'E' }] });
    expect(ids(plain, stamp(3, ['linear', 'modal', 'spectral']))).not.toContain('dynamic-analyses-refuse-eccentricities');
  });

  it('tells a timber model that its members are no longer checked as steel', () => {
    const timber = model({ elements: [member(1, 3)] });
    expect(modelFeatures(timber).has('timberOrAluminiumMembers')).toBe(true);
    expect(modelFeatures(timber).has('steelMembers')).toBe(false);
    expect(ids(timber, stamp(3))).toContain('other-materials-not-checked-as-steel');
  });

  it('tells a project with footings about the strip footings under walls', () => {
    const withFooting = model({ elements: [member(1, 2)], footings: [[1, {}]] as never });
    expect(ids(withFooting, stamp(3))).toContain('strip-footings-under-walls-whole-strip');
  });

  it('holds nine entries, each from a PR of the chain', () => {
    expect(V4).toHaveLength(9);
    for (const c of RESULT_CHANGES.changes.filter((x) => x.resultsVersion === 4)) {
      expect(c.prs.every((n) => [460, 461, 462, 463, 474, 475].includes(n)), c.id).toBe(true);
    }
  });
});
