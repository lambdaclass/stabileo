/**
 * The scope of a document, and the two directions it may not move in.
 *
 * ── The state this file makes unreachable ──────────────────────────
 *
 * A user designs beams and columns, runs the detailing, then unticks `column` in Diseñar. Before
 * this rule the drawing set's banner said "SCOPE: beams" and its sheets drew the columns — three
 * ways to ask what the document covers, and no way for the reader on site to find the seam.
 *
 * The product rule, confirmed 2026-08-27: Diseñar owns the family scope, Documentos may narrow it
 * to individual elements, and Documentos may NEVER widen it. Adding a family is done in Diseñar or
 * it is not done.
 *
 * ── What is deliberately NOT asserted ──────────────────────────────
 *
 * That an unclassifiable member is dropped. It is not: a model edited after the detailing ran
 * leaves members in the drawing whose `MemberContext` is gone, and silently removing steel from a
 * drawing set is the one failure this may not trade for tidiness. They stay in the base and are
 * named as `unclassified`.
 */

import { describe, expect, it } from 'vitest';
import {
  documentScopeBlocker, resolveDocumentScope, type RcDocumentableMember,
} from '../rc-document-scope';

const m = (
  elementId: number, ...families: RcDocumentableMember['families']
): RcDocumentableMember => ({ elementId, families });

/** Beams 1–2 and columns 10–11 in the drawing, which is the ordinary frame. */
const FRAME: RcDocumentableMember[] = [
  m(2, 'beam'), m(1, 'beam'), m(11, 'column'), m(10, 'column'),
];

describe('the base set is the design scope, measured on the drawing', () => {
  it('is every member of the drawing when every family is selected', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: null,
    });
    expect(s.base).toEqual([1, 2, 10, 11]);
    expect(s.elements).toEqual([1, 2, 10, 11]);
    expect(s.whole).toBe(true);
    expect(s.excluded).toEqual([]);
    expect(s.families).toEqual(['column', 'beam']);
  });

  it('excludes a family the design scope does not contain, and names its members', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam'], requested: null,
    });
    expect(s.base, 'the columns are not documentable from here').toEqual([1, 2]);
    expect(s.excluded.map((e) => e.elementId)).toEqual([10, 11]);
    expect(s.excluded.every((e) => e.families.includes('column'))).toBe(true);
    expect(s.families).toEqual(['beam']);
    expect(s.designFamilies).toEqual(['beam']);
  });

  it('reports the families in DESIGN_FAMILIES order, not in selection order', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: null,
    });
    expect(s.designFamilies).toEqual(['column', 'beam']);
  });
});

describe('narrowing', () => {
  it('reduces the export to the members asked for', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: [1, 10],
    });
    expect(s.elements).toEqual([1, 10]);
    expect(s.whole).toBe(false);
    expect(s.base).toEqual([1, 2, 10, 11]);
  });

  it('drops a family from the statement when no member of it is selected', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: [1, 2],
    });
    expect(s.families, 'the set contains no column').toEqual(['beam']);
    expect(s.designFamilies, 'the scope it was narrowed FROM is unchanged')
      .toEqual(['column', 'beam']);
  });

  it('a request covering the whole base is not reported as a narrowing', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: [1, 2, 10, 11],
    });
    expect(s.whole).toBe(true);
  });

  it('deduplicates and sorts, so the statement does not depend on click order', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: [10, 1, 10],
    });
    expect(s.elements).toEqual([1, 10]);
  });
});

describe('widening is refused, and the refusal is named', () => {
  it('a member of an unselected family cannot be requested into the set', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam'], requested: [1, 10],
    });
    expect(s.elements, 'the column does not enter').toEqual([1]);
    expect(s.refused, 'and it is not dropped in silence').toEqual([10]);
  });

  it('a member the drawing no longer contains is refused the same way', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: [1, 999],
    });
    expect(s.elements).toEqual([1]);
    expect(s.refused).toEqual([999]);
  });

  it('the whole-base default cannot refuse anything, because it asks for nothing', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam'], requested: null,
    });
    expect(s.refused).toEqual([]);
  });
});

describe('a member nothing can classify stays in the set and says so', () => {
  it('is in the base and named as unclassified', () => {
    const s = resolveDocumentScope({
      members: [...FRAME, m(77)], designFamilies: ['beam', 'column'], requested: null,
    });
    expect(s.base, 'no steel disappears').toContain(77);
    expect(s.unclassified).toEqual([77]);
  });

  it('contributes no family to the statement, because it has none', () => {
    const s = resolveDocumentScope({
      members: [m(77)], designFamilies: ['beam'], requested: null,
    });
    expect(s.families).toEqual([]);
    expect(s.base).toEqual([77]);
  });
});

describe('a member whose steel belongs to two families', () => {
  /**
   * A column standing on a footing. `FootingDesignRecord.ownerElementIds` names the COLUMN,
   * because a footing is an entity and not a member of the model, so the same element carries
   * both families' steel and both statements are true of the same drawing.
   */
  const ON_FOOTING = [m(10, 'column', 'footing'), m(1, 'beam')];

  it('is documentable on a foundations-only run', () => {
    const s = resolveDocumentScope({
      members: ON_FOOTING, designFamilies: ['footing'], requested: null,
    });
    expect(s.base, 'the element the footing drawing draws').toEqual([10]);
    expect(s.families).toEqual(['footing']);
    expect(s.excluded.map((e) => e.elementId), 'the beam is out of scope').toEqual([1]);
  });

  it('names only the families the design scope covers', () => {
    const s = resolveDocumentScope({
      members: ON_FOOTING, designFamilies: ['column'], requested: null,
    });
    expect(s.base).toEqual([10]);
    expect(s.families, 'foundations were not asked for').toEqual(['column']);
  });

  it('names both when both were asked for', () => {
    const s = resolveDocumentScope({
      members: ON_FOOTING, designFamilies: ['column', 'footing'], requested: null,
    });
    expect(s.families).toEqual(['column', 'footing']);
  });
});

describe('the two empties are different answers', () => {
  it('nothing documentable is a project-level refusal', () => {
    const s = resolveDocumentScope({
      members: [], designFamilies: ['beam'], requested: null,
    });
    expect(s.base).toEqual([]);
    expect(s.emptySelection, 'nobody unticked anything').toBe(false);
    expect(documentScopeBlocker(s)).toBe('noBase');
  });

  it('everything unticked is one click from being fixed', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: [],
    });
    expect(s.emptySelection).toBe(true);
    expect(documentScopeBlocker(s)).toBe('emptySelection');
  });

  it('a full base with a real selection blocks nothing', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: [2],
    });
    expect(documentScopeBlocker(s)).toBe(null);
  });

  it('a request of ids none of which exist blocks as an empty selection, not as no base', () => {
    const s = resolveDocumentScope({
      members: FRAME, designFamilies: ['beam', 'column'], requested: [404],
    });
    expect(s.refused).toEqual([404]);
    expect(documentScopeBlocker(s)).toBe('emptySelection');
  });
});

describe('a repeated member is one member', () => {
  it('the first classification wins and the id appears once', () => {
    const s = resolveDocumentScope({
      members: [m(5, 'beam'), m(5, 'beam')], designFamilies: ['beam'], requested: null,
    });
    expect(s.base).toEqual([5]);
  });
});
