/**
 * The catalogue as a source: query, group, and the identifier that must not drift.
 *
 * These are the assertions the UI rests on, kept out of the UI so a component test never has
 * to prove that a search works — only that it is wired.
 */

import { describe, it, expect } from 'vitest';
import {
  queryProfiles, groupByFamily, steelProfileSource, populatedFamilies,
  standardsInFamily, familyHasMixedStandards,
} from '../catalogue';
import { IRAM_L } from '../../data/iram-angles';
import { FAMILY_CLASSIFICATION } from '../../data/section-catalog';
import { ALL_PROFILES, FAMILY_LIST } from '../../data/steel-profiles';
import { resolveProfile } from '../../engine/generators/profile-resolve';

describe('the catalogue covers what the tables hold', () => {
  it('lists every profile, once', () => {
    const all = queryProfiles();
    expect(all.length).toBe(ALL_PROFILES.length);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });

  it('carries the four figures a choice is actually made on', () => {
    // `IPE 200` and `HEA 200` are both "200" and are not interchangeable, so the row has to
    // show more than a name.
    const ipe = steelProfileSource.byId('IPE 200');
    expect(ipe).not.toBeNull();
    expect(ipe!.heightMm).toBeGreaterThan(0);
    expect(ipe!.widthMm).toBeGreaterThan(0);
    expect(ipe!.areaCm2).toBeGreaterThan(0);
    expect(ipe!.massKgPerM).toBeGreaterThan(0);
  });
});

describe('the identifier is the one the model already stores', () => {
  it('is the catalogue name, so a saved spec keeps resolving', () => {
    // The contract that makes this safe to ship: whatever the selector hands back must be
    // something `resolveProfile` accepts, because that is what the emitter calls.
    for (const id of ['IPE 200', 'HEB 160', 'UPN 100', 'L 50x50x5']) {
      const entry = steelProfileSource.byId(id);
      expect(entry, id).not.toBeNull();
      expect(entry!.id, id).toBe(entry!.name);
      expect(resolveProfile(entry!.id), `${id} resolves`).not.toBeNull();
    }
  });

  it('every entry in the catalogue resolves — no row can be picked and then refused', () => {
    const unresolvable = queryProfiles()
      .filter((e) => resolveProfile(e.id) === null)
      .map((e) => e.id);
    expect(unresolvable).toEqual([]);
  });
});

describe('search', () => {
  it('ignores case and spaces, so three ways of typing one profile agree', () => {
    const a = queryProfiles({ text: 'HEA 200' }).map((e) => e.id);
    const b = queryProfiles({ text: 'hea200' }).map((e) => e.id);
    const c = queryProfiles({ text: '  HeA200 ' }).map((e) => e.id);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a).toContain('HEA 200');
  });

  it('narrows rather than reorders', () => {
    const some = queryProfiles({ text: 'IPE' });
    expect(some.length).toBeGreaterThan(0);
    expect(some.length).toBeLessThan(ALL_PROFILES.length);
    for (const e of some) expect(e.name.toLowerCase()).toContain('ipe');
  });

  it('returns nothing for a query that matches nothing, rather than everything', () => {
    // The failure mode worth guarding: an empty filter silently falling back to the full list
    // is how a user ends up picking from 100+ rows again.
    expect(queryProfiles({ text: 'zzzz' })).toEqual([]);
  });
});

describe('filters', () => {
  it('a family filter keeps only that family', () => {
    const only = queryProfiles({ families: ['IPE'] });
    expect(only.length).toBeGreaterThan(0);
    for (const e of only) expect(e.family).toBe('IPE');
  });

  it('several families are a union, not an intersection', () => {
    const two = queryProfiles({ families: ['IPE', 'HEB'] });
    const fams = new Set(two.map((e) => e.family));
    expect([...fams].sort()).toEqual(['HEB', 'IPE']);
  });

  it('composes with the search rather than replacing it', () => {
    const both = queryProfiles({ text: '200', families: ['HEA'] });
    expect(both.length).toBeGreaterThan(0);
    for (const e of both) {
      expect(e.family).toBe('HEA');
      expect(e.name).toContain('200');
    }
  });

  it('a standards-body filter keeps only the families that body publishes', () => {
    // The axis comes from `section-catalog.ts`, which carries the real dimensional standard
    // per family. An earlier version of this module hardcoded a three-value axis of its own;
    // this asserts the delegation, so reintroducing that map fails here.
    const cen = queryProfiles({ standardsBodies: ['CEN'] });
    expect(cen.length).toBeGreaterThan(0);
    for (const e of cen) expect(FAMILY_CLASSIFICATION[e.family].standardsBody).toBe('CEN');
    const iram = queryProfiles({ standardsBodies: ['IRAM-IAS'] });
    expect(iram.some((e) => e.family === 'W')).toBe(true);
    expect(iram.some((e) => e.family === 'IPE')).toBe(false);
  });

  it('carries the published standard by name, not a translated word', () => {
    // `EN 10365` is a designation, not a label: it must survive verbatim into the row.
    const ipe = steelProfileSource.byId('IPE 200')!;
    expect(ipe.standard).toBe(FAMILY_CLASSIFICATION.IPE.standard);
    expect(ipe.standard).toMatch(/EN 10365/);
    expect(ipe.standardsBody).toBe('CEN');
  });

  it('a design-code filter delegates to the catalogue rather than guessing', () => {
    // `familiesForCode` refuses a family whose shape merely looks plausible under a code, and
    // that judgement is the catalogue's to make.
    const cirsoc = queryProfiles({ designCode: 'cirsoc-301' });
    expect(cirsoc.length).toBeGreaterThan(0);
    const fams = new Set(cirsoc.map((e) => e.family));
    expect(fams.has('IPN')).toBe(true);
    expect(fams.has('UPN')).toBe(true);
  });

});

describe('grouping', () => {
  it('follows the catalogue order, not the alphabet', () => {
    // Alphabetical would put CHS first and IPE eighth, which is tidy and useless to someone
    // scanning for an I-section.
    const keys = groupByFamily(queryProfiles()).map((g) => g.key);
    const expected = FAMILY_LIST.filter((f) => keys.includes(f));
    expect(keys).toEqual(expected);
  });

  it('drops empty groups instead of rendering headings with nothing under them', () => {
    const groups = groupByFamily(queryProfiles({ families: ['IPE'] }));
    expect(groups.map((g) => g.key)).toEqual(['IPE']);
    expect(groups[0].entries.length).toBeGreaterThan(0);
  });

  it('loses nothing: the groups add up to the query', () => {
    const entries = queryProfiles({ text: '1' });
    const grouped = groupByFamily(entries).flatMap((g) => g.entries);
    expect(grouped.length).toBe(entries.length);
  });
});

describe('the source seam', () => {
  it('exposes only what a replacement would have to implement', () => {
    // The general PRO picker is expected to supply its own source. Keeping the surface to
    // four methods is what makes that a small job rather than a port.
    expect(typeof steelProfileSource.list).toBe('function');
    expect(typeof steelProfileSource.byId).toBe('function');
    expect(typeof steelProfileSource.families).toBe('function');
    expect(typeof steelProfileSource.classify).toBe('function');
    expect(typeof steelProfileSource.designCodes).toBe('function');
  });

  it('an unknown id is null, not a throw', () => {
    expect(steelProfileSource.byId('IPE 999')).toBeNull();
  });

  it('every family it advertises has rows', () => {
    for (const f of populatedFamilies()) {
      expect(queryProfiles({ families: [f] }).length, f).toBeGreaterThan(0);
    }
  });
});

describe('provenance, where a family holds rows from two standards', () => {
  it('gives the merged-in angles their own standard, and leaves the rest alone', () => {
    // The European series and the Argentine one live in the same family array. Before this,
    // every row in it claimed EN 10056-1, including the eleven that are IRAM.
    const european = steelProfileSource.byId('L 50x50x5')!;
    expect(european.standard).toBe('EN 10056-1');
    expect(european.standardsBody).toBe('CEN');
    expect(european.standardDiffersFromFamily).toBe(false);

    const argentine = steelProfileSource.byId('L 63.5x63.5x9.5')!;
    expect(argentine.standard).toBe('IRAM-IAS U 500-558');
    expect(argentine.standardsBody).toBe('IRAM-IAS');
    expect(argentine.standardDiffersFromFamily).toBe(true);
  });

  it('marks exactly the rows the second table supplied — no more, no fewer', () => {
    // Read off `IRAM_L` rather than restated, so the assertion cannot drift from the file it
    // is about. A name-based rule would pass this and fail the day a size is added.
    const marked = new Set(
      queryProfiles({ families: ['L'] }).filter((e) => e.standardDiffersFromFamily).map((e) => e.id),
    );
    expect(marked).toEqual(new Set(IRAM_L.map((p) => p.name)));
    expect(marked.size).toBe(IRAM_L.length);
  });

  it('reports the angles as carrying two standards and every other family as carrying one', () => {
    expect(familyHasMixedStandards('L')).toBe(true);
    // First-appearance order in `ALL_PROFILES`, which lists the Argentine angles before the
    // European ones. Order is asserted rather than sorted away so the group header is stable.
    expect(standardsInFamily('L')).toEqual(['IRAM-IAS U 500-558', 'EN 10056-1']);

    for (const f of populatedFamilies()) {
      if (f === 'L') continue;
      expect(standardsInFamily(f), f).toEqual([FAMILY_CLASSIFICATION[f].standard]);
      expect(familyHasMixedStandards(f), f).toBe(false);
    }
  });

  it('never invents a standard for a row: every one is a published designation', () => {
    // The set of standards in play is closed — it is the family declarations plus the one
    // named in the merged-in table's own header. Anything else would be a fabrication.
    const declared = new Set(Object.values(FAMILY_CLASSIFICATION).map((c) => c.standard));
    declared.add('IRAM-IAS U 500-558');
    for (const e of queryProfiles()) expect(declared, e.id).toContain(e.standard);
  });

  it('filters by publishing body using the row, not the family', () => {
    // This is what the fix buys the PRO picker: asking for IRAM-IAS angles used to return
    // nothing, because the family said CEN for all of them.
    const iramAngles = queryProfiles({ families: ['L'], standardsBodies: ['IRAM-IAS'] });
    expect(iramAngles.length).toBe(IRAM_L.length);
    const cenAngles = queryProfiles({ families: ['L'], standardsBodies: ['CEN'] });
    expect(cenAngles.length).toBeGreaterThan(0);
    expect(iramAngles.length + cenAngles.length).toBe(queryProfiles({ families: ['L'] }).length);
  });
});

describe('the geometric filter', () => {
  it('bounds the depth inclusively, at either end or both', () => {
    const band = queryProfiles({ heightMinMm: 200, heightMaxMm: 300 });
    expect(band.length).toBeGreaterThan(0);
    for (const e of band) {
      expect(e.heightMm, e.id).toBeGreaterThanOrEqual(200);
      expect(e.heightMm, e.id).toBeLessThanOrEqual(300);
    }
    // Inclusive: a profile exactly on the bound is in.
    expect(band.map((e) => e.id)).toContain('IPE 200');
    expect(band.map((e) => e.id)).toContain('IPE 300');

    const onlyMin = queryProfiles({ heightMinMm: 900 });
    expect(onlyMin.length).toBeGreaterThan(0);
    for (const e of onlyMin) expect(e.heightMm).toBeGreaterThanOrEqual(900);
  });

  it('treats an absent bound as no bound, and an unusable one as visibly empty', () => {
    const all = queryProfiles().length;
    expect(queryProfiles({}).length).toBe(all);
    // A half-typed number arrives as NaN. Every comparison against it is false, so the list
    // empties and the panel's empty state explains why — which is better than ignoring what the
    // user typed and showing a list that does not match the filter on screen.
    expect(queryProfiles({ heightMinMm: Number.NaN }).length).toBe(0);
    expect(queryProfiles({ heightMinMm: undefined, heightMaxMm: undefined }).length).toBe(all);
  });

  it('composes with the other axes rather than replacing them', () => {
    const both = queryProfiles({ families: ['IPE'], heightMinMm: 300, heightMaxMm: 400 });
    expect(both.length).toBeGreaterThan(0);
    for (const e of both) {
      expect(e.family).toBe('IPE');
      expect(e.heightMm).toBeGreaterThanOrEqual(300);
      expect(e.heightMm).toBeLessThanOrEqual(400);
    }
  });
});
