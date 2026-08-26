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
  RC_TITLE_BLOCK_LIMITS,
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
    expect(rcNormaliseTitleBlock({ project: '  ', subtitle: '' })).toEqual({});
  });

  it('keeps what was written, normalised', () => {
    expect(rcNormaliseTitleBlock({ project: ' Edificio  Los Álamos ', office: 'Estudio X' }))
      .toEqual({ project: 'Edificio Los Álamos', office: 'Estudio X' });
  });

  it('clips each field to its own limit', () => {
    const c = rcNormaliseTitleBlock({
      project: 'p'.repeat(200), subtitle: 's'.repeat(200), office: 'o'.repeat(200),
    });
    expect(c.project).toHaveLength(RC_TITLE_BLOCK_LIMITS.project);
    expect(c.subtitle).toHaveLength(RC_TITLE_BLOCK_LIMITS.subtitle);
    expect(c.office).toHaveLength(RC_TITLE_BLOCK_LIMITS.office);
  });

  /*
   * The author's half carries no codes at all. An earlier draft let one declare an extra
   * regulation; it is out by decision, and a stored project that still carries the field must
   * not be able to smuggle it back onto a sheet.
   */
  it('drops a declared-code field left over from an older project', () => {
    const legacy = { project: 'Obra', declaredCodes: ['Ordenanza 4711'] } as never;
    expect(rcNormaliseTitleBlock(legacy)).toEqual({ project: 'Obra' });
  });
});

describe('the codes a sheet prints', () => {
  it('states every bound regulation, with its edition and jurisdiction', () => {
    expect(rcTitleBlockCodes(BOUND).map((c) => c.text)).toEqual([
      'CIRSOC 201 · 2025 (Nacional)', 'CIRSOC 103 · 2013',
    ]);
  });

  /*
   * The whole point of the decision. The rótulo is a projection of the Reglamentos stage, so
   * the function takes the bindings and NOTHING else — there is no second argument an author's
   * text could arrive through, which is what makes "not editable" a property of the type rather
   * than a rule somebody has to remember.
   */
  it('takes the bindings and nothing else', () => {
    expect(rcTitleBlockCodes.length).toBe(1);
  });

  it('follows the bindings when they change', () => {
    const before = rcTitleBlockCodes(BOUND);
    const after = rcTitleBlockCodes([{ label: 'CIRSOC 201', edition: '2005' }]);
    expect(after.map((c) => c.text)).toEqual(['CIRSOC 201 · 2005']);
    expect(after).not.toEqual(before);
  });

  it('prints nothing when nothing governs', () => {
    expect(rcTitleBlockCodes([])).toEqual([]);
  });

  /* One instrument bound to two roles is one line: printed twice it reads as two instruments
     whose names happen to match. */
  it('does not repeat a regulation bound twice under two roles', () => {
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
