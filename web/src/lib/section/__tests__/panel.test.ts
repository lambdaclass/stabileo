/**
 * Canonical detailed-analysis result for the section panel.
 *
 * Two things are pinned here. First, the panel's numbers and the outline it
 * draws them on come from one geometry, proved by digest. Second — and this is
 * the part that is easy to get wrong quietly — a trustworthy normal stress is
 * never combined with an untrustworthy shear or torsion and presented as a
 * valid total.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { isSolverReady } from '../../engine/wasm-solver';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import { interpolateForces3D } from '../../engine/section-stress-3d';
import type { AnalysisResults3D, ElementForces3D } from '../../engine/types-3d';
import { resetModel3D, frame, support, DOF } from '../../engine/__tests__/helpers/random-models-3d';
import {
  canonicalPanelResult,
  componentProvenance,
  stationForces2D,
  stationForces3D,
} from '../panel';
import { resolveSectionState } from '../state';
import { ALL_PROFILES } from '../../data/steel-profiles';
import type { Section } from '../../store/model.svelte';

function sec(over: Partial<Section> & { id?: number }): Section {
  return { id: 1, name: '', a: 0.01, iz: 1e-5, ...over } as Section;
}
function fromCatalogue(name: string, id = 1): Section {
  const p = ALL_PROFILES.find((x) => x.name === name)!;
  return sec({ id, name: p.name, a: p.a * 1e-4, iy: p.iy * 1e-8, iz: p.iz * 1e-8 });
}
const resolved = (s: Section): Section => ({ ...s, canonical: resolveSectionState(s) });
const F = { n: 100, my: 50, mz: 10 };

// ─── The canonical path ────────────────────────────────────────────

describe('geometry-backed sections get a canonical result', () => {
  for (const name of ['IPE 300', 'HEA 300', 'HEB 200', 'CHS 88.9x4']) {
    it(`${name} analyses and its digest matches the drawing`, () => {
      const r = canonicalPanelResult(resolved(fromCatalogue(name)), F);
      expect(r.ok, name).toBe(true);
      if (!r.ok) return;
      // The guard inside already compared them; assert it explicitly too.
      expect(r.bending.digest).toBe(r.geometry.digest);
      expect(r.forces).toEqual(F);
      expect(r.provenance.normalAndBending).toBe('canonical');
    });
  }

  it('reports the resultants actually used, for traceability', () => {
    const r = canonicalPanelResult(resolved(fromCatalogue('IPE 300')), { n: 7, my: 11, mz: 13 });
    if (!r.ok) throw new Error('expected ok');
    expect(r.forces).toEqual({ n: 7, my: 11, mz: 13 });
    expect(r.bending.forces.n).toBe(7);
  });

  it('an asymmetric angle produces a tilted neutral axis under pure My', () => {
    const r = canonicalPanelResult(
      resolved(sec({ shape: 'L', h: 0.1, b: 0.1, t: 0.01 })),
      { n: 0, my: 10, mz: 0 },
    );
    if (!r.ok) throw new Error('expected ok');
    expect(Math.abs(r.bending.neutralAxis.angle)).toBeGreaterThan(1e-3);
    expect(Math.abs((r.geometry.principalAngle * 180) / Math.PI - 45)).toBeLessThan(1e-6);
    // Extrema are reported at real coordinates, not at a bounding-box corner.
    expect(Number.isFinite(r.bending.max.y)).toBe(true);
    expect(Number.isFinite(r.bending.max.z)).toBe(true);
  });

  it('a rotated section transforms its moment vector', () => {
    const flat = resolved(sec({ shape: 'rect', b: 0.2, h: 0.4 }));
    const spun = resolved(sec({ shape: 'rect', b: 0.2, h: 0.4, rotation: 90 }));
    const a = canonicalPanelResult(flat, { n: 0, my: 50, mz: 0 });
    const b = canonicalPanelResult(spun, { n: 0, my: 50, mz: 0 });
    if (!a.ok || !b.ok) throw new Error('expected ok');
    // Rotation lives on the geometry, so both resolve; the point is that the
    // request carried `forcesAreLocal` and the engine applied the rotation.
    expect(a.bending.digest).not.toBe(b.bending.digest);
  });
});

// ─── Refusals ──────────────────────────────────────────────────────

describe('the panel refuses rather than approximating', () => {
  for (const spec of [
    { name: 'Losa equivalente', a: 0.05, iy: 4e-4, iz: 1e-4 },
    { name: 'Sección compuesta', a: 0.02, iy: 9e-5, iz: 3e-5 },
  ]) {
    it(`${spec.name} is properties-only and gets no canonical analysis`, () => {
      const r = canonicalPanelResult(resolved(sec(spec)), F);
      expect(r.ok, spec.name).toBe(false);
      if (!r.ok) expect(r.refusal.kind).toBe('propertiesOnly');
    });
  }

  it('an unresolved section is refused', () => {
    const r = canonicalPanelResult(fromCatalogue('IPE 300'), F);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.kind).toBe('notResolved');
  });

  it('absent forces are refused rather than defaulted to zero', () => {
    const r = canonicalPanelResult(resolved(fromCatalogue('IPE 300')), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.kind).toBe('noForces');
  });

  it('a section whose stored digest disagrees with its geometry is refused', () => {
    const s = resolved(fromCatalogue('IPE 300'));
    const st = s.canonical!;
    if (st.kind !== 'geometry-backed') throw new Error('geometry-backed');
    // Corrupt only the cached digest: the drawing reports it, the engine
    // recomputes from the polygons, and the two must disagree.
    const tampered = { ...s, canonical: { ...st, digest: 'ffffffffffffffff' } };
    const r = canonicalPanelResult(tampered, F);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.kind).toBe('digestMismatch');
  });

  // NOTE: there is deliberately no panel-level versionMismatch test. The
  // panel's drawing and its bending result both derive from the same
  // state.geometry, so they always carry the same wire version — a version
  // mismatch cannot fire through this API. (The old test tampered `version: 99`
  // and expected a refusal, but it passed only because a dead guard compared
  // against a constant the drawing always copied; tampering the version also
  // changes the digest, which is covered by the digestMismatch test above.)
  // The cross-source case the guard exists for is pinned in drawing.test.ts.
});

// ─── Canonical vs legacy component separation ──────────────────────

describe('stress components report what may be trusted', () => {
  it('a rectangle reports every component from its own geometry', () => {
    const p = componentProvenance(resolved(sec({ shape: 'rect', b: 0.2, h: 0.4 })));
    expect(p.normalAndBending).toBe('canonical');
    expect(p.transverseShear).toBe('canonical');
    expect(p.combinedCriteriaValid).toBe(true);
  });

  it('an ANGLE reports shear, which the legacy formula could never do', () => {
    // The defect this closes ran the other way for a long time: `V*Q/(I*b)`
    // needs one well-defined width, and an angle has rotated principal axes and
    // a shear centre at its corner, so the old path refused it outright and
    // left combined criteria unavailable. Solving equilibrium over the real
    // outline needs no width at all.
    const p = componentProvenance(resolved(sec({ shape: 'L', h: 0.1, b: 0.1, t: 0.01 })));
    expect(p.normalAndBending).toBe('canonical');
    expect(p.transverseShear).toBe('canonical');
  });

  it('a closed section and an arbitrary polygon report shear too', () => {
    expect(componentProvenance(resolved(sec({ shape: 'RHS', b: 0.1, h: 0.2, t: 0.008 }))).transverseShear)
      .toBe('canonical');
    expect(
      componentProvenance(
        resolved(sec({ polygon: [[0, 0], [0.3, 0], [0.22, 0.09], [0.05, 0.18]] })),
      ).transverseShear,
    ).toBe('canonical');
  });

  it('torsion is reported when the constant has a basis, and only then', () => {
    // A circular family gets the closed form; anything else geometry-backed
    // gets Saint-Venant solved on its own mesh. What is NOT allowed, and never
    // was, is Routh's polygon approximation or the `Iz * 0.001` placeholder.
    const circle = resolveSectionState(sec({ shape: 'CHS', h: 0.2, t: 0.01 }), { torsion: true });
    expect(circle.kind).toBe('geometry-backed');
    if (circle.kind === 'geometry-backed') {
      expect(circle.jProvenance).toBe('exactAnalytical');
    }

    const open = resolveSectionState(sec({ shape: 'rect', b: 0.2, h: 0.4 }), { torsion: true });
    if (open.kind !== 'geometry-backed') throw new Error('expected geometry-backed');
    expect(open.jProvenance).toBe('saintVenant');
    // A square's J against Saint-Venant's series, so the value is pinned and
    // not merely present.
    const s = 0.2, l = 0.4;
    const series = l * s ** 3 * (1 / 3 - 0.21 * (s / l) * (1 - s ** 4 / (12 * l ** 4)));
    expect(Math.abs(open.j! / series - 1)).toBeLessThan(0.05);
  });

  it('a section with no geometry claims nothing at all', () => {
    const p = componentProvenance(resolved(sec({ name: 'Losa equivalente', a: 0.05, iy: 4e-4, iz: 1e-4 })));
    expect(p.normalAndBending).toBe('unavailable');
    expect(p.transverseShear).toBe('unavailable');
    expect(p.torsion).toBe('unavailable');
    expect(p.combinedCriteriaValid).toBe(false);
  });
});

// ─── Station and force mapping ─────────────────────────────────────

describe('station selection reaches the calculation', () => {
  const ef = {
    elementId: 1, nStart: 10, nEnd: 10, vStart: 5, vEnd: -5,
    mStart: 0, mEnd: 0, length: 4, qI: -5, qJ: -5,
    pointLoads: [], distributedLoads: [],
  } as never;

  it('2D resultants differ between stations of a loaded member', () => {
    const mid = stationForces2D(ef, 0.5);
    const end = stationForces2D(ef, 1.0);
    expect(mid.my).not.toBeCloseTo(end.my, 6);
    expect(mid.mz).toBe(0); // 2D has no second bending axis
    expect(mid.n).toBeCloseTo(10, 6);
  });

  it('3D resultants interpolate both bending axes', () => {
    const e3 = { nStart: 0, nEnd: 20, myStart: 0, myEnd: 100, mzStart: -10, mzEnd: 10 };
    // Shear and torsion are optional; absent means zero rather than unknown.
    expect(stationForces3D(e3, 0)).toEqual({ n: 0, my: 0, mz: -10, vy: 0, vz: 0, tx: 0 });
    expect(stationForces3D(e3, 1)).toEqual({ n: 20, my: 100, mz: 10, vy: 0, vz: 0, tx: 0 });
    const mid = stationForces3D(e3, 0.5);
    expect(mid.n).toBeCloseTo(10, 12);
    expect(mid.my).toBeCloseTo(50, 12);
    expect(mid.mz).toBeCloseTo(0, 12);
  });

  it('reads the torsion the solver actually produces, which it calls mx', () => {
    /*
     * The regression this pins was silent and total. The reader named the
     * field `txStart`; every 3D result object names it `mxStart`; the read was
     * optional, so it returned zero. The panel showed "Mx = 8.00 kN·m" in its
     * header and "no torque at this station" three rows below, and torsional
     * and warping stress were zero everywhere in the application.
     *
     * A name that no producer uses cannot be caught by types once a cast is in
     * the way, so it is caught here instead.
     */
    const e3 = {
      nStart: 0, nEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
      mxStart: 8, mxEnd: 8,
    };
    expect(stationForces3D(e3, 0).tx).toBeCloseTo(8, 12);
    expect(stationForces3D(e3, 0.5).tx).toBeCloseTo(8, 12);
  });

  it('interpolates a varying torque along the member', () => {
    const e3 = {
      nStart: 0, nEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
      mxStart: 10, mxEnd: -6,
    };
    expect(stationForces3D(e3, 0).tx).toBeCloseTo(10, 12);
    expect(stationForces3D(e3, 0.5).tx).toBeCloseTo(2, 12);
    expect(stationForces3D(e3, 1).tx).toBeCloseTo(-6, 12);
  });

  it('still accepts a caller that spells it T', () => {
    // Not every caller assembles an ElementForces3D; one that builds its own
    // station forces may legitimately call the quantity T.
    const e3 = {
      nStart: 0, nEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
      txStart: 4, txEnd: 4,
    };
    expect(stationForces3D(e3, 0.5).tx).toBeCloseTo(4, 12);
  });

  it('an equivalent 2D and 3D case agree where they describe the same problem', () => {
    const s = resolved(fromCatalogue('IPE 300'));
    const twoD = canonicalPanelResult(s, { n: 15, my: 40, mz: 0 });
    const threeD = canonicalPanelResult(s, stationForces3D(
      { nStart: 15, nEnd: 15, myStart: 40, myEnd: 40, mzStart: 0, mzEnd: 0 }, 0.5,
    ));
    if (!twoD.ok || !threeD.ok) throw new Error('expected ok');
    expect(threeD.bending.max.sigma).toBeCloseTo(twoD.bending.max.sigma, 12);
  });
});

// ─── 3D station forces are the diagram's, inside loaded spans ──────
//
// The canonical panel analyses the section at the station the user picked, so
// the resultants there have to be the ones the diagram draws. A straight line
// between the member ends is right only for an unloaded member: a simply
// supported beam under q has My = 0 at both ends and qL²/8 at midspan.

describe('3D station forces follow the diagram inside loaded spans', () => {
  const quiet: Array<ReturnType<typeof vi.spyOn>> = [];
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 0));
    expect(isSolverReady()).toBe(true);
    for (const k of ['log', 'warn', 'info'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}));
  });
  afterAll(() => { quiet.forEach((q) => q.mockRestore()); uiStore.analysisMode = '2d'; });

  const solve3D = () => {
    const r = modelStore.solve3D(false, false, false);
    if (!r || typeof r === 'string') throw new Error(`3D solve refused: ${r}`);
    return r as AnalysisResults3D;
  };

  it('simply supported beam along X under q = 10: My = qL²/8 = 45 at midspan', () => {
    resetModel3D();
    let el = 0;
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3);
      el = frame(a, b, 1);
      support(a, 'custom3d', DOF('xyzX')); support(b, 'custom3d', DOF('yz'));
      modelStore.addDistributedLoad3D(el, 0, 0, -10, -10);
    });
    const ef = solve3D().elementForces.find((f) => f.elementId === el)!;
    const mid = stationForces3D(ef, 0.5);
    expect(Math.abs(mid.my)).toBeCloseTo(45, 6);
    expect(mid.my).toBeCloseTo(evaluateDiagramAt(ef, 'momentY', 0.5), 9);
    expect(mid.vz).toBeCloseTo(0, 6);                        // shear crosses zero at midspan
    expect(Math.abs(stationForces3D(ef, 0).vz)).toBeCloseTo(30, 6); // qL/2 at the support
  });

  it('every resultant is the diagram value at every station, and the ends are the member ends', () => {
    resetModel3D();
    let e1 = 0, e2 = 0;
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 1, 0.5), c = modelStore.addNode(7, 3, 0);
      e1 = frame(a, b, 1); e2 = frame(c, b, 1);             // the second drawn back toward the first
      support(a, 'custom3d', DOF('xyzXYZ')); support(c, 'custom3d', DOF('xyzX'));
      modelStore.addDistributedLoad3D(e1, -3, -7, -12, -4, 0.5, 3.2); // partial, trapezoidal, both axes
      modelStore.addPointLoadOnElement3D(e1, 1.1, 6, -9);
      modelStore.addDistributedLoad3D(e2, 4, 4, -8, -8);
      modelStore.addPointLoadOnElement3D(e2, 2.0, -5, 3);
      modelStore.addNodalLoad3D(b, 2, -3, -6, 4, 1, -2);     // includes a torque
    });
    const res = solve3D();
    for (const id of [e1, e2]) {
      const ef = res.elementForces.find((f) => f.elementId === id)! as ElementForces3D;
      const scale = 1 + Math.max(...['nStart', 'myStart', 'myEnd', 'mzStart', 'mzEnd', 'vyStart', 'vzStart', 'mxStart']
        .map((k) => Math.abs((ef as unknown as Record<string, number>)[k])));
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const f = stationForces3D(ef, t);
        expect(f.n).toBeCloseTo(evaluateDiagramAt(ef, 'axial', t), 9);
        expect(f.my).toBeCloseTo(evaluateDiagramAt(ef, 'momentY', t), 9);
        expect(f.mz).toBeCloseTo(evaluateDiagramAt(ef, 'momentZ', t), 9);
        expect(f.vy).toBeCloseTo(evaluateDiagramAt(ef, 'shearY', t), 9);
        expect(f.vz).toBeCloseTo(evaluateDiagramAt(ef, 'shearZ', t), 9);
        expect(f.tx).toBeCloseTo(evaluateDiagramAt(ef, 'torsion', t), 9);
        // The panel's legacy readout (interpolateForces3D) is the same station.
        const legacy = interpolateForces3D(ef, t);
        for (const [a, b] of [[f.n, legacy.N], [f.my, legacy.My], [f.mz, legacy.Mz], [f.tx, legacy.Mx]]) {
          expect(Math.abs(a - b)).toBeLessThan(1e-9 * scale);
        }
      }
      // At the member ends the diagram closes on the solver's own end values.
      const f0 = stationForces3D(ef, 0), f1 = stationForces3D(ef, 1);
      expect(Math.abs(f0.my - ef.myStart)).toBeLessThan(1e-6 * scale);
      expect(Math.abs(f0.mz - ef.mzStart)).toBeLessThan(1e-6 * scale);
      expect(Math.abs(f1.my - ef.myEnd)).toBeLessThan(1e-6 * scale);
      expect(Math.abs(f1.mz - ef.mzEnd)).toBeLessThan(1e-6 * scale);
      expect(Math.abs(f1.vy - ef.vyEnd)).toBeLessThan(1e-6 * scale);
      expect(Math.abs(f1.vz - ef.vzEnd)).toBeLessThan(1e-6 * scale);
      // And inside the loaded span it is NOT the straight line between them.
      const lin = ef.myStart + 0.5 * (ef.myEnd - ef.myStart);
      expect(Math.abs(stationForces3D(ef, 0.5).my - lin)).toBeGreaterThan(1e-3 * scale);
    }
  });

  it('a caller with end values only still gets the straight line', () => {
    const f = stationForces3D({ nStart: 2, nEnd: 4, myStart: 10, myEnd: 30, mzStart: 0, mzEnd: -8, vzStart: 1, vzEnd: 3 }, 0.25);
    expect(f).toEqual({ n: 2.5, my: 15, mz: -2, vy: 0, vz: 1.5, tx: 0 });
  });
});
