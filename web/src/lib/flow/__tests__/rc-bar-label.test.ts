/**
 * What a bar is called, and the one thing the primary label must never be.
 */

import { describe, it, expect } from 'vitest';
import {
  rcBarLabel, rcBarLabelParts, rcLooksTechnical, type RcBarLike,
} from '../rc-bar-label';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';

const bar = (over: Partial<RcBarLike> = {}): RcBarLike => ({
  id: 'col-61:ties:stirrup:0.000', diameterMm: 8, role: 'transverse',
  ownerElementIds: [61], ...over,
});

describe('a bar is named by what a person needs', () => {
  it('leads with its mark when it has one', () => {
    const l = rcBarLabel(bar(), () => 'B12');
    expect(rcBarLabelParts(l).lead).toBe('B12');
  });

  /*
   * "Not marked yet" and "marked B0" are different facts, and a schedule showing the second for
   * the first would be wrong on the one column a bender reads. An unmarked bar leads with its
   * diameter — the next most identifying thing — rather than with a blank.
   */
  it('leads with its diameter when it has no mark', () => {
    const l = rcBarLabel(bar({ diameterMm: 16 }), () => undefined);
    expect(l.mark).toBeNull();
    expect(rcBarLabelParts(l).lead).toBe('Ø16');
  });

  it('names both members of a bar continuous over a support, sorted', () => {
    expect(rcBarLabel(bar({ ownerElementIds: [9, 3] }), () => 'B1').ownerElementIds)
      .toEqual([3, 9]);
  });

  it('maps the two roles to keys that exist in es and en', () => {
    for (const role of ['longitudinal', 'transverse']) {
      const k = rcBarLabel(bar({ role }), () => 'B1').roleKey!;
      expect(k, role).toBeTruthy();
      expect(es[k as keyof typeof es], k).toBeTruthy();
      expect(en[k as keyof typeof en], k).toBeTruthy();
    }
  });

  /* A role this app does not name yields null rather than a key that resolves to nothing. */
  it('returns null for a role it does not name', () => {
    expect(rcBarLabel(bar({ role: 'diagonal' }), () => 'B1').roleKey).toBeNull();
  });
});

describe('the technical id is kept, and never leads', () => {
  it('travels on the label', () => {
    expect(rcBarLabel(bar(), () => 'B12').technicalId).toBe('col-61:ties:stirrup:0.000');
  });

  /*
   * The negative assertion this module exists for. `owner:family:slot:station` is the grammar,
   * so the check is structural rather than a list of known prefixes — a future generator
   * inventing a new family would still be caught, which a prefix list would not do.
   */
  it('the primary label is never a technical id', () => {
    for (const b of [bar(), bar({ id: 'beam-3:long:top:1.250' })]) {
      for (const mark of ['B12', undefined]) {
        const lead = rcBarLabelParts(rcBarLabel(b, () => mark)).lead;
        expect(rcLooksTechnical(lead), `lead "${lead}" must not be a key`).toBe(false);
      }
    }
  });

  it('recognises the engine keys and leaves human strings alone', () => {
    expect(rcLooksTechnical('col-61:ties:stirrup:0.000')).toBe(true);
    expect(rcLooksTechnical('B12')).toBe(false);
    expect(rcLooksTechnical('Ø16')).toBe(false);
  });
});
