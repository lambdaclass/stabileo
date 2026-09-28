/**
 * The section analysis on a truss member.
 *
 * ── The crash ──────────────────────────────────────────────────────
 *
 * Opening a truss example and asking for the detailed section analysis stopped
 * the application. Not a refused section, not an empty panel — a throw inside a
 * `$derived`, which takes the panel's whole subtree with it.
 *
 * The cause was not the truss. `analyzeSectionStress` has two branches, and only
 * one of them resolved the section first: the JS fallback and the whole of
 * `section-stress-3d` call `resolveSectionGeometryLegacy`, while the WASM branch
 * sent the raw `Section`. The engine's `SectionGeometry` requires `shape`, a
 * Section only carries one when somebody set it, and `serde` answers a missing
 * required field by failing the parse — which crosses the boundary as a throw.
 *
 * It went unseen because the app's DEFAULT section declares `shape: 'I'`, and
 * nearly every example uses it. The three truss fixtures are the ones that
 * define their own section — an angle, `L 80x80x8` — so they were where it
 * surfaced. Any imported or catalogue section would have done the same.
 *
 * ── What a truss section should say ────────────────────────────────
 *
 * A truss carries axial force and nothing else, so the section is in a state
 * worth seeing precisely because it is degenerate: σ is the same at every fibre,
 * there is no shear anywhere, and there is no neutral axis to find. Mohr's
 * circle is the uniaxial one, which makes Von Mises and Tresca both collapse to
 * |σ|. These are pinned because "it no longer crashes" is not the same claim as
 * "it is right".
 */
import { describe, it, expect } from 'vitest';
import { modelStore } from '../../store';
import { loadFixture } from '../../templates/load-fixture';
import { analyzeSectionStress, resolveSectionGeometryLegacy } from '../section-stress';
import type { Section } from '../../store/model.svelte';
import howe from '../../templates/fixtures/howe-truss.json';

/** The most heavily loaded member of the loaded truss, with its section. */
function loadedTruss() {
  modelStore.clear();
  loadFixture(howe as never, modelStore.fixtureApi() as never);
  const out = modelStore.solve();
  if (typeof out === 'string' || !out) throw new Error('the truss example must solve');
  const ef = [...out.elementForces].sort((a, b) => Math.abs(b.nStart) - Math.abs(a.nStart))[0];
  const el = modelStore.elements.get(ef.elementId)!;
  return {
    ef, el,
    sec: modelStore.sections.get(el.sectionId)!,
    mat: modelStore.materials.get(el.materialId)!,
  };
}

describe('a section whose shape was never set', () => {
  it('is resolved before it reaches the engine, not refused at it', () => {
    /* The regression, stated as the property rather than as the fixture: an
       angle from the catalogue carries no `shape` of its own, and the resolver
       reads one from its name and its thickness from the catalogue. */
    const bare = { id: 99, name: 'L 80x80x8', a: 0.00123, iy: 8e-7, iz: 8e-7, j: 1e-7, b: 0.08, h: 0.08 } as Section;
    expect('shape' in bare).toBe(false);
    const r = resolveSectionGeometryLegacy(bare);
    expect(r.shape).toBe('L');
    expect(r.t, 'the catalogue supplies the leg thickness').toBeGreaterThan(0);
  });

  it('does not throw when analysed', () => {
    const { ef, sec, mat } = loadedTruss();
    expect('shape' in sec, 'the fixture section really has no shape').toBe(false);
    expect(() => analyzeSectionStress(ef as never, sec as never, mat.fy, 0.5)).not.toThrow();
  });
});

describe('what a truss member does to its section', () => {
  it('carries axial force and nothing else', () => {
    const { ef, el } = loadedTruss();
    expect(el.type).toBe('truss');
    expect(Math.abs(ef.nStart), 'a loaded member').toBeGreaterThan(1);
    expect(ef.mStart).toBe(0);
    expect(ef.mEnd).toBe(0);
    expect(ef.vStart).toBe(0);
  });

  it('puts the same normal stress on every fibre', () => {
    const { ef, sec, mat } = loadedTruss();
    const r = analyzeSectionStress(ef as never, sec as never, mat.fy, 0.5);
    const d = r.distribution;
    expect(d.length).toBeGreaterThan(10);

    // σ = N/A, and Navier's gradient term is absent because M is.
    const expected = (ef.nStart / r.resolved.a) / 1000;   // kPa → MPa
    for (const p of d) expect(p.sigma).toBeCloseTo(expected, 6);

    // Uniform: the extreme fibres read the same as the centroid.
    const lo = Math.min(...d.map((p) => p.sigma));
    const hi = Math.max(...d.map((p) => p.sigma));
    expect(hi - lo).toBeCloseTo(0, 9);
    // …and the fibres really do span the section, so "uniform" is a statement
    // about the whole depth and not about one point sampled twice.
    expect(Math.max(...d.map((p) => p.y)) - Math.min(...d.map((p) => p.y)))
      .toBeCloseTo(r.resolved.yMax - r.resolved.yMin, 9);
  });

  it('has no shear anywhere, so Jourawski contributes nothing', () => {
    const { ef, sec, mat } = loadedTruss();
    const r = analyzeSectionStress(ef as never, sec as never, mat.fy, 0.5);
    for (const p of r.distribution) expect(p.tau).toBe(0);
    expect(r.tauAtY).toBe(0);
  });

  it('has no neutral axis, and says so rather than putting one at zero', () => {
    /* A neutral axis is where σ changes sign. Under pure axial load the whole
       section is on one side of it, so the honest answer is "there is none" —
       `0` would draw a line through the centroid that means nothing. */
    const { ef, sec, mat } = loadedTruss();
    const r = analyzeSectionStress(ef as never, sec as never, mat.fy, 0.5);
    expect(r.neutralAxisY).toBeNull();
  });

  it('gives the uniaxial Mohr circle, with the principal direction on the axis', () => {
    const { ef, sec, mat } = loadedTruss();
    const r = analyzeSectionStress(ef as never, sec as never, mat.fy, 0.5);
    const sigma = (ef.nStart / r.resolved.a) / 1000;
    const m = r.mohr!;
    // Uniaxial: one principal stress is σ and the other is exactly zero.
    const principals = [m.sigma1, m.sigma2].sort((a, b) => Math.abs(b) - Math.abs(a));
    expect(principals[0]).toBeCloseTo(sigma, 6);
    expect(principals[1]).toBeCloseTo(0, 9);
    // Centre at σ/2, radius |σ|/2 — the circle passes through the origin.
    expect(m.center).toBeCloseTo(sigma / 2, 6);
    expect(m.radius).toBeCloseTo(Math.abs(sigma) / 2, 6);
    // And the greatest shear is half the axial stress, at 45°.
    expect(m.tauMax).toBeCloseTo(Math.abs(sigma) / 2, 6);
  });

  it('collapses Von Mises and Tresca onto |σ|, which is what uniaxial means', () => {
    const { ef, sec, mat } = loadedTruss();
    const r = analyzeSectionStress(ef as never, sec as never, mat.fy, 0.5);
    const sigma = Math.abs((ef.nStart / r.resolved.a) / 1000);
    const f = r.failure!;
    expect(f.vonMises).toBeCloseTo(sigma, 6);
    expect(f.tresca).toBeCloseTo(sigma, 6);
    expect(f.rankine).toBeCloseTo(sigma, 6);
    /* The three criteria agreeing is not a coincidence to be pinned loosely:
       under uniaxial stress they are the same number by construction, and a
       difference would mean one of them is reading a stress that is not there. */
    expect(f.vonMises).toBeCloseTo(f.tresca, 9);
  });

  it('reads the utilisation against fy the same way a beam does', () => {
    const { ef, sec, mat } = loadedTruss();
    const fy = mat.fy!;
    expect(fy, 'the fixture steel declares a yield stress').toBeGreaterThan(0);
    const r = analyzeSectionStress(ef as never, sec as never, fy, 0.5);
    const sigma = Math.abs((ef.nStart / r.resolved.a) / 1000);
    /* Both in MPa: the analysis reports σ in MPa and carries fy through
       unchanged, which the failure block echoes back. */
    expect(r.failure!.fy).toBe(fy);
    expect(r.failure!.ratioVM).toBeCloseTo(sigma / fy, 6);
  });
});
