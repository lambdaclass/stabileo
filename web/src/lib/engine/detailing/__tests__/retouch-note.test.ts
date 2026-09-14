/**
 * Objective 11 — the sentence every export carries about its hand edits.
 *
 * ── Why this is one function and not three ─────────────────────────
 *
 * The report, the DXF note block and the schedule's header all print it, and they must not be
 * able to disagree. The failure that matters is not a typo: it is one of the three writers
 * rendering `unknown` the way it renders `known`-and-empty, which turns "we have no record"
 * into "none were" on a document somebody signs.
 */

import { describe, expect, it } from 'vitest';
import { retouchNote } from '../document-render';
import {
  RC_RETOUCH_NOT_APPLICABLE, RC_RETOUCH_UNKNOWN, rcRetouch,
} from '../../../flow/rc-selection';

describe('retouchNote', () => {
  it('says nothing when the caller supplied no provenance', () => {
    expect(retouchNote(undefined, 'es')).toBeNull();
  });

  /* Nothing designed: the question has no subject, and inventing a doubt about a set that
     cannot have members is what `rcRetouchProvenance` refuses to do. */
  it('says nothing when nothing was designed', () => {
    expect(retouchNote(RC_RETOUCH_NOT_APPLICABLE, 'es')).toBeNull();
  });

  /*
   * The one that matters. These two are the pair a reader must never confuse, so the test
   * asserts they are not merely different strings but that neither can be read as the other.
   */
  it('never lets "no record" read as "none"', () => {
    const unknown = retouchNote(RC_RETOUCH_UNKNOWN, 'en')!;
    const none = retouchNote(rcRetouch([]), 'en')!;
    expect(unknown).not.toBe(none);
    expect(unknown).toContain('NO RECORD');
    expect(unknown).toContain('does not mean no reinforcement was retouched');
    expect(none).toContain('none');
    expect(none).not.toContain('NO RECORD');
  });

  it('names the members when there are any, and counts them', () => {
    const note = retouchNote(rcRetouch([7, 3]), 'en')!;
    expect(note).toContain('2 member(s)');
    // Sorted by `rcRetouch`, so two readings of one project produce one sentence.
    expect(note).toContain('3, 7');
  });

  /*
   * A hand-edited member is still verified — against the steel that is there. The sentence has
   * to say which, because a reader who took it to mean "unverified" would reject work that was
   * checked, and one who took it to mean "as designed" would accept an arrangement the
   * automatic design never produced.
   */
  it('states what the verification of a retouched member is OF', () => {
    expect(retouchNote(rcRetouch([3]), 'en')!)
      .toContain('the steel that is there, not of the automatic design it replaced');
  });

  it('speaks Spanish for an es locale, in all three states', () => {
    expect(retouchNote(RC_RETOUCH_UNKNOWN, 'es')!).toContain('SIN REGISTRO');
    expect(retouchNote(rcRetouch([]), 'es')!).toContain('ninguno');
    expect(retouchNote(rcRetouch([3]), 'es')!).toContain('editada a mano');
  });
});
