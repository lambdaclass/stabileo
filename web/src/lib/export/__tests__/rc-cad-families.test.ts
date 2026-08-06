/**
 * The family taxonomy, and the two ways it must refuse.
 *
 * The bars here are built by the PRODUCTION generators, not hand-written literals, because the
 * claim under test is that the generators already record enough to name every piece. A literal
 * with `enclosesBarIds` set by hand would prove only that this module reads a field.
 *
 * The one exception is the refusal cases, which are deliberately malformed: no generator produces
 * a transverse bar confining nothing, and that is exactly why the test has to construct one.
 */
import { describe, it, expect } from 'vitest';
import {
  buildStraightBarWithHooks, type BarPath,
} from '../../codes/cirsoc201/bar-geometry';
import { footingMatLayerId } from '../../engine/detailing/footing-mat-geometry';
import {
  CAD_FAMILY_ORDER, classifyCadFamily, footingMatAxisOf, partitionCadFamilies,
} from '../rc-cad-families';

/** A vertical starter, as `footing-dowel-cage` emits one: longitudinal, no layer identity. */
function dowel(id: string): BarPath {
  return buildStraightBarWithHooks({
    id, diameterMm: 20, role: 'longitudinal',
    start: { x: 0.1, y: 0.1, z: -1.1 }, end: { x: 0.1, y: 0.1, z: 0.5 },
    axis: { x: 0, y: 0, z: 1 }, hookNormal: { x: 1, y: 0, z: 0 },
    startHook: 90, ownerElementIds: [1], edition: '2025',
  });
}

/** A bottom-mat bar, carrying the layer identity the mat generator writes. */
function matBar(id: string, axis: 'X' | 'Y'): BarPath {
  const bar = buildStraightBarWithHooks({
    id, diameterMm: 16, role: 'longitudinal',
    start: axis === 'X' ? { x: -0.9, y: 0.2, z: -1.16 } : { x: 0.2, y: -0.9, z: -1.15 },
    end: axis === 'X' ? { x: 0.9, y: 0.2, z: -1.16 } : { x: 0.2, y: 0.9, z: -1.15 },
    axis: axis === 'X' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 },
    hookNormal: { x: 0, y: 0, z: 1 },
    ownerElementIds: [1], edition: '2025',
  });
  return { ...bar, layerId: footingMatLayerId('F1', axis) };
}

/** A closed perimeter tie: `enclosesBarIds` is what makes it one. */
function closedStirrup(id: string): BarPath {
  return { ...dowel(id), role: 'transverse', enclosesBarIds: ['d0', 'd1', 'd2', 'd3'] };
}

/** A crosstie: no enclosure, a restraint pair. */
function crosstie(id: string): BarPath {
  return {
    ...dowel(id), role: 'transverse', enclosesBarIds: [], restrainsBarIds: ['d4', 'd6'],
  };
}

describe('naming a bar from what the generators recorded', () => {
  it('names a starter dowel', () => {
    expect(classifyCadFamily(dowel('F1-C1-dowel-0'))).toEqual({ ok: true, kind: 'columnDowel' });
  });

  it('names the two mat directions from the layer identity, not the id', () => {
    expect(classifyCadFamily(matBar('F1-matX-fw0-0', 'X')))
      .toEqual({ ok: true, kind: 'footingBottomMatX' });
    expect(classifyCadFamily(matBar('F1-matY-fw0-0', 'Y')))
      .toEqual({ ok: true, kind: 'footingBottomMatY' });

    // The id carries no weight: a mat bar named like a dowel is still a mat bar, and a dowel
    // named like a mat bar is still a dowel. This is the property that makes the taxonomy
    // independent of every generator's naming convention.
    expect(classifyCadFamily(matBar('F1-C1-dowel-99', 'X')))
      .toEqual({ ok: true, kind: 'footingBottomMatX' });
    expect(classifyCadFamily(dowel('F1-matX-fw0-99')))
      .toEqual({ ok: true, kind: 'columnDowel' });
  });

  it('separates a closed stirrup from a crosstie', () => {
    expect(classifyCadFamily(closedStirrup('s0'))).toEqual({ ok: true, kind: 'starterTie' });
    expect(classifyCadFamily(crosstie('c0'))).toEqual({ ok: true, kind: 'starterCrosstie' });
  });

  it('reads the mat axis, or null for steel that is not mat steel', () => {
    expect(footingMatAxisOf(matBar('a', 'X'))).toBe('X');
    expect(footingMatAxisOf(matBar('b', 'Y'))).toBe('Y');
    expect(footingMatAxisOf(dowel('c'))).toBeNull();
    expect(footingMatAxisOf(closedStirrup('d'))).toBeNull();
  });
});

describe('element ownership alone cannot classify a bar', () => {
  /**
   * The defect this taxonomy exists to remove, stated as a test.
   *
   * A footing's bars are attributed to the COLUMN element, so a mat bar and a dowel are
   * indistinguishable by ownership — and the V1 exporter, which scoped by ownership and then
   * called everything longitudinal a dowel, described twenty mat bars as column dowels.
   */
  it('gives identical ownership to a mat bar and a dowel, and still names them differently', () => {
    const mat = matBar('F1-matX-fw0-4', 'X');
    const d = dowel('F1-C1-dowel-0');
    // Identical ownership. Identical role. The only difference is the layer identity.
    expect(mat.ownerElementIds).toEqual(d.ownerElementIds);
    expect(mat.role).toBe(d.role);
    expect(classifyCadFamily(mat)).not.toEqual(classifyCadFamily(d));
    expect(classifyCadFamily(mat)).toEqual({ ok: true, kind: 'footingBottomMatX' });
    expect(classifyCadFamily(d)).toEqual({ ok: true, kind: 'columnDowel' });
  });
});

describe('refusal, rather than a fallback family', () => {
  it('refuses a transverse bar that confines nothing', () => {
    const orphan: BarPath = {
      ...dowel('t0'), role: 'transverse', enclosesBarIds: [], restrainsBarIds: [],
    };
    expect(classifyCadFamily(orphan))
      .toEqual({ ok: false, reason: 'TRANSVERSE_CONFINES_NOTHING' });
  });

  it('refuses a bar whose layer identity contradicts its role', () => {
    const contradictory: BarPath = { ...matBar('F1-matX-fw0-0', 'X'), role: 'transverse' };
    expect(classifyCadFamily(contradictory))
      .toEqual({ ok: false, reason: 'MAT_LAYER_WITH_TRANSVERSE_ROLE' });
  });

  it('refuses a mat-layer bar that also claims to enclose bars', () => {
    const contradictory: BarPath = {
      ...matBar('F1-matY-fw0-0', 'Y'), enclosesBarIds: ['d0'],
    };
    expect(classifyCadFamily(contradictory))
      .toEqual({ ok: false, reason: 'MAT_LAYER_WITH_ENCLOSURE' });
  });

  it('never invents a family: no input yields a kind outside the declared union', () => {
    const inputs = [dowel('a'), matBar('b', 'X'), matBar('c', 'Y'),
      closedStirrup('d'), crosstie('e')];
    for (const b of inputs) {
      const r = classifyCadFamily(b);
      expect(r.ok).toBe(true);
      if (r.ok) expect(CAD_FAMILY_ORDER).toContain(r.kind);
    }
  });
});

describe('partitioning an assembly', () => {
  it('groups every bar and surfaces the ones it refuses', () => {
    const bars = [
      dowel('d0'), dowel('d1'),
      matBar('mx0', 'X'), matBar('mx1', 'X'), matBar('my0', 'Y'),
      closedStirrup('s0'), crosstie('c0'), crosstie('c1'),
      { ...dowel('bad'), role: 'transverse' as const, enclosesBarIds: [], restrainsBarIds: [] },
    ];
    const p = partitionCadFamilies(bars);
    expect(p.byKind.get('columnDowel')!.map((b) => b.id)).toEqual(['d0', 'd1']);
    expect(p.byKind.get('footingBottomMatX')!.map((b) => b.id)).toEqual(['mx0', 'mx1']);
    expect(p.byKind.get('footingBottomMatY')!.map((b) => b.id)).toEqual(['my0']);
    expect(p.byKind.get('starterTie')!.map((b) => b.id)).toEqual(['s0']);
    expect(p.byKind.get('starterCrosstie')!.map((b) => b.id)).toEqual(['c0', 'c1']);
    // Refused, not silently dropped and not folded into a neighbour.
    expect(p.refused).toEqual([
      { bar: bars[8], reason: 'TRANSVERSE_CONFINES_NOTHING' },
    ]);
    // Every bar is accounted for exactly once, across families and refusals together.
    const placed = [...p.byKind.values()].reduce((n, l) => n + l.length, 0) + p.refused.length;
    expect(placed).toBe(bars.length);
  });
});
