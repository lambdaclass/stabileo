/**
 * The eccentric load must reach the DIAGRAMS, not only the readout.
 *
 * The first version of this feature resolved an eccentric load correctly and
 * fed it to Mohr's circle, the tensors and the stress map — but the stress
 * diagrams kept plotting the model's own forces, because they come from a
 * different analysis path. The panel showed two load cases at once and only
 * the small print said which was which.
 *
 * Connecting the two paths means crossing a convention boundary, and that is
 * what this file pins:
 *
 *   * `stationForces2D` reports `my = M`; the diagram path wants the OPPOSITE
 *     sign to put tension on the same fibre. Same for `mz`.
 *   * the axes swap names: the diagram path's `yFiber` is the DEPTH, which is
 *     the canonical `z`, and its `zFiber` is the width, the canonical `y`.
 *
 * Both were established by measuring the two functions against each other, not
 * by reading the code. A sign error here does not throw — it draws a diagram
 * upside down, which looks entirely plausible.
 */

import { describe, it, expect } from 'vitest';
import { canonicalStressState } from '../stress-state';
import { resolveEccentric, snapShearCentre } from '../eccentric';
import { resolveSectionState } from '../state';
import { analyzeSectionStressFromForces } from '../../engine/section-stress-3d';
import type { Section } from '../../store/model.svelte';

const issue2366 = process.env.RUN_KNOWN_WRONG === '2366' ? it : it.skip;

function sec(over: Partial<Section>): Section {
  const s = { id: 1, name: '', a: 0.08, iy: 1.0667e-3, iz: 2.667e-4, ...over } as Section;
  s.canonical = resolveSectionState(s, { torsion: true });
  return s;
}
/** 200 wide × 400 deep: canonical y is the width, z the depth. */
const rect = () => sec({ shape: 'rect', b: 0.2, h: 0.4 });

/** The conversion the panel applies when handing forces to the diagram path. */
const toDiagram = (
  s: Section,
  f: { n: number; my: number; mz: number; vy?: number; vz?: number; t?: number },
  point: [number, number],
) =>
  analyzeSectionStressFromForces(
    f.n, f.vy ?? 0, f.vz ?? 0, f.t ?? 0,
    -f.my, -f.mz,
    s, 250,
    point[1], point[0],
  );

describe('the two analysis paths agree once the conventions are crossed', () => {
  it('reports the same normal stress for the same forces at the same point', () => {
    const S = rect();
    const forces = { n: 300, my: 100, mz: 40 };
    for (const point of [[0, 0.2], [0.1, -0.15], [-0.08, 0.05]] as Array<[number, number]>) {
      const canon = canonicalStressState(S, forces, point);
      if (!canon.ok) throw new Error(canon.message ?? canon.reason);
      const diag = toDiagram(S, forces, point);
      // Loose tolerance: the diagram path resolves the section from its named
      // dimensions while the canonical path integrates the polygon, so they
      // agree to the resolver's precision rather than to the last bit.
      expect(diag.sigmaAtFiber).toBeCloseTo(canon.state.sigma, 2);
    }
  });

  it('would disagree if the sign were not inverted — so the test is not vacuous', () => {
    const S = rect();
    const forces = { n: 0, my: 100, mz: 0 };
    const point: [number, number] = [0, 0.2];
    const canon = canonicalStressState(S, forces, point);
    if (!canon.ok) throw new Error('canonical failed');
    const wrong = analyzeSectionStressFromForces(0, 0, 0, 0, forces.my, 0, S, 250, point[1], point[0]);
    // Same magnitude, opposite sign: exactly the failure that looks plausible.
    expect(wrong.sigmaAtFiber).toBeCloseTo(-canon.state.sigma, 2);
  });
});

describe('an axial load moved sideways bends the section both ways', () => {
  it('produces Mz, which a plane frame cannot represent on its own', () => {
    // This is the case the user has to be able to see: a 2D model has one
    // bending component, and an eccentric axial force introduces the other.
    const r = resolveEccentric({ n: 500, at: [0.06, 0] });
    expect(r.forces.mz).toBeCloseTo(-30, 9); // -N·y
    expect(r.forces.my).toBeCloseTo(0, 12);
  });

  it('produces My when moved along the depth, and both when moved diagonally', () => {
    expect(resolveEccentric({ n: 500, at: [0, 0.1] }).forces.my).toBeCloseTo(50, 9);
    const both = resolveEccentric({ n: 500, at: [0.06, 0.1] }).forces;
    expect(both.my).toBeCloseTo(50, 9);
    expect(both.mz).toBeCloseTo(-30, 9);
  });

  it('and that Mz reaches the stress: the section is no longer in uniaxial bending', () => {
    const S = rect();
    const e = resolveEccentric({ n: 500, at: [0.06, 0] });
    // On the vertical centreline the weak-axis bending contributes nothing...
    const onAxis = canonicalStressState(S, e.forces, [0, 0]);
    // ...but off it, it does, and that difference IS the eccentricity.
    const offAxis = canonicalStressState(S, e.forces, [0.1, 0]);
    if (!onAxis.ok || !offAxis.ok) throw new Error('state failed');
    expect(Math.abs(offAxis.state.sigma - onAxis.state.sigma)).toBeGreaterThan(1);
  });
});

describe('a transverse load off the shear centre twists the member', () => {
  it('produces torsion proportional to the arm, and none through the shear centre', () => {
    // The load the user asked for: parallel to the SECTION, perpendicular to
    // the member axis. Through the shear centre it only shears; away from it,
    // it also twists.
    const sc: [number, number] = [0.05, 0];
    expect(resolveEccentric({ vz: 100, at: sc }, sc).forces.t).toBeCloseTo(0, 12);
    const off = resolveEccentric({ vz: 100, at: [0.15, 0] }, sc);
    expect(off.forces.t).toBeCloseTo(10, 9); // vz · (y - y_sc) = 100 · 0.10
    // Twice the arm, twice the torque — it is a moment, not a threshold.
    expect(resolveEccentric({ vz: 100, at: [0.25, 0] }, sc).forces.t).toBeCloseTo(20, 9);
  });

  it('#2366 refuses combined shear for an eccentric planar force routed through the biaxial API', () => {
    const S = rect();
    const point: [number, number] = [0.05, 0];
    const centered = toDiagram(S, resolveEccentric({ vz: 100, at: [0, 0] }).forces, point);
    const offset = toDiagram(S, resolveEccentric({ vz: 100, at: point }).forces, point);
    expect(offset.tauVzAtFiber).toBe(centered.tauVzAtFiber);
    expect(offset.tauTorsion).not.toBe(0);
    expect(offset).toMatchObject({
      refusal: 'combinedTorsionAndTransverseShear', tauTotal: null, mohr: null, failure: null,
    });
    expect(centered.refusal).toBeNull();
    expect(centered.tauTotal).toBe(centered.tauVzAtFiber);
    for (const sample of offset.distributionZ) {
      expect(sample).toMatchObject({ refusal: offset.refusal, tauTotal: null, vonMises: null });
    }
    for (const sample of centered.distributionZ) {
      expect(sample).toMatchObject({ refusal: null, tauTotal: 0 });
    }
  });

  issue2366('known wrong result: #2366 includes centred planar shear in the width cut diagnostics', () => {
    const centered = toDiagram(rect(), resolveEccentric({ vz: 100, at: [0, 0] }).forces, [0.05, 0]);
    expect(centered.tauVzAtFiber).toBeGreaterThan(0);
    for (const sample of centered.distributionZ) {
      expect(sample).toMatchObject({ refusal: null, tauVz: 0 });
      expect(sample.tauTotal, JSON.stringify(sample)).toBeCloseTo(centered.tauVzAtFiber, 12);
      expect(sample.vonMises).toBeCloseTo(centered.failure!.vonMises, 12);
    }
  });

  it('a horizontal transverse load twists about the other arm, with opposite sense', () => {
    const t = resolveEccentric({ vy: 100, at: [0, 0.1] }, [0, 0]).forces.t;
    expect(t).toBeCloseTo(-10, 9); // -vy · z
  });

  it('that torsion produces real shear stress through the Saint-Venant solve', () => {
    const S = rect();
    const alone = canonicalStressState(S, { n: 0, my: 0, mz: 0, t: 10 }, [0.05, 0]);
    if (!alone.ok) throw new Error('state failed');
    // Solved on the mesh, not inferred from a formula: torsion on its own is a
    // shear field, and it is present.
    expect(alone.state.tau).toBeGreaterThan(0);
    expect(alone.state.breakdown.torsion).toBeGreaterThan(0);
  });

  it('adds to the transverse shear on one side and cancels it on the other', () => {
    // The physics that a scalar "total shear" hides. Torsion circulates, so on
    // one face of the section its flow runs WITH the transverse shear and on
    // the opposite face against it. A first version of this test asserted that
    // adding torsion always raises tau and failed — correctly — because the
    // point it sampled was on the cancelling side.
    const S = rect();
    const shear = { n: 0, my: 0, mz: 0, vz: 100 };
    const both = { ...shear, t: 10 };
    const at = (p: [number, number], f: typeof shear) => {
      const r = canonicalStressState(S, f, p);
      if (!r.ok) throw new Error(r.message ?? r.reason);
      return r.state.tau;
    };
    const left = at([-0.05, 0], both) - at([-0.05, 0], shear);
    const right = at([0.05, 0], both) - at([0.05, 0], shear);
    // Opposite senses on opposite sides — that is what makes it a circulation.
    expect(Math.sign(left)).toBe(-Math.sign(right));
    expect(Math.abs(left)).toBeGreaterThan(0.1);
    expect(Math.abs(right)).toBeGreaterThan(0.1);
  });
});

describe('the custom load adds to the model rather than replacing it', () => {
  it('superposes: model forces plus the user’s own, both at their own points', () => {
    // What the panel computes for `custom`. Resolving the user's load alone and
    // adding it is what makes `effect` report THIS load's contribution instead
    // of burying it in the model's totals.
    const model = { n: 100, my: 50, mz: 0, vy: 0, vz: 20, t: 0 };
    const own = resolveEccentric({ n: 200, at: [0.05, 0] });
    const total = {
      n: model.n + own.forces.n,
      my: model.my + own.forces.my,
      mz: model.mz + own.forces.mz,
    };
    expect(total.n).toBe(300);
    expect(total.my).toBeCloseTo(50, 9);
    expect(total.mz).toBeCloseTo(-10, 9); // only the user's load is eccentric
    // The reported effect is the user's contribution, not the total.
    expect(own.effect.mzFromN).toBeCloseTo(-10, 9);
  });
});

/**
 * Solver noise in the shear centre.
 *
 * A doubly-symmetric section's shear centre is its centroid exactly, but a
 * numerical solve lands microns away. As a coordinate that is irrelevant; as a
 * lever arm it is not, and the panel used it as a lever arm — so merely
 * switching the eccentric overlay ON produced a torque, which flipped the
 * panel to a different analysis path and visibly moved every number. Opening a
 * view must not change what it is a view of.
 */
describe('a shear centre that is numerically, but not exactly, the centroid', () => {
  it('snaps to zero so it produces no torque', () => {
    // 400 mm deep section, shear centre off by 10 microns.
    const snapped = snapShearCentre([1e-5, -8e-6], 0.4);
    expect(snapped).toEqual([0, 0]);
    expect(resolveEccentric({ vz: 60 }, snapped).forces.t).toBe(0);
  });

  it('leaves a real shear centre alone', () => {
    // A channel's sits outside the section — tens of millimetres, not microns.
    const real: [number, number] = [-0.032, 0];
    expect(snapShearCentre(real, 0.2)).toEqual(real);
    expect(Math.abs(resolveEccentric({ vz: 60, at: [0, 0] }, real).forces.t)).toBeCloseTo(1.92, 6);
  });

  it('scales with the section, so the rule holds at any size', () => {
    // The same absolute offset is noise on a girder and real on a small angle.
    const off: [number, number] = [5e-5, 0];
    expect(snapShearCentre(off, 0.9)).toEqual([0, 0]);      // 900 mm girder: noise
    expect(snapShearCentre(off, 0.02)).toEqual(off);        // 20 mm angle: meaningful
  });

  it('treats a missing shear centre as the centroid', () => {
    // No shear force means no shear solve, so there is nothing to snap.
    expect(snapShearCentre(undefined, 0.4)).toEqual([0, 0]);
    expect(snapShearCentre(null, 0.4)).toEqual([0, 0]);
  });
});
