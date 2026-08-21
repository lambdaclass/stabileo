/**
 * The catalogue as a source: query, group, and the identifier that must not drift.
 *
 * These are the assertions the UI rests on, kept out of the UI so a component test never has
 * to prove that a search works — only that it is wired.
 */

import { describe, it, expect } from 'vitest';
import {
  queryProfiles, groupByFamily, steelProfileSource, populatedFamilies,
} from '../catalogue';
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
