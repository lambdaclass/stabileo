/**
 * Regulation identity, edition and clause provenance.
 *
 * Every implemented formula, default, warning and drawing requirement in the app
 * carries a `ClauseRef` back to a specific clause of a specific edition of a specific
 * regulation. Nothing in the design or load path is allowed to state a number without
 * one — `docs/codes/CIRSOC/CAPABILITY-INDEX.md` is the human-readable map and this
 * module is its machine-readable half.
 *
 * The hard rule this module exists to enforce: **rules and clause identifiers are never
 * mixed between editions.** CIRSOC 201-2005 renumbered wholesale into 201-2025 (2005
 * chapter 12 "longitudes de anclaje" became 2025 chapter 25 "detalles de armado", and so
 * on), so quoting a 2005 clause next to a 2025 rule would be actively misleading to the
 * engineer reviewing the output. `assertSameEdition` makes that a runtime error rather
 * than a subtle documentation bug.
 *
 * Pure: no store imports, no Svelte runes. Safe to use from workers and tests.
 */

import type { EngineMessage } from './message';

// ─── Regulation identity ─────────────────────────────────────────

export type RegulationId =
  | 'cirsoc-101'   // permanent and imposed loads
  | 'cirsoc-102'   // wind
  | 'cirsoc-200'   // concrete technology
  | 'cirsoc-201'   // reinforced concrete
  | 'cirsoc-301'   // structural steel
  | 'inpres-cirsoc-103-i'    // seismic — general
  | 'inpres-cirsoc-103-ii';  // seismic — reinforced concrete

/** An edition is part of the regulation's identity, never a modifier of it. */
export type RegulationEdition = '2005' | '2018' | '2024' | '2025';

/**
 * Whether an edition can be used for production design, and if not, why not.
 *
 * ── Why three states and not a boolean ─────────────────────────────
 *
 * "Unavailable" collapses two situations that call for different product behaviour and
 * different words to the user:
 *
 *   `UNAVAILABLE_SOURCE` — the app WOULD implement this edition, but the official text is
 *      not supplied, so the rules cannot be written. Nothing is wrong with the
 *      architecture; a document is missing. Supplying and converting the text, then adding
 *      an adapter, is the whole fix. This is CIRSOC 201-2005's situation.
 *
 *   `UNSUPPORTED` — the text may well be available; the app has simply not implemented
 *      this regulation. Eurocode 2 is here.
 *
 * The distinction matters because the remedies differ and because a user who owns the 2005
 * text should be told that supplying it is what unblocks them, rather than being told the
 * edition is "not supported" and concluding the product will never do it.
 *
 * ── The one invariant ──────────────────────────────────────────────
 *
 * A non-`AVAILABLE` edition may be NAMED and CITED as unavailable. It may never be
 * APPLIED. There is deliberately no fallback: an unavailable edition does not quietly
 * borrow another edition's rules, because a result that cites a rule it did not apply is
 * worse than no result.
 */
export type EditionAvailability =
  /** Implemented, sourced against the official text, and usable for production design. */
  | 'AVAILABLE'
  /** Would be implemented, but the official text is not supplied. */
  | 'UNAVAILABLE_SOURCE'
  /** Not implemented by this app. */
  | 'UNSUPPORTED';

export function isAvailable(a: EditionAvailability): a is 'AVAILABLE' {
  return a === 'AVAILABLE';
}

export interface RegulationInfo {
  id: RegulationId;
  edition: RegulationEdition;
  /** Short name as printed on the cover, e.g. "CIRSOC 201". */
  name: string;
  /** Full title as printed on the cover. */
  title: string;
  /**
   * Legal instrument that put this edition into force, when one is known.
   * `null` means the app makes no claim about its legal status.
   */
  inForce: {
    instrument: string;
    /** ISO date the edition became legally operative. */
    effectiveFrom: string;
    /** Where that was published. */
    published: string;
  } | null;
  /** True when the app ships a converted copy under docs/codes/CIRSOC/markdown/. */
  textAvailable: boolean;
  /** Key of the converted directory, when `textAvailable`. */
  textKey?: string;
}

/**
 * Registry of the editions the app knows about.
 *
 * Presence here does NOT mean the app implements the regulation — it means the app can
 * name it, cite it and say honestly whether it is supported. Support is declared
 * separately by the capability model in `./capability.ts`.
 */
export const REGULATIONS: readonly RegulationInfo[] = [
  {
    id: 'cirsoc-101', edition: '2025', name: 'CIRSOC 101',
    title: 'Reglamento Argentino de Cargas Permanentes y Sobrecargas Mínimas de Diseño para Edificios y Otras Estructuras',
    inForce: {
      instrument: 'Resolución 11/2026 (RESOL-2026-11-APN-SOP#MEC), art. 1',
      effectiveFrom: '2026-01-22',
      published: 'Boletín Oficial de la República Argentina, 21-01-2026',
    },
    textAvailable: true, textKey: 'cirsoc-101-2025',
  },
  {
    id: 'cirsoc-101', edition: '2005', name: 'CIRSOC 101',
    title: 'Reglamento Argentino de Cargas Permanentes y Sobrecargas Mínimas de Diseño',
    inForce: null, textAvailable: false,
  },
  {
    id: 'cirsoc-102', edition: '2025', name: 'CIRSOC 102',
    title: 'Reglamento Argentino de Acción del Viento sobre las Construcciones',
    inForce: {
      instrument: 'Resolución 11/2026 (RESOL-2026-11-APN-SOP#MEC), art. 1',
      effectiveFrom: '2026-01-22',
      published: 'Boletín Oficial de la República Argentina, 21-01-2026',
    },
    textAvailable: true, textKey: 'cirsoc-102-2025',
  },
  {
    id: 'cirsoc-102', edition: '2005', name: 'CIRSOC 102',
    title: 'Reglamento Argentino de Acción del Viento sobre las Construcciones',
    inForce: null, textAvailable: false,
  },
  {
    id: 'cirsoc-200', edition: '2024', name: 'CIRSOC 200',
    title: 'Reglamento Argentino de Tecnología del Hormigón',
    inForce: {
      instrument: 'Resolución 11/2026 (RESOL-2026-11-APN-SOP#MEC), art. 1',
      effectiveFrom: '2026-01-22',
      published: 'Boletín Oficial de la República Argentina, 21-01-2026',
    },
    // Supplied? No. The app cites CIRSOC 201 26.4 for aggregate limits instead.
    textAvailable: false,
  },
  {
    id: 'cirsoc-201', edition: '2025', name: 'CIRSOC 201',
    title: 'Reglamento Argentino de Estructuras de Hormigón',
    inForce: {
      instrument: 'Resolución 11/2026 (RESOL-2026-11-APN-SOP#MEC), art. 1',
      effectiveFrom: '2026-01-22',
      published: 'Boletín Oficial de la República Argentina, 21-01-2026',
    },
    textAvailable: true, textKey: 'cirsoc-201-2025',
  },
  {
    id: 'cirsoc-201', edition: '2005', name: 'CIRSOC 201',
    title: 'Reglamento Argentino de Estructuras de Hormigón',
    // Res. 11/2026 does not explicitly derogate the 2005 edition, so the app does not
    // claim it was derogated. It claims only that 2025 is the edition in force.
    inForce: null, textAvailable: false,
  },
  {
    id: 'cirsoc-301', edition: '2018', name: 'CIRSOC 301',
    title: 'Reglamento Argentino de Estructuras de Acero para Edificios',
    inForce: null, textAvailable: true, textKey: 'cirsoc-301-2018',
  },
  {
    id: 'inpres-cirsoc-103-i', edition: '2018', name: 'INPRES-CIRSOC 103 Parte I',
    title: 'Reglamento Argentino para Construcciones Sismorresistentes — Parte I: Construcciones en General',
    inForce: null, textAvailable: true, textKey: 'inpres-cirsoc-103-i',
  },
  {
    // The supplied document is Edición Julio 2005. An earlier audit assumed a 2021
    // edition; no 2021 text was supplied and no 2021 clause number is used anywhere.
    id: 'inpres-cirsoc-103-ii', edition: '2005', name: 'INPRES-CIRSOC 103 Parte II',
    title: 'Reglamento Argentino para Construcciones Sismorresistentes — Parte II: Construcciones de Hormigón Armado',
    inForce: null, textAvailable: true, textKey: 'inpres-cirsoc-103-ii',
  },
] as const;

export function findRegulation(id: RegulationId, edition: RegulationEdition): RegulationInfo | undefined {
  return REGULATIONS.find((r) => r.id === id && r.edition === edition);
}

export function editionsOf(id: RegulationId): RegulationEdition[] {
  return REGULATIONS.filter((r) => r.id === id).map((r) => r.edition);
}

// ─── Clause references ───────────────────────────────────────────

/**
 * A citation to one clause of one edition.
 *
 * `clause` is the identifier exactly as printed in that edition — no normalisation, no
 * translation between editions. `note` carries an interpretation the app had to make;
 * its presence means a reviewer should look at the clause themselves.
 */
export interface ClauseRef {
  regulation: RegulationId;
  edition: RegulationEdition;
  /** e.g. '25.2.1', '2.3.2', '1.13-1' (an equation), 'Tabla 4.1'. */
  clause: string;
  /**
   * Developer annotation naming the clause, e.g. 'separación mínima de armaduras'.
   *
   * NOT user-facing and never rendered: `formatClause()` prints regulation, edition and
   * clause number only. It exists so a reader of this source knows which rule a bare
   * `'25.2.1'` refers to. The engine-purity gate treats it as a comment, so it may stay in
   * the language of the regulation being cited.
   */
  label?: string;
  /** Recorded when the app resolved an ambiguity conservatively. Developer annotation. */
  note?: string;
}

export function clause(
  regulation: RegulationId,
  edition: RegulationEdition,
  clauseId: string,
  label?: string,
  note?: string,
): ClauseRef {
  return { regulation, edition, clause: clauseId, label, note };
}

/** Canonical display form, e.g. `CIRSOC 201 2025 §25.2.1`. */
export function formatClause(ref: ClauseRef): string {
  const info = findRegulation(ref.regulation, ref.edition);
  const name = info?.name ?? ref.regulation;
  // Table and figure identifiers already read as nouns; only articles take the § sign.
  const sep = /^(tabla|table|figura|figure|anexo|ap[ée]ndice|cap)/i.test(ref.clause) ? ' ' : ' §';
  return `${name} ${ref.edition}${sep}${ref.clause}`;
}

/**
 * Guard against silently mixing editions inside one rule set.
 *
 * Throws rather than warns: a certificate that cites two editions of the same
 * regulation is not a cosmetic defect, it is an incorrect engineering document.
 */
export function assertSameEdition(refs: readonly ClauseRef[], context: string): void {
  const byRegulation = new Map<RegulationId, RegulationEdition>();
  for (const ref of refs) {
    const seen = byRegulation.get(ref.regulation);
    if (seen === undefined) {
      byRegulation.set(ref.regulation, ref.edition);
      continue;
    }
    if (seen !== ref.edition) {
      throw new Error(
        `${context}: clause references mix ${ref.regulation} editions ${seen} and ${ref.edition}. ` +
        `Editions renumber clauses wholesale; a rule set must cite exactly one edition per regulation.`,
      );
    }
  }
}

// ─── Provenance of a computed value ──────────────────────────────

/** How a value that feeds the design reached the app. */
export type ValueOrigin =
  /** Read from project data the user entered or the model carries. */
  | 'project'
  /** Taken from a table or formula in the regulation. */
  | 'code'
  /** Computed by the app from project data plus code rules. */
  | 'derived'
  /**
   * Not available, so the app proceeded on a stated assumption. Always visible in
   * certificates, drawings and reports. Never rendered green.
   */
  | 'assumed'
  /** Explicitly overridden by the user, overriding a code or derived value. */
  | 'override';

/**
 * A number with its justification attached.
 *
 * The app carries these instead of bare numbers wherever the value would otherwise be
 * unexplainable in a report — which is everywhere a reviewing engineer would ask
 * "where did that come from?".
 */
export interface ProvenancedValue<T = number> {
  value: T;
  origin: ValueOrigin;
  /** Empty only for `project` and `override` origins. */
  refs: ClauseRef[];
  /**
   * Required when `origin === 'assumed'`: what was assumed and why.
   *
   * Structured, not prose: this text reaches the UI, the PDF, DXF notes and the XLSX
   * assumptions sheet, each of which translates it at its own boundary.
   */
  assumption?: EngineMessage;
  /** Unit label for display, e.g. 'kN/m²', 'mm'. */
  unit?: string;
}

export function fromCode<T>(value: T, refs: ClauseRef[], unit?: string): ProvenancedValue<T> {
  return { value, origin: 'code', refs, unit };
}

export function fromProject<T>(value: T, unit?: string): ProvenancedValue<T> {
  return { value, origin: 'project', refs: [], unit };
}

export function derived<T>(value: T, refs: ClauseRef[], unit?: string): ProvenancedValue<T> {
  return { value, origin: 'derived', refs, unit };
}

export function assumed<T>(
  value: T, assumption: EngineMessage, refs: ClauseRef[] = [], unit?: string,
): ProvenancedValue<T> {
  return { value, origin: 'assumed', refs, assumption, unit };
}

export function overridden<T>(value: T, unit?: string): ProvenancedValue<T> {
  return { value, origin: 'override', refs: [], unit };
}

/**
 * True when the value must be shown in a non-green state.
 *
 * Assumed values are the whole reason this exists: a design that silently assumed a
 * 20 mm aggregate is not the same document as one where the project stated it, and the
 * reviewer has to be able to see the difference at a glance.
 */
export function needsAttention(v: ProvenancedValue<unknown>): boolean {
  return v.origin === 'assumed';
}

/** Collect every assumption in a set of values, for the report's assumptions block. */
export function collectAssumptions(
  values: readonly ProvenancedValue<unknown>[],
): EngineMessage[] {
  return values
    .filter((v) => v.origin === 'assumed' && v.assumption !== undefined)
    .map((v) => v.assumption!);
}
