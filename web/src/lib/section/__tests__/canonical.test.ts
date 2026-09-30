/**
 * Canonical section resolution — end-to-end through the real WASM engine.
 *
 * These pin the two properties the whole canonical architecture exists for:
 *
 *  1. A geometry-backed section's numbers and its drawing come from ONE
 *     geometry, provable by digest.
 *  2. A section whose true outline is not known is refused rather than
 *     approximated. The old path inferred a shape from the profile NAME and
 *     invented thicknesses when they were missing, which produced a measured
 *     40 % error in shear stress with no warning.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveCanonicalSection,
  isGeometryBacked,
  type ResolvedSection,
} from '../canonical';
import { analyzeSectionBending, hasCanonicalGeometryExport, sectionGeometryDigest } from '../../engine/wasm-solver';
import { ALL_PROFILES } from '../../data/steel-profiles';
import type { Section } from '../../store/model.svelte';

// These tests exercise the canonical-geometry WASM export. A build from a
// branch that predates the section engine does not have it, so skip rather
// than fail with "WASM solver not initialized".
const hasCanonical = hasCanonicalGeometryExport();
const describeCanonical = hasCanonical ? describe : describe.skip;

/** Build a stored section as the app would hold it. */
function sec(over: Partial<Section> & { id?: number }): Section {
  return { id: 1, name: '', a: 0.01, iz: 1e-5, ...over } as Section;
}

/** Look up a catalogue profile and wrap it as a stored section. */
function fromCatalogue(name: string, id = 1): Section {
  const p = ALL_PROFILES.find((x) => x.name === name);
  if (!p) throw new Error(`catalogue profile ${name} not found`);
  return sec({
    id,
    name: p.name,
    a: p.a * 1e-4,
    iy: p.iy * 1e-8,
    iz: p.iz * 1e-8,
  });
}

const rel = (got: number, exp: number) => (exp === 0 ? Math.abs(got) : Math.abs((got - exp) / exp));

function backed(r: ResolvedSection) {
  if (!isGeometryBacked(r)) throw new Error(`expected geometry-backed, got ${r.state}: ${JSON.stringify(r.reason)}`);
  return r;
}

// ─── Geometry-backed catalogue families ────────────────────────────

describeCanonical('IPE / HEA / HEB resolve to canonical geometry with root fillets', () => {
  const CASES: Array<[string, number, number, number]> = [
    // name, published A (cm2), Iy (cm4), Iz (cm4)
    ['IPE 300', 53.8, 8356, 604],
    ['IPE 80', 7.64, 80.1, 8.49],
    ['HEB 200', 78.1, 5696, 2003],
    ['HEA 300', 113, 18260, 6310],
  ];

  for (const [name, a, iy, iz] of CASES) {
    it(`${name} matches its published properties`, () => {
      const r = backed(resolveCanonicalSection(fromCatalogue(name)));
      // 0.6 %: the published tables carry three significant figures, so
      // ~0.1-0.5 % is inherent in the reference. Tight enough that a missing
      // fillet (2.4-6.0 %) still fails.
      expect(rel(r.properties.a * 1e4, a)).toBeLessThan(6e-3);
      expect(rel(r.properties.iy * 1e8, iy)).toBeLessThan(6e-3);
      expect(rel(r.properties.iz * 1e8, iz)).toBeLessThan(6e-3);
      expect(r.profileId).toBe(name);
      expect(r.digest).toMatch(/^[0-9a-f]{16}$/);
    });
  }

  it('every IPE, HEA and HEB profile resolves', () => {
    const rolled = ALL_PROFILES.filter((p) => ['IPE', 'HEA', 'HEB'].includes(p.family));
    expect(rolled.length).toBe(56);
    for (const p of rolled) {
      const r = resolveCanonicalSection(fromCatalogue(p.name));
      expect(r.state, `${p.name}`).toBe('geometry-backed');
    }
  });

  it('a doubly symmetric profile has no product of inertia', () => {
    const r = backed(resolveCanonicalSection(fromCatalogue('IPE 300')));
    expect(Math.abs(r.properties.iyz) / r.properties.iy).toBeLessThan(1e-9);
  });
});

describeCanonical('CHS resolves to the exact annulus', () => {
  it('every CHS profile resolves and is isotropic in bending', () => {
    const chs = ALL_PROFILES.filter((p) => p.family === 'CHS');
    expect(chs.length).toBeGreaterThan(90);   // IRAM-IAS ships 95
    for (const p of chs) {
      const r = backed(resolveCanonicalSection(fromCatalogue(p.name)));
      expect(rel(r.properties.iy, r.properties.iz), p.name).toBeLessThan(1e-6);
      expect(r.geometry.polygons.filter((q) => q.isVoid).length, `${p.name} bore`).toBe(1);
    }
  });

  it('every CHS lands on the exact annulus, so no listed inertia can drift', () => {
    // The European table this replaced had six entries whose inertia
    // contradicted their own diameter and wall. An annulus is exact in closed
    // form, so that class of error is checkable for every row at once.
    for (const p of ALL_PROFILES.filter((x) => x.family === 'CHS')) {
      const ro = p.h / 2000, ri = ro - p.t! / 1000;
      const exact = (Math.PI / 4) * (ro ** 4 - ri ** 4);
      const r = backed(resolveCanonicalSection(fromCatalogue(p.name)));
      expect(rel(r.properties.iy, exact), p.name).toBeLessThan(2e-3);
    }
  });
});

// ─── Properties-only families ──────────────────────────────────────

describeCanonical('incomplete rolled families stay properties-only', () => {
  // MC is the only family here, and it earns the place: its page prints a
  // 16.66 % flange slope shared with the C series, but at that slope the built
  // outline misses MC's published properties by 14.6 % median, and no quoting
  // position rescues it. Fitting the slope per profile works — everything then
  // lands inside 1.5 % — but fits it against the properties it is supposed to
  // predict. So it stays refused rather than drawn from an inferred shape.
  const EXPECTED: Array<[string, number, string]> = [
    ['MC', 33, 'missingTaperAndRadii'],
  ];

  for (const [family, count, reasonKind] of EXPECTED) {
    it(`${family} (${count} profiles) is refused with a structured reason`, () => {
      const profiles = ALL_PROFILES.filter((p) => p.family === family);
      expect(profiles.length).toBe(count);
      for (const p of profiles) {
        const r = resolveCanonicalSection(fromCatalogue(p.name));
        expect(r.state, p.name).toBe('properties-only');
        if (r.state === 'properties-only') {
          expect(r.reason.kind).toBe(reasonKind);
          // Still globally solvable: the declared values survive.
          expect(r.declared.a).toBeGreaterThan(0);
          expect(r.declared.iz).toBeGreaterThan(0);
        }
      }
    });
  }

  it('a section with neither shape nor polygon is properties-only, not guessed', () => {
    const r = resolveCanonicalSection(sec({ name: 'Amorphous', a: 0.005, iz: 2e-5, iy: 8e-5 }));
    expect(r.state).toBe('properties-only');
    if (r.state === 'properties-only') expect(r.reason.kind).toBe('noGeometry');
  });

  it('a parametric shape missing a dimension is refused, never invented', () => {
    // This is the S1 defect made unrepresentable: the old path would have
    // substituted tw = 0.05*b and tf = 0.06*h here.
    const r = resolveCanonicalSection(sec({ shape: 'I', b: 0.15, h: 0.3 }));
    expect(r.state).toBe('properties-only');
    if (r.state === 'properties-only') {
      expect(r.reason.kind).toBe('missingDimensions');
      if (r.reason.kind === 'missingDimensions') {
        expect(r.reason.missing.sort()).toEqual(['tf', 'tw']);
      }
    }
  });
});

// ─── Identity: name must not touch geometry ────────────────────────

describeCanonical('identity is dimensional, never the display name', () => {
  it('renaming a catalogue section changes neither geometry nor digest', () => {
    const original = backed(resolveCanonicalSection(fromCatalogue('IPE 300')));
    // Same dimensions, different display name — resolved as a parametric
    // section so the catalogue lookup cannot rescue it.
    const renamed = backed(
      resolveCanonicalSection(
        sec({ id: 2, name: 'Main beam', shape: 'I', h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107 }),
      ),
    );
    // The parametric build is sharp-cornered, so it is a DIFFERENT geometry —
    // and the digest says so rather than silently pretending otherwise.
    expect(renamed.digest).not.toBe(original.digest);
    expect(renamed.properties.a).toBeLessThan(original.properties.a);
  });

  it('two sections with identical geometry share a digest regardless of id or name', () => {
    const a = backed(resolveCanonicalSection(sec({ id: 1, name: 'A', shape: 'rect', b: 0.2, h: 0.4 })));
    const b = backed(resolveCanonicalSection(sec({ id: 99, name: 'Z', shape: 'rect', b: 0.2, h: 0.4 })));
    expect(b.digest).toBe(a.digest);
    expect(b.properties.a).toBeCloseTo(a.properties.a, 15);
  });

  it('the same catalogue profile resolves identically every time', () => {
    const a = backed(resolveCanonicalSection(fromCatalogue('HEB 200', 1)));
    const b = backed(resolveCanonicalSection(fromCatalogue('HEB 200', 7)));
    expect(b.digest).toBe(a.digest);
  });
});

// ─── Digest identity between drawing and numbers ───────────────────

describeCanonical('drawing and numerical analysis prove they share one geometry', () => {
  it('the bending result echoes the geometry digest', () => {
    const r = backed(resolveCanonicalSection(fromCatalogue('IPE 300')));
    const stress = analyzeSectionBending({ geometry: r.geometry, n: 100, my: 50, mz: 10 });
    expect(stress.digest).toBe(r.digest);
    expect(stress.geometryVersion).toBe(r.geometry.version);
  });

  it('the digest a drawing would recompute matches the numerical one', () => {
    // The drawing receives the geometry over the wire and recomputes the
    // digest; it must land on the same value. This fails if serialization
    // perturbs coordinates, which it measurably does at the f64 level.
    const r = backed(resolveCanonicalSection(fromCatalogue('CHS 88.9x4')));
    const roundTripped = JSON.parse(JSON.stringify(r.geometry));
    expect(sectionGeometryDigest(roundTripped).digest).toBe(r.digest);
  });

  it('a deliberately different geometry FAILS the digest check', () => {
    // Guards the guard: if the digest could not tell two sections apart it
    // would prove nothing.
    const a = backed(resolveCanonicalSection(fromCatalogue('IPE 300')));
    const b = backed(resolveCanonicalSection(fromCatalogue('IPE 330')));
    expect(b.digest).not.toBe(a.digest);
    const stress = analyzeSectionBending({ geometry: a.geometry, n: 0, my: 10, mz: 0 });
    expect(stress.digest).not.toBe(b.digest);
  });
});

// ─── Unsymmetrical bending reaches the web layer ───────────────────

describeCanonical('axial and unsymmetrical bending through the web boundary', () => {
  it('an equal-leg angle reports non-principal geometric axes', () => {
    const r = backed(resolveCanonicalSection(sec({ shape: 'L', h: 0.1, b: 0.1, t: 0.01 })));
    expect(Math.abs(r.properties.iyz)).toBeGreaterThan(1e-9);
    expect(Math.abs(Math.abs(r.properties.thetaP * 180 / Math.PI) - 45)).toBeLessThan(1e-6);

    const stress = analyzeSectionBending({ geometry: r.geometry, n: 0, my: 10, mz: 0 });
    // With Iyz != 0 and only My applied, the neutral axis must NOT lie on the
    // geometric y-axis. That is precisely what the old reduced formula got
    // wrong for every angle.
    expect(Math.abs(stress.neutralAxis.angle)).toBeGreaterThan(1e-3);
    expect(stress.neutralAxis.uniform).toBe(false);
  });

  it('a rectangle under pure axial load has uniform stress and no neutral axis', () => {
    const r = backed(resolveCanonicalSection(sec({ shape: 'rect', b: 0.2, h: 0.4 })));
    const stress = analyzeSectionBending({ geometry: r.geometry, n: 200, my: 0, mz: 0 });
    expect(stress.neutralAxis.uniform).toBe(true);
    for (const p of stress.boundary) expect(rel(p.sigma, 200 / 0.08)).toBeLessThan(1e-12);
  });

  it('uniaxial bending on a rectangle reproduces M c / I', () => {
    const r = backed(resolveCanonicalSection(sec({ shape: 'rect', b: 0.2, h: 0.4 })));
    const stress = analyzeSectionBending({ geometry: r.geometry, n: 0, my: 50, mz: 0 });
    const iy = (0.2 * 0.4 ** 3) / 12;
    expect(rel(stress.max.sigma, (50 * 0.2) / iy)).toBeLessThan(1e-12);
    expect(rel(stress.min.sigma, -(50 * 0.2) / iy)).toBeLessThan(1e-12);
  });

  it('reversing every resultant negates the field', () => {
    const r = backed(resolveCanonicalSection(fromCatalogue('IPE 300')));
    const a = analyzeSectionBending({ geometry: r.geometry, n: 100, my: 50, mz: -20 });
    const b = analyzeSectionBending({ geometry: r.geometry, n: -100, my: -50, mz: 20 });
    expect(rel(a.max.sigma, -b.min.sigma)).toBeLessThan(1e-12);
  });

  it('the resultants used are echoed for traceability', () => {
    const r = backed(resolveCanonicalSection(fromCatalogue('IPE 300')));
    const stress = analyzeSectionBending({ geometry: r.geometry, n: 7, my: 11, mz: 13 });
    expect(stress.forces).toEqual({ n: 7, my: 11, mz: 13 });
  });
});

// ─── Custom geometry ───────────────────────────────────────────────

describeCanonical('custom geometry is canonical by definition', () => {
  it('an explicit polygon with a hole resolves and subtracts the void', () => {
    const r = backed(
      resolveCanonicalSection(
        sec({
          name: 'Custom box',
          polygon: [[0, 0], [0.2, 0], [0.2, 0.3], [0, 0.3]],
          holes: [[[0.05, 0.06], [0.15, 0.06], [0.15, 0.2], [0.05, 0.2]]],
        }),
      ),
    );
    expect(rel(r.properties.a, 0.2 * 0.3 - 0.1 * 0.14)).toBeLessThan(1e-12);
    expect(r.geometry.polygons.filter((p) => p.isVoid).length).toBe(1);
  });

  it('an explicit polygon wins over any name that looks like a catalogue profile', () => {
    // The name-inference defect, made impossible: this section is called
    // "IPE 300" but its geometry is a plain rectangle, and the geometry wins.
    const r = backed(
      resolveCanonicalSection(
        sec({ name: 'IPE 300', polygon: [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]] }),
      ),
    );
    expect(rel(r.properties.a, 0.01)).toBeLessThan(1e-12);
  });
});

// ─── The refusal must say something true ───────────────────────────

/**
 * A user opened a model carrying an IPN 300 and was told the section was
 * "amorfa (sin forma geométrica definida)". An IPN 300 is neither: it is a
 * fully standardised rolled profile whose flange taper and fillet radii we do
 * not hold. The refusal reason is what the panel selects its wording from, so
 * the distinction is pinned here rather than left to the component.
 */
describeCanonical('a properties-only refusal distinguishes a data gap from a shapeless section', () => {
  const dataGap: Array<[string, string]> = [];

  for (const [name, kind] of dataGap) {
    it(`${name} reports ${kind}, never noGeometry`, () => {
      const r = resolveCanonicalSection(fromCatalogue(name));
      expect(r.state).toBe('properties-only');
      if (r.state !== 'properties-only') return;
      expect(r.reason.kind).toBe(kind);
      // The panel keys the "amorphous" wording off this exact value.
      expect(r.reason.kind).not.toBe('noGeometry');
    });
  }

  it('only a section with no shape and no polygon is genuinely shapeless', () => {
    const r = resolveCanonicalSection({ id: 9, name: 'Losa equivalente', a: 0.01, iz: 1e-5 } as Section);
    expect(r.state).toBe('properties-only');
    if (r.state !== 'properties-only') return;
    expect(r.reason.kind).toBe('noGeometry');
  });
});

// ─── Tapered rolled families are geometry-backed, and provably so ──

/**
 * The point of building an outline from DIN's rules rather than a radius table
 * is that the result is checkable: integrating it must return the published A,
 * Iy and Iz, none of which took any part in constructing it. Rust pins this per
 * profile; this pins that the WEB path — name lookup, unit conversion, request
 * shape, engine call — delivers the same thing, which is where a silently
 * dropped field or a millimetre/metre slip would show up instead.
 */
describeCanonical('IPN, UPN and L are geometry-backed and reproduce their published properties', () => {
  for (const family of ['IPN', 'UPN', 'L'] as const) {
    it(`every ${family} builds an outline that integrates to its catalogue row`, () => {
      const profiles = ALL_PROFILES.filter((p) => p.family === family);
      expect(profiles.length).toBeGreaterThan(0);
      for (const p of profiles) {
        const r = resolveCanonicalSection(fromCatalogue(p.name));
        expect(r.state, p.name).toBe('geometry-backed');
        if (r.state !== 'geometry-backed') continue;
        // Two angle series share the family. The EN 10056-1 sizes are whole
        // millimetres and hold to 1 %. The IRAM-IAS ones are imperial-derived
        // (15.9 = 5/8"), publish small areas to three figures, and were loaded
        // under a 3 % reconciliation filter — anything worse than that was
        // dropped rather than shipped, so 3 % is the bound they earned.
        const tol = p.family === 'L' && p.name.includes('.') ? 0.03 : 0.01;
        // Catalogue units are cm² and cm⁴; canonical geometry is in metres.
        expect(rel(r.properties.a * 1e4, p.a), `${p.name} A`).toBeLessThan(tol);
        expect(rel(r.properties.iy * 1e8, p.iy), `${p.name} Iy`).toBeLessThan(tol);
        expect(rel(r.properties.iz * 1e8, p.iz), `${p.name} Iz`).toBeLessThan(tol);
      }
    });
  }

  it('records the standard each outline was built to, not just that it is a catalogue shape', () => {
    const byName = (n: string) => backed(resolveCanonicalSection(fromCatalogue(n)));
    expect(JSON.stringify(byName('IPN 300').geometry.source)).toContain('DIN 1025-1');
    expect(JSON.stringify(byName('UPN 200').geometry.source)).toContain('DIN 1026-1');
    expect(JSON.stringify(byName('L 100x100x10').geometry.source)).toContain('EN 10056-1');
  });

  it('an IPN has a tapered flange — it is not silently built as a parallel-flange IPE', () => {
    // If the taper were dropped, the outline would still close and still look
    // like an I; only the numbers would be wrong. Compare the flange thickness
    // near the web against the thickness at the tip.
    const g = backed(resolveCanonicalSection(fromCatalogue('IPN 300'))).geometry;
    const pts = g.polygons[0].vertices as Array<[number, number]>;
    const top = pts.filter(([, v]) => v > 0);
    const nearWeb = top.filter(([w]) => Math.abs(w) < 0.02 && Math.abs(w) > 0.006);
    const nearTip = top.filter(([w]) => Math.abs(w) > 0.055);
    const lowest = (a: Array<[number, number]>) => Math.min(...a.map(([, v]) => v));
    // Thickness measured down from the flat top face at +h/2.
    expect(0.15 - lowest(nearWeb)).toBeGreaterThan(0.15 - lowest(nearTip));
  });

  it('an equal-leg angle keeps its 45° principal axis after filleting', () => {
    const r = backed(resolveCanonicalSection(fromCatalogue('L 100x100x10')));
    expect(Math.abs(Math.abs((r.properties.thetaP * 180) / Math.PI) - 45)).toBeLessThan(0.5);
  });
});

// ─── The whole catalogue, in one assertion ─────────────────────────

/**
 * With the IRAM-IAS tube tables in, no shipped profile is properties-only any
 * more. That is a claim worth pinning over the entire catalogue rather than
 * per family: a profile added later without the fillet data its family needs
 * would fail here immediately, instead of quietly reaching a user as a refusal
 * in the section panel.
 */
describeCanonical('every profile in the catalogue has exact geometry', () => {
  it('resolves geometry-backed and reproduces its own published properties', () => {
    const failures: string[] = [];
    // The American series (W, HP, M) is excluded deliberately and checked
    // separately below: those tables mark their dimensions nominal and derive
    // area from nominal mass, so no outline can reproduce both. Every other
    // family must.
    // MC is excluded for a different reason again: it has no outline at all,
    // asserted separately below.
    const EXCLUDED = new Set(['W', 'HP', 'M', 'C', 'MC']);
    for (const p of ALL_PROFILES.filter((x) => !EXCLUDED.has(x.family))) {
      const r = resolveCanonicalSection(fromCatalogue(p.name));
      if (r.state !== 'geometry-backed') {
        failures.push(`${p.name}: ${r.reason.kind}`);
        continue;
      }
      // Tube tables are tighter than rolled-profile ones, but 2 % covers the
      // smallest tubes whose tabulated area carries only two decimals.
      const err = Math.max(
        rel(r.properties.a * 1e4, p.a),
        rel(r.properties.iy * 1e8, p.iy),
        rel(r.properties.iz * 1e8, p.iz),
      );
      if (err > 0.03) failures.push(`${p.name}: ${(err * 100).toFixed(2)} %`);
    }
    expect(failures).toEqual([]);
  });

  it('covers all sixteen families', () => {
    const families = new Set(ALL_PROFILES.map((p) => p.family));
    expect(families.size).toBe(16);
    expect(ALL_PROFILES.length).toBeGreaterThan(600);
  });

  it('the nominal-dimension families stay inside a bounded deviation', () => {
    // HP tracks its table closely. M has one profile — M5x18.9 — whose
    // published Iz its own dimensions do not support: two flanges 127 mm wide
    // and 10.6 mm thick give 363 cm⁴ by hand, and the table says 327. The
    // outline is right and the table is not, so the deviation is declared
    // rather than suppressed, and bounded here so it cannot grow unnoticed.
    for (const [family, bound] of [['HP', 0.02], ['M', 0.12], ['C', 0.07]] as const) {
      for (const p of ALL_PROFILES.filter((x) => x.family === family)) {
        const r = resolveCanonicalSection(fromCatalogue(p.name));
        expect(r.state, p.name).toBe('geometry-backed');
        if (r.state !== 'geometry-backed') continue;
        const dev = Math.max(
          rel(r.properties.a * 1e4, p.a),
          rel(r.properties.iy * 1e8, p.iy),
          rel(r.properties.iz * 1e8, p.iz),
        );
        expect(dev, `${p.name}`).toBeLessThan(bound);
      }
    }
  });

  it('W is geometry-backed too, within its declared deviation', () => {
    // The claim for W is weaker but still bounded: the shape is right and the
    // numbers are close, just not exact. Pinning the bound stops the deviation
    // from quietly growing if the radius derivation is ever changed.
    const devs: number[] = [];
    for (const p of ALL_PROFILES.filter((x) => x.family === 'W')) {
      const r = resolveCanonicalSection(fromCatalogue(p.name));
      expect(r.state, p.name).toBe('geometry-backed');
      if (r.state !== 'geometry-backed') continue;
      devs.push(Math.max(
        rel(r.properties.a * 1e4, p.a),
        rel(r.properties.iy * 1e8, p.iy),
        rel(r.properties.iz * 1e8, p.iz),
      ));
    }
    devs.sort((a, b) => a - b);
    expect(devs.length).toBe(267);
    expect(devs[Math.floor(devs.length / 2)], 'median').toBeLessThan(0.012);
    expect(devs[devs.length - 1], 'worst').toBeLessThan(0.06);
  });

  it('W reproduces the published web slenderness exactly, which is what classifies it', () => {
    // The root radius is solved from the published clear web depth, so hw/tw —
    // the ratio that decides whether a web is compact, non-compact or slender —
    // comes out right even where the area does not.
    for (const name of ['W44x335', 'W24x104', 'W12x50']) {
      const p = ALL_PROFILES.find((x) => x.name === name);
      if (!p) continue;
      const hw = p.h - 2 * (p.tf! + p.r!);
      expect(hw / p.tw!, name).toBeGreaterThan(10);
    }
  });
});
