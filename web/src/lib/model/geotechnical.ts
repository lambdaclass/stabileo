/**
 * Project geotechnical data.
 *
 * ── Why this is a project entity and not a footing field ────────
 *
 * A bearing pressure is a property of the ground, not of one footing. Ten footings on the
 * same stratum share one geotechnical report, and burying the value inside each of them
 * means ten places to edit it and ten chances for them to disagree — which is exactly how
 * a project ends up with two footings verified against different soils by accident.
 *
 * So the ground lives here, as a small set of named profiles, and a footing carries a
 * REFERENCE. Geometry belongs to the footing; the ground belongs to the project. The
 * Design tab may summarise both and link to their editors, but it does not own a second
 * copy of either.
 *
 * ── No invented defaults ────────────────────────────────────────
 *
 * No regulation states an allowable bearing pressure — it comes from a geotechnical study,
 * and CIRSOC 201 §13.3.1 assumes one has been supplied. A footing whose soil is unstated
 * therefore CANNOT be verified, and this module models that as a first-class state rather
 * than substituting a plausible 200 kPa. `unstated` is a value, not a gap: it is what the
 * gate reads, what the certificate records and what the assumptions sheet prints.
 *
 * Every number that is present carries provenance, because "the report said 250 kPa" and
 * "we assumed 250 kPa pending the report" produce the same arithmetic and different
 * documents.
 *
 * Pure: no store, no runes. Pressures kPa, unit weights kN/m³, subgrade moduli kN/m³,
 * lengths m.
 */

import { msg, type EngineMessage } from '../codes/message';

export const GEOTECHNICAL_SCHEMA_VERSION = 1;

/**
 * How the project states the ground's resistance.
 *
 * Only two forms, deliberately. `allowablePressure` is what a geotechnical report for an
 * ordinary building actually delivers, and it is what §13.3.1's service-level comparison
 * consumes. A drained/undrained bearing-capacity formulation with c′, φ′ and shape
 * factors is a different workflow with different inputs; offering an empty version of it
 * would be a menu entry that produces no numbers.
 */
export type BearingResistance =
  /** Service-level allowable bearing pressure, kPa. The ordinary case. */
  | { kind: 'allowablePressure'; allowableBearingKPa: number }
  /**
   * Not stated. A footing founded on this profile cannot be verified for bearing, and
   * says so. This is the initial state of a new profile — not an error condition.
   */
  | { kind: 'unstated' };

/** Where a geotechnical value came from. Drives the badge, the PDF and the XLSX sheet. */
export type GeotechnicalSource =
  /** Taken from a geotechnical study. `reference` should name it. */
  | 'report'
  /** Assumed by the engineer pending a study. Legitimate, and must be visible. */
  | 'assumed'
  /** Nothing recorded yet. */
  | 'unstated';

export interface GeotechnicalProvenance {
  source: GeotechnicalSource;
  /**
   * Free text naming the study, borehole, date or the basis of the assumption. Free text
   * because a report reference is not enumerable; it is transcribed onto the drawing as
   * the engineer wrote it.
   */
  reference: string;
}

/**
 * One named ground condition.
 *
 * Nullable numbers throughout, and null means "not stated" rather than zero. A subgrade
 * modulus of 0 kN/m³ is a physically meaningful (and absurd) value; the absence of one is
 * not, and conflating them is how a Winkler run silently produces infinite settlement.
 */
export interface SoilProfile {
  id: number;
  name: string;
  bearing: BearingResistance;
  /**
   * Soil unit weight, kN/m³. Consumed for the overburden over the footing when the
   * founding level is below grade. Null until stated.
   */
  unitWeightKNm3: number | null;
  /**
   * Winkler subgrade modulus, kN/m³. Consumed ONLY by the Winkler workflow
   * (`solve_winkler_2d`/`3d`). Null is the ordinary state for a project that does not use
   * it, and must not block an isolated-footing check that never reads it.
   */
  subgradeModulusKNm3: number | null;
  /**
   * Groundwater depth below grade, m. Consumed only where a check actually reads it; it is
   * recorded rather than acted on until then, so the assumption is at least visible.
   */
  groundwaterDepthM: number | null;
  provenance: GeotechnicalProvenance;
}

export interface ProjectGeotechnical {
  version: number;
  profiles: SoilProfile[];
  /** Which profile a newly created footing references. Null when there are none. */
  defaultProfileId: number | null;
}

// ─── Construction ────────────────────────────────────────────────

export function emptyGeotechnical(): ProjectGeotechnical {
  return { version: GEOTECHNICAL_SCHEMA_VERSION, profiles: [], defaultProfileId: null };
}

/**
 * A new profile, with resistance UNSTATED.
 *
 * Creating a profile is the engineer saying "there is a stratum here", which is not the
 * same as knowing its capacity. Seeding a number here would put an invented value behind
 * a name the engineer chose, which reads as theirs.
 */
export function newSoilProfile(id: number, name: string): SoilProfile {
  return {
    id,
    name,
    bearing: { kind: 'unstated' },
    unitWeightKNm3: null,
    subgradeModulusKNm3: null,
    groundwaterDepthM: null,
    provenance: { source: 'unstated', reference: '' },
  };
}

export function findProfile(
  geo: ProjectGeotechnical | undefined, id: number | null | undefined,
): SoilProfile | undefined {
  if (!geo || id === null || id === undefined) return undefined;
  return geo.profiles.find((p) => p.id === id);
}

// ─── Validation ──────────────────────────────────────────────────

export type GeotechnicalIssueSeverity =
  /** Blocks a check that consumes the value. */
  | 'blocking'
  /** The value is present but the engineer owns it — show it, do not block. */
  | 'advisory';

export interface GeotechnicalIssue {
  severity: GeotechnicalIssueSeverity;
  profileId: number;
  message: EngineMessage;
}

/**
 * Validate a profile's numbers.
 *
 * `unstated` resistance is reported as BLOCKING, because bearing cannot be checked without
 * it — but only against the profile, not against the project. A project may legitimately
 * carry a half-filled profile for a stratum no footing is founded on yet; whether that
 * blocks anything is decided per footing, at the footing gate, by whoever references it.
 *
 * An `assumed` value is ADVISORY: assuming a bearing pressure pending the soil report is
 * ordinary practice, and refusing to design until the report arrives would make the tool
 * useless during the phase engineers most need it. The assumption must be visible in every
 * document, which is what the provenance is for.
 */
export function validateSoilProfile(p: SoilProfile): GeotechnicalIssue[] {
  const out: GeotechnicalIssue[] = [];
  const blocking = (message: EngineMessage) =>
    out.push({ severity: 'blocking', profileId: p.id, message });
  const advisory = (message: EngineMessage) =>
    out.push({ severity: 'advisory', profileId: p.id, message });

  if (p.name.trim() === '') {
    advisory(msg('geotechnical.issue.unnamed', { id: p.id }));
  }

  if (p.bearing.kind === 'unstated') {
    blocking(msg('geotechnical.issue.bearingUnstated', { profile: p.name }));
  } else if (!(p.bearing.allowableBearingKPa > 0)) {
    // Zero or negative is not "unstated" — it is a number that cannot be right, and it
    // would sail through a `!= null` check and divide into a utilisation of Infinity.
    blocking(msg('geotechnical.issue.bearingNotPositive', {
      profile: p.name, value: p.bearing.allowableBearingKPa,
    }));
  }

  if (p.unitWeightKNm3 !== null && !(p.unitWeightKNm3 > 0)) {
    blocking(msg('geotechnical.issue.unitWeightNotPositive', {
      profile: p.name, value: p.unitWeightKNm3,
    }));
  }
  if (p.subgradeModulusKNm3 !== null && !(p.subgradeModulusKNm3 > 0)) {
    blocking(msg('geotechnical.issue.subgradeNotPositive', {
      profile: p.name, value: p.subgradeModulusKNm3,
    }));
  }
  if (p.groundwaterDepthM !== null && p.groundwaterDepthM < 0) {
    blocking(msg('geotechnical.issue.groundwaterNegative', {
      profile: p.name, value: p.groundwaterDepthM,
    }));
  }

  if (p.provenance.source === 'assumed' && p.provenance.reference.trim() === '') {
    // An assumption with no stated basis is the one that survives to construction.
    advisory(msg('geotechnical.issue.assumedWithoutBasis', { profile: p.name }));
  }
  if (p.provenance.source === 'unstated' && p.bearing.kind === 'allowablePressure') {
    advisory(msg('geotechnical.issue.valueWithoutProvenance', { profile: p.name }));
  }

  return out;
}

export function validateGeotechnical(geo: ProjectGeotechnical): GeotechnicalIssue[] {
  return geo.profiles.flatMap(validateSoilProfile);
}

/**
 * The assumption messages this profile contributes to a document.
 *
 * Separate from validation: an assumption is not a problem, and printing it in the
 * problems list would train the reader to dismiss it. This is what the PDF assumptions
 * section and the XLSX assumptions sheet enumerate.
 */
export function geotechnicalAssumptions(p: SoilProfile): EngineMessage[] {
  const out: EngineMessage[] = [];
  if (p.provenance.source === 'assumed') {
    out.push(msg('geotechnical.assumption.assumed', {
      profile: p.name,
      basis: p.provenance.reference.trim() === ''
        ? msg('geotechnical.assumption.noBasis')
        : p.provenance.reference,
    }));
  }
  if (p.bearing.kind === 'allowablePressure' && p.provenance.source === 'report') {
    out.push(msg('geotechnical.assumption.fromReport', {
      profile: p.name,
      value: p.bearing.allowableBearingKPa,
      reference: p.provenance.reference.trim() === ''
        ? msg('geotechnical.assumption.unnamedReport')
        : p.provenance.reference,
    }));
  }
  if (p.groundwaterDepthM !== null) {
    // Recorded but not yet consumed by any check. Saying so is the honest form; silently
    // storing it would imply a buoyancy check that does not exist.
    out.push(msg('geotechnical.assumption.groundwaterRecordedOnly', {
      profile: p.name, depth: p.groundwaterDepthM,
    }));
  }
  return out;
}

// ─── Migration ───────────────────────────────────────────────────

export interface GeotechnicalMigration {
  geotechnical: ProjectGeotechnical;
  notices: EngineMessage[];
}

/**
 * Read any persisted shape, including none.
 *
 * A project saved before foundations existed has no geotechnical data, and gets an EMPTY
 * set rather than a seeded profile: inventing a stratum a user never entered, and then
 * founding their footings on it, is worse than having none.
 */
export function migrateGeotechnical(raw: unknown): GeotechnicalMigration {
  const notices: EngineMessage[] = [];
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return { geotechnical: emptyGeotechnical(), notices };
  }
  const src = raw as Record<string, unknown>;
  const rawProfiles = Array.isArray(src.profiles) ? src.profiles : [];
  const profiles: SoilProfile[] = [];
  const seen = new Set<number>();

  for (const entry of rawProfiles) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === 'number' && Number.isFinite(e.id) ? e.id : null;
    if (id === null || seen.has(id)) continue;
    seen.add(id);

    const name = typeof e.name === 'string' ? e.name : '';
    const rawBearing = e.bearing as Record<string, unknown> | undefined;
    let bearing: BearingResistance = { kind: 'unstated' };
    if (rawBearing && rawBearing.kind === 'allowablePressure') {
      const v = rawBearing.allowableBearingKPa;
      if (typeof v === 'number' && Number.isFinite(v)) {
        bearing = { kind: 'allowablePressure', allowableBearingKPa: v };
      } else {
        // A stored pressure that is not a finite number is dropped to `unstated` and the
        // user is told, rather than carried as NaN into a utilisation.
        notices.push(msg('geotechnical.migration.bearingDropped', { profile: name }));
      }
    }

    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    const source: GeotechnicalSource =
      e.provenance && typeof e.provenance === 'object'
        && ['report', 'assumed', 'unstated']
          .includes(String((e.provenance as Record<string, unknown>).source))
        ? (e.provenance as { source: GeotechnicalSource }).source
        : 'unstated';
    const reference =
      e.provenance && typeof e.provenance === 'object'
        && typeof (e.provenance as Record<string, unknown>).reference === 'string'
        ? (e.provenance as { reference: string }).reference
        : '';

    profiles.push({
      id,
      name,
      bearing,
      unitWeightKNm3: num(e.unitWeightKNm3),
      subgradeModulusKNm3: num(e.subgradeModulusKNm3),
      groundwaterDepthM: num(e.groundwaterDepthM),
      provenance: { source, reference },
    });
  }

  const storedDefault = typeof src.defaultProfileId === 'number' ? src.defaultProfileId : null;
  const defaultProfileId = profiles.some((p) => p.id === storedDefault)
    ? storedDefault
    : (profiles[0]?.id ?? null);

  return {
    geotechnical: { version: GEOTECHNICAL_SCHEMA_VERSION, profiles, defaultProfileId },
    notices,
  };
}
