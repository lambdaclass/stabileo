/**
 * Objective 8 — the rótulo, and the line between what the author writes and what the app states.
 *
 * The assertions that matter are the ones about that line: a declared code is marked, a
 * verified one cannot be overwritten by a declaration, and a field that would break a DXF
 * entity is collapsed rather than let through.
 */

import { describe, expect, it } from 'vitest';
import {
  rcTitleField, rcNormaliseTitleBlock, rcTitleBlockCodes, rcTitleBlockNamed,
  RC_TITLE_BLOCK_LIMITS, RC_MAX_DECLARED_CODES,
} from '../title-block-config';

const BOUND = [
  { label: 'CIRSOC 201', edition: '2025', jurisdiction: 'Nacional' },
  { label: 'CIRSOC 103', edition: '2013' },
];

describe('a field is one line, and short', () => {
  it('collapses the whitespace a paste brings with it', () => {
    expect(rcTitleField('  Edificio\n Los\tÁlamos  ', 80)).toBe('Edificio Los Álamos');
  });

  /*
   * A newline inside a DXF `TEXT` group breaks the entity and CAD refuses the file. The
   * failure is silent at the point of typing and appears on somebody else's screen.
   */
  it('lets no newline through, whatever the limit', () => {
    expect(rcTitleField('a\nb\r\nc', 80)).not.toMatch(/[\r\n]/);
  });

  it('clips to the limit without leaving a trailing space', () => {
    const out = rcTitleField(`${'x'.repeat(40)} ${'y'.repeat(40)}`, 41);
    expect(out).toHaveLength(40);
    expect(out).not.toMatch(/\s$/);
  });

  it('treats an absent field as an empty one', () => {
    expect(rcTitleField(undefined, 80)).toBe('');
    expect(rcTitleField('   ', 80)).toBe('');
  });
});

describe('normalising the config', () => {
  it('drops empty fields rather than storing blanks', () => {
    expect(rcNormaliseTitleBlock({ project: '  ', subtitle: '', declaredCodes: ['', ' '] }))
      .toEqual({});
  });

  it('keeps what was written, normalised', () => {
    expect(rcNormaliseTitleBlock({
      project: ' Edificio  Los Álamos ', office: 'Estudio X', declaredCodes: [' NBR 6118 '],
    })).toEqual({
      project: 'Edificio Los Álamos', office: 'Estudio X', declaredCodes: ['NBR 6118'],
    });
  });

  /* Two identical lines on a rótulo read as two instruments whose names happen to match. */
  it('deduplicates declared codes', () => {
    expect(rcNormaliseTitleBlock({ declaredCodes: ['NBR 6118', 'NBR 6118'] }).declaredCodes)
      .toEqual(['NBR 6118']);
  });

  it('bounds how many codes an author may declare', () => {
    const many = Array.from({ length: RC_MAX_DECLARED_CODES + 3 }, (_, i) => `Code ${i}`);
    expect(rcNormaliseTitleBlock({ declaredCodes: many }).declaredCodes)
      .toHaveLength(RC_MAX_DECLARED_CODES);
  });

  it('clips each field to its own limit', () => {
    const c = rcNormaliseTitleBlock({
      project: 'p'.repeat(200), subtitle: 's'.repeat(200), office: 'o'.repeat(200),
    });
    expect(c.project).toHaveLength(RC_TITLE_BLOCK_LIMITS.project);
    expect(c.subtitle).toHaveLength(RC_TITLE_BLOCK_LIMITS.subtitle);
    expect(c.office).toHaveLength(RC_TITLE_BLOCK_LIMITS.office);
  });
});

describe('the codes a sheet prints', () => {
  it('states every bound regulation, with its edition and jurisdiction', () => {
    const codes = rcTitleBlockCodes(BOUND);
    expect(codes.map((c) => c.text)).toEqual([
      'CIRSOC 201 · 2025 (Nacional)', 'CIRSOC 103 · 2013',
    ]);
    expect(codes.every((c) => c.source === 'verified')).toBe(true);
  });

  /*
   * The whole reason the two are not one list of strings. A declared code is a statement by the
   * author that this application did not check, and a rótulo that presented it like the others
   * would be making a claim on the app's behalf.
   */
  it('marks an author’s own code as declared, and qualifies it', () => {
    const codes = rcTitleBlockCodes(BOUND, { declaredCodes: ['Ordenanza municipal 4711'] });
    const own = codes.find((c) => c.text === 'Ordenanza municipal 4711')!;
    expect(own.source).toBe('declared');
    expect(own.qualifierKey).toBe('detailing.titleBlock.declared');
  });

  it('puts the verified ones first, always', () => {
    const codes = rcTitleBlockCodes(BOUND, { declaredCodes: ['AAA — sorts first alphabetically'] });
    expect(codes[0].source).toBe('verified');
    expect(codes[codes.length - 1].source).toBe('declared');
  });

  /*
   * A declaration cannot overwrite what the run used. Printed twice — once qualified as
   * unverified — a reader would reasonably conclude the two lines meant different things.
   */
  it('drops a declaration that repeats a verified code', () => {
    const codes = rcTitleBlockCodes(BOUND, { declaredCodes: ['CIRSOC 201 · 2025 (Nacional)'] });
    expect(codes.filter((c) => c.text.startsWith('CIRSOC 201'))).toHaveLength(1);
    expect(codes[0].source).toBe('verified');
  });

  it('prints the verified codes even when the author configured nothing', () => {
    expect(rcTitleBlockCodes(BOUND, {})).toHaveLength(2);
  });

  it('prints nothing when nothing governs and nothing was declared', () => {
    expect(rcTitleBlockCodes([], {})).toEqual([]);
  });

  it('does not repeat a bound regulation bound twice under two roles', () => {
    expect(rcTitleBlockCodes([BOUND[0], BOUND[0]])).toHaveLength(1);
  });
});

describe('whether the project has a name', () => {
  /* An unnamed project is a normal state, and must be distinguishable from one called
     "Project" — which is what every export used to be headed with. */
  it('is false for a project nobody has named', () => {
    expect(rcTitleBlockNamed({})).toBe(false);
    expect(rcTitleBlockNamed({ project: '   ' })).toBe(false);
  });

  it('is true once it is named', () => {
    expect(rcTitleBlockNamed({ project: 'Los Álamos' })).toBe(true);
  });
});
