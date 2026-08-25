import { describe, it, expect } from 'vitest';
import { battenPlan, builtUpGroup } from '../battens';
import { BUILT_UP_ARRANGEMENTS } from '../profile-spec';

describe('the five groups of §E.6.1', () => {
  it('a single profile is not a built-up member at all', () => {
    expect(builtUpGroup('single', 0)).toBe('none');
    expect(battenPlan({ arrangement: 'single', gapMm: 0 }).inScope).toBe(false);
  });

  /*
   * Zero gap is «en contacto continuo», the words §E.6.2.2(a) uses and the same condition the
   * `ki = 0,50` note in §E.6.2.1 attaches to back-to-back angles. Its rule is a MAXIMUM spacing,
   * not a minimum count — a different rule, so a different group.
   */
  it('chords in continuous contact are Group I', () => {
    expect(builtUpGroup('doubleBack', 0)).toBe('I');
    expect(builtUpGroup('doubleFacing', 0)).toBe('I');
  });

  it('chords separated by a gap need something spanning it — Group V', () => {
    expect(builtUpGroup('doubleBack', 10)).toBe('V');
    expect(builtUpGroup('quadBox', 8)).toBe('V');
  });

  /*
   * Two profiles crossed at ninety degrees is not one of the five figures §E.6.1 draws. Calling
   * it Group V would apply a batten rule to a shape the clause never contemplated.
   */
  it('a crossed pair is out of scope rather than assigned a group', () => {
    expect(builtUpGroup('doubleX', 10)).toBe('none');
    expect(battenPlan({ arrangement: 'doubleX', gapMm: 10 }).inScope).toBe(false);
  });

  it('every arrangement gets an answer, so no caller hits a hole', () => {
    for (const a of BUILT_UP_ARRANGEMENTS) {
      expect(typeof builtUpGroup(a, 0)).toBe('string');
      expect(typeof builtUpGroup(a, 10)).toBe('string');
    }
  });
});

describe('what the code defines, this reports — with its clause', () => {
  const plan = (o: Partial<Parameters<typeof battenPlan>[0]> = {}) =>
    battenPlan({ arrangement: 'doubleBack', gapMm: 10, ...o });

  it('Group V divides the member into at least three segments', () => {
    const p = plan();
    expect(p.group).toBe('V');
    expect(p.minSegments.value).toBe(3);
    // «Se colocarán presillas intermedias para dividir la longitud de la pieza, como mínimo en
    // tres tramos.»
    expect(p.minSegments.clause).toBe('E.6.3.2(b)(2)');
  });

  it('and therefore two intermediate battens, plus the two at the ends', () => {
    expect(plan().intermediateCount.value).toBe(2);
  });

  it('spacing is uniform once a member length exists', () => {
    const p = plan({ lengthM: 6 });
    expect(p.spacing.value).toBeCloseTo(2, 9);
    expect(p.spacing.noteKey).toBe('battens.spacing.uniform');
  });

  /*
   * The limitation that matters for the section selector: a SECTION has no length. It is a
   * cross-section and can sit on members of any length, so `a = L/3` has no value there. Null
   * with the rule named, never `L/3` on an assumed length.
   */
  it('and is null without one, with the reason said rather than assumed', () => {
    const p = plan();
    expect(p.spacing.value).toBeNull();
    expect(p.spacing.noteKey).toBe('battens.spacing.needsMemberLength');
  });

  /*
   * `a/ri ≤ (3/4)·λ` — §E.6.2.2(a)(3), with `ri` the chord's MINIMUM radius of gyration. Real
   * arithmetic, so it is computed rather than quoted.
   */
  it('computes the maximum spacing from the slenderness rule', () => {
    const p = plan({ chordRiM: 0.02, governingSlenderness: 80 });
    expect(p.maxSpacingFromSlenderness.value).toBeCloseTo(0.75 * 80 * 0.02, 12);
    expect(p.maxSpacingFromSlenderness.clause).toBe('E.6.2.2(a)(3)');
  });

  it('and reports it missing when the chord radius is not supplied', () => {
    expect(plan().maxSpacingFromSlenderness.value).toBeNull();
    expect(plan().maxSpacingFromSlenderness.noteKey).toBe('battens.maxSpacing.needsChordRi');
  });

  it('derives the number of batten planes from the arrangement', () => {
    expect(plan().planes.value).toBe(2);
    expect(plan({ arrangement: 'quadBox' }).planes.value).toBe(4);
  });

  it('every quantity names a dotted CIRSOC clause', () => {
    for (const q of Object.values(plan({ lengthM: 6, chordRiM: 0.02, governingSlenderness: 80 }))) {
      if (q && typeof q === 'object' && 'clause' in q) {
        expect((q as { clause: string }).clause).toMatch(/^E\.6\./);
      }
    }
  });
});

describe('what the code does NOT define is not invented', () => {
  const p = battenPlan({ arrangement: 'doubleBack', gapMm: 10, lengthM: 6 });

  /*
   * No batten dimension appears anywhere in §E.6. The only property of a batten the clause
   * names is `Ip`, «el momento de inercia de una presilla en su plano», and it appears
   * exclusively inside E.6.19's inequality — never as something computed from a size. Sizing is
   * deferred to Chapter F for the plate and Chapter J for its connections.
   */
  it('reports the geometry as GEOMETRY_UNAVAILABLE, not as a plate', () => {
    expect(p.geometry.state).toBe('GEOMETRY_UNAVAILABLE');
    expect(p.geometry.missingKeys).toEqual([
      'battens.missing.thickness', 'battens.missing.width', 'battens.missing.depth',
    ]);
  });

  it('quotes the condition the missing dimension must satisfy', () => {
    // `np·Ip/h ≥ 10·I1/a`
    expect(p.geometry.conditionClause).toBe('E.6.19');
    expect(p.geometry.conditionKey).toBe('battens.condition.stiffness');
  });

  it('carries no thickness, width or depth field at all', () => {
    const json = JSON.stringify(p);
    for (const word of ['thicknessMm', 'widthMm', 'depthMm', 'plateThickness']) {
      expect(json).not.toContain(word);
    }
  });

  it('states the rules a surface must show, as keys', () => {
    expect(p.ruleKeys).toContain('battens.rule.minThreeSegments');
    expect(p.ruleKeys).toContain('battens.rule.equalAndUniform');
    expect(p.ruleKeys).toContain('battens.rule.facedAcrossPlanes');
    // The one with a consequence for the chord check: its unbraced length is `a`, with k = 1.
    expect(p.ruleKeys).toContain('battens.rule.chordUnbracedLengthIsA');
  });
});
