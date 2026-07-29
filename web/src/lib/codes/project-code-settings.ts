/**
 * Per-project regulation settings: jurisdiction, adopted editions, concrete data.
 *
 * These are project facts, not app preferences. They are persisted with the model,
 * migrated forward, printed on every certificate and drawing, and they decide which
 * design-code adapter runs. Two projects open side by side may legitimately be designed
 * to different editions.
 *
 * Default is CIRSOC 201-2025 — the edition legally in force since 22-01-2026 under
 * Resolución 11/2026. CIRSOC 201-2005 stays selectable for legacy projects and gets its
 * own adapter with its own clause map; the two never share a rule.
 *
 * Pure: no store imports, no runes.
 */

import {
  type ClauseRef, type ProvenancedValue, type RegulationEdition,
  assumed, clause, fromProject, overridden,
} from './regulation';
import { msg, round, type EngineMessage } from './message';

// ─── Jurisdiction ────────────────────────────────────────────────

/**
 * CIRSOC is mandatory for national public works. Resolución 11/2026 art. 2 *invites*
 * provinces and municipalities to adopt it, so provincial/municipal applicability is a
 * project fact the app cannot infer — it records what the user states.
 */
export type AdoptionBasis =
  /** National public works: CIRSOC applies by the resolution itself. */
  | 'national'
  /** The province or municipality has adopted CIRSOC. */
  | 'adopted'
  /** Applied by contract or by the designer's choice, not by a local instrument. */
  | 'voluntary'
  /** The user has not stated it. Printed as such; never silently treated as adopted. */
  | 'unstated';

export interface Jurisdiction {
  /** Free text — province, municipality or "Obra pública nacional". */
  name: string;
  basis: AdoptionBasis;
  /** Optional: the local instrument, e.g. an ordinance number. */
  instrument?: string;
}

export const DEFAULT_JURISDICTION: Jurisdiction = { name: '', basis: 'unstated' };

// ─── Concrete data ───────────────────────────────────────────────

/**
 * Maximum nominal coarse-aggregate size, in millimetres.
 *
 * CIRSOC 201-2025 §25.2.1 and §25.2.3 make d_agg part of the *mandatory* minimum clear
 * spacing, so it is not optional data — but no edition of the regulation states a
 * default value, because it is a property of the concrete mixture (CIRSOC 200 territory)
 * and not of the structural design.
 *
 * The app therefore refuses to present any number as a regulatory default. When project
 * data is absent it proceeds on an explicitly recorded assumption whose provenance is
 * `assumed`, which propagates to certificates, drawings and reports and is never shown
 * green. 20 mm is common Argentine practice; that is a statement about practice, not
 * about the code, and the assumption text says so.
 */
export const DAGG_ASSUMED_MM = 20;

/** Absolute bounds. Below 6 mm nothing sold as coarse aggregate exists; 63 mm is the
 *  largest sieve size in normal building practice. Outside this the value is a typo. */
export const DAGG_MIN_MM = 6;
export const DAGG_MAX_MM = 63;

/** Shotcrete cap — CIRSOC 201-2025 §26.4.2.1(a)(13). */
export const DAGG_SHOTCRETE_MAX_MM = 13;

export interface ConcreteProjectData {
  /**
   * Maximum nominal coarse-aggregate size in mm, or `null` when the project has not
   * stated it. `null` is a meaningful, persisted value — it is what makes the
   * assumption visible instead of invisible.
   */
  maxAggregateSizeMm: number | null;
  /** Placed by shotcrete, which caps d_agg at 13 mm. */
  shotcrete: boolean;
}

export const DEFAULT_CONCRETE_DATA: ConcreteProjectData = {
  maxAggregateSizeMm: null,
  shotcrete: false,
};

/**
 * Resolve d_agg to a usable number, carrying how it was obtained.
 *
 * Callers must use the returned `ProvenancedValue`, not a bare number, so the assumption
 * cannot be lost between here and the report.
 */
export function resolveMaxAggregateSize(data: ConcreteProjectData): ProvenancedValue<number> {
  if (data.maxAggregateSizeMm !== null) {
    return { ...overridden(data.maxAggregateSizeMm, 'mm'), origin: 'project' };
  }
  return assumed(
    DAGG_ASSUMED_MM,
    msg('codes.aggregate.assumed', { mm: DAGG_ASSUMED_MM }),
    [clause('cirsoc-201', '2025', '25.2.1', 'separación libre mínima de armaduras')],
    'mm',
  );
}

export interface AggregateValidation {
  ok: boolean;
  /** Human-readable problems, each already citing its clause. */
  problems: Array<{ message: EngineMessage; refs: ClauseRef[] }>;
}

/**
 * Validate d_agg against the geometry it has to fit into.
 *
 * CIRSOC 201-2025 §26.4.2.1(a)(5): d_agg must not exceed the least of
 *   (i)   1/5 of the least dimension between form faces,
 *   (ii)  1/3 of the slab thickness,
 *   (iii) 3/4 of the specified minimum clear spacing between bars.
 *
 * (iii) is the same constraint as §25.2.1 seen from the other side — spacing ≥ (4/3)d_agg
 * is exactly d_agg ≤ (3/4)spacing — so a design that satisfies the spacing rule cannot
 * fail (iii). It is still checked, because the project may specify a spacing directly.
 */
export function validateMaxAggregateSize(
  daggMm: number,
  geometry: {
    /** Least clear dimension between form faces, in mm (member width less cover, etc.). */
    leastFormDimensionMm?: number;
    /** Slab thickness in mm, when the member is a slab. */
    slabThicknessMm?: number;
    /** Specified minimum clear spacing between bars, in mm. */
    minClearSpacingMm?: number;
  },
  shotcrete = false,
): AggregateValidation {
  const problems: AggregateValidation['problems'] = [];
  const limitRef = clause('cirsoc-201', '2025', '26.4.2.1(a)(5)',
    'tamaño máximo nominal del agregado grueso');

  if (!Number.isFinite(daggMm) || daggMm < DAGG_MIN_MM || daggMm > DAGG_MAX_MM) {
    problems.push({
      message: msg('codes.aggregate.outOfRange', { dagg: daggMm, min: DAGG_MIN_MM, max: DAGG_MAX_MM }),
      refs: [limitRef],
    });
    // A value this far off makes the remaining comparisons meaningless.
    return { ok: false, problems };
  }

  if (shotcrete && daggMm > DAGG_SHOTCRETE_MAX_MM) {
    problems.push({
      message: msg('codes.aggregate.shotcreteLimit', { dagg: daggMm, limit: DAGG_SHOTCRETE_MAX_MM }),
      refs: [clause('cirsoc-201', '2025', '26.4.2.1(a)(13)', 'hormigón proyectado')],
    });
  }

  const { leastFormDimensionMm, slabThicknessMm, minClearSpacingMm } = geometry;
  if (leastFormDimensionMm !== undefined && daggMm > leastFormDimensionMm / 5) {
    problems.push({
      message: msg('codes.aggregate.formDimension', {
        dagg: daggMm, limit: round(leastFormDimensionMm / 5, 1),
      }),
      refs: [limitRef],
    });
  }
  if (slabThicknessMm !== undefined && daggMm > slabThicknessMm / 3) {
    problems.push({
      message: msg('codes.aggregate.slabThickness', { dagg: daggMm, limit: round(slabThicknessMm / 3, 1) }),
      refs: [limitRef],
    });
  }
  if (minClearSpacingMm !== undefined && daggMm > 0.75 * minClearSpacingMm) {
    problems.push({
      message: msg('codes.aggregate.clearSpacing', {
        dagg: daggMm, limit: round(0.75 * minClearSpacingMm, 1),
      }),
      refs: [limitRef, clause('cirsoc-201', '2025', '25.2.1')],
    });
  }

  return { ok: problems.length === 0, problems };
}

// ─── The persisted settings object ───────────────────────────────

export const CODE_SETTINGS_VERSION = 1;

export interface ProjectCodeSettings {
  /** Bumped whenever the persisted shape changes; drives migration. */
  version: number;
  jurisdiction: Jurisdiction;
  /** Edition of CIRSOC 201 this project is designed to. */
  concreteEdition: RegulationEdition;
  /** Edition of CIRSOC 101 used for load generation. */
  loadEdition: RegulationEdition;
  /** Edition of CIRSOC 102 used for wind generation. */
  windEdition: RegulationEdition;
  concrete: ConcreteProjectData;
}

export function defaultCodeSettings(): ProjectCodeSettings {
  return {
    version: CODE_SETTINGS_VERSION,
    jurisdiction: { ...DEFAULT_JURISDICTION },
    concreteEdition: '2025',
    loadEdition: '2025',
    windEdition: '2025',
    concrete: { ...DEFAULT_CONCRETE_DATA },
  };
}

export interface MigrationNotice {
  /** Stable key for i18n. */
  key: string;
  /** Substitution parameters. */
  params?: Record<string, string | number>;
  severity: 'info' | 'warning';
}

export interface MigrationResult {
  settings: ProjectCodeSettings;
  notices: MigrationNotice[];
}

/**
 * Load settings from a persisted project, migrating older shapes forward.
 *
 * Projects saved before this branch have no code settings at all. Those were designed by
 * a verifier implementing CIRSOC 201-2005 rules, so they are migrated to
 * `concreteEdition: '2005'` — NOT to the 2025 default. Silently re-stamping an old
 * project as 2025 would misrepresent what it was actually checked against.
 *
 * The user can move it to 2025 deliberately, which is a real design decision and
 * produces a warning that results will change.
 */
export function migrateCodeSettings(raw: unknown): MigrationResult {
  const notices: MigrationNotice[] = [];

  if (raw === null || raw === undefined || typeof raw !== 'object') {
    const settings = defaultCodeSettings();
    settings.concreteEdition = '2005';
    settings.loadEdition = '2005';
    settings.windEdition = '2005';
    notices.push({ key: 'codes.migration.legacyProject', severity: 'warning' });
    return { settings, notices };
  }

  const src = raw as Partial<ProjectCodeSettings>;
  const base = defaultCodeSettings();

  const settings: ProjectCodeSettings = {
    version: CODE_SETTINGS_VERSION,
    jurisdiction: {
      name: typeof src.jurisdiction?.name === 'string' ? src.jurisdiction.name : base.jurisdiction.name,
      basis: isAdoptionBasis(src.jurisdiction?.basis) ? src.jurisdiction.basis : base.jurisdiction.basis,
      instrument: typeof src.jurisdiction?.instrument === 'string' ? src.jurisdiction.instrument : undefined,
    },
    concreteEdition: isEdition(src.concreteEdition) ? src.concreteEdition : base.concreteEdition,
    loadEdition: isEdition(src.loadEdition) ? src.loadEdition : base.loadEdition,
    windEdition: isEdition(src.windEdition) ? src.windEdition : base.windEdition,
    concrete: {
      maxAggregateSizeMm:
        typeof src.concrete?.maxAggregateSizeMm === 'number' && Number.isFinite(src.concrete.maxAggregateSizeMm)
          ? src.concrete.maxAggregateSizeMm
          : null,
      shotcrete: src.concrete?.shotcrete === true,
    },
  };

  if (typeof src.version === 'number' && src.version < CODE_SETTINGS_VERSION) {
    notices.push({
      key: 'codes.migration.versionUpgraded',
      params: { from: src.version, to: CODE_SETTINGS_VERSION },
      severity: 'info',
    });
  }
  if (settings.concrete.maxAggregateSizeMm === null) {
    notices.push({ key: 'codes.migration.aggregateAssumed', params: { mm: DAGG_ASSUMED_MM }, severity: 'warning' });
  }

  return { settings, notices };
}

/**
 * Notice produced when the user moves a project between editions.
 *
 * Stabileo has no compatibility requirement to preserve incorrect results, but it does
 * have an obligation to say when stored results stopped being comparable.
 */
export function editionChangeNotice(
  from: RegulationEdition,
  to: RegulationEdition,
): MigrationNotice | null {
  if (from === to) return null;
  return { key: 'codes.migration.editionChanged', params: { from, to }, severity: 'warning' };
}

function isEdition(v: unknown): v is RegulationEdition {
  return v === '2005' || v === '2018' || v === '2024' || v === '2025';
}

function isAdoptionBasis(v: unknown): v is AdoptionBasis {
  return v === 'national' || v === 'adopted' || v === 'voluntary' || v === 'unstated';
}

/** Round-trip helper used by the persistence tests. */
export function serialiseCodeSettings(s: ProjectCodeSettings): unknown {
  return JSON.parse(JSON.stringify(s));
}

/** Everything the report's "bases de cálculo" block needs, already provenanced. */
export function codeSettingsSummary(s: ProjectCodeSettings): {
  dagg: ProvenancedValue<number>;
  jurisdiction: ProvenancedValue<string>;
} {
  return {
    dagg: resolveMaxAggregateSize(s.concrete),
    jurisdiction:
      s.jurisdiction.basis === 'unstated'
        ? assumed(
            // An empty name stays empty: the boundary renders "not stated", because only
            // the boundary knows the reader's language.
            s.jurisdiction.name,
            msg('codes.jurisdiction.unstatedAssumption'),
          )
        : fromProject(s.jurisdiction.name),
  };
}
