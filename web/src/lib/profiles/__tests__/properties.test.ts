/**
 * The properties a PRO card shows, and the refusals that keep it honest.
 *
 * The assertions that matter here are the ones about NOT having a number. A section modulus
 * computed from half the depth of a channel is wrong by about a third and looks entirely
 * plausible; the whole point of this module is that such a value never appears.
 *
 * The published moduli used as cross-checks below are from the same handbook tables the
 * catalogue's dimensions come from, and they are quoted in the assertions rather than stored,
 * because a stored expectation is a second table that can drift.
 */

import { describe, it, expect } from 'vitest';
import { steelProfileSource, queryProfiles } from '../catalogue';
import {
  PROPERTY_BASES, PROPERTY_ORDER, profileProperties, propertyRows,
} from '../properties';

const propsOf = (id: string) => profileProperties(steelProfileSource.byId(id)!);

describe('what the table already says', () => {
  it('passes the tabulated values through untouched, and marks them as tabulated', () => {
    const p = propsOf('IPE 200');
    expect(p.area.value).toBe(28.5);
    expect(p.iy.value).toBe(1943);
    expect(p.iz.value).toBe(142);
    expect(p.mass.value).toBe(22.4);
    expect(p.height.value).toBe(200);
    expect(p.width.value).toBe(100);
    for (const k of ['area', 'iy', 'iz', 'mass', 'height', 'width'] as const) {
      expect(p[k].basis, k).toBe('tabulated');
    }
  });
});

describe('the radius of gyration, which is exact arithmetic', () => {
  it('reproduces the published value for a doubly symmetric profile', () => {
    // IPE 200: published iy = 8.26 cm, iz = 2.24 cm. sqrt(1943/28.5) = 8.257…
    const p = propsOf('IPE 200');
    expect(p.ry.value!).toBeCloseTo(8.26, 2);
    expect(p.rz.value!).toBeCloseTo(2.23, 2);
    expect(p.ry.basis).toBe('derivedFromTable');
  });

  it('is available for every profile in the catalogue, because it needs no outline', () => {
    // This is the one derived property with no refusal case, and that is worth pinning: it
    // depends only on two tabulated numbers, so a family with no geometry still gets it.
    for (const e of queryProfiles()) {
      const p = profileProperties(e);
      expect(p.ry.value, e.id).not.toBeNull();
      expect(p.rz.value, e.id).not.toBeNull();
      expect(p.ry.value!, e.id).toBeGreaterThan(0);
    }
  });

  it('satisfies the identity the tube tables were validated against', () => {
    // `iram-tubes.ts` required every row to satisfy r = sqrt(I/A). Recomputing it here is a
    // check that the catalogue units are being read the way that validation assumed.
    for (const id of ['SHS 100x100x3.2', 'CHS 88.9x4']) {
      const p = propsOf(id);
      expect(p.ry.value!).toBeCloseTo(Math.sqrt(p.iy.value! / p.area.value!), 10);
    }
  });
});

describe('the section modulus, which needs a centroid', () => {
  it('reproduces the published value for a doubly symmetric profile', () => {
    // IPE 200: published Wy = 194 cm³, Wz = 28.5 cm³. 1943/(20/2) = 194.3.
    const p = propsOf('IPE 200');
    expect(p.wy.value!).toBeCloseTo(194, 0);
    expect(p.wz.value!).toBeCloseTo(28.4, 0);
    // No note: the section is symmetric about both axes, so there is only one modulus each.
    expect(p.wy.noteKey).toBeUndefined();
    expect(p.wz.noteKey).toBeUndefined();
  });

  it('reports the MINIMUM modulus for an axis the section is not symmetric about', () => {
    // A channel is symmetric top to bottom and not left to right. Wy is unambiguous; Wz has
    // two values and the one that governs is the smaller.
    const p = propsOf('UPN 200');
    expect(p.wy.value!).toBeCloseTo(191, 0);           // published 191 cm³
    expect(p.wy.noteKey).toBeUndefined();
    expect(p.symmetry).toEqual({ aboutY: true, aboutZ: false });
    if (p.wz.value !== null) {
      expect(p.wz.noteKey).toBe('steel.props.note.minimumModulus');
      // UPN 200: Iz = 148 cm⁴, centroid 2.01 cm from the web's back, flange tip 5.49 cm away.
      // The governing modulus is 148/5.49 = 27.0, not the 148/3.75 = 39.5 that half the width
      // would give. Anything at or above 30 means the centroid was assumed centred.
      expect(p.wz.value).toBeLessThan(30);
      expect(p.wz.value).toBeGreaterThan(20);
    } else {
      // No geometry engine in this environment: refusing is the correct alternative.
      expect(p.wz.basis).toBe('unavailable');
      expect(p.wz.noteKey).toBe('steel.props.unavailable.centroidUnknown');
    }
  });

  it('refuses both moduli for an angle rather than halving its legs', () => {
    // An equal-leg angle's centroid is off-centre on both axes. Half the leg is not the
    // extreme-fibre distance for either one.
    const p = propsOf('L 100x100x10');
    expect(p.symmetry).toEqual({ aboutY: false, aboutZ: false });
    for (const w of [p.wy, p.wz]) {
      if (w.value === null) {
        expect(w.basis).toBe('unavailable');
        expect(w.noteKey).toBe('steel.props.unavailable.centroidUnknown');
      } else {
        // With geometry the value is real, and it must have come from the outline — never
        // from half the bounding box.
        expect(w.basis).toBe('derivedFromGeometry');
        expect(w.noteKey).toBe('steel.props.note.minimumModulus');
        expect(w.value).toBeLessThan(p.iy.value! / (p.height.value! / 20));
      }
    }
  });

  it('refuses the modulus for the properties-only family, whichever way round', () => {
    // MC is a channel whose flange taper cannot be determined from what is published, so no
    // outline exists to measure a centroid on — and it is not symmetric left to right, so
    // symmetry cannot stand in. Wz has to be a refusal in every environment.
    const p = propsOf('MC18x58');
    expect(p.wz.value).toBeNull();
    expect(p.wz.basis).toBe('unavailable');
    expect(p.wz.noteKey).toBe('steel.props.unavailable.centroidUnknown');
    expect(p.unavailableReasons).toContain('steel.props.unavailable.centroidUnknown');
  });
});

describe('the torsion constant, which is never derived', () => {
  it('passes the tabulated J through for the structural tubes', () => {
    const p = propsOf('SHS 100x100x3.2');
    expect(p.j.value).not.toBeNull();
    expect(p.j.basis).toBe('tabulated');
  });

  it('reports it as unavailable for every family whose source does not publish one', () => {
    // The prohibition this pins: a polygon-derived value is not J for a thin open section, so
    // an absent J stays absent. An IPE has an outline, so a module willing to integrate one
    // would happily produce a number here.
    for (const id of ['IPE 200', 'UPN 200', 'L 100x100x10', 'W12x26']) {
      const p = propsOf(id);
      expect(p.j.value, id).toBeNull();
      expect(p.j.basis, id).toBe('unavailable');
      expect(p.j.noteKey, id).toBe('steel.props.unavailable.torsionNotPublished');
    }
  });
});

describe('the contract every quantity keeps', () => {
  it('has a value exactly when it is not unavailable, and a reason exactly when it is', () => {
    // The invariant the card rests on: it never has to decide whether a null means zero.
    for (const e of queryProfiles()) {
      for (const row of propertyRows(profileProperties(e))) {
        const { basis, value, noteKey } = row.quantity;
        expect(PROPERTY_BASES, `${e.id}.${row.key}`).toContain(basis);
        if (basis === 'unavailable') {
          expect(value, `${e.id}.${row.key}`).toBeNull();
          expect(noteKey, `${e.id}.${row.key}`).toBeTruthy();
        } else {
          expect(value, `${e.id}.${row.key}`).not.toBeNull();
          expect(Number.isFinite(value!), `${e.id}.${row.key}`).toBe(true);
          expect(value!, `${e.id}.${row.key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('lists every row once, in the declared order, with a label key each', () => {
    const rows = propertyRows(propsOf('IPE 200'));
    expect(rows.map((r) => r.key)).toEqual([...PROPERTY_ORDER]);
    for (const r of rows) expect(r.labelKey).toBe(`steel.props.label.${r.key}`);
  });

  it('collects the reasons without repeating one', () => {
    const p = propsOf('MC18x58');
    expect(new Set(p.unavailableReasons).size).toBe(p.unavailableReasons.length);
    // MC publishes no root radius either — that is why it has no outline — so the card has
    // more than one thing to say about it.
    expect(p.unavailableReasons.length).toBeGreaterThan(1);
  });
});

describe('the root radius, whose absence means four different things', () => {
  it('is tabulated where the standard publishes it', () => {
    const p = propsOf('IPE 200');
    expect(p.rootRadius.value).toBe(12);
    expect(p.rootRadius.basis).toBe('tabulated');
    expect(p.rootRadius.noteKey).toBeUndefined();
  });

  it('says so where it was solved from the published web depth instead', () => {
    // W, HP, M and C have no usable radius column; theirs was inverted out of `hw`. Calling
    // that "tabulated" would claim a column that does not exist.
    const p = propsOf('W12x26');
    expect(p.rootRadius.value).toBeGreaterThan(0);
    expect(p.rootRadius.basis).toBe('derivedFromTable');
    expect(p.rootRadius.noteKey).toBe('steel.props.note.rootRadiusInverted');
  });

  it('explains that a tapered family needs no radius column at all', () => {
    // IPN and UPN take both radii from DIN's rules on their own dimensions, and the outline is
    // exact. "Not published" alone would read as a gap in a family that has none.
    for (const id of ['IPN 200', 'UPN 200']) {
      const p = propsOf(id);
      expect(p.rootRadius.value, id).toBeNull();
      expect(p.rootRadius.noteKey, id).toBe('steel.props.unavailable.rootRadiusByRule');
    }
  });

  it('does not read the C9 zero as a published sharp corner', () => {
    // `iram-c.ts` gives those three no radius — their published clear web depth would put a
    // 49.5 mm fillet inside a 61.8 mm flange — and encodes it as `r: 0`. A zero rendered as a
    // tabulated value would attribute a decision of ours to the standard.
    const p = propsOf('C9x20');
    expect(p.rootRadius.value).toBeNull();
    expect(p.rootRadius.basis).toBe('unavailable');
    expect(p.rootRadius.noteKey).toBe('steel.props.unavailable.rootRadiusSharp');
  });

  it('reports a genuinely missing radius as missing, on the family it keeps out of geometry', () => {
    const p = propsOf('MC18x58');
    expect(p.rootRadius.noteKey).toBe('steel.props.unavailable.rootRadiusNotPublished');
  });
});
