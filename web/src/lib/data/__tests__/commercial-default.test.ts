/**
 * When a chosen profile brings its steel with it, and when it must not.
 *
 * The rule is one line — apply the grade only if nobody chose a steel on
 * purpose — but it guards two opposite failures, and the destructive one is
 * silent. Applying always would overwrite the deliberate choice of an engineer
 * verifying an existing structure, who sets the steel FIRST because that is the
 * fact they were given, and then tries sections against it. They would be
 * looking at the section when the material changed underneath them.
 *
 * Applying never is what the app did until now: this mechanism existed, was
 * tested, and was wired to nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  commercialDefaultFor, materialFromGrade, findMaterialWithGrade,
} from '../commercial-default';
import { gradeById } from '../structural-grades';

describe('a section chosen for a member with no catalogued steel', () => {
  it('brings the grade its family is rolled in', () => {
    const g = commercialDefaultFor('IPN', { userDefined: false }, 'AR');
    expect(g?.id).toBe('iram-f24');
  });

  it('gives the wide-flange series the different steel it is really rolled in', () => {
    // The whole reason this is per-family: W is F-36 here while everything
    // else Acindar rolls is F-24.
    expect(commercialDefaultFor('W', { userDefined: false }, 'AR')?.id).toBe('iram-f36');
    expect(commercialDefaultFor('IPN', { userDefined: false }, 'AR')?.id).toBe('iram-f24');
  });

  it('follows the region the user filtered by', () => {
    // One family, three countries, three steels.
    expect(commercialDefaultFor('W', { userDefined: false }, 'US')?.id).toBe('astm-a992');
    expect(commercialDefaultFor('W', { userDefined: false }, 'BR')?.id).toBe('astm-a572-50');
    expect(commercialDefaultFor('W', { userDefined: false }, 'EU')).toBeNull();  // none recorded
  });

  it('gives a European frame European steel', () => {
    expect(commercialDefaultFor('IPE', { userDefined: false }, 'EU')?.id).toBe('en-s355');
    expect(commercialDefaultFor('HEB', { userDefined: false }, 'EU')?.id).toBe('en-s355');
  });

  it('falls back to the first recorded practice when no code is selected', () => {
    // Not nothing: a profile with no country attached still comes from
    // somewhere, and the table lists local practice first for the families
    // that have it.
    expect(commercialDefaultFor('IPN', { userDefined: false }, null)?.id).toBe('iram-f24');
    expect(commercialDefaultFor('IPN', { userDefined: false }, undefined)?.id).toBe('iram-f24');
  });
});

describe('a deliberate choice is never overwritten', () => {
  it('leaves a material that came from the catalogue alone', () => {
    // The destructive case. An engineer set S355 and is now trying sections
    // against it; changing the section must not change the steel.
    expect(commercialDefaultFor('IPN', { gradeId: 'en-s355' }, 'AR')).toBeNull();
  });

  it('leaves it alone even when the pairing is an unusual one', () => {
    // An IPN in F-36 draws the pairing NOTE — a statement about supply — and
    // that is the whole response. Warning and silently correcting are
    // different things, and only one of them respects the user.
    expect(commercialDefaultFor('IPN', { userDefined: false, gradeId: 'iram-f36' }, 'AR')).toBeNull();
  });

  it('leaves a material the user entered by its own numbers alone', () => {
    expect(commercialDefaultFor('IPN', { userDefined: true }, 'AR')).toBeNull();
  });

  it('requires a known automatic material', () => {
    // A material exists, it just did not come from the catalogue: nobody chose
    // a steel, they got whatever the model was created with.
    expect(commercialDefaultFor('IPN', { userDefined: false }, 'AR')?.id).toBe('iram-f24');
    expect(commercialDefaultFor('IPN', undefined, 'AR')).toBeNull();
    expect(commercialDefaultFor('IPN', {}, 'AR')).toBeNull();
  });
});

describe('families and grades that have no answer', () => {
  it('says nothing for a family with no recorded practice', () => {
    expect(commercialDefaultFor('T', { userDefined: false }, 'US')).toBeNull();
    expect(commercialDefaultFor('CHS', { userDefined: false }, 'EU')).toBeNull();
  });

  it('says nothing for a family it does not know', () => {
    expect(commercialDefaultFor('ZZZ', { userDefined: false }, 'AR')).toBeNull();
    expect(commercialDefaultFor(undefined, { userDefined: false }, 'AR')).toBeNull();
  });
});

describe('the material a grade produces', () => {
  it('carries the grade properties and its identity', () => {
    const g = gradeById('iram-f24')!;
    const m = materialFromGrade(g);
    expect(m.name).toBe('F-24');
    expect(m.fy).toBe(240);
    expect(m.e).toBe(g.e);
    expect(m.nu).toBe(g.nu);
    expect(m.rho).toBe(g.rho);
    // Stored, not inferred from the name: a user can rename a material.
    expect(m.gradeId).toBe('iram-f24');
  });

  it('is named as it is written on a drawing', () => {
    expect(materialFromGrade(gradeById('astm-a992')!).name).toBe('A992');
    expect(materialFromGrade(gradeById('en-s355')!).name).toBe('S355');
  });
});

describe('reusing a material the model already has', () => {
  const materials = [
    { id: 1, gradeId: undefined },
    { id: 2, gradeId: 'iram-f24' },
    { id: 3, gradeId: 'astm-a992' },
  ];

  it('finds one carrying the grade, so twenty members share one steel', () => {
    expect(findMaterialWithGrade(materials, 'iram-f24')?.id).toBe(2);
    expect(findMaterialWithGrade(materials, 'astm-a992')?.id).toBe(3);
  });

  it('returns nothing when the model has none, so the caller creates it', () => {
    expect(findMaterialWithGrade(materials, 'en-s355')).toBeUndefined();
  });

  it('does not match a material that has no grade at all', () => {
    expect(findMaterialWithGrade(materials, undefined as never)).toBeUndefined();
  });
});
