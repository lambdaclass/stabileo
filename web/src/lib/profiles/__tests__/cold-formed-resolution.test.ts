/**
 * Resolution, filters, and the boundary with the store.
 *
 * The property that matters most here is the one a parametric family exists for: **an id
 * resolves without a catalogue**. Everything else in this app resolves a section by finding it in
 * a table, so a saved project is only as openable as the table is stable. A cold-formed
 * designation carries its own dimensions, so it resolves against nothing — and that has to be
 * asserted, because it is the whole justification for shipping a family with no rows.
 *
 * The filters are driven against an INJECTED series. Query logic tested only against the shipped
 * (empty) series is untested logic that reports success, and the day a sourced series lands is
 * the wrong day to discover that a depth bound was inclusive on the wrong side.
 */

import { describe, it, expect } from 'vitest';
import {
  createColdFormedSource, coldFormedSource, coldFormedSectionFields, isColdFormedSection,
  COLD_FORMED_FAMILIES, NO_SOURCED_SERIES, COLD_FORMED_BASIS,
} from '../cold-formed-catalogue';
import { coldFormedGeometry, type ColdFormedSpec } from '../cold-formed';
import { modelStore } from '../../store/model.svelte';
import { steelProfileSource } from '../catalogue';

/**
 * A series standing in for a sourced one, used ONLY to drive the filters.
 *
 * Not a claim about what any mill rolls — that is exactly what this module refuses to ship. It
 * lives in the test because a test series is honest and a shipped one would not be.
 */
const TEST_SERIES: ColdFormedSpec[] = [
  { shape: 'C', hMm: 100, bMm: 50, cMm: 15, tMm: 2 },
  { shape: 'C', hMm: 100, bMm: 50, cMm: 15, tMm: 2.5 },
  { shape: 'C', hMm: 150, bMm: 60, cMm: 20, tMm: 2 },
  { shape: 'C', hMm: 200, bMm: 75, cMm: 20, tMm: 3 },
  { shape: 'Z', hMm: 150, bMm: 60, cMm: 20, tMm: 2 },
  { shape: 'Z', hMm: 200, bMm: 75, cMm: 20, tMm: 2.5 },
];

const injected = createColdFormedSource(TEST_SERIES);

describe('an id resolves with no catalogue behind it', () => {
  it('resolves a designation the shipped source has never heard of', () => {
    // The shipped source has an empty series. It still answers, because the answer is in the id.
    expect(coldFormedSource.seriesStatus()).toEqual({ available: false, reason: 'noSourcedSeries' });
    const e = coldFormedSource.byId('C 240x75x20x2.5');
    expect(e).not.toBeNull();
    expect(e!.heightMm).toBe(240);
    expect(e!.thicknessMm).toBe(2.5);
    expect(e!.areaCm2).toBeGreaterThan(0);
  });

  it('resolves the same section identically whether or not a series contains it', () => {
    /*
     * A section must not change because someone loaded a catalogue. The one in `TEST_SERIES` and
     * the one resolved from thin air have to be the same object by value — otherwise a project
     * would analyse differently depending on which library happened to be open.
     */
    const id = 'C 150x60x20x2.0';
    const fromSeries = injected.list({ text: id })[0];
    const fromNothing = coldFormedSource.byId(id);
    expect(fromSeries).toBeDefined();
    expect(fromNothing).toEqual(fromSeries);
  });

  it('refuses an id that is not a cold-formed designation', () => {
    for (const bad of ['IPE 200', 'C 100x50x15', 'W 310x39', '', 'C 10x50x15x2']) {
      expect(coldFormedSource.byId(bad), bad).toBeNull();
    }
  });

  it('and does not collide with the hot-rolled channel series', () => {
    /*
     * `C` is already a family in the tabulated catalogue — the AMERICAN hot-rolled channel of
     * `iram-c.ts`, per IRAM-IAS U 500-509-4. Different product, different code, and a shared
     * family id would merge them in every filter. Hence `CFC`/`CFZ`.
     *
     * Asserted from both sides: a hot-rolled channel id is not a cold-formed designation, and
     * the cold-formed family ids are not in the tabulated source's family list.
     */
    const hotRolled = steelProfileSource.list({ families: ['C'] });
    expect(hotRolled.length, 'the hot-rolled C series exists').toBeGreaterThan(0);
    for (const e of hotRolled) expect(coldFormedSource.byId(e.id), e.id).toBeNull();

    const tabulated = steelProfileSource.families() as readonly string[];
    expect(tabulated).not.toContain(COLD_FORMED_FAMILIES.C);
    expect(tabulated).not.toContain(COLD_FORMED_FAMILIES.Z);
  });
});

describe('the shipped series is empty, and says so', () => {
  it('lists nothing rather than inventing rows', () => {
    expect(NO_SOURCED_SERIES).toEqual([]);
    expect(coldFormedSource.list()).toEqual([]);
    expect(coldFormedSource.list({ shapes: ['C'] })).toEqual([]);
  });

  it('reports a reason a UI can show', () => {
    // "Empty" and "empty because nothing is sourced" are different things to a user, and only
    // the second can be said out loud.
    const status = coldFormedSource.seriesStatus();
    expect(status.available).toBe(false);
    expect(status).toHaveProperty('reason', 'noSourcedSeries');
  });

  it('still declares both families, because the shapes exist even with no rows', () => {
    expect(coldFormedSource.families()).toEqual([COLD_FORMED_FAMILIES.C, COLD_FORMED_FAMILIES.Z]);
  });

  it('and every quantity it derives is labelled as derived', () => {
    // One basis for the whole row, because geometry is the only input. Asserted so the constant
    // cannot quietly become `tabulated` when a series arrives — a sourced SERIES does not make
    // the PROPERTIES tabulated.
    expect(COLD_FORMED_BASIS).toBe('derivedFromGeometry');
  });
});

describe('filters, driven against an injected series', () => {
  it('lists everything when no query is given, deepest first', () => {
    const ids = injected.list().map((e) => e.id);
    expect(ids).toHaveLength(TEST_SERIES.length);
    const depths = injected.list().map((e) => e.heightMm);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('filters by shape', () => {
    expect(injected.list({ shapes: ['Z'] }).every((e) => e.shape === 'Z')).toBe(true);
    expect(injected.list({ shapes: ['Z'] })).toHaveLength(2);
    expect(injected.list({ shapes: ['C', 'Z'] })).toHaveLength(TEST_SERIES.length);
  });

  it('filters by depth, inclusively at both ends', () => {
    // Inclusive is the useful reading of "between 100 and 150", and the boundary is where an
    // off-by-one lives, so both ends are named explicitly.
    expect(injected.list({ heightMinMm: 150 }).map((e) => e.heightMm)).toEqual([150, 150, 200, 200]);
    expect(injected.list({ heightMaxMm: 150 }).map((e) => e.heightMm)).toEqual([100, 100, 150, 150]);
    expect(injected.list({ heightMinMm: 150, heightMaxMm: 150 })).toHaveLength(2);
  });

  it('filters by sheet thickness — the axis a cold-formed section is actually chosen on', () => {
    expect(injected.list({ thicknessMinMm: 2.5 }).every((e) => e.thicknessMm >= 2.5)).toBe(true);
    expect(injected.list({ thicknessMaxMm: 2 }).every((e) => e.thicknessMm <= 2)).toBe(true);
    expect(injected.list({ thicknessMinMm: 2.5, thicknessMaxMm: 2.5 })).toHaveLength(2);
  });

  it('filters by text, ignoring case and spacing', () => {
    expect(injected.list({ text: 'z 150' }).map((e) => e.id)).toEqual(['Z 150x60x20x2.0']);
    expect(injected.list({ text: 'Z150X60' })).toHaveLength(1);
  });

  it('combines filters', () => {
    const r = injected.list({ shapes: ['C'], heightMinMm: 120, thicknessMaxMm: 2 });
    expect(r.map((e) => e.id)).toEqual(['C 150x60x20x2.0']);
  });

  it('drops a series row that cannot be bent instead of listing a broken section', () => {
    // At construction, so a bad row cannot make the same query answer differently twice.
    const withJunk = createColdFormedSource([
      ...TEST_SERIES,
      { shape: 'C', hMm: 10, bMm: 50, cMm: 15, tMm: 2 },  // flanges meet
      { shape: 'Z', hMm: 100, bMm: 1, cMm: 15, tMm: 2 },  // no flange
    ]);
    expect(withJunk.list()).toHaveLength(TEST_SERIES.length);
  });
});

describe('the boundary with the store', () => {
  const entry = coldFormedSource.byId('C 150x60x20x2.0')!;
  const fields = coldFormedSectionFields(entry);

  it('converts to SI, because that is what a Section holds', () => {
    // The catalogue talks mm and cm; the store holds metres. One conversion, checked against the
    // geometry module's own mm output so a factor of ten cannot hide in the middle.
    const g = coldFormedGeometry(entry.spec)!;
    expect(fields.h).toBeCloseTo(150 / 1000, 12);
    expect(fields.b).toBeCloseTo(60 / 1000, 12);
    expect(fields.a).toBeCloseTo(g.areaMm2 / 1e6, 15);
    expect(fields.iy).toBeCloseTo(g.iyMm4 / 1e12, 20);
    expect(fields.iz).toBeCloseTo(g.izMm4 / 1e12, 20);
    expect(fields.j).toBeCloseTo(g.jMm4 / 1e12, 20);
  });

  it('follows the lipped-channel field convention exactly', () => {
    // `t` is the lip LENGTH and `tl` the sheet thickness, matching `'C'`. This is what lets the
    // viewer draw a Z from fields it already reads, so it is asserted rather than trusted.
    expect(fields.t).toBeCloseTo(20 / 1000, 12);   // lip length c
    expect(fields.tl).toBeCloseTo(2 / 1000, 12);   // sheet thickness
    expect(fields.tw).toBe(fields.tl);
    expect(fields.tf).toBe(fields.tl);
  });

  it('writes neither a fabricated `built` nor a fabricated `composition`', () => {
    /*
     * The designation IS the parameter record, so `built` would be redundant — and it would have
     * to name a `SECTION_SHAPES` template that does not exist for cold-formed, which is the same
     * species of lie as a `composition` naming a catalogue part this section does not have.
     */
    expect(fields).not.toHaveProperty('built');
    expect(fields).not.toHaveProperty('composition');
    expect(fields.profileFamily).toBe(COLD_FORMED_FAMILIES.C);
  });

  it('round-trips the id through the store, which is how a project survives a save', () => {
    modelStore.clear();
    const id = modelStore.addSection(coldFormedSectionFields(coldFormedSource.byId('Z 200x75x20x2.5')!));
    const snap = modelStore.snapshot();
    modelStore.clear();
    modelStore.restore(snap);

    const stored = modelStore.model.sections.get(id)!;
    expect(stored.name).toBe('Z 200x75x20x2.5');
    expect(stored.profileFamily).toBe(COLD_FORMED_FAMILIES.Z);
    expect(stored.shape).toBe('Z');
    // And the id still resolves after the round trip — the point of a self-describing name.
    const again = coldFormedSource.byId(stored.name)!;
    expect(again.spec).toEqual({ shape: 'Z', hMm: 200, bMm: 75, cMm: 20, tMm: 2.5 });
    expect(stored.a).toBeCloseTo(coldFormedSectionFields(again).a, 15);
  });
});

describe('recognising a cold-formed section in a stored model', () => {
  it('recognises one by its name alone, with no lookup', () => {
    // Which is what lets `steel-inventory.ts` explain a cold-formed member without importing any
    // geometry: in a parametric family the name is the specification.
    expect(isColdFormedSection({ name: 'C 100x50x15x2.0' })).toBe(true);
    expect(isColdFormedSection({ name: 'Z 200x75x20x2.5' })).toBe(true);
  });

  it('recognises one by family when the name has been edited', () => {
    expect(isColdFormedSection({ name: 'Correa de techo', profileFamily: 'CFZ' })).toBe(true);
  });

  it('does not mistake a hot-rolled section for one', () => {
    expect(isColdFormedSection({ name: 'IPE 200', profileFamily: 'IPE' })).toBe(false);
    expect(isColdFormedSection({ name: 'C 310x30.8', profileFamily: 'C' })).toBe(false);
    expect(isColdFormedSection({ name: 'UPN 200' })).toBe(false);
    expect(isColdFormedSection(undefined)).toBe(false);
    expect(isColdFormedSection({})).toBe(false);
  });
});
