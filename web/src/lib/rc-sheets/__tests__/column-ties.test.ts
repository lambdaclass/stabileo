import { describe, it, expect } from 'vitest';
import { columnTieLayout, tieSegments, tiesIn } from '../column-ties';
import type { ColumnRow } from '../column-row';

/** A 40 × 40 column of 3 m clear height under a 60 cm beam, its ties Ø8 at `s`. */
function row(o: { s: number; dia?: number; seismic?: { lo: number; so: number }; lap?: number; tieMax?: number; shear?: number; joint?: number }): ColumnRow {
  const dia = o.dia ?? 16;
  return {
    family: 'column', key: 'column:1:0', name: 'C1', b: 0.4, h: 0.4, length: 3.6, cover: 0.03,
    demand: { key: 'column:1:0', name: 'C1', b: 0.4, h: 0.4, length: 3.6, lu: 3, psiTop: 1, psiBot: 1, cases: [], joints: { bottom: 0.6, top: o.joint ?? 0.6 } },
    adopted: { corner: dia, nx: 1, dx: dia, ny: 1, dy: dia, tieDia: 8, tieSpacing: o.s },
    checks: { ratio: 0.5, ok: true, area: 0, spacingOk: true, tieOk: true, tieMax: o.tieMax ?? 0.25, crossties: { x: 0, y: 0 }, rhoOk: true, shearX: o.shear ?? 0.2, shearY: 0.1 },
    ...(o.lap ? { lap: { length: o.lap, tension: false } } : {}),
    ...(o.seismic ? { confinement: o.seismic } : {}),
  } as unknown as ColumnRow;
}
const gaps = (ys: number[]) => ys.slice(1).map((y, i) => y - ys[i]!);
const within = (ys: number[], a: number, b: number) => ys.filter((y) => y >= a - 1e-9 && y <= b + 1e-9);

describe('column ties along the storey', () => {
  it('ACI 318 and CIRSOC 201 without chapter 18: one spacing, half a spacing from the slab, carried through the joint', () => {
    for (const code of ['aci318-19', 'cirsoc201-2025'] as const) {
      const l = columnTieLayout(row({ s: 0.2, lap: 0.6 }), code);
      expect(l.ties[0]).toBeCloseTo(0.1, 9);
      expect(Math.max(...gaps(l.ties))).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(l.ties.at(-1)).toBeCloseTo(3.6 - 0.1, 9);
      expect(l.lap).toEqual({ from: 0, to: 0.6 });
      expect(tieSegments(l).map((z) => [z.kind, z.spacing])).toEqual([['lap', 0.2], ['middle', 0.2], ['joint', 0.2]]);
      expect(tieSegments(l).find((z) => z.kind === 'lap')!.clause).toBe('§25.5.5.1');
    }
  });

  it('with chapter 18: so over lo at both ends, through the joint and over a lap in the middle half, min(6·db; 150 mm) between', () => {
    const l = columnTieLayout(row({ s: 0.1, dia: 20, seismic: { lo: 0.5, so: 0.1 }, lap: 0.8 }), 'aci318-19');
    expect(l.lap!.from).toBeCloseTo(1.1, 9);
    expect(l.lap!.to).toBeCloseTo(1.9, 9);
    for (const [a, b] of [[0, 0.5], [2.5, 3.6], [1.1, 1.9]] as const) expect(Math.max(...gaps(within(l.ties, a, b)))).toBeLessThanOrEqual(0.1 + 1e-9);
    const mid = gaps(within(l.ties, 0.55, 1.05));
    expect(Math.max(...mid)).toBeCloseTo(0.1, 9);
    // 6·db of a Ø20 rounds to so itself: the ends are no denser than the middle, and are not dimensioned apart.
    expect(tieSegments(l).map((z) => z.kind)).toEqual(['middle', 'lap', 'middle', 'joint']);
    expect(l.notes).toEqual(['rcSheets.elev.n.ruleHolds']);
    const wide = tieSegments(columnTieLayout(row({ s: 0.075, dia: 20, seismic: { lo: 0.5, so: 0.075 }, lap: 0.8 }), 'aci318-19'));
    expect(wide.map((z) => z.kind)).toEqual(['end', 'middle', 'lap', 'middle', 'end', 'joint']);
    expect(wide[0]!.clause).toBe('§18.7.5.1, §18.7.5.3');
    expect(wide[1]!.spacing).toBeCloseTo(0.1, 9);
  });

  it('with chapter 18 and Ø25 bars the middle opens to 150 mm, and never past what the shear check leaves room for', () => {
    const open = tieSegments(columnTieLayout(row({ s: 0.1, dia: 25, seismic: { lo: 0.5, so: 0.1 } }), 'aci318-19'));
    expect(open.find((z) => z.kind === 'middle')!.spacing).toBeCloseTo(0.15, 9);
    const held = tieSegments(columnTieLayout(row({ s: 0.1, dia: 25, seismic: { lo: 0.5, so: 0.1 }, shear: 0.8 }), 'aci318-19'));
    expect(held.find((z) => z.kind === 'middle')!.spacing).toBeCloseTo(0.125, 9);
    expect(held.find((z) => z.kind === 'middle')!.clause).toBe('§18.7.5.5, §22.5');
    expect(open.find((z) => z.kind === 'middle')!.clause).toBe('§18.7.5.5');
  });

  it('EN 1992-1-1: 0.6·scl,max within max(b; h) of the slab and the beam and over the lap, scl,max between, three ties at least in the lap', () => {
    const l = columnTieLayout(row({ s: 0.15, tieMax: 0.6 * 0.32, lap: 0.25 }), 'en1992-1-1');
    const seg = tieSegments(l);
    expect(seg.map((z) => z.kind)).toEqual(['lap', 'end', 'middle', 'end', 'joint']);
    expect(seg[0]!.spacing).toBeCloseTo(0.08, 9);
    expect(seg[1]!.to).toBeCloseTo(0.4, 9);
    expect(seg[2]!.spacing).toBeCloseTo(0.3, 9);
    expect(seg[3]!.from).toBeCloseTo(2.6, 9);
    expect(tiesIn(l, seg[0]!)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...gaps(within(l.ties, 0, 0.4)))).toBeLessThanOrEqual(0.15 + 1e-9);
  });

  it('EN 1992-1-1 with bars of 14 mm or less: no closer ties over the lap', () => {
    const seg = tieSegments(columnTieLayout(row({ s: 0.15, dia: 12, tieMax: 0.6 * 0.24, lap: 0.5 }), 'bs-en1992-1-1'));
    expect(seg.map((z) => z.kind)).toEqual(['end', 'middle', 'end', 'joint']);
  });

  it('ACI 318 without chapter 18 draws the project\'s denser ends, the design\'s rule: lo = max(side, lu/6, 450 mm) at half the spacing', () => {
    const plain = columnTieLayout(row({ s: 0.2 }), 'cirsoc201-2025');
    expect(plain.notes).toEqual(['rcSheets.elev.n.oneSpacingAci']);
    const l = columnTieLayout(row({ s: 0.2 }), 'cirsoc201-2025', { endZones: true });
    const seg = tieSegments(l);
    expect(seg.map((z) => [z.kind, z.spacing])).toEqual([['end', 0.1], ['middle', 0.2], ['end', 0.1], ['joint', 0.2]]);
    expect(seg[0]!.to).toBeCloseTo(0.5, 9);
    expect(l.notes).toEqual(['rcSheets.elev.n.projectEnds']);
    expect(Math.max(...gaps(within(l.ties, 0, 0.5)))).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('EN 1992-1-1 opens the middle to what the shear leaves room for, a spacing that sits on the grid included', () => {
    const seg = tieSegments(columnTieLayout(row({ s: 0.175, tieMax: 0.6 * 0.32, shear: 0.875 }), 'en1992-1-1'));
    expect(seg.find((z) => z.kind === 'middle')!.spacing).toBeCloseTo(0.2, 9);
    const held = columnTieLayout(row({ s: 0.175, tieMax: 0.6 * 0.32, shear: 0.99 }), 'en1992-1-1');
    expect(tieSegments(held).map((z) => z.kind)).toEqual(['middle', 'joint']);
    expect(held.notes).toContain('rcSheets.elev.n.shearHolds');
  });

  it('TS 500: one spacing along the storey', () => {
    const seg = tieSegments(columnTieLayout(row({ s: 0.15, lap: 0.6, joint: 0 }), 'ts500-2000'));
    expect(seg.map((z) => [z.kind, z.spacing, z.clause])).toEqual([['lap', 0.15, '9.3'], ['middle', 0.15, '7.4.1']]);
  });
});
