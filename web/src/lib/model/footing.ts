/**
 * Isolated spread footings, as a first-class modelled entity.
 *
 * ── Why this exists ─────────────────────────────────────────────
 *
 * `foundation-check.ts` has been complete and unit-tested since PR18 opened, and no user
 * could reach it, because the model carried nothing to check. There were no plan
 * dimensions, no thickness and no soil anywhere in `StructureModel`. The two ways out of
 * that were both wrong:
 *
 *   * infer a footing under every support from the reaction — that produces numbers with
 *     the appearance of a design for a foundation nobody dimensioned;
 *   * take the dimensions from a transient dialog at run time — that produces a
 *     verification that cannot be reopened, re-run, revised or drawn.
 *
 * So a footing is a persisted entity with an identity, like a node or a shell. It survives
 * save/open, undo, tab switch and URL share, it can be selected and deleted, and it carries
 * the revision metadata that lets its design go stale when it is edited.
 *
 * ── The division of ownership ───────────────────────────────────
 *
 * GEOMETRY and materials live here. The GROUND lives in `geotechnical.ts` and is
 * referenced by id, because a bearing pressure is a property of a stratum shared by many
 * footings rather than of one footing. This split is the reason the Design tab can
 * summarise both and own neither.
 *
 * ── No invented defaults for anything that decides an outcome ───
 *
 * A new footing gets a geometry that is a starting point (0,50 m thickness and no plan
 * dimensions is not a design), and it gets NO soil. `B` and `L` start at zero, which fails
 * validation loudly, rather than at a plausible 1,50 m that would pass a bearing check the
 * engineer never made. Cover follows the project's own detailing default because it is a
 * detailing convention rather than a strength decision.
 *
 * Pure: no store, no runes. Lengths m, strengths MPa, angles degrees.
 */

import { msg, type EngineMessage } from '../codes/message';
import type { FootingKind } from '../engine/detailing/foundation-check';

export const FOOTING_SCHEMA_VERSION = 1;

/** A raised block between the footing and the column, where one is used. */
export interface Pedestal {
  /** Plan dimensions, m, in the footing's local axes. */
  B: number;
  L: number;
  /** Height above the top of the footing, m. */
  height: number;
}

export interface Footing {
  id: number;
  /** Engineer-facing label, e.g. "Z1". Carried onto the plan, the schedule and the mark. */
  name: string;
  /**
   * The supported node. This is where the reaction is read, so it is required — a footing
   * with no node has no load and cannot be checked.
   */
  nodeId: number;
  /**
   * The supported column, when one is identifiable.
   *
   * Optional on purpose: a footing under a pinned support with nothing modelled above it is
   * still a footing, and its bearing and thickness are still checkable. What the column
   * reference adds is the punching perimeter and the dowel/starter geometry, so a footing
   * without one reports those as unsupported rather than guessing a column size.
   */
  columnElementId?: number;
  kind: FootingKind;
  /** Plan dimensions, m, along the footing's local axes after `rotationDeg`. */
  B: number;
  L: number;
  /** Overall thickness, m. */
  thickness: number;
  /** Plan rotation of the local axes about global Z, degrees. */
  rotationDeg: number;
  /**
   * Plan offset of the footing centroid from the supported node, m, in local axes.
   *
   * This is a real design device, not a modelling convenience: a footing beside a property
   * line is deliberately eccentric, and the resulting moment is part of its bearing check.
   */
  eccentricityB: number;
  eccentricityL: number;
  pedestal?: Pedestal;
  /**
   * Concrete material. Null means the project default resolution applies (the minimum f'c
   * across the concretes in use), exactly as the shell families resolve it.
   */
  concreteMaterialId: number | null;
  /**
   * Reinforcement material.
   *
   * Null is the ORDINARY case today, and that is a statement about the app rather than
   * about the footing: there is no distinct rebar-material entity — reinforcement f_y comes
   * from the shared `DEFAULT_REBAR_FY` default. The reference is modelled anyway so that a
   * footing's steel grade is a property of the footing the day materials gain rebar grades,
   * instead of a migration. Resolution is explicit and provenanced at the point of use, so
   * a certificate can state which of the two it used.
   */
  rebarMaterialId: number | null;
  /** Clear cover to the bottom mat, m. */
  cover: number;
  /** Elevation of the UNDERSIDE, m in global Z. Fixes the embedment against grade. */
  foundingElevation: number;
  /** The stratum this footing bears on — an id into `ProjectGeotechnical.profiles`. */
  soilProfileId: number | null;
  /**
   * Bumped on every edit that changes an outcome.
   *
   * Per-footing rather than only project-wide so invalidation can be targeted: editing Z7
   * must retire Z7's design and leave Z1..Z6 alone.
   */
  revision: number;
}

/** Default thickness for a new footing, m. A starting point, not a design. */
export const NEW_FOOTING_THICKNESS_M = 0.5;

/**
 * A new footing on a node.
 *
 * `B` and `L` are ZERO. That is deliberate and is the whole posture of this module: a new
 * footing is invalid until dimensioned, and it says so, rather than arriving at a plausible
 * size that would quietly pass a bearing check nobody performed.
 */
export function newFooting(
  id: number, nodeId: number, name: string,
  opts: { cover: number; foundingElevation: number; soilProfileId: number | null },
): Footing {
  return {
    id,
    name,
    nodeId,
    kind: 'isolated',
    B: 0,
    L: 0,
    thickness: NEW_FOOTING_THICKNESS_M,
    rotationDeg: 0,
    eccentricityB: 0,
    eccentricityL: 0,
    concreteMaterialId: null,
    rebarMaterialId: null,
    cover: opts.cover,
    foundingElevation: opts.foundingElevation,
    soilProfileId: opts.soilProfileId,
    revision: 1,
  };
}

/**
 * Effective depth to the bottom mat, m.
 *
 * `thickness - cover - one bar diameter` is the honest approximation for a two-way mat
 * whose two layers sit at different depths; the deeper direction is the one that governs
 * flexure and the shallower governs the other way. A single `d` is what
 * `foundation-check.ts` consumes, so this returns the AVERAGE mat depth and the caller
 * records that as an assumption rather than presenting it as exact.
 */
export function footingEffectiveDepth(f: Footing, barDiameterMm: number): number {
  const db = barDiameterMm / 1000;
  return Math.max(0, f.thickness - f.cover - db);
}

// ─── Validation ──────────────────────────────────────────────────

export type FootingIssueSeverity = 'blocking' | 'advisory';

export interface FootingIssue {
  severity: FootingIssueSeverity;
  footingId: number;
  message: EngineMessage;
}

/**
 * Validate a footing's own geometry.
 *
 * This does NOT look at the ground or the reaction — it answers only "is this a
 * dimensionally coherent footing". Whether it is verifiable is a separate question asked at
 * the gate, because it depends on the soil profile, the column and the analysis, and
 * mixing the two would make a missing reaction look like a geometry error.
 */
export function validateFooting(f: Footing): FootingIssue[] {
  const out: FootingIssue[] = [];
  const blocking = (message: EngineMessage) =>
    out.push({ severity: 'blocking', footingId: f.id, message });
  const advisory = (message: EngineMessage) =>
    out.push({ severity: 'advisory', footingId: f.id, message });

  if (f.name.trim() === '') advisory(msg('footing.issue.unnamed', { id: f.id }));

  if (!(f.B > 0)) blocking(msg('footing.issue.planDimension', { footing: f.name, axis: 'B', value: f.B }));
  if (!(f.L > 0)) blocking(msg('footing.issue.planDimension', { footing: f.name, axis: 'L', value: f.L }));
  if (!(f.thickness > 0)) {
    blocking(msg('footing.issue.thicknessNotPositive', { footing: f.name, value: f.thickness }));
  }
  if (f.cover < 0) blocking(msg('footing.issue.coverNegative', { footing: f.name, value: f.cover }));

  // Cover from both faces cannot consume the section. Without this, `d` goes to zero or
  // negative and every shear utilisation becomes Infinity — a "failure" whose cause is
  // unreadable from the result.
  if (f.thickness > 0 && f.cover > 0 && 2 * f.cover >= f.thickness) {
    blocking(msg('footing.issue.coverExceedsThickness', {
      footing: f.name, cover: f.cover, thickness: f.thickness,
    }));
  }

  if (!Number.isFinite(f.rotationDeg)) {
    blocking(msg('footing.issue.rotationNotFinite', { footing: f.name }));
  }

  if (f.pedestal) {
    const p = f.pedestal;
    if (!(p.B > 0) || !(p.L > 0)) {
      blocking(msg('footing.issue.pedestalPlan', { footing: f.name }));
    }
    if (!(p.height > 0)) {
      blocking(msg('footing.issue.pedestalHeight', { footing: f.name, value: p.height }));
    }
    // A pedestal wider than its footing is not a pedestal.
    if (f.B > 0 && f.L > 0 && (p.B > f.B || p.L > f.L)) {
      blocking(msg('footing.issue.pedestalLargerThanFooting', { footing: f.name }));
    }
  }

  // Eccentricity beyond the footing's own half-dimension puts the column outside the base.
  if (f.B > 0 && Math.abs(f.eccentricityB) >= f.B / 2) {
    blocking(msg('footing.issue.eccentricityOutside', {
      footing: f.name, axis: 'B', value: f.eccentricityB,
    }));
  }
  if (f.L > 0 && Math.abs(f.eccentricityL) >= f.L / 2) {
    blocking(msg('footing.issue.eccentricityOutside', {
      footing: f.name, axis: 'L', value: f.eccentricityL,
    }));
  }

  if (f.kind !== 'isolated') {
    // Not an error — a modelled intent the engine cannot yet check. It must be visible as
    // an unsupported capability rather than silently checked as if it were isolated.
    advisory(msg('footing.issue.kindUnsupported', { footing: f.name, kind: f.kind }));
  }

  return out;
}

export function validateFootings(footings: Iterable<Footing>): FootingIssue[] {
  const out: FootingIssue[] = [];
  for (const f of footings) out.push(...validateFooting(f));
  return out;
}

// ─── Migration ───────────────────────────────────────────────────

export interface FootingMigration {
  footings: Map<number, Footing>;
  notices: EngineMessage[];
}

const FOOTING_KINDS: readonly FootingKind[] = ['isolated', 'combined', 'strip', 'mat', 'pileCap'];

/**
 * Read any persisted shape, including none.
 *
 * A footing whose stored `nodeId` is not a number is DROPPED with a notice rather than
 * repaired: a footing attached to nothing has no reaction, and inventing a node for it
 * would move someone's foundation.
 */
export function migrateFootings(raw: unknown, defaults: { cover: number }): FootingMigration {
  const notices: EngineMessage[] = [];
  const footings = new Map<number, Footing>();
  if (!Array.isArray(raw)) return { footings, notices };

  for (const entry of raw) {
    // Persisted as [id, value] pairs, matching every other Map family on the model.
    const value = Array.isArray(entry) ? entry[1] : entry;
    if (!value || typeof value !== 'object') continue;
    const e = value as Record<string, unknown>;

    const id = typeof e.id === 'number' && Number.isFinite(e.id) ? e.id : null;
    if (id === null || footings.has(id)) continue;
    const nodeId = typeof e.nodeId === 'number' && Number.isFinite(e.nodeId) ? e.nodeId : null;
    if (nodeId === null) {
      notices.push(msg('footing.migration.droppedNoNode', { id }));
      continue;
    }

    const num = (v: unknown, fallback: number): number =>
      typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    const nullableId = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;

    let pedestal: Pedestal | undefined;
    if (e.pedestal && typeof e.pedestal === 'object') {
      const p = e.pedestal as Record<string, unknown>;
      pedestal = { B: num(p.B, 0), L: num(p.L, 0), height: num(p.height, 0) };
    }

    const kind = FOOTING_KINDS.includes(e.kind as FootingKind)
      ? (e.kind as FootingKind)
      : 'isolated';

    footings.set(id, {
      id,
      name: typeof e.name === 'string' ? e.name : '',
      nodeId,
      ...(typeof e.columnElementId === 'number' && Number.isFinite(e.columnElementId)
        ? { columnElementId: e.columnElementId }
        : {}),
      kind,
      B: num(e.B, 0),
      L: num(e.L, 0),
      thickness: num(e.thickness, NEW_FOOTING_THICKNESS_M),
      rotationDeg: num(e.rotationDeg, 0),
      eccentricityB: num(e.eccentricityB, 0),
      eccentricityL: num(e.eccentricityL, 0),
      ...(pedestal ? { pedestal } : {}),
      concreteMaterialId: nullableId(e.concreteMaterialId),
      rebarMaterialId: nullableId(e.rebarMaterialId),
      cover: num(e.cover, defaults.cover),
      foundingElevation: num(e.foundingElevation, 0),
      soilProfileId: nullableId(e.soilProfileId),
      revision: num(e.revision, 1),
    });
  }

  return { footings, notices };
}
