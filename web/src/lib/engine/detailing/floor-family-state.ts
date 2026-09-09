/**
 * What the floor pass actually knows about each family — and what it does not.
 *
 * ── The defect this exists to remove ───────────────────────────────
 *
 * `FloorFamiliesPanel` read its counts as `floorRun?.slabs.length ?? 0`. With no run, that is
 * `0`, and `0` is rendered in the family tab exactly the way a real zero is. So a project that
 * had never been through the floor pass told the engineer it had **no slabs**, which is
 * indistinguishable from "the pass ran and found none" and is the more alarming of the two
 * readings. The same `?? 0` was on walls, and `footingRun?.outcomes ?? []` did it for footings.
 *
 * A count that is not known is `null` here, never `0`. The caller renders an explanation in
 * its place. That is the whole point of this module: the absence of a run is a STATE, not a
 * quantity.
 *
 * ── Where each state comes from ────────────────────────────────────
 *
 *   notRun       `run === null`                    — the pass has not produced a result
 *   noElements   `readiness.shellCount === 0`      — model fact, knowable WITHOUT running
 *                `footingCount === 0`
 *   skipped      classified in the family, and in neither the designed nor the refused set
 *   designed     `run.slabs[]` / `run.walls[]`     — real results with layers and shear
 *   refused      `run.unsupported[]`               — each entry names its element
 *   provisional  a designed result whose `maturity` is not validated, or whose own
 *                `unsupported[]` is non-empty — it designed, and not completely
 *   error        `store.lastError`                 — the pass threw
 *
 * ── Two classifications nobody was showing ────────────────────────
 *
 * `ShellFamily` is `'slab' | 'wall' | 'inclined' | 'degenerate'`. The panel had a tab for
 * slabs, a tab for walls, and nowhere for the other two: an inclined shell — a ramp, a stair
 * soffit, a pitched roof slab — and a degenerate one, whose geometry the classifier could not
 * resolve. Both were classified by the run and then vanished from every count, because they
 * are in neither `slabs[]` nor `walls[]` and, unless they happened to raise an `unsupported`,
 * in nothing else either.
 *
 * They are reported here as their own figures. A shell the app cannot design is a fact the
 * engineer needs; silently dropping it is the failure mode this module is written against.
 *
 * Pure: no store, no runes, no i18n. The caller supplies the data and words the result.
 */

import type { ShellFamily } from './run-floor-design';

export type FloorFamilyKey = 'slabs' | 'walls' | 'foundations';

export type FloorFamilyStateKind =
  /** The pass threw. Any figures on hand belong to an earlier run. */
  | 'error'
  /** The model has nothing of this family. Known without running. */
  | 'noElements'
  /** No run has classified anything yet. Counts are unknown, not zero. */
  | 'notRun'
  /** Designed, and something about it is incomplete. */
  | 'provisional'
  /** The pass refused at least one member and designed none. */
  | 'refused'
  /** Classified, and neither designed nor refused — out of the run's scope. */
  | 'skipped'
  /** Designed, with nothing outstanding. */
  | 'designed';

export interface FloorFamilyState {
  family: FloorFamilyKey;
  /**
   * The headline state, chosen by CAUTION rather than by majority.
   *
   * A family with forty designed panels and one refusal reports `refused` in its detail
   * counts and keeps `designed` as its headline only when nothing is outstanding. The
   * ordering below never lets a success hide a limitation, and never lets one refusal
   * describe a floor that mostly worked — which is why every count travels with it.
   */
  kind: FloorFamilyStateKind;
  /**
   * Members of this family the run classified. `null` when no run has happened.
   *
   * NEVER `0` for "unknown". A `0` here means the run looked and found none.
   */
  classified: number | null;
  designed: number | null;
  refused: number | null;
  provisional: number | null;
  skipped: number | null;
  /** Shells classified as neither slab nor wall. Reported, never dropped. */
  inclined: number | null;
  degenerate: number | null;
  /** True when a count cannot be stated yet, so the caller renders a reason instead. */
  countsUnavailable: boolean;
}

/** A designed result carries enough to say whether it is complete. */
export interface DesignedProbe {
  /** `MaturityRecord.level`, or whatever the record calls its verdict. */
  maturity?: { level?: string } | null;
  /** Conditions the design itself could not cover. */
  unsupported?: readonly string[];
}

export interface FloorFamilyInput {
  run: {
    slabs: readonly DesignedProbe[];
    walls: readonly DesignedProbe[];
    classifications: readonly { elementId: number; family: ShellFamily }[];
    unsupported: readonly { elementId: number }[];
  } | null;
  /** Model census. `shellCount` is knowable with no run at all. */
  readiness: { shellCount: number };
  footingCount: number;
  footingRun: { outcomes: readonly { check: unknown }[] } | null;
  /**
   * The store's last error.
   *
   * NOTE — this channel is shared with the beam/column pass: `detailingStore.lastError` is
   * written by `generate()` too. So an error raised by a beam run will colour the floor
   * families until the next floor run clears it. Attributing it precisely needs a per-pass
   * error on the store, which is a store change and is recorded as debt rather than guessed
   * at here.
   */
  error: string | null;
}

/** A design that is not fully validated, or that names conditions it could not cover. */
function isProvisional(d: DesignedProbe): boolean {
  if (d.unsupported && d.unsupported.length > 0) return true;
  const level = d.maturity?.level;
  // Absent or non-validated maturity is provisional. Only an explicit VALIDATED clears it —
  // the default must be the cautious reading, never the flattering one.
  return level == null || level !== 'VALIDATED';
}

function headline(s: {
  designed: number; refused: number; provisional: number; skipped: number;
}): FloorFamilyStateKind {
  if (s.provisional > 0) return 'provisional';
  if (s.refused > 0 && s.designed === 0) return 'refused';
  if (s.designed === 0 && s.skipped > 0) return 'skipped';
  if (s.designed > 0) return s.refused > 0 ? 'provisional' : 'designed';
  return 'skipped';
}

function shellFamily(key: FloorFamilyKey): ShellFamily | null {
  return key === 'slabs' ? 'slab' : key === 'walls' ? 'wall' : null;
}

/**
 * The state of one shell family — slabs or walls.
 *
 * `noElements` is decided from the MODEL, before any run, because "this building has no
 * walls" is a fact about the building and does not need a design pass to be true. It
 * therefore outranks `notRun`: telling someone their model has no walls is more useful than
 * telling them a pass has not run over the walls they do not have.
 */
function shellState(key: 'slabs' | 'walls', input: FloorFamilyInput): FloorFamilyState {
  const empty = {
    family: key, classified: null, designed: null, refused: null, provisional: null,
    skipped: null, inclined: null, degenerate: null, countsUnavailable: true,
  } as const;

  if (input.error) return { ...empty, kind: 'error' };
  if (input.readiness.shellCount === 0) return { ...empty, kind: 'noElements' };
  if (!input.run) return { ...empty, kind: 'notRun' };

  const fam = shellFamily(key)!;
  const inFamily = input.run.classifications.filter((c) => c.family === fam);
  const refusedIds = new Set(input.run.unsupported.map((u) => u.elementId));
  const results = key === 'slabs' ? input.run.slabs : input.run.walls;

  const classified = inFamily.length;
  const designed = results.length;
  const refused = inFamily.filter((c) => refusedIds.has(c.elementId)).length;
  const provisional = results.filter(isProvisional).length;
  // What the run classified into this family and then neither designed nor refused. Derived
  // by subtraction because that is the only honest source: the run does not publish a
  // "skipped" list, and inventing one would be the same sin as the zero this replaces.
  const skipped = Math.max(0, classified - designed - refused);

  return {
    family: key,
    kind: headline({ designed, refused, provisional, skipped }),
    classified, designed, refused, provisional, skipped,
    inclined: input.run.classifications.filter((c) => c.family === 'inclined').length,
    degenerate: input.run.classifications.filter((c) => c.family === 'degenerate').length,
    countsUnavailable: false,
  };
}

/**
 * The state of the foundations family.
 *
 * Footings do not go through shell classification: they are modelled objects with their own
 * per-footing gate, and `footingRun.outcomes` is one entry each. `check === null` is the
 * engine saying it could not check that footing — a refusal, not a zero.
 */
function foundationState(input: FloorFamilyInput): FloorFamilyState {
  const empty = {
    family: 'foundations' as const, classified: null, designed: null, refused: null,
    provisional: null, skipped: null, inclined: null, degenerate: null,
    countsUnavailable: true,
  } as const;

  if (input.error) return { ...empty, kind: 'error' };
  if (input.footingCount === 0) return { ...empty, kind: 'noElements' };
  if (!input.footingRun) return { ...empty, kind: 'notRun' };

  const outcomes = input.footingRun.outcomes;
  const designed = outcomes.filter((o) => o.check !== null).length;
  const refused = outcomes.length - designed;
  // Modelled footings the run never reported on. Not zero-filled: a footing absent from the
  // outcomes was outside the run's scope, and that is a different fact from being refused.
  const skipped = Math.max(0, input.footingCount - outcomes.length);

  return {
    family: 'foundations',
    kind: headline({ designed, refused, provisional: 0, skipped }),
    classified: input.footingCount,
    designed, refused, provisional: 0, skipped,
    inclined: null, degenerate: null,
    countsUnavailable: false,
  };
}

export function floorFamilyStates(input: FloorFamilyInput): FloorFamilyState[] {
  return [
    shellState('slabs', input),
    shellState('walls', input),
    foundationState(input),
  ];
}

/**
 * Shells the run classified as neither slab nor wall.
 *
 * Surfaced separately because they belong to no tab and were therefore invisible. `null` when
 * no run has classified anything — the same rule as every other count here.
 */
export function offFamilyShells(input: FloorFamilyInput): {
  inclined: number; degenerate: number; total: number;
} | null {
  if (!input.run) return null;
  const inclined = input.run.classifications.filter((c) => c.family === 'inclined').length;
  const degenerate = input.run.classifications.filter((c) => c.family === 'degenerate').length;
  return { inclined, degenerate, total: inclined + degenerate };
}
