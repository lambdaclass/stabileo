/**
 * What a user chose at a joint, how that survives a save, and why an id is not enough.
 *
 * ── Why this is a module and not part of the store ──────────────────
 *
 * `JointChoices` used to live inside `joint-design.svelte.ts`, which imports `modelStore`. Once
 * the choices had to travel on the model — see below — the model would have had to import the
 * store back for its type, so the type moved to the module both of them can read. No runes and
 * no store access live here: this file is data and two pure functions.
 *
 * ── I-06: the choices had nowhere to be stored ──────────────────────
 *
 * The store held them in a `$state` Map and in nothing else. They were not in `snapshot()`, not
 * in `restore()`, not in the URL codec and not in any serialiser, so twenty designed joints were
 * lost on closing the tab — the only capability in M2 whose result could not be kept.
 *
 * They now live on `StructureModel.jointDesigns`, which is the same decision `codeSettings`,
 * `regulations` and `detailing` already took: on the model they travel through every persistence
 * path for free — `.ded`, undo/redo, tab capture, autosave — rather than through four that each
 * have to remember.
 *
 * Only the CHOICES are stored, which is the store's existing rule and not a new one. Demands,
 * capacities, the plate outline and the batten stations are recomputed on read, so a saved joint
 * can never report a check against a member that has since been deleted.
 *
 * ── I-07: a node id is not an identity ─────────────────────────────
 *
 * Choices are keyed by node id, and a node id is only meaningful inside the model that issued
 * it. Load a second model in the same session and its node 5 is a different node — same integer,
 * different structure. Taking the stored choices for it would present as chosen something the
 * user never chose for THIS model, which is the defect shape this branch chased three times: a
 * plausible value occupying the place of an absent one.
 *
 * So a stored joint records what it was designed against, and reconciliation checks that rather
 * than trusting the integer:
 *
 *   · `atMm` — where the node was, to the millimetre. A node at a different place is a different
 *     node, whatever its id says;
 *   · `memberCount` — how many members touched it. Same place, different fan of members, is a
 *     different joint.
 *
 * A joint that fails either check is **obsolete**, not deleted and not applied. Deleting would
 * throw away work over a moved node; applying would be the silent association. Obsolete is a
 * third answer, it is visible in the panel, and it has a remedy.
 */

import type { BoltLayoutChoice } from './bolted-joint';
import type { WeldInput } from './fillet-weld';
import type { BuiltUpArrangement } from '../section/profile-spec';

/** What a user chose for one joint. Choices only — nothing computed lives here. */
export interface JointChoices {
  bolts?: BoltLayoutChoice | null;
  plate?: { thicknessMm?: number; fuMPa?: number };
  weld?: WeldInput | null;
  /** Set when the members meeting here are built-up and battens are being detailed. */
  battens?: {
    arrangement: BuiltUpArrangement; gapMm: number; lengthM?: number; segments?: number;
    /**
     * The chord's minimum radius of gyration, mm — `ri` in §E.6.3.1(b)'s `λ₁ = a / ri`.
     *
     * An input rather than a lookup: several members meet a joint and the app cannot know which
     * one is the chord being battened. Guessing would put a number into a slenderness the user
     * never checked.
     */
    chordRiMm?: number;
    /**
     * The member the layout is detailed for.
     *
     * Stored so a re-render cannot quietly move the reference back to the longest member: the
     * preload is an initial SELECTION, and once a user changes it the choice is theirs.
     */
    memberId?: number;
  } | null;
}

/** Where a joint was, and what met it, at the moment it was designed. */
export interface JointFingerprint {
  /**
   * Node position in millimetres, rounded. Integers, so a save/open cycle is exact.
   *
   * Optional, and the absence is a claim: «this joint cannot be vouched for». It is what the
   * store writes when a choice is recorded against a node the model does not have, and what a
   * project hand-edited or written by an older version can arrive with. Reconciliation reads it
   * as `nodeMoved` rather than matching on the id alone.
   *
   * NOT `NaN`, which was the first version and was wrong across the file boundary: `JSON`
   * serialises `NaN` as `null`, and `null` coerces to `0` in the tolerance comparison — so a
   * joint that could not be vouched for came back matching a node at the origin.
   */
  atMm?: { x: number; y: number; z: number };
  /**
   * How many members were incident on the node.
   *
   * Deliberately a COUNT of incident elements and not the joint's member list. Which members
   * form a joint is `detectJoints`' answer and the store refuses to hold a second opinion on it;
   * how many elements touch a node is a different and purely arithmetic question, and it is
   * enough to notice that the fan of members changed.
   */
  memberCount: number;
}

/** One stored joint: its key, its fingerprint, and the choices themselves. */
export interface StoredJointDesign extends JointFingerprint {
  nodeId: number;
  choices: JointChoices;
}

/**
 * The joint designs a project carries.
 *
 * Versioned from the start, like `regulations`. A project saved before this existed has the
 * field absent, which reads as "no joints were designed" — the correct answer, and the reason
 * old projects load unchanged.
 */
export interface StoredJointDesigns {
  version: 1;
  joints: StoredJointDesign[];
}

export const JOINT_DESIGNS_SCHEMA_VERSION = 1 as const;

/** Why a stored joint could not be matched to the model that is open now. */
export type JointObsolescence =
  /** No node carries that id any more. The node was deleted, or this is another model. */
  | 'nodeMissing'
  /** A node with that id exists somewhere else. Same integer, different node. */
  | 'nodeMoved'
  /** Same node, but a different number of members meet it now. */
  | 'topologyChanged';

/**
 * The tolerance for «the same node», in millimetres.
 *
 * One millimetre, and it is a tolerance rather than an equality because `atMm` is rounded from
 * metres: a node at `3.0004 m` and the same node re-read from a file are both `3000 mm`, but a
 * node that a user nudged by a millimetre is a node that moved. Anything looser would start
 * matching a different node in a dense truss; anything tighter would flag float noise as a move.
 */
const SAME_NODE_TOL_MM = 1;

/**
 * A fingerprint taken from a node that exists, so its position is known.
 *
 * The distinction matters at the type level: `JointFingerprint.atMm` is optional because a STORED
 * one may not have it, while one computed from a live node always does.
 */
export type KnownJointFingerprint = JointFingerprint & {
  atMm: NonNullable<JointFingerprint['atMm']>;
};

/** The fingerprint of a node as the model has it now. */
export function fingerprintNode(
  node: { x: number; y: number; z?: number },
  memberCount: number,
): KnownJointFingerprint {
  return {
    atMm: {
      x: Math.round(node.x * 1000),
      y: Math.round(node.y * 1000),
      z: Math.round((node.z ?? 0) * 1000),
    },
    memberCount,
  };
}

/** How many elements are incident on a node. Pure arithmetic over the element table. */
export function incidentMemberCount(
  elements: Iterable<{ nodeI: number; nodeJ: number }>,
  nodeId: number,
): number {
  let n = 0;
  for (const el of elements) if (el.nodeI === nodeId || el.nodeJ === nodeId) n++;
  return n;
}

/** What reconciliation produced: the joints that still apply, and the ones that do not. */
export interface ReconciledJointDesigns {
  /** Node id → choices, for joints that matched the model that is open now. */
  live: Map<number, JointChoices>;
  /** Node id → why it did not match. Kept, shown, and never applied. */
  obsolete: Map<number, JointObsolescence>;
}

/**
 * Match stored joints against the model that is open now.
 *
 * Pure, and total: every stored joint lands in exactly one of the two maps, so nothing is
 * dropped on the floor. A joint is `live` only when its node still exists, is still in the same
 * place, and still has the same number of members on it — the three ways an id can lie.
 *
 * Reconciled against the CURRENT model on every read rather than once on load. That is what
 * makes deleting a node mid-session mark its joint obsolete immediately, instead of leaving a
 * design that matched at load time and stopped matching afterwards.
 */
export function reconcileJointDesigns(
  stored: StoredJointDesigns | undefined,
  nodes: Map<number, { x: number; y: number; z?: number }>,
  elements: Iterable<{ nodeI: number; nodeJ: number }>,
): ReconciledJointDesigns {
  const live = new Map<number, JointChoices>();
  const obsolete = new Map<number, JointObsolescence>();
  if (!stored || !Array.isArray(stored.joints)) return { live, obsolete };

  // Counted once over the element table rather than once per joint: a nave with 400 members and
  // 200 designed joints would otherwise walk the table 200 times.
  const incident = new Map<number, number>();
  for (const el of elements) {
    incident.set(el.nodeI, (incident.get(el.nodeI) ?? 0) + 1);
    incident.set(el.nodeJ, (incident.get(el.nodeJ) ?? 0) + 1);
  }

  for (const j of stored.joints) {
    if (typeof j?.nodeId !== 'number') continue;
    const node = nodes.get(j.nodeId);
    if (!node) { obsolete.set(j.nodeId, 'nodeMissing'); continue; }
    const now = fingerprintNode(node, incident.get(j.nodeId) ?? 0);
    /*
     * Every axis must be a finite number BEFORE it is compared, not merely present.
     *
     * A hand-edited or older project can carry `atMm: { x: null, ... }`, and `null` coerces to
     * `0` in arithmetic — so a comparison alone would match such an entry against any node at the
     * origin. The three `Number.isFinite` checks are what turn «no usable fingerprint» into
     * `nodeMoved` instead of a false match.
     */
    const was = j.atMm;
    const moved = was == null
      || !Number.isFinite(was.x) || !Number.isFinite(was.y) || !Number.isFinite(was.z)
      || Math.abs(now.atMm.x - was.x) > SAME_NODE_TOL_MM
      || Math.abs(now.atMm.y - was.y) > SAME_NODE_TOL_MM
      || Math.abs(now.atMm.z - was.z) > SAME_NODE_TOL_MM;
    if (moved) { obsolete.set(j.nodeId, 'nodeMoved'); continue; }
    if (now.memberCount !== j.memberCount) {
      obsolete.set(j.nodeId, 'topologyChanged');
      continue;
    }
    live.set(j.nodeId, j.choices ?? {});
  }
  return { live, obsolete };
}

/**
 * A deep, proxy-free copy, for the snapshot boundary.
 *
 * `JSON` round-tripping rather than a spread, for the same reason `snapshot()` does it to
 * `codeSettings`: `choices.battens` and `choices.bolts` are nested objects, and a shallow copy
 * would leave the saved project sharing them with the live model — so editing a batten gap would
 * silently rewrite the undo entry it was supposed to be able to go back to.
 */
export function cloneStoredJointDesigns(s: StoredJointDesigns): StoredJointDesigns {
  return JSON.parse(JSON.stringify(s)) as StoredJointDesigns;
}
