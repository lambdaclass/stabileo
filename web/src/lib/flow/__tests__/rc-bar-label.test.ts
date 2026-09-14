/**
 * What a bar is called, and the one thing the primary label must never be.
 */

import { describe, it, expect } from 'vitest';
import {
  rcBarLabel, rcBarLabelParts, rcLooksTechnical, rcConflictSide, rcConflictLabel,
  type RcBarLike,
} from '../rc-bar-label';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';
import pt from '../../i18n/locales/pt';

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

/*
 * A conflict named two bars the worst way available: `{barA} / {barB}`, two raw engine keys, in
 * monospace, as the PRIMARY text of the row a reviewer reads first. `BarConflict` carries ids and
 * nothing else — no diameter, no role, no mark — so naming it means joining the assembly's bars
 * back in, and that join can fail.
 */
describe('a conflict names two bars, not two keys', () => {
  const bars: RcBarLike[] = [
    { id: 'beam-3:long:top:0.000', diameterMm: 16, role: 'longitudinal', ownerElementIds: [3] },
    { id: 'col-61:ties:stirrup:0.000', diameterMm: 8, role: 'transverse', ownerElementIds: [61] },
  ];
  const barOf = (id: string) => bars.find((b) => b.id === id);
  const marks: Record<string, string> = { 'beam-3:long:top:0.000': 'B4' };
  const markOf = (id: string) => marks[id];

  const conflict = (over = {}) => ({
    severity: 'clearance',
    barA: 'beam-3:long:top:0.000',
    barB: 'col-61:ties:stirrup:0.000',
    ...over,
  });

  it('leads each side with its mark when it has one', () => {
    expect(rcConflictSide('beam-3:long:top:0.000', barOf, markOf).lead).toBe('B4');
  });

  /* Unmarked falls back to the diameter, exactly as the bar list does. One rule, one place. */
  it('leads with the diameter when the bar is not marked yet', () => {
    const s = rcConflictSide('col-61:ties:stirrup:0.000', barOf, markOf);
    expect(s.lead).toBe('Ø8');
    expect(s.resolved).toBe(true);
  });

  /*
   * The negative assertion, scoped to the sides that HAD a bar to name. An unresolvable side has
   * nothing else true to say, so it keeps the key and reports `resolved: false` rather than
   * pretending.
   */
  it('no resolvable side leads with an engine key', () => {
    const l = rcConflictLabel(conflict(), barOf, markOf);
    for (const side of [l.a, l.b]) {
      expect(side.resolved).toBe(true);
      expect(rcLooksTechnical(side.lead), `lead "${side.lead}"`).toBe(false);
    }
  });

  it('a bar this assembly does not hold keeps its key, and admits it', () => {
    const s = rcConflictSide('ghost-1:long:top:0.000', barOf, markOf);
    expect(s.resolved).toBe(false);
    expect(s.lead).toBe('ghost-1:long:top:0.000');
    expect(s.diameterMm).toBeNull();
  });

  it('carries both keys whatever the leads are', () => {
    const l = rcConflictLabel(conflict(), barOf, markOf);
    expect(l.a.technicalId).toBe('beam-3:long:top:0.000');
    expect(l.b.technicalId).toBe('col-61:ties:stirrup:0.000');
  });

  /*
   * A mark is a fabrication TYPE, not an identity: two physically distinct bars of one type can
   * clash. The row would read `B4 / B4` and look like a bar colliding with itself, so the flag
   * exists and the component shows the keys without waiting to be asked.
   */
  it('flags a clash between two bars of the same mark', () => {
    const twins: RcBarLike[] = [
      { id: 'a:long:top:0.000', diameterMm: 16, role: 'longitudinal', ownerElementIds: [3] },
      { id: 'b:long:top:0.000', diameterMm: 16, role: 'longitudinal', ownerElementIds: [4] },
    ];
    const l = rcConflictLabel(
      { severity: 'clearance', barA: 'a:long:top:0.000', barB: 'b:long:top:0.000' },
      (id) => twins.find((b) => b.id === id),
      () => 'B4',
    );
    expect(l.a.lead).toBe('B4');
    expect(l.b.lead).toBe('B4');
    expect(l.sameMark).toBe(true);
  });

  it('two different marks are not flagged', () => {
    expect(rcConflictLabel(conflict(), barOf, markOf).sameMark).toBe(false);
  });

  /* Two unresolved sides sharing a key would be one bar, not two: never a same-mark row. */
  it('unresolved sides are never reported as sharing a mark', () => {
    const l = rcConflictLabel(
      { severity: 'clearance', barA: 'ghost-1', barB: 'ghost-1' }, () => undefined, () => undefined);
    expect(l.sameMark).toBe(false);
  });
});

describe('the severity naming moved out of the component', () => {
  const noBars = () => undefined;

  it('names the two severities with keys that exist in es, en and pt', () => {
    for (const severity of ['overlap', 'clearance']) {
      const k = rcConflictLabel({ severity, barA: 'a', barB: 'b' }, noBars, noBars).severityKey;
      for (const dict of [es, en, pt]) expect(dict[k as keyof typeof dict], `${k}`).toBeTruthy();
    }
  });

  /* What the component did before: everything reported that is not an overlap is a clearance. */
  it('falls back to clearance for a severity it does not name', () => {
    expect(rcConflictLabel({ severity: 'marginal', barA: 'a', barB: 'b' }, noBars, noBars)
      .severityKey).toBe('detailing.conflict.clearance');
  });

  /* The engine's classification is passed through, never re-decided here. */
  it('passes the pair class through, and null when there is none', () => {
    expect(rcConflictLabel(
      { severity: 'clearance', barA: 'a', barB: 'b', classLabelKey: 'detailing.pair.crossing' },
      noBars, noBars).classLabelKey).toBe('detailing.pair.crossing');
    expect(rcConflictLabel({ severity: 'clearance', barA: 'a', barB: 'b' }, noBars, noBars)
      .classLabelKey).toBeNull();
  });
});
