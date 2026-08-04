/**
 * Edition availability and rule provenance — the gates.
 *
 * ── The rule these enforce ─────────────────────────────────────────
 *
 * An edition may be NAMED and explained. It may only be APPLIED when its official text is
 * supplied and its rules are implemented against that text. There is no fallback: an
 * unavailable edition does not borrow another edition's rules, because a result that cites a
 * rule it did not apply is worse than no result.
 *
 * ── Why these are gates and not unit tests ─────────────────────────
 *
 * Each one closes a defect that was actually present:
 *
 *   - `bar-geometry.ts` relabelled Tables 25.3.1/25.3.2 as CIRSOC 201-2005 §7.1/§7.2 while
 *     returning identical numbers, and one `clause(…, edition, 'Tabla 25.3.1', …)` call
 *     stamped a 2025 TABLE IDENTIFIER with whatever edition was passed — so a 2005 project
 *     produced the citation "CIRSOC 201 2005 Tabla 25.3.1", naming a table that edition does
 *     not contain.
 *   - `spacing.ts` cited 2005 §7.6.1/§7.6.2/§7.6.3 with numbers no supplied text backs.
 *   - `roles.ts` offered CIRSOC 201-2005 in the concrete selector, so it could be applied.
 *
 * The gates are written against the generic catalogue and clause layers, not against CIRSOC,
 * so a future edition or regulation is covered by them automatically.
 */

import { describe, expect, it } from 'vitest';
import {
  REGULATION_ROLES, ROLE_CATALOG, allOptionsForRole, availabilityOf, bindRole,
  optionIsAvailable, optionsForRole,
} from '../roles';
import { REGULATIONS, findRegulation, isAvailable, type EditionAvailability } from '../regulation';
import {
  minClearSpacingFor, minClearBetweenLayers, minClearSpacingInLayer, minClearSpacingColumn,
} from '../cirsoc201/spacing';
import { transverseSpacingLimits } from '../cirsoc201/transverse-spacing';

// ─── The availability model itself ────────────────────────────────

describe('the availability model', () => {
  it('distinguishes "text not supplied" from "not implemented"', () => {
    // Different remedies, so they must be different states. A user who owns the 2005 text
    // needs to know that supplying it is what unblocks them.
    const all: EditionAvailability[] = ['AVAILABLE', 'UNAVAILABLE_SOURCE', 'UNSUPPORTED'];
    expect(all.filter(isAvailable)).toEqual(['AVAILABLE']);
  });

  it('defaults to AVAILABLE so the catalogue stays terse', () => {
    const withoutField = ROLE_CATALOG.find((o) => o.availability === undefined);
    expect(withoutField).toBeDefined();
    expect(availabilityOf(withoutField!)).toBe('AVAILABLE');
  });
});

// ─── Selectors expose no unavailable edition ──────────────────────

describe('selectors expose only AVAILABLE editions', () => {
  it('holds for every role, generically', () => {
    for (const role of REGULATION_ROLES) {
      for (const o of optionsForRole(role)) {
        expect(optionIsAvailable(o), `${role}/${o.adapterId}`).toBe(true);
      }
    }
  });

  it('retains reserved metadata outside the selector, so nothing is lost', () => {
    const reservedSomewhere = REGULATION_ROLES
      .flatMap((r) => allOptionsForRole(r))
      .filter((o) => !optionIsAvailable(o));
    expect(reservedSomewhere.length).toBeGreaterThan(0);
    // Every reserved option still carries the identity a future adapter needs.
    for (const o of reservedSomewhere) {
      expect(o.adapterId).toBeTruthy();
      expect(o.nameKey).toBeTruthy();
      expect(o.edition).toBeTruthy();
      // And it explains itself rather than being silently missing.
      expect(o.noteKey, o.adapterId).toBeTruthy();
    }
  });

  it('CIRSOC 201-2005 specifically: reserved, explained, not selectable', () => {
    const offered = optionsForRole('concrete').filter((o) => o.regulation === 'cirsoc-201');
    expect(offered.map((o) => o.edition)).toEqual(['2025']);
    const reserved = allOptionsForRole('concrete')
      .find((o) => o.regulation === 'cirsoc-201' && o.edition === '2005')!;
    expect(availabilityOf(reserved)).toBe('UNAVAILABLE_SOURCE');
    expect(reserved.noteKey).toBe('regulations.note.editionTextNotSupplied');
    // The premise: the registry records that no text is supplied.
    expect(findRegulation('cirsoc-201', '2005')?.textAvailable).toBe(false);
    expect(findRegulation('cirsoc-201', '2025')?.textAvailable).toBe(true);
  });
});

// ─── Unavailable editions cannot be applied ───────────────────────

describe('unavailable editions cannot be applied', () => {
  it('bindRole refuses every non-available option in the catalogue', () => {
    const reserved = REGULATION_ROLES
      .flatMap((r) => allOptionsForRole(r))
      .filter((o) => !optionIsAvailable(o));
    for (const o of reserved) {
      expect(() => bindRole(o.role, o.adapterId), o.adapterId).toThrow();
    }
  });

  it('bindRole accepts every available option, so the gate is not over-broad', () => {
    for (const role of REGULATION_ROLES) {
      for (const o of optionsForRole(role)) {
        expect(() => bindRole(role, o.adapterId), o.adapterId).not.toThrow();
      }
    }
  });

  it('there is no hidden fallback: an unavailable edition yields no usable rule', () => {
    const l = transverseSpacingLimits('2005', {
      VsRequired: 0, bw: 0.3, d: 0.5, fc: 30, cover: 0.025, stirrupDiaMm: 8,
    });
    expect(l.unsupported).toEqual(['unsupportedCheck']);
    expect(l.alongMax).toBe(0);
    expect(l.acrossMax).toBe(0);
    expect(l.clauses).toEqual([]);
  });
});

// ─── Rule provenance: every rule cites its own edition ────────────

describe('every implemented rule cites the edition it came from', () => {
  it('minimum clear spacing cites 2025 only, for beams, columns and layers', () => {
    const inputs = { barDiameterMm: 25, maxAggregateSizeMm: 19 };
    const results = [
      minClearSpacingInLayer('2025', inputs),
      minClearSpacingColumn('2025', inputs),
      minClearBetweenLayers('2025'),
      minClearSpacingFor('2025', 'beam', inputs),
      minClearSpacingFor('2025', 'column', inputs),
      minClearSpacingFor('2025', 'slab', inputs),
      minClearSpacingFor('2025', 'wall', inputs),
    ];
    for (const r of results) {
      expect(r.refs.length).toBeGreaterThan(0);
      for (const ref of r.refs) expect(ref.edition).toBe('2025');
    }
  });

  it('no 2025 clause identifier is ever stamped with a 2005 edition', () => {
    // Chapter 25 is a 2025 structure; the 2005 edition numbers the same subject matter in
    // chapter 7, and its shear rules live in chapter 11. A ref must never pair one edition's
    // number with the other's label.
    //
    // Scope note: the same gate over the BEND rules (Tables 25.3.1/25.3.2 in
    // `cirsoc201/bar-geometry.ts`) lives on the detailing branch, because that module is
    // introduced there. This branch owns the spacing and transverse-spacing rules.
    const refs = [
      ...minClearSpacingFor('2025', 'beam', { barDiameterMm: 20, maxAggregateSizeMm: 19 }).refs,
      ...minClearSpacingFor('2025', 'column', { barDiameterMm: 32, maxAggregateSizeMm: 19 }).refs,
      ...minClearBetweenLayers('2025').refs,
      ...transverseSpacingLimits('2025', {
        VsRequired: 0, bw: 0.3, d: 0.5, fc: 30, cover: 0.025, stirrupDiaMm: 8,
      }).clauses,
    ];
    expect(refs.length).toBeGreaterThan(3);
    for (const r of refs) {
      if (/^(25\.|Tabla 25\.|9\.7\.|Tabla 9\.7\.)/.test(r.clause)) expect(r.edition).toBe('2025');
      if (/^(7\.|Tabla 7\.|11\.)/.test(r.clause)) expect(r.edition).toBe('2005');
    }
  });

  it('the registry never marks an edition available whose text is not supplied', () => {
    // The invariant that makes the whole model trustworthy: availability is downstream of
    // whether the app actually has the text to implement.
    //
    // This holds for EVERY role, not just the design-governing one. An earlier revision
    // asserted `o.role === 'concrete'` here, which for a basis/loads/wind option reduces to
    // `expect(false).toBe(false)` — the check passed vacuously for exactly the roles it was
    // not covering, and three offered options whose text is not supplied went unnoticed.
    const offending: string[] = [];
    for (const role of REGULATION_ROLES) {
      for (const o of optionsForRole(role)) {
        if (!o.regulation) continue;
        const info = findRegulation(o.regulation, o.edition as never);
        if (!info) continue;
        if (!info.textAvailable) {
          offending.push(`${o.adapterId} (role ${o.role}, edition ${o.edition})`);
        }
      }
    }
    expect(
      offending,
      `offered for selection but their official text is not supplied: ${offending.join(', ')}`,
    ).toEqual([]);
  });
});

// ─── The seam still supports multiple editions ────────────────────

describe('the architecture still supports a future edition', () => {
  it('keeps more than one edition of at least one regulation in the registry', () => {
    const byRegulation = new Map<string, number>();
    for (const r of REGULATIONS) {
      byRegulation.set(r.id, (byRegulation.get(r.id) ?? 0) + 1);
    }
    expect([...byRegulation.values()].some((n) => n > 1)).toBe(true);
    // CIRSOC 201 specifically keeps both, so the edition-aware plumbing stays exercised.
    expect(byRegulation.get('cirsoc-201')).toBe(2);
  });

  it('keeps edition selection regulation-agnostic', async () => {
    // Adding a sourced 2005 adapter must be a catalogue edit plus an adapter — not a UI
    // rewrite. So the selector functions must not name a regulation or an edition.
    const src = await import('node:fs').then((fs) => fs.readFileSync(
      new URL('../roles.ts', import.meta.url), 'utf8'));
    const selector = src.slice(
      src.indexOf('export function optionsForRole'),
      src.indexOf('export function findOption'));
    expect(selector).not.toMatch(/cirsoc|2005|2025/i);
  });

  it('rules that ARE edition-aware still branch, so the capability is not lost', () => {
    // `minClearSpacingInLayer` genuinely differs between editions (2005 carries no aggregate
    // term). The mechanism must survive the cleanup even though 2005 is not selectable —
    // otherwise re-enabling an edition would mean rebuilding it.
    const inputs = { barDiameterMm: 8, maxAggregateSizeMm: 40 };
    const y2025 = minClearSpacingInLayer('2025', inputs);
    const y2005 = minClearSpacingInLayer('2005', inputs);
    expect(y2025.terms.aggregateTermMm).not.toBeNull();
    expect(y2005.terms.aggregateTermMm).toBeNull();
    expect(y2005.refs[0].edition).toBe('2005');
    expect(y2025.refs[0].edition).toBe('2025');
  });
});
