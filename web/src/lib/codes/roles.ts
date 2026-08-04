/**
 * Code-neutral project regulation stack.
 *
 * ── What this replaces ─────────────────────────────────────────
 *
 * The first attempt hardcoded CIRSOC into the product: a "Design regulations" panel with
 * three CIRSOC-specific edition dropdowns, a separate hardcoded "Seismic — INPRES-CIRSOC
 * 103" tab, and a design-code dropdown that listed both CIRSOC 201 adapters under the
 * identical label "CIRSOC 201". A user could not tell the two apart, could not reach
 * CIRSOC 103 through the regulation surface at all, and could not express a mixed stack.
 *
 * The model here is roles, not codes. A project binds ONE adapter to each role it needs.
 * Whether that adapter is Argentine, European or American is not the product's business.
 *
 * ── Roles ──────────────────────────────────────────────────────
 *
 * basis    load basis, actions and combination rules      (e.g. CIRSOC 101, EN 1990)
 * loads    imposed and permanent load magnitudes          (e.g. CIRSOC 101, EN 1991-1-1)
 * wind     wind actions                                    (e.g. CIRSOC 102, EN 1991-1-4)
 * seismic  seismic actions and seismic detailing           (e.g. INPRES-CIRSOC 103)
 * concrete reinforced concrete design                      (e.g. CIRSOC 201, EC2)
 * steel    structural steel design                         (e.g. CIRSOC 301, EC3)
 * masonry  masonry design
 * timber   timber design
 *
 * `basis` and `loads` are separate on purpose: EN 1990 supplies combinations while
 * EN 1991-1-1 supplies the magnitudes, and a project may legitimately mix them.
 *
 * Pure: no store, no runes.
 */

import type {
  ClauseRef, EditionAvailability, RegulationEdition, RegulationId,
} from './regulation';
import { findRegulation, isAvailable } from './regulation';
import type { Maturity } from './maturity';
import { msg, type EngineMessage, type MessageParam } from './message';

// ─── Roles ───────────────────────────────────────────────────────

export const REGULATION_ROLES = [
  'basis', 'loads', 'wind', 'seismic', 'concrete', 'steel', 'masonry', 'timber',
] as const;
export type RegulationRole = (typeof REGULATION_ROLES)[number];

/** Roles whose configuration affects generated loads, and therefore the analysis. */
export const LOAD_AFFECTING_ROLES: readonly RegulationRole[] =
  Object.freeze(['basis', 'loads', 'wind', 'seismic']);

/** Roles that only affect member design, not the forces. */
export const DESIGN_ONLY_ROLES: readonly RegulationRole[] =
  Object.freeze(['concrete', 'steel', 'masonry', 'timber']);

export function isLoadAffecting(role: RegulationRole): boolean {
  return LOAD_AFFECTING_ROLES.includes(role);
}

// ─── Catalogue ───────────────────────────────────────────────────

/**
 * One selectable option for one role.
 *
 * `maturity` is the honest claim. An `UNSUPPORTED` option stays visible so a user can see
 * that the role exists and what may arrive later, but it can never be applied — see
 * `validateStack`. Listing it is a roadmap signal, not an implementation claim.
 */
export interface RoleOption {
  /** Stable id, unique across the catalogue. */
  adapterId: string;
  role: RegulationRole;
  /** Regulation identity, when it maps onto a known regulation. */
  regulation?: RegulationId;
  edition: RegulationEdition | string;
  /**
   * i18n key of the regulation's name, WITHOUT the edition.
   *
   * The rendered label is `t(nameKey)` with `{edition}` interpolated, so the two CIRSOC 201
   * adapters read "CIRSOC 201 (2025)" and "CIRSOC 201 (2005)" — the duplicate-label defect
   * is fixed structurally, because `edition` is part of the template rather than something
   * a catalogue author has to remember to type.
   *
   * A regulation's *name* is a proper noun and is the same in every locale; the surrounding
   * template is not, which is why this is a key and not a literal.
   */
  nameKey: string;
  /** Regulation family, for the compatibility rules. */
  family: 'cirsoc' | 'eurocode' | 'aci-aisc' | 'other';
  maturity: Maturity;
  /**
   * Whether this option can be applied to a project at all.
   *
   * Separate from `maturity`, which grades how well a thing that IS implemented has been
   * validated. Availability answers the prior question: is it implemented and sourced?
   * `UNAVAILABLE_SOURCE` and `UNSUPPORTED` options are retained in the catalogue as
   * reserved metadata — the architecture, clause map and adapter seam stay in place — but
   * they are filtered out of normal selectors and refused by `applyRoleBinding`.
   *
   * Defaults to `AVAILABLE` when omitted so the catalogue stays terse.
   */
  availability?: EditionAvailability;
  /** True when this option needs role-specific settings before it can be applied. */
  requiresConfig: boolean;
  /** i18n key for a one-line explanation of what it does or why it is unavailable. */
  noteKey?: string;
}

/** Availability of one option, with the catalogue's `AVAILABLE` default applied. */
export function availabilityOf(option: RoleOption): EditionAvailability {
  return option.availability ?? 'AVAILABLE';
}

/** True when this option may be bound to a project. */
export function optionIsAvailable(option: RoleOption): boolean {
  return isAvailable(availabilityOf(option));
}

/**
 * The catalogue.
 *
 * Editions come from `REGULATIONS` where one exists, so the legal-status metadata stays
 * in one place. The rendered label always carries the edition — see `nameKey`.
 */
export const ROLE_CATALOG: readonly RoleOption[] = Object.freeze([
  // ── basis / combinations ──
  {
    adapterId: 'cirsoc101-2025-basis', role: 'basis', regulation: 'cirsoc-101',
    edition: '2025', nameKey: 'regulations.name.cirsoc101', family: 'cirsoc',
    maturity: 'VALIDATED', requiresConfig: false,
  },
  {
    // RESERVED, not selectable — same reason as CIRSOC 201-2005 below. The official
    // 101-2005 text is not supplied (`REGULATIONS` records `textAvailable: false`), and
    // `cirsoc101/combinations.ts` implements the 2025 §2.3.2 combinations only, citing
    // 2025 clauses. Offering this option meant a project stamped 2005 whose combinations
    // came from the 2025 text — a result citing a rule it did not apply.
    adapterId: 'cirsoc101-2005-basis', role: 'basis', regulation: 'cirsoc-101',
    edition: '2005', nameKey: 'regulations.name.cirsoc101', family: 'cirsoc',
    maturity: 'UNSUPPORTED', availability: 'UNAVAILABLE_SOURCE', requiresConfig: false,
    noteKey: 'regulations.note.editionTextNotSupplied',
  },
  {
    adapterId: 'en1990', role: 'basis', edition: 'EN 1990:2002',
    nameKey: 'regulations.name.en1990', family: 'eurocode',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.notImplemented',
  },
  // ── imposed / permanent loads ──
  {
    adapterId: 'cirsoc101-2025-loads', role: 'loads', regulation: 'cirsoc-101',
    edition: '2025', nameKey: 'regulations.name.cirsoc101', family: 'cirsoc',
    maturity: 'VALIDATED', requiresConfig: true,
  },
  {
    // RESERVED, not selectable. `cirsoc101/live-loads.ts` implements the 2025 Table 4.1
    // occupancies and the §4.7.2 reduction only; there is no 2005 branch and no 2005 text
    // to write one from.
    adapterId: 'cirsoc101-2005-loads', role: 'loads', regulation: 'cirsoc-101',
    edition: '2005', nameKey: 'regulations.name.cirsoc101', family: 'cirsoc',
    maturity: 'UNSUPPORTED', availability: 'UNAVAILABLE_SOURCE', requiresConfig: true,
    noteKey: 'regulations.note.editionTextNotSupplied',
  },
  {
    adapterId: 'en1991-1-1', role: 'loads', edition: 'EN 1991-1-1',
    nameKey: 'regulations.name.en1991_1_1', family: 'eurocode',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.notImplemented',
  },
  // ── wind ──
  {
    adapterId: 'cirsoc102-2025', role: 'wind', regulation: 'cirsoc-102',
    edition: '2025', nameKey: 'regulations.name.cirsoc102', family: 'cirsoc',
    maturity: 'VALIDATED', requiresConfig: true,
  },
  {
    // RESERVED, not selectable. `cirsoc102/wind.ts` is a full rebuild against the 2025
    // text — K_e, the pressure coefficients, the exposure and enclosure rules — and takes
    // no edition parameter. Under this label the wind loads and every clause ref were the
    // 2025 edition's, which is the mislabelling the availability model exists to stop.
    adapterId: 'cirsoc102-2005', role: 'wind', regulation: 'cirsoc-102',
    edition: '2005', nameKey: 'regulations.name.cirsoc102', family: 'cirsoc',
    maturity: 'UNSUPPORTED', availability: 'UNAVAILABLE_SOURCE', requiresConfig: true,
    noteKey: 'regulations.note.editionTextNotSupplied',
  },
  {
    adapterId: 'en1991-1-4', role: 'wind', edition: 'EN 1991-1-4',
    nameKey: 'regulations.name.en1991_1_4', family: 'eurocode',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.notImplemented',
  },
  // ── seismic: selected through the ROLE, never a hardcoded tab ──
  {
    adapterId: 'inpres103-2018', role: 'seismic', regulation: 'inpres-cirsoc-103-i',
    edition: '2018', nameKey: 'regulations.name.inpres103', family: 'cirsoc',
    maturity: 'IMPLEMENTED_PROVISIONAL', requiresConfig: true,
    noteKey: 'regulations.note.seismicSuppliedEditions',
  },
  {
    adapterId: 'en1998-1', role: 'seismic', edition: 'EN 1998-1',
    nameKey: 'regulations.name.en1998_1', family: 'eurocode',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.notImplemented',
  },
  // ── reinforced concrete: the two editions are now DISTINCT ──
  {
    adapterId: 'cirsoc', role: 'concrete', regulation: 'cirsoc-201',
    edition: '2025', nameKey: 'regulations.name.cirsoc201', family: 'cirsoc',
    maturity: 'VALIDATED', requiresConfig: false,
  },
  {
    // RESERVED, not selectable. The official CIRSOC 201-2005 text is not supplied with
    // this app, so its rules cannot be written; §9.7.6.2.2's 2005 counterpart in particular
    // governs every beam. The 2025 table is NOT applied under this label — see
    // `codes/cirsoc201/transverse-spacing.ts`. The entry is kept so the adapter seam, the
    // clause map and the edition-aware plumbing stay exercised and a future sourced 2005
    // adapter is a catalogue edit rather than a re-architecture.
    adapterId: 'cirsoc-2005', role: 'concrete', regulation: 'cirsoc-201',
    edition: '2005', nameKey: 'regulations.name.cirsoc201', family: 'cirsoc',
    maturity: 'UNSUPPORTED', availability: 'UNAVAILABLE_SOURCE', requiresConfig: false,
    noteKey: 'regulations.note.editionTextNotSupplied',
  },
  {
    adapterId: 'eurocode', role: 'concrete', edition: 'EN 1992-1-1',
    nameKey: 'regulations.name.en1992_1_1', family: 'eurocode',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.notImplemented',
  },
  {
    adapterId: 'aci-aisc', role: 'concrete', edition: 'ACI 318-19',
    nameKey: 'regulations.name.aci318', family: 'aci-aisc',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.notImplemented',
  },
  // ── steel: CIRSOC 301 now EXISTS in the surface, honestly unsupported ──
  {
    adapterId: 'cirsoc301-2018', role: 'steel', regulation: 'cirsoc-301',
    edition: '2018', nameKey: 'regulations.name.cirsoc301', family: 'cirsoc',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.textAvailableNotImplemented',
  },
  {
    adapterId: 'eurocode3', role: 'steel', edition: 'EN 1993-1-1',
    nameKey: 'regulations.name.en1993_1_1', family: 'eurocode',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.notImplemented',
  },
  // ── masonry / timber ──
  {
    adapterId: 'masonry', role: 'masonry', edition: 'TMS 402-16',
    nameKey: 'regulations.name.tms402', family: 'other',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.notImplemented',
  },
  {
    adapterId: 'nds', role: 'timber', edition: 'NDS 2018',
    nameKey: 'regulations.name.nds', family: 'other',
    maturity: 'UNSUPPORTED', requiresConfig: false,
    noteKey: 'regulations.note.notImplemented',
  },
]);

/**
 * Options a user may actually choose for a role.
 *
 * Filtered to `AVAILABLE`. An edition whose official text is not supplied is not offered,
 * because offering it would mean either refusing at apply time (a dead control) or applying
 * some other edition's rules under its label (the defect this model exists to prevent).
 *
 * Generic by construction: nothing here names a regulation. Making a future CIRSOC 201-2005
 * selectable is a catalogue edit plus an adapter, with no change to this function or to any
 * UI that calls it.
 */
export function optionsForRole(role: RegulationRole): RoleOption[] {
  return ROLE_CATALOG.filter((o) => o.role === role && optionIsAvailable(o));
}

/**
 * Every catalogued option for a role, available or not.
 *
 * For surfaces whose job is to explain the catalogue rather than to drive a choice — the
 * regulations panel's "why can I not pick this?" list, and the tests that assert the
 * reserved metadata survived. Never use this to populate a control that applies a binding.
 */
export function allOptionsForRole(role: RegulationRole): RoleOption[] {
  return ROLE_CATALOG.filter((o) => o.role === role);
}

export function findOption(adapterId: string): RoleOption | undefined {
  return ROLE_CATALOG.find((o) => o.adapterId === adapterId);
}

/**
 * Assert the catalogue has no duplicate display name inside a role.
 *
 * This is the invariant whose absence produced the shipped defect. It is checked at
 * module scope so a future duplicate fails at import rather than in a dropdown.
 */
function assertUniqueDisplayNames(): void {
  for (const role of REGULATION_ROLES) {
    // Identity is (name, edition), which is exactly what the rendered label shows. Two
    // options may share a nameKey — that is the CIRSOC 201 case — but never an edition
    // with it. A locale-level test renders the labels in every shipped language and
    // repeats this check on the actual strings.
    // Checked over the WHOLE catalogue, not just the available slice: a reserved option
    // that collides with a live one would start colliding the day it is switched on.
    const labels = allOptionsForRole(role).map((o) => `${o.nameKey}|${o.edition}`);
    const dup = labels.find((n, i) => labels.indexOf(n) !== i);
    if (dup !== undefined) {
      throw new Error(
        `Regulation catalogue: role "${role}" has two options that render identically ` +
        `(${dup}). A user cannot tell them apart.`,
      );
    }
  }
  const ids = ROLE_CATALOG.map((o) => o.adapterId);
  const dupId = ids.find((n, i) => ids.indexOf(n) !== i);
  if (dupId !== undefined) throw new Error(`Duplicate adapterId in catalogue: ${dupId}`);
}
assertUniqueDisplayNames();

/**
 * The `{ key, params }` a surface needs to render an option's label.
 *
 * Every consumer — the role selector, the load derivation, the report's basis block —
 * builds the label the same way, so "CIRSOC 201" can never appear without its edition.
 */
export function optionLabel(o: RoleOption): EngineMessage {
  return msg(o.nameKey, { edition: String(o.edition) });
}

/**
 * The label of whatever is bound to a role, or an explicit "not selected" message.
 *
 * Never returns an empty string: a blank where a regulation name belongs reads as a
 * rendering bug, and a report that silently omits the governing code is worse than one
 * that says it has none.
 */
export function bindingLabel(b: RoleBinding): EngineMessage {
  if (!b.adapterId || !b.nameKey) return msg('regulations.none');
  return msg(b.nameKey, { edition: b.edition });
}

// ─── Bindings ────────────────────────────────────────────────────

/** Lifecycle of a role's configuration relative to what the results were produced with. */
export type BindingState =
  /** Applied and consistent with the current downstream results. */
  | 'applied'
  /** Chosen but not yet applied; downstream results still reflect the previous binding. */
  | 'pending'
  /** Applied, but something downstream has since invalidated what it produced. */
  | 'stale'
  /** No adapter bound to this role. */
  | 'unset';

export interface RoleBinding {
  role: RegulationRole;
  /** Null when unset. */
  adapterId: string | null;
  /**
   * i18n key of the regulation name, copied at bind time so a stored project stays
   * readable even if the catalogue later drops the adapter. Render with `edition`.
   */
  nameKey: string;
  edition: string;
  maturity: Maturity;
  /** Free text: province, municipality, or "national public works". */
  jurisdiction: string;
  /** How the regulation comes to apply here. */
  adoption: 'national' | 'adopted' | 'voluntary' | 'unstated';
  /** Role-specific settings, opaque to this module. */
  settings: Record<string, unknown>;
  /** False while required settings are missing. */
  configComplete: boolean;
  state: BindingState;
  /** The regulationConfigRevision at which this binding was applied. */
  appliedAtRevision: number | null;
  /** Clause references this binding contributed, for provenance. */
  refs: ClauseRef[];
}

export function unsetBinding(role: RegulationRole): RoleBinding {
  return {
    role, adapterId: null, nameKey: '', edition: '',
    maturity: 'UNSUPPORTED', jurisdiction: '', adoption: 'unstated',
    settings: {}, configComplete: false, state: 'unset',
    appliedAtRevision: null, refs: [],
  };
}

export function bindRole(
  role: RegulationRole, adapterId: string,
  over: Partial<Pick<RoleBinding, 'jurisdiction' | 'adoption' | 'settings'>> = {},
): RoleBinding {
  const opt = findOption(adapterId);
  if (!opt || opt.role !== role) {
    throw new Error(`Adapter "${adapterId}" is not an option for role "${role}".`);
  }
  // An unavailable edition may be named and explained. It may never be BOUND. Throwing
  // rather than warning is deliberate: every path that reaches here is either a UI control
  // (which is fed from `optionsForRole` and therefore cannot offer one) or a loader (which
  // must decide what to do instead). A silent bind would put an inapplicable edition on the
  // project and let it reach a certificate.
  if (!optionIsAvailable(opt)) {
    throw new Error(
      `Adapter "${adapterId}" is ${availabilityOf(opt)} and cannot be bound to a project. ` +
      `Its rules are not implemented for this edition and no other edition's rules are ` +
      `substituted for it.`,
    );
  }
  return {
    role, adapterId,
    nameKey: opt.nameKey, edition: String(opt.edition), maturity: opt.maturity,
    jurisdiction: over.jurisdiction ?? '', adoption: over.adoption ?? 'unstated',
    settings: over.settings ?? {},
    configComplete: !opt.requiresConfig,
    state: 'pending',
    appliedAtRevision: null,
    refs: [],
  };
}

export type ProjectRegulations = Record<RegulationRole, RoleBinding>;

/** A new project: concrete and the load roles bound to the editions in force. */
export function defaultRegulations(): ProjectRegulations {
  const out = {} as ProjectRegulations;
  for (const role of REGULATION_ROLES) out[role] = unsetBinding(role);
  const seed: Array<[RegulationRole, string]> = [
    ['basis', 'cirsoc101-2025-basis'],
    ['loads', 'cirsoc101-2025-loads'],
    ['wind', 'cirsoc102-2025'],
    ['concrete', 'cirsoc'],
  ];
  for (const [role, id] of seed) {
    out[role] = { ...bindRole(role, id), state: 'applied', appliedAtRevision: 0 };
  }
  return out;
}

// ─── Compatibility ───────────────────────────────────────────────

export type ProblemSeverity = 'error' | 'warning';

export interface StackProblem {
  severity: ProblemSeverity;
  roles: RegulationRole[];
  /** i18n key. */
  key: string;
  params?: Record<string, MessageParam>;
}

export interface StackValidation {
  ok: boolean;
  problems: StackProblem[];
}

/**
 * Validate a stack.
 *
 * Mixed families are PERMITTED where technically defensible — CIRSOC loads with Eurocode
 * concrete is a real thing an engineer may do deliberately — but two cases are refused:
 *
 *  * an UNSUPPORTED adapter cannot be applied, because there is no implementation behind
 *    it and applying it would produce nothing while looking like a choice;
 *  * `basis` and `loads` from different families is an ERROR, because the combination
 *    factors and the load magnitudes are calibrated together. CIRSOC 101 combinations
 *    applied to EN 1991 characteristic values is not a conservative approximation, it is
 *    a different reliability level.
 *
 * A material role from a different family than `basis` is a WARNING: the partial-factor
 * philosophies differ and the engineer must own that decision, but it is a decision they
 * are allowed to make.
 */
export function validateStack(reg: ProjectRegulations): StackValidation {
  const problems: StackProblem[] = [];

  for (const role of REGULATION_ROLES) {
    const b = reg[role];
    if (!b.adapterId) continue;
    const opt = findOption(b.adapterId);
    if (!opt) {
      problems.push({ severity: 'error', roles: [role], key: 'regulations.problem.unknownAdapter',
        params: { adapter: b.adapterId } });
      continue;
    }
    if (opt.maturity === 'UNSUPPORTED') {
      problems.push({ severity: 'error', roles: [role], key: 'regulations.problem.unsupportedAdapter',
        params: { name: msg(opt.nameKey, { edition: String(opt.edition) }) } });
    }
    if (!b.configComplete) {
      problems.push({ severity: 'warning', roles: [role], key: 'regulations.problem.configIncomplete',
        params: { name: msg(opt.nameKey, { edition: String(opt.edition) }) } });
    }
    if (b.adoption === 'unstated' && opt.maturity !== 'UNSUPPORTED') {
      problems.push({ severity: 'warning', roles: [role], key: 'regulations.problem.adoptionUnstated',
        params: { name: msg(opt.nameKey, { edition: String(opt.edition) }) } });
    }
  }

  const fam = (r: RegulationRole) => {
    const id = reg[r].adapterId;
    return id ? findOption(id)?.family : undefined;
  };

  const basisFam = fam('basis');
  const loadsFam = fam('loads');
  if (basisFam && loadsFam && basisFam !== loadsFam) {
    problems.push({
      severity: 'error', roles: ['basis', 'loads'],
      key: 'regulations.problem.basisLoadsFamilyMismatch',
      params: { basis: bindingLabel(reg.basis), loads: bindingLabel(reg.loads) },
    });
  }

  for (const role of DESIGN_ONLY_ROLES) {
    const f = fam(role);
    if (basisFam && f && f !== basisFam) {
      problems.push({
        severity: 'warning', roles: ['basis', role],
        key: 'regulations.problem.materialFamilyDiffers',
        params: { material: bindingLabel(reg[role]), basis: bindingLabel(reg.basis) },
      });
    }
  }

  // A seismic binding without a basis is meaningless: the seismic case has to enter a
  // combination, and the combination rules live in `basis`.
  if (reg.seismic.adapterId && !reg.basis.adapterId) {
    problems.push({ severity: 'error', roles: ['seismic', 'basis'],
      key: 'regulations.problem.seismicNeedsBasis' });
  }

  return { ok: !problems.some((p) => p.severity === 'error'), problems };
}

/** True when this role can be used to produce results right now. */
export function roleUsable(reg: ProjectRegulations, role: RegulationRole): boolean {
  const b = reg[role];
  if (!b.adapterId) return false;
  const opt = findOption(b.adapterId);
  if (!opt || opt.maturity === 'UNSUPPORTED') return false;
  return b.configComplete;
}

/** Roles whose bindings are pending, i.e. chosen but not yet applied. */
export function pendingRoles(reg: ProjectRegulations): RegulationRole[] {
  return REGULATION_ROLES.filter((r) => reg[r].state === 'pending');
}

/** True when a pending change affects loads and therefore requires regeneration. */
export function pendingRequiresLoadRegeneration(reg: ProjectRegulations): boolean {
  return pendingRoles(reg).some(isLoadAffecting);
}

// ─── Provenance ──────────────────────────────────────────────────

export interface RegulationStamp {
  role: RegulationRole;
  /** Render at the boundary: `te(label)`. */
  label: EngineMessage;
  edition: string;
  jurisdiction: string;
  adoption: RoleBinding['adoption'];
  maturity: Maturity;
  state: BindingState;
  /** Legal instrument, when the regulation registry knows one. */
  inForce?: string;
}

/** The stamp block every report, drawing and export carries. */
export function regulationStamps(reg: ProjectRegulations): RegulationStamp[] {
  const out: RegulationStamp[] = [];
  for (const role of REGULATION_ROLES) {
    const b = reg[role];
    if (!b.adapterId) continue;
    const opt = findOption(b.adapterId);
    const info = opt?.regulation
      ? findRegulation(opt.regulation, opt.edition as RegulationEdition)
      : undefined;
    out.push({
      role, label: bindingLabel(b), edition: b.edition,
      jurisdiction: b.jurisdiction, adoption: b.adoption,
      maturity: b.maturity, state: b.state,
      inForce: info?.inForce?.instrument,
    });
  }
  return out;
}

// ─── Migration ───────────────────────────────────────────────────

export const REGULATIONS_SCHEMA_VERSION = 2;

export interface StoredRegulations {
  version: number;
  roles: ProjectRegulations;
}

/**
 * Migrate from any earlier persisted shape.
 *
 * v1 was the CIRSOC-specific `{ concreteEdition, loadEdition, windEdition, jurisdiction,
 * concrete }`. Its editions map onto role bindings; its `concrete.maxAggregateSizeMm` does
 * NOT come along — that value now belongs to the concrete material, and
 * `migrateAggregateOutOfRegulations` hands it to the caller to place there.
 */
export interface RegulationsMigration {
  stored: StoredRegulations;
  /** Aggregate size rescued from a v1 payload, for the material store to adopt. */
  rescuedAggregateMm: number | null;
  notices: Array<{ key: string; params?: Record<string, MessageParam> }>;
}

export function migrateRegulations(raw: unknown): RegulationsMigration {
  const notices: RegulationsMigration['notices'] = [];

  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return {
      stored: { version: REGULATIONS_SCHEMA_VERSION, roles: defaultRegulations() },
      rescuedAggregateMm: null, notices,
    };
  }

  const src = raw as Record<string, unknown>;

  // Already role-shaped?
  if (typeof src.version === 'number' && src.roles && typeof src.roles === 'object') {
    const roles = defaultRegulations();
    const stored = src.roles as Record<string, unknown>;
    for (const role of REGULATION_ROLES) {
      const b = stored[role] as Partial<RoleBinding> | undefined;
      if (!b || typeof b !== 'object') continue;
      const opt = b.adapterId ? findOption(b.adapterId) : undefined;
      if (!opt) { roles[role] = unsetBinding(role); continue; }
      // A stored project may name an edition that has since been withdrawn from production
      // (CIRSOC 201-2005). It is unset rather than carried, and the user is told, because
      // the alternative is a project that silently cannot be designed with no explanation.
      if (!optionIsAvailable(opt)) {
        roles[role] = unsetBinding(role);
        notices.push({
          key: 'regulations.migration.editionWithdrawn',
          params: { role, edition: String(opt.edition) },
        });
        continue;
      }
      roles[role] = {
        ...bindRole(role, opt.adapterId, {
          jurisdiction: typeof b.jurisdiction === 'string' ? b.jurisdiction : '',
          adoption: isAdoption(b.adoption) ? b.adoption : 'unstated',
          settings: (b.settings && typeof b.settings === 'object') ? b.settings as Record<string, unknown> : {},
        }),
        configComplete: b.configComplete === true || !opt.requiresConfig,
        state: isState(b.state) ? b.state : 'applied',
        appliedAtRevision: typeof b.appliedAtRevision === 'number' ? b.appliedAtRevision : 0,
      };
    }
    return { stored: { version: REGULATIONS_SCHEMA_VERSION, roles }, rescuedAggregateMm: null, notices };
  }

  // v1 CIRSOC-specific shape.
  const roles = defaultRegulations();
  const edition = (v: unknown): RegulationEdition =>
    v === '2005' || v === '2018' || v === '2024' || v === '2025' ? v : '2025';
  const jur = (src.jurisdiction as { name?: string; basis?: string } | undefined) ?? {};
  const common = {
    jurisdiction: typeof jur.name === 'string' ? jur.name : '',
    adoption: isAdoption(jur.basis) ? jur.basis : 'unstated' as RoleBinding['adoption'],
  };

  const concreteEd = edition(src.concreteEdition);
  const loadEd = edition(src.loadEdition);
  const windEd = edition(src.windEdition);

  // The v1 shape could record concreteEdition '2005'. That edition is no longer available
  // for production design, so the project is bound to the edition in force and TOLD, rather
  // than bound to something inapplicable or silently left unset. No migration workflow is
  // offered: stored 2005 results were produced by rules the app no longer applies, so
  // re-running the design is the only honest outcome.
  // The same applies to the 2005 load and wind editions: their texts are not supplied
  // either, so they are bound to the edition in force and the user is TOLD, rather than
  // bound to a label whose rules would come from the 2025 text.
  if (concreteEd === '2005') {
    notices.push({
      key: 'regulations.migration.editionWithdrawn',
      params: { role: 'concrete', edition: '2005' },
    });
  }
  if (loadEd === '2005') {
    for (const role of ['basis', 'loads'] as const) {
      notices.push({
        key: 'regulations.migration.editionWithdrawn',
        params: { role, edition: '2005' },
      });
    }
  }
  if (windEd === '2005') {
    notices.push({
      key: 'regulations.migration.editionWithdrawn',
      params: { role: 'wind', edition: '2005' },
    });
  }
  roles.concrete = {
    ...bindRole('concrete', 'cirsoc', common),
    state: 'applied', appliedAtRevision: 0,
  };
  roles.basis = {
    ...bindRole('basis', 'cirsoc101-2025-basis', common),
    state: 'applied', appliedAtRevision: 0,
  };
  roles.loads = {
    ...bindRole('loads', 'cirsoc101-2025-loads', common),
    state: 'applied', appliedAtRevision: 0,
  };
  roles.wind = {
    ...bindRole('wind', 'cirsoc102-2025', common),
    state: 'applied', appliedAtRevision: 0,
  };

  const conc = src.concrete as { maxAggregateSizeMm?: unknown } | undefined;
  const rescued = typeof conc?.maxAggregateSizeMm === 'number' ? conc.maxAggregateSizeMm : null;

  notices.push({ key: 'regulations.migration.fromEditionSettings' });
  if (rescued !== null) {
    notices.push({ key: 'regulations.migration.aggregateMoved', params: { mm: rescued } });
  }

  return { stored: { version: REGULATIONS_SCHEMA_VERSION, roles }, rescuedAggregateMm: rescued, notices };
}

function isAdoption(v: unknown): v is RoleBinding['adoption'] {
  return v === 'national' || v === 'adopted' || v === 'voluntary' || v === 'unstated';
}
function isState(v: unknown): v is BindingState {
  return v === 'applied' || v === 'pending' || v === 'stale' || v === 'unset';
}
