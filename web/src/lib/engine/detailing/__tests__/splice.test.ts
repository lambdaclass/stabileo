/**
 * Lap splices where collinear members meet — CIRSOC 201 §25.5.
 *
 * The rule these replace demanded that two collinear beams either share an identical layout
 * or separate fully in plan. Neither is what the code says, and the second is not one of its
 * options at all: §25.5.1.2 permits a CONTACT lap, where the two bars touch and clear
 * spacing is measured to ADJACENT bars. Demanding full separation asked two 8-bar beams for
 * sixteen transverse positions in a 284 mm section, and stranded fifty members on it.
 */
import { describe, it, expect } from 'vitest';
import {
  planSplice, classifySplice, transitionExists,
  CLASS_A_AREA_RATIO, MAX_NONCONTACT_PITCH_MM,
} from '../splice';
import { deriveDevelopment } from '../../../codes/cirsoc201/anchorage';
import { teAt } from '../../../i18n/engine-text';

const DEV = deriveDevelopment({
  diameterMm: 16, fy: 420, fc: 25, favourableSpacing: true, edition: '2025',
});

function plan(over: Partial<Parameters<typeof planSplice>[0]> = {}) {
  return planSplice({
    from: [-0.06, 0, 0.06], to: [-0.06, 0, 0.06],
    diameterMm: 16, development: DEV, areaRatio: 1.0, groups: 1,
    availableLength: 3.0, edition: '2025', maxAggregateSizeMm: 19,
    ...over,
  });
}

describe('§25.5.2.1 Table 25.5.2.1 classification', () => {
  it('Class A needs BOTH the area ratio and the 50 % limit', () => {
    expect(classifySplice(CLASS_A_AREA_RATIO, 0.5).spliceClass).toBe('A');
    expect(classifySplice(CLASS_A_AREA_RATIO, 1.0).spliceClass).toBe('B');
    expect(classifySplice(1.9, 0.5).spliceClass).toBe('B');
  });

  it('defaults to Class B, the longer lap', () => {
    // A conservative default is the right one here: getting it wrong shortens real steel.
    expect(classifySplice(1.0, 1.0).factor).toBe(1.3);
  });

  it('cites the table', () => {
    expect(classifySplice(2.0, 0.5).refs.map((r) => r.clause)).toContain('Tabla 25.5.2.1');
  });
});

describe('the three transitions the code names', () => {
  it('identical layouts become one continuous bar, not two', () => {
    const r = plan();
    expect(r.ok).toBe(true);
    expect(r.schedule!.kind).toBe('continuous');
    expect(r.schedule!.pairs.every((p) => p.offset === 0)).toBe(true);
  });

  it('a CONTACT lap is legal with no plan separation at all — §25.5.1.2', () => {
    // The arrangement the old rule could not express. Same positions, different member.
    const r = plan({ from: [-0.06, 0, 0.06], to: [-0.06, 0, 0.06], groups: 2 });
    expect(r.ok).toBe(true);
    expect(r.schedule!.kind).toBe('contactLap');
    expect(r.schedule!.refs.map((x) => x.clause)).toContain('25.5.1.2');
  });

  it('a NON-CONTACT lap is legal within the §25.5.1.3 transverse limit', () => {
    const r = plan({ from: [-0.06, 0.06], to: [-0.03, 0.09] });
    expect(r.ok).toBe(true);
    expect(r.schedule!.kind).toBe('nonContactLap');
    for (const p of r.schedule!.pairs) {
      expect(p.offset).toBeLessThanOrEqual(MAX_NONCONTACT_PITCH_MM / 1000 + 1e-9);
    }
  });

  it('refuses when no bar has a partner within the transverse limit', () => {
    const r = plan({ from: [-0.30], to: [0.30] });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('noLegalTransversePairing');
  });
});

describe('the overlap interval is what the collision engine needs', () => {
  it('reports the exact interval where BOTH bars exist', () => {
    const r = plan({ groups: 1 });
    const p = r.schedule!.pairs[0];
    expect(p.overlapTo - p.overlapFrom).toBeCloseTo(r.schedule!.lapLength, 9);
  });

  it('staggered groups place their overlaps at DIFFERENT stations', () => {
    // The point of staggering: not every bar is spliced at one section, so the section
    // never carries the full doubled count.
    const r = plan({ from: [-0.06, 0, 0.06, 0.12], to: [-0.06, 0, 0.06, 0.12], groups: 2 });
    expect(r.ok).toBe(true);
    const starts = new Set(r.schedule!.pairs.map((p) => Math.round(p.overlapFrom * 1000)));
    expect(starts.size).toBe(2);
    expect(r.schedule!.maxFractionAtSection).toBeCloseTo(0.5, 9);
  });

  it('staggering earns the shorter Class A lap when the area ratio allows it', () => {
    const one = plan({ groups: 1, areaRatio: 2.0 });
    const two = plan({ groups: 2, areaRatio: 2.0 });
    expect(one.schedule!.spliceClass).toBe('B');
    expect(two.schedule!.spliceClass).toBe('A');
    expect(two.schedule!.lapLength).toBeLessThan(one.schedule!.lapLength);
  });
});

describe('physical room is checked, not assumed', () => {
  it('refuses when the member is too short for the laps', () => {
    const r = plan({ groups: 3, availableLength: 0.4 });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('insufficientLength');
    for (const locale of ['en', 'es']) {
      expect(teAt(r.detail!, locale)).not.toBe(r.detail!.key);
    }
  });

  it('honours a joint exclusion zone', () => {
    const withZone = plan({ jointExclusion: 0.5 });
    expect(withZone.schedule!.pairs[0].overlapFrom).toBeCloseTo(0.5, 9);
  });

  it('more stagger groups need more length, and say so', () => {
    const lap = plan().schedule!.lapLength;
    expect(plan({ groups: 3, availableLength: lap * 3 - 0.01 }).ok).toBe(false);
    expect(plan({ groups: 3, availableLength: lap * 3 + 0.01 }).ok).toBe(true);
  });
});

describe('transitionExists is what arc consistency should ask', () => {
  it('accepts differing layouts that a contact lap connects', () => {
    // Exactly the case the old rule rejected, and the reason fifty members were stranded.
    expect(transitionExists([-0.06, 0, 0.06], [-0.05, 0.01, 0.07], 16, DEV)).toBe(true);
  });

  it('still refuses a pairing no lap can reach', () => {
    expect(transitionExists([-0.40], [0.40], 16, DEV)).toBe(false);
  });

  it('is deterministic under input reordering', () => {
    const a = transitionExists([0.06, -0.06, 0], [0, 0.06, -0.06], 16, DEV);
    const b = transitionExists([-0.06, 0, 0.06], [-0.06, 0, 0.06], 16, DEV);
    expect(a).toBe(b);
  });
});
