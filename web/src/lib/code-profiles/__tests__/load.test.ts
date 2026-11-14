import { describe, expect, it } from 'vitest';
import { indexProfiles, mergeInto, ProfileError, resolveProfile } from '../load';
import { toConfirmPaths, validateProfile } from '../validate';
import { loadsProfile, rcProfile, SHIPPED_PROFILES } from '../registry';
import { clauseOf } from '../cite';
import { PSF, LBF_KN, MPH } from '../units';
import type { KeyedTable, LoadsProfile, RcProfile, Val } from '../types';
import en1992 from '../profiles/rc/en-1992-1-1.json';

type Doc = Record<string, any>;
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const meta = (id: string, over: Doc = {}): Doc => ({
  schema: 1, id, role: 'loads', title: id, edition: '2020', revision: 1, country: 'XX', maturity: 'draft',
  maintainers: [], sources: [{ id: 'XS 1', title: 'Example standard', edition: '2020' }], ...over,
});

const loads = (over: Doc = {}): Doc => ({
  meta: meta('xs-loads'),
  imposed: {
    occupancies: {
      units: { q: 'kN/m2', Q: 'kN' }, cite: [{ clause: 'Table 1' }], labelPrefix: 'loads.xs.',
      rows: [{ key: 'xs-office', kind: 'office', q: 2.5, Q: 3 }, { key: 'xs-store', kind: 'storage', q: 7.5, noReduction: true }],
    },
  },
  ...over,
});

const issuesOf = (doc: unknown) => validateProfile(doc).map((i) => i.path);

function failure(fn: () => unknown): ProfileError {
  try { fn(); } catch (e) { if (e instanceof ProfileError) return e; throw e; }
  throw new Error('expected a ProfileError');
}

describe('the shipped profiles', () => {
  it('all resolve with no issue', () => {
    for (const d of SHIPPED_PROFILES) {
      const id = (d as Doc).meta.id as string;
      const p = (d as Doc).meta.role === 'rc' ? rcProfile(id) : loadsProfile(id);
      expect(p.meta.id).toBe(id);
    }
  });

  it('a profile asked for under another role is refused', () => {
    expect(failure(() => loadsProfile('en-1992-1-1')).issues).toEqual([{ path: 'meta.role', message: 'is rc, not loads' }]);
  });
});

describe('extends', () => {
  it('the UK concrete annex inherits what it does not change and overrides what it does', () => {
    const en = rcProfile('en-1992-1-1'), uk = rcProfile('bs-en-1992-1-1');
    expect(uk.meta.extends).toBe('en-1992-1-1');
    expect(uk.resistance).toMatchObject({ kind: 'gamma', gammaC: { v: 1.5 }, alphaCC: { v: 0.85 } });
    expect(en.resistance).toMatchObject({ alphaCC: { v: 1 } });
    expect(uk.punching.vmax!.k).toEqual({ c: 0.5 });
    expect(uk.shear).toEqual(en.shear);
    expect(uk.meta.sources.map((s) => s.id)).toEqual(['EN 1992-1-1', 'NA to BS EN 1992-1-1']);
    expect(clauseOf(uk.meta, (uk.resistance as { alphaCC: Val }).alphaCC.cite)).toMatchObject({ regulation: 'NA to BS EN 1992-1-1', edition: '2005', clause: 'NA to 3.1.6(1)P' });
    expect(clauseOf(uk.meta, (uk.resistance as { gammaC: Val }).gammaC.cite)).toMatchObject({ regulation: 'EN 1992-1-1', edition: '2004' });
  });

  it('a keyed table is patched row by row, and a list is replaced whole', () => {
    const en = loadsProfile('en-1990-1991'), uk = loadsProfile('en-1990-1991-uk');
    const psi = (p: LoadsProfile) => (p.combinations as { psi: KeyedTable }).psi;
    expect(psi(uk).rows.H).toEqual([0.7, 0, 0]);
    expect(psi(uk).rows.A).toEqual(psi(en).rows.A);
    expect(psi(uk).columns).toEqual(['psi0', 'psi1', 'psi2']);
    expect(uk.imposed.occupancies.rows.map((r) => r.key)).not.toContain('ec-B');
    expect(uk.imposed.occupancies.labelPrefix).toBe(en.imposed.occupancies.labelPrefix);
  });

  it('null removes what the parent declared', () => {
    expect(mergeInto({ a: { b: 1, c: 2 }, d: 3 }, { a: { c: null }, d: null })).toEqual({ a: { b: 1 } });
  });

  it('the meta is never inherited, only the sources add up', () => {
    const child = { meta: meta('xs-child', { extends: 'xs-loads', title: 'Child', sources: [{ id: 'XS 2', title: 'Annex', edition: '2021' }] }) };
    const p = resolveProfile('xs-child', indexProfiles([loads(), child]));
    expect(p.meta.title).toBe('Child');
    expect(p.meta.sources.map((s) => s.id)).toEqual(['XS 1', 'XS 2']);
    expect((p as LoadsProfile).imposed.occupancies.rows).toHaveLength(2);
  });

  it('a missing parent and a cycle are reported', () => {
    const orphan = { meta: meta('xs-orphan', { extends: 'xs-nowhere' }) };
    expect(failure(() => resolveProfile('xs-orphan', indexProfiles([orphan]))).issues[0]!.message).toBe('no profile "xs-nowhere"');
    const a = { ...loads(), meta: meta('xs-a', { extends: 'xs-b' }) }, b = { meta: meta('xs-b', { extends: 'xs-a' }) };
    expect(failure(() => resolveProfile('xs-a', indexProfiles([a, b]))).issues[0]!.message).toBe('extends itself through xs-a → xs-b → xs-a');
  });

  it('two documents with one id are refused', () => {
    expect(failure(() => indexProfiles([loads(), loads()])).issues[0]!.message).toBe('two profiles share this id');
  });
});

describe('required fields', () => {
  it('a concrete profile without γc names the field', () => {
    const doc: Doc = copy(en1992);
    delete doc.resistance.gammaC;
    expect(issuesOf(doc)).toEqual(['resistance.gammaC']);
    expect(failure(() => resolveProfile('en-1992-1-1', indexProfiles([doc]))).message).toContain('resistance.gammaC: required');
  });

  it('a loads profile without occupancies, a meta without a source, a value without a cite', () => {
    expect(issuesOf(loads({ imposed: {} }))).toEqual(['imposed.occupancies']);
    expect(issuesOf({ ...loads(), meta: meta('xs', { sources: [] }) })).toEqual(['meta.sources']);
    const doc: Doc = copy(en1992);
    delete doc.columns.rhoMax.cite;
    expect(validateProfile(doc)).toContainEqual({ path: 'columns.rhoMax', message: 'a value needs a cite' });
  });

  it('a formula outside the catalog, or with a coefficient missing or extra', () => {
    const doc: Doc = copy(en1992);
    doc.beams.minSteel.f = 'minSteel.free';
    doc.shear.k = { ...doc.shear.k, crdc: undefined, extra: 1 };
    expect(validateProfile(doc)).toEqual(expect.arrayContaining([
      { path: 'beams.minSteel.f', message: '"minSteel.free" is not in the formula catalog' },
      { path: 'shear.k.crdc', message: 'missing coefficient' },
      { path: 'shear.k.extra', message: '"shear.variableStrut" has no coefficient "extra"' },
    ]));
  });

  it('ψ out of order, a duplicate key and a table whose values do not match its axes', () => {
    const doc: Doc = copy(en1992);
    doc.beams.xuLimit.values = [0.45];
    expect(issuesOf(doc)).toEqual(['beams.xuLimit.values']);
    const l = loads({ combinations: { form: 'generated', gamma: { gSup: { v: 1.35, cite: { clause: 'A' } }, gInf: { v: 1, cite: { clause: 'A' } }, q: { v: 1.5, cite: { clause: 'A' } } },
      psi: { unit: '-', cite: { clause: 'B' }, columns: ['psi0', 'psi1', 'psi2'], rows: { A: [0.3, 0.5, 0.7] } }, exclusive: [], notActing: true } });
    l.imposed.occupancies.rows.push({ key: 'xs-office', kind: 'office', q: 1 });
    expect(issuesOf(l)).toEqual(['imposed.occupancies.rows.2.key', 'combinations.psi.rows.A']);
  });
});

describe('units', () => {
  it('an unknown unit, and a unit the field cannot take, are refused', () => {
    const doc: Doc = copy(en1992);
    doc.materials.steel.es.unit = 'ksi-ish';
    expect(validateProfile(doc)).toEqual([{ path: 'materials.steel.es.unit', message: 'unknown unit "ksi-ish"' }]);
    const l = loads();
    l.imposed.occupancies.units.q = 'kN';
    expect(issuesOf(l)).toEqual(['imposed.occupancies.units.q']);
  });

  it('imperial values come out in SI, by the same products the code used', () => {
    const l = loads();
    l.imposed.occupancies.units = { q: 'psf', Q: 'lbf' };
    l.imposed.occupancies.rows = [{ key: 'xs-office', kind: 'office', q: 50, Q: 2000 }, { key: 'xs-trucks', kind: 'parking', q: null }];
    l.wind = { density: { v: 1.25, unit: 'kg/m3', cite: { clause: 'W' } }, speed: { v: 115, unit: 'mph', cite: { clause: 'W' } } };
    const p = resolveProfile('xs-loads', indexProfiles([l])) as LoadsProfile & { wind: Doc };
    expect(p.imposed.occupancies.units).toEqual({ q: 'kN/m2', Q: 'kN' });
    expect(p.imposed.occupancies.rows[0]).toMatchObject({ q: 50 * PSF, Q: 2000 * LBF_KN });
    expect(p.imposed.occupancies.rows[1]!.q).toBeNull();
    expect(p.wind.speed).toMatchObject({ v: 115 * MPH, unit: 'm/s' });
    expect(p.wind.density).toMatchObject({ v: 1.25, unit: 'kg/m3' });
    expect(l.imposed.occupancies.rows[0].q).toBe(50);
  });
});

describe('status', () => {
  it('a value without a status is transcribed; an unknown status is refused', () => {
    const doc: Doc = copy(en1992);
    expect(toConfirmPaths(doc)).toEqual([]);
    doc.resistance.gammaS.status = 'probably';
    expect(validateProfile(doc)).toEqual([{ path: 'resistance.gammaS.status', message: 'unknown status "probably"' }]);
  });

  it('every value to confirm is listed, and a validated profile may hold none', () => {
    const doc: Doc = copy(en1992);
    doc.resistance.alphaCT.status = 'toConfirm';
    doc.beams.xuLimit.status = 'checked';
    expect(toConfirmPaths(doc)).toEqual(['resistance.alphaCT']);
    expect(validateProfile(doc)).toEqual([]);
    doc.meta.maturity = 'validated';
    expect(validateProfile(doc)).toEqual([{ path: 'resistance.alphaCT', message: 'a validated profile cannot hold a value to confirm' }]);
    const p = resolveProfile('en-1992-1-1', indexProfiles([{ ...doc, meta: { ...doc.meta, maturity: 'provisional' } }])) as RcProfile;
    expect((p.resistance as { alphaCT: Val }).alphaCT.status).toBe('toConfirm');
  });
});
