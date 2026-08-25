import { describe, it, expect } from 'vitest';
import { battenLayout, stiffnessConditionEvaluable } from '../batten-geometry';

const ok = (o = {}) => battenLayout({ arrangement: 'doubleBack', gapMm: 10, lengthM: 6, ...o });

describe('what §E.6 determines, this produces', () => {
  it('divides the member into at least three segments', () => {
    const r = ok();
    expect(r.state).toBe('available');
    if (r.state !== 'available') throw new Error('unreachable');
    expect(r.layout.segments).toBe(3);
    expect(r.layout.spacingM).toBeCloseTo(2, 9);
  });

  it('places a batten at each end and one at every interior station', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    // Three segments: two ends plus two intermediates.
    expect(r.layout.stations).toHaveLength(4);
    expect(r.layout.stations.filter((s) => s.kind === 'end')).toHaveLength(2);
    expect(r.layout.stations.filter((s) => s.kind === 'intermediate')).toHaveLength(2);
    expect(r.layout.stations.map((s) => s.atM)).toEqual([0, 2, 4, 6]);
  });

  /*
   * «Las presillas intermedias serán iguales y estarán uniformemente espaciadas.» Asserted as a
   * property of the positions, not of the number: equal spacing is what the clause requires and
   * what a fabricator reads off the drawing.
   */
  it('spaces them uniformly', () => {
    const r = ok({ lengthM: 7, segments: 4 });
    if (r.state !== 'available') throw new Error('unreachable');
    const gaps = r.layout.stations.slice(1).map((s, i) => s.atM - r.layout.stations[i].atM);
    for (const g of gaps) expect(g).toBeCloseTo(7 / 4, 9);
  });

  it('every station names the clause that put it there', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    for (const s of r.layout.stations) expect(s.clause).toMatch(/^E\.6\.3\.2\(b\)/);
  });

  /*
   * The one consequence of the layout that changes a MEMBER check. Carried explicitly because
   * leaving a consumer to infer «unbraced length = spacing» is how the two drift apart.
   */
  it('reports the chord unbraced length, which is the spacing', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    expect(r.layout.chordUnbracedLengthM).toBe(r.layout.spacingM);
  });

  it('gives two planes for a two-chord assembly and four for a four-chord one', () => {
    const two = ok();
    const four = ok({ arrangement: 'quadBox' });
    if (two.state !== 'available' || four.state !== 'available') throw new Error('unreachable');
    expect(two.layout.planes).toBe(2);
    expect(four.layout.planes).toBe(4);
  });

  it('derives the chord separation when the depth is known', () => {
    const r = ok({ chordDepthMm: 100 });
    if (r.state !== 'available') throw new Error('unreachable');
    expect(r.layout.chordSeparationM).toBeCloseTo(0.110, 9);
  });
});

describe('what it refuses', () => {
  /*
   * Only Group V is «cordones unidos por presillas». Chords in continuous contact are Group I,
   * joined by bolts or welds; producing batten positions for one would place a component the
   * clause never put there.
   */
  it('produces nothing for chords in continuous contact', () => {
    const r = battenLayout({ arrangement: 'doubleBack', gapMm: 0, lengthM: 6 });
    expect(r.state).toBe('UNAVAILABLE');
    if (r.state === 'available') throw new Error('unreachable');
    expect(r.missingKeys).toContain('batten.notGroupV');
  });

  it('nor for a single profile or a crossed pair', () => {
    for (const arrangement of ['single', 'doubleX'] as const) {
      const r = battenLayout({ arrangement, gapMm: 10, lengthM: 6 });
      expect(r.state, arrangement).toBe('UNAVAILABLE');
    }
  });

  /*
   * The input a section cannot have. `a = L/n` has no value without a member, which is exactly
   * why the section-level module reports the spacing as absent.
   */
  it('needs the member length, and says so', () => {
    const r = battenLayout({ arrangement: 'doubleBack', gapMm: 10 });
    expect(r.state).toBe('UNAVAILABLE');
    if (r.state === 'available') throw new Error('unreachable');
    expect(r.missingKeys).toContain('batten.missing.memberLength');
  });

  /*
   * Refused rather than clamped. Silently raising two segments to three produces a layout the
   * user did not ask for and would still be told was theirs.
   */
  it('refuses fewer than three segments instead of raising them', () => {
    const r = ok({ segments: 2 });
    expect(r.state).toBe('UNAVAILABLE');
    if (r.state === 'available') throw new Error('unreachable');
    expect(r.missingKeys).toContain('batten.segmentsBelowMinimum');
  });

  it('and a non-integer count', () => {
    expect(ok({ segments: 3.5 }).state).toBe('UNAVAILABLE');
  });
});

describe('the plate itself is still unavailable, and that is correct', () => {
  /*
   * §E.6 names no batten dimension anywhere. The only property it gives is `Ip`, and only inside
   * `np·Ip/h ≥ 10·I1/a`; sizing is deferred to Chapter F for the plate and J for its
   * connections. Positions at the right stations with an invented thickness would be a fiction
   * dressed in a right answer.
   */
  it('reports GEOMETRY_UNAVAILABLE with the condition, even when the positions are known', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    expect(r.layout.plate.state).toBe('GEOMETRY_UNAVAILABLE');
    expect(r.layout.plate.conditionClause).toBe('E.6.19');
    expect(r.layout.plate.missingKeys).toEqual([
      'battens.missing.thickness', 'battens.missing.width', 'battens.missing.depth',
    ]);
  });

  it('carries no thickness field at all', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    const json = JSON.stringify(r.layout);
    for (const word of ['thicknessMm', 'plateThickness', 'widthMm']) {
      expect(json).not.toContain(word);
    }
  });

  /*
   * E.6.19 becomes arithmetic the moment a project supplies `Ip`. The shape of the answer does
   * not have to change for that to happen, which is what this predicate is for.
   */
  it('says when the stiffness condition could be evaluated', () => {
    const r = ok({ chordDepthMm: 100 });
    if (r.state !== 'available') throw new Error('unreachable');
    expect(stiffnessConditionEvaluable(r.layout)).toBe(false);
    expect(stiffnessConditionEvaluable(r.layout, 12)).toBe(true);
    // And not without the chord separation, which is `h` in the condition.
    const noDepth = ok();
    if (noDepth.state !== 'available') throw new Error('unreachable');
    expect(stiffnessConditionEvaluable(noDepth.layout, 12)).toBe(false);
  });
});
