/**
 * Topology + profiles → a loadable model, end to end.
 *
 * The two things worth pinning here are the ones a preview would otherwise be free to lie
 * about: that the counts shown beside the Generate button are the counts that land in the
 * model, and that a compound section reaches the solver carrying the ASSEMBLY's properties
 * rather than one profile's.
 */

import { describe, it, expect } from 'vitest';
import { generateTruss, DEFAULT_TRUSS_PARAMS, type TrussParams } from '../truss-topology';
import { generateLatticeColumn } from '../lattice-column';
import {
  emitModel, validateProfiles, requiredRoles, defaultProfileSpec, PLACEHOLDER_STEEL,
  type EmitOptions,
} from '../emit';
import { resolveProfile, availableArrangements, canCompose } from '../profile-resolve';
import { composeBuiltUp } from '../built-up-section';
import { solverProperties } from '../../../section/state';
import type { Section } from '../../../store/model.svelte';

const P = (over: Partial<TrussParams> = {}): TrussParams => ({ ...DEFAULT_TRUSS_PARAMS, ...over });

const LATTICE_PROFILES: EmitOptions['profiles'] = {
  chord: { profileName: 'IPE 100', arrangement: 'single', gapMm: 0, rotationDeg: 'auto' },
  post: { profileName: 'L 50x50x5', arrangement: 'single', gapMm: 0, rotationDeg: 'auto' },
  diagonal: { profileName: 'L 50x50x5', arrangement: 'single', gapMm: 0, rotationDeg: 'auto' },
};

describe('profile resolution', () => {
  it('resolves a catalogue profile through canonical geometry', () => {
    const r = resolveProfile('IPE 200')!;
    expect(r).not.toBeNull();
    expect(r.basis).toBe('canonicalGeometry');
    expect(r.centroidKnown).toBe(true);
    expect(r.profile.a).toBeGreaterThan(0);
    expect(r.profile.iy).toBeGreaterThan(r.profile.iz);
  });

  it('places the centroid of a channel off the middle of its box', () => {
    // The whole reason canonical geometry is consulted at all. A UPN's centroid is near
    // the web, so the two extents are markedly unequal — if they came out symmetric the
    // resolver would be reporting a bounding box instead of a centroidal one.
    const r = resolveProfile('UPN 80')!;
    const { yMin, yMax } = r.profile.extent;
    expect(Math.abs(yMax)).toBeGreaterThan(Math.abs(yMin) * 1.5);
  });

  it('gives an angle a non-zero product of inertia', () => {
    const r = resolveProfile('L 70x70x7') ?? resolveProfile('L 70x70x7')!;
    expect(Math.abs(r.profile.iyz)).toBeGreaterThan(0);
  });

  it('reports the deviation for a nominal-dimension family without treating it as an error', () => {
    const r = resolveProfile('W44x335')!;
    expect(r.basis).toBe('canonicalGeometry');
    expect(r.areaDeviation).not.toBeNull();
    expect(Math.abs(r.areaDeviation!)).toBeLessThan(0.06);
  });

  it('returns null for a name that is not in the catalogue', () => {
    expect(resolveProfile('IPE 999')).toBeNull();
    expect(resolveProfile('')).toBeNull();
  });

  it('refuses to compose a properties-only asymmetric profile', () => {
    // MC is the one family whose outline cannot be fitted, and it is a channel — so its
    // centroid is neither known nor centred, and a back-to-back pair of them would be
    // placed wrong. Refused with a reason instead.
    const r = resolveProfile('MC18x58');
    if (!r) return; // catalogue may drop the family; the rule is what is being tested
    expect(r.basis).toBe('catalogueDeclared');
    expect(r.centroidKnown).toBe(false);
    expect(canCompose(r, 'single')).toBeNull();
    expect(canCompose(r, 'doubleBack')?.key).toBe('generator.problem.centroidUnknown');
    expect(availableArrangements(r)).toEqual(['single']);
  });

  it('offers every arrangement for a geometry-backed profile', () => {
    const r = resolveProfile('L 50x50x5')!;
    expect(availableArrangements(r).length).toBeGreaterThan(1);
    expect(availableArrangements(r)).toContain('quadBox');
  });
});

describe('emitModel — what lands in the model is what the preview said', () => {
  const t = generateTruss(P({ kind: 'trapezoidal', panelsPerHalf: 5 }));
  const g = emitModel(t, { name: 'Cercha', profiles: LATTICE_PROFILES });

  it('emits one node per generated node and one element per generated member', () => {
    expect(g.json.nodes).toHaveLength(t.nodes.length);
    expect(g.json.elements).toHaveLength(t.members.length);
    expect(Object.values(g.counts).reduce((s, n) => s + n, 0)).toBe(g.json.elements.length);
  });

  it('carries the totals through unchanged', () => {
    expect(g.totalLengthM).toBe(t.totalLengthM);
    expect(g.slopePercent).toBe(t.slopePercent);
    expect(g.counts).toEqual(t.counts);
  });

  it('numbers nodes and elements from 1, contiguously', () => {
    expect(g.json.nodes.map((n) => n.id)).toEqual(g.json.nodes.map((_, i) => i + 1));
    expect(g.json.elements.map((e) => e.id)).toEqual(g.json.elements.map((_, i) => i + 1));
  });

  it('points every element at a node and a section that exist', () => {
    const nodeIds = new Set(g.json.nodes.map((n) => n.id));
    const secIds = new Set(g.json.sections.map((s) => s.id));
    for (const e of g.json.elements) {
      expect(nodeIds.has(e.nodeI)).toBe(true);
      expect(nodeIds.has(e.nodeJ)).toBe(true);
      expect(secIds.has(e.sectionId)).toBe(true);
      expect(e.materialId).toBe(1);
    }
  });

  it('makes one section per role, not one per member', () => {
    expect(g.json.sections).toHaveLength(requiredRoles(t).length);
    // Chords, posts and diagonals: three sections for forty-one members.
    expect(g.json.sections.length).toBeLessThan(g.json.elements.length);
  });

  it('preserves the element type each member was generated as', () => {
    for (const [i, m] of t.members.entries()) {
      expect(g.json.elements[i].type).toBe(m.type);
    }
  });

  it('emits supports in the 3-D vocabulary, with a roller that actually holds the truss up', () => {
    expect(g.json.supports).toHaveLength(2);
    expect(g.json.supports.map((s) => s.type).sort()).toEqual(['custom3d', 'pinned3d']);

    // The roller had to be spelled out. `rollerXZ` reads like "rolls along the span" and is
    // the opposite: `{ rx: false, ry: true, rz: false }`, where the flags mean RESTRAINED —
    // free in X AND in Z. The first version emitted it, and every generated truss was
    // standing on a bearing that did not carry vertical load. The solver reported a
    // mechanism, correctly. A truss bearing slides along the span and is held laterally and
    // vertically, which is what this asserts.
    const roller = g.json.supports.find((s) => s.type === 'custom3d')!;
    expect(roller.dofRestraints).toEqual({
      tx: false, ty: true, tz: true, rx: false, ry: false, rz: false,
    });
    expect(roller.dofFrame).toBe('global');
  });

  it('emits no loads, no combinations and no claim of having been designed', () => {
    expect(g.json.loads).toEqual([]);
    expect(g.json.combinations).toEqual([]);
    expect(g.json.loadCases).toEqual([]);
    for (const e of g.json.elements) {
      expect((e as Record<string, unknown>).reinforcement).toBeUndefined();
    }
  });
});

describe('emitModel — compound sections reach the solver as assemblies', () => {
  const t = generateTruss(P({ kind: 'pratt', panelsPerHalf: 4 }));
  const g = emitModel(t, {
    name: 'Pratt 2L',
    profiles: {
      chord: { profileName: 'L 50x50x5', arrangement: 'doubleBack', gapMm: 8, rotationDeg: 'auto' },
      post: defaultProfileSpec('L 50x50x5'),
      diagonal: defaultProfileSpec('L 50x50x5'),
    },
  });

  it('names the section after the composition', () => {
    const chord = g.json.sections.find((s) => String(s.name).startsWith('2x'))!;
    expect(chord).toBeDefined();
    expect(String(chord.name)).toContain('][');
    expect(String(chord.name)).toContain('8mm');
  });

  it('emits the ASSEMBLY area, not one profile\'s', () => {
    const single = resolveProfile('L 50x50x5')!;
    const chord = g.json.sections.find((s) => String(s.name).startsWith('2x'))!;
    expect(chord.a as number).toBeCloseTo(2 * single.profile.a, 12);
  });

  it('survives the solver\'s own property read unchanged', () => {
    // The chord section has no `shape` and a name no catalogue profile matches, so the
    // canonical resolver treats it as properties-only and hands back exactly what was
    // declared. That is the whole point: a compound section must NOT be rebuilt from one
    // profile's outline.
    const chord = g.json.sections.find((s) => String(s.name).startsWith('2x'))! as unknown as Section;
    const props = solverProperties(chord);
    expect(props.source).toBe('declared');
    expect(props.a).toBeCloseTo(chord.a as number, 15);
    expect(props.iy).toBeCloseTo(chord.iy as number, 15);
    expect(props.iz).toBeCloseTo(chord.iz as number, 15);
  });

  it('agrees with composing the section directly', () => {
    const single = resolveProfile('L 50x50x5')!;
    const expected = composeBuiltUp(single.profile, 'doubleBack', 0.008);
    const chord = g.json.sections.find((s) => String(s.name).startsWith('2x'))!;
    expect(chord.iz as number).toBeCloseTo(expected.iz, 15);
    expect(chord.iy as number).toBeCloseTo(expected.iy, 15);
    // This catalogue publishes a torsional constant for the IRAM structural tubes and for
    // nothing else, so a pair of ANGLES has no J to sum — and says so rather than
    // producing one. The tube case below exercises the summing path.
    expect(g.sections.chord!.jBasis).toBe('partHasNoJ');
    expect(chord.j).toBeUndefined();
  });

  it('sums the open parts when the profile actually publishes a J', () => {
    const tubeName = 'SHS 100x100x4';
    const tube = resolveProfile(tubeName);
    expect(tube, `${tubeName} must exist for this test to mean anything`).not.toBeNull();
    expect(tube!.profile.j).not.toBeNull();

    const g2 = emitModel(t, {
      name: 'Pratt tubos',
      profiles: {
        chord: { profileName: tubeName, arrangement: 'doubleParallel', gapMm: 10, rotationDeg: 'auto' },
        post: defaultProfileSpec(tubeName),
        diagonal: defaultProfileSpec(tubeName),
      },
    });
    expect(g2.sections.chord!.jBasis).toBe('sumOfOpenParts');
    const chord = g2.json.sections.find((s) => String(s.name).startsWith('2x'))!;
    expect(chord.j as number).toBeCloseTo(2 * tube!.profile.j!, 18);
    expect(g2.assumptions).toContain('generator.builtUp.torsion.sumOfOpenParts');
  });

  it('omits J entirely for a closed arrangement, rather than summing the open parts', () => {
    const closed = emitModel(t, {
      name: 'Pratt cajon',
      profiles: {
        chord: { profileName: 'L 50x50x5', arrangement: 'quadBox', gapMm: 6, rotationDeg: 'auto' },
        post: defaultProfileSpec('L 50x50x5'),
        diagonal: defaultProfileSpec('L 50x50x5'),
      },
    });
    const chord = closed.json.sections.find((s) => String(s.name).startsWith('4x'))!;
    expect(chord.j).toBeUndefined();
    expect(closed.sections.chord!.jBasis).toBe('closedCellNotComputed');
    expect(closed.assumptions).toContain('generator.builtUp.torsion.closedCellNotComputed');

    // And the solver reads that as an absent constant with the provenance to match, which
    // is what keeps the substitution it makes downstream visible rather than silent.
    const props = solverProperties(chord as unknown as Section);
    expect(props.j).toBeNull();
    expect(props.jProvenance).toBe('unavailable');
  });
});

describe('emitModel — orientation', () => {
  it('writes no roll when there is none to write', () => {
    const t = generateTruss(P());
    const g = emitModel(t, { name: 'x', profiles: LATTICE_PROFILES });
    for (const e of g.json.elements) expect(e.rollAngle).toBeUndefined();
  });

  it('an explicit rotation goes on the ELEMENTS of that role, and never on the section', () => {
    // The solver adds `element.rollAngle + section.rotation`, so writing both would apply
    // 90° twice. One mechanism only — and the sections stay unrotated, which is what
    // lets them be shared across a role without one member's orientation moving the rest.
    const t = generateTruss(P());
    const g = emitModel(t, {
      name: 'x',
      profiles: { ...LATTICE_PROFILES, chord: { ...LATTICE_PROFILES.chord!, rotationDeg: 90 } },
    });
    for (const s of g.json.sections) expect(s.rotation).toBeUndefined();

    const chordSectionId = g.json.sections[0].id;
    const chordElements = g.json.elements.filter((e) => e.sectionId === chordSectionId);
    expect(chordElements.length).toBeGreaterThan(0);
    for (const e of chordElements) expect(e.rollAngle).toBe(90);
    for (const e of g.json.elements.filter((x) => x.sectionId !== chordSectionId)) {
      expect(e.rollAngle).toBeUndefined();
    }
  });

  it('a generator-computed roll goes on the ELEMENT, per member', () => {
    // Two members of the same role with different rolls: exactly the purlin case, and the
    // reason a shared `Section.rotation` cannot carry it.
    const t = generateTruss(P({ kind: 'pratt', panelsPerHalf: 1 }));
    t.members[0].rollAngleDeg = 11.3;
    t.members[1].rollAngleDeg = -11.3;
    const g = emitModel(t, { name: 'x', profiles: LATTICE_PROFILES });
    expect(g.json.elements[0].rollAngle).toBeCloseTo(11.3, 9);
    expect(g.json.elements[1].rollAngle).toBeCloseTo(-11.3, 9);
    expect(g.json.elements[2].rollAngle).toBeUndefined();
  });

  it('an explicit rotation overrides the generator\'s roll for the whole role', () => {
    const t = generateTruss(P({ kind: 'pratt', panelsPerHalf: 1 }));
    t.members[0].rollAngleDeg = 11.3;
    const g = emitModel(t, {
      name: 'x',
      profiles: { ...LATTICE_PROFILES, chord: { ...LATTICE_PROFILES.chord!, rotationDeg: 180 } },
    });
    expect(g.json.elements[0].rollAngle).toBe(180);
  });
});

describe('emitModel — assumptions travel with the model', () => {
  it('lists the topology and the section assumptions together, deduplicated and sorted', () => {
    const t = generateTruss(P());
    const g = emitModel(t, { name: 'x', profiles: LATTICE_PROFILES });
    expect(g.assumptions).toEqual([...g.assumptions].sort());
    expect(new Set(g.assumptions).size).toBe(g.assumptions.length);
    expect(g.assumptions).toContain('generator.assume.chordsContinuous');
    expect(g.assumptions).toContain('generator.assume.webPinned');
  });

  it('says the grade is a placeholder while no catalogued one is bound', () => {
    const t = generateTruss(P());
    const g = emitModel(t, { name: 'x', profiles: LATTICE_PROFILES });
    expect(g.assumptions).toContain('generator.assume.placeholderGrade');
    expect(g.json.materials[0].name).toBe(PLACEHOLDER_STEEL.name);
  });

  it('stops saying so once a grade is supplied, and carries the id through', () => {
    const t = generateTruss(P());
    const g = emitModel(t, {
      name: 'x',
      profiles: LATTICE_PROFILES,
      material: { ...PLACEHOLDER_STEEL, name: 'F-24', fy: 235, gradeId: 'iram-f24' },
    });
    expect(g.assumptions).not.toContain('generator.assume.placeholderGrade');
    expect(g.json.materials[0].gradeId).toBe('iram-f24');
  });
});

describe('validateProfiles — reports everything before Generate is pressed', () => {
  const t = generateTruss(P());

  it('accepts a complete, valid selection', () => {
    expect(validateProfiles(t, LATTICE_PROFILES)).toEqual([]);
  });

  it('names every role left without a profile', () => {
    const problems = validateProfiles(t, { chord: LATTICE_PROFILES.chord });
    expect(problems.map((p) => p.role).sort()).toEqual(['diagonal', 'post']);
    for (const p of problems) expect(p.key).toBe('generator.problem.profileMissing');
  });

  it('rejects a profile that is not in the catalogue', () => {
    const problems = validateProfiles(t, { ...LATTICE_PROFILES, post: defaultProfileSpec('IPE 999') });
    expect(problems.map((p) => p.key)).toContain('generator.problem.profileUnknown');
  });

  it('stops emission rather than producing a section of zero area', () => {
    expect(() => emitModel(t, { name: 'x', profiles: { chord: LATTICE_PROFILES.chord } }))
      .toThrow(/invalid profile selection/);
  });

  it('asks only for the roles the topology actually uses', () => {
    const portal = generateTruss(P({ kind: 'rolledPortal', riseM: 1.5 }));
    expect(requiredRoles(portal)).toEqual(['rafter']);
    expect(validateProfiles(portal, { rafter: defaultProfileSpec('IPE 160') })).toEqual([]);
  });
});

describe('emitModel — the lattice column goes through the same path', () => {
  it('emits a loadable column', () => {
    const t = generateLatticeColumn({ divisions: 6 });
    const g = emitModel(t, { name: 'Columna', profiles: LATTICE_PROFILES });
    expect(g.json.nodes).toHaveLength(14);
    expect(g.json.elements).toHaveLength(25);
    expect(g.json.sections).toHaveLength(3);
    expect(g.json.supports).toHaveLength(2);
  });

  it('emits fixed supports as the 3-D fixed type when the base is fixed', () => {
    const t = generateLatticeColumn({ divisions: 3, fixedBase: true });
    const g = emitModel(t, { name: 'Columna', profiles: LATTICE_PROFILES });
    expect(g.json.supports.every((s) => s.type === 'fixed3d')).toBe(true);
  });
});
