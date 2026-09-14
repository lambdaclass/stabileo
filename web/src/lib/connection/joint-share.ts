/**
 * The joint decisions on a share link — I-08, the joints half.
 *
 * ── The asymmetry this closes ───────────────────────────────────────
 *
 * I-06 moved the joint choices onto `StructureModel.jointDesigns`, so they travel `.ded`,
 * undo/redo, tab capture and autosave. The URL codec was not one of those paths: it is a separate,
 * versioned wire format that enumerates what it carries, so a designed shed shared by link arrived
 * with every joint undesigned. Three surfaces generate that link — the Share button, the feedback
 * widget and the Education exercise source — and the worst of the three is the feedback widget: a
 * user reporting a problem with a joint attached a link that rebuilt the model without the joint
 * the report was about.
 *
 * ── Why a module of its own ─────────────────────────────────────────
 *
 * `url-sharing.ts` imports four stores, so a test of it either boots Svelte or — as
 * `url-sharing.test.ts` did — inlines its own copy of the encoder and tests the copy. A wire
 * format tested through a duplicate is a wire format with no test. Everything here is pure, so its
 * tests import the code that actually runs. Same reason `joint-choices.ts` was split out of the
 * store.
 *
 * ── Only the choices, enforced here rather than assumed ─────────────
 *
 * `StoredJointDesigns` holds choices by construction, but this file does not rely on that: pack
 * walks a FIELD TABLE and emits nothing else. A `capacityKN`, a `utilisation` or a `checks` array
 * that ever reached the model — through a hand-edited file, or a future mistake — cannot reach a
 * URL through here. Capacities are recomputed from the open model on every read, so a link can
 * never present a verification against a member that is not in it.
 *
 * ── Obsolescence is not stored, and its inputs are ──────────────────
 *
 * `nodeMissing` / `nodeMoved` / `topologyChanged` are decided by `reconcileJointDesigns` against
 * the model that is open, on every read. They are derived, so they are not on the wire. What IS on
 * the wire is the fingerprint they are derived FROM — `atMm` and `memberCount` — because that is
 * part of the persisted decision: it records the joint the user was actually looking at.
 *
 * Carrying it is what extends I-07 to the URL. A link opened over a different model reports its
 * joints obsolete, with a reason and a remedy, instead of matching them by node id and presenting
 * as chosen something nobody chose for that model. A payload that arrives WITHOUT a fingerprint
 * reconciles as `nodeMoved` — never as a match — which is the reading the `.ded` path already gives
 * an entry that cannot be vouched for.
 *
 * ── Compatibility, in both directions ───────────────────────────────
 *
 * · **Old link, new code.** No `jd` key at all. That reads as «no joint decisions», the true
 *   answer for a link shared before this existed — not an empty joint designed at every node.
 * · **New link, old code.** `jd` is a new key of the top-level compact object, and `fromCompact`
 *   reads the keys it knows and ignores the rest. No position was added to any existing tuple.
 * · **Newer link, this code.** Unknown keys inside a joint's choices are IGNORED, so a field added
 *   later as an optional key does not make today's build reject tomorrow's link. That is the whole
 *   reason the growth room is inside an object.
 *
 * ── What is rejected, and why it takes the link with it ─────────────
 *
 * A known key with the wrong type, an entry that is not a well-formed tuple, or a container
 * version this build cannot read all make `unpackJointDesigns` throw, which makes `decompressV2`
 * return `null` — the app's existing single answer for a link it could not read.
 *
 * Rejecting the whole link rather than dropping the joints is deliberate. The model bytes and the
 * joint bytes arrive in one deflate stream: if that stream is not what it claims to be, treating
 * half of it as trustworthy is the weaker position, and quietly loading a shed with its joints
 * removed is precisely the «plausible value in the place of an absent one» this work has spent its
 * life refusing. The cost is stated in `share-codec-fields.md` §7.3: a tampered joints payload
 * costs the recipient the whole link.
 */

import { BOLT_GRADES, type ThreadCondition } from './bolted-joint';
import type { EdgeFinish, Exposure } from './bolt-geometry';
import type { WeldProcess, WeldLoading } from './fillet-weld';
import { isBuiltUpArrangement } from '../section/profile-spec';
import {
  JOINT_DESIGNS_SCHEMA_VERSION,
  type JointChoices, type StoredJointDesign, type StoredJointDesigns,
} from './joint-choices';

/**
 * The members a field accepts, built from a `Record` keyed by the union.
 *
 * `Record<T, 1>` is what makes these self-maintaining: add a member to `ThreadCondition` and the
 * argument stops compiling until the member is listed, so a value the app can produce can never
 * become a value the wire silently rejects. A hand-written array would have drifted quietly, which
 * is the failure mode `share-codec-fields.md` §6 was written about.
 */
function membersOf<T extends string>(all: Record<T, 1>): ReadonlySet<string> {
  return new Set(Object.keys(all));
}

const THREADS = membersOf<ThreadCondition>({ included: 1, excluded: 1 });
const EDGE_FINISHES = membersOf<EdgeFinish>({ sheared: 1, rolled: 1 });
const EXPOSURES = membersOf<Exposure>({ painted: 1, weathering: 1 });
const WELD_PROCESSES = membersOf<WeldProcess>({ manual: 1, submergedArc: 1 });
const WELD_LOADINGS = membersOf<WeldLoading>({ endLoaded: 1, other: 1 });

/** Imported rather than restated: Tabla J.3.2 has one list of grades, in one file. */
const GRADES: ReadonlySet<string> = new Set<string>(BOLT_GRADES);

type Checked = { ok: true; value: unknown } | { ok: false };

/**
 * A wire field: its name on the model, its name on the wire, and what it accepts.
 *
 * `check` answers with the value to keep, or refuses. It never repairs and never substitutes — a
 * wrong-typed bolt diameter is not a bolt diameter, and coercing it would put a number the user
 * never chose into a capacity calculation.
 */
interface Field {
  key: string;
  short: string;
  check: (v: unknown) => Checked;
}

const bad: Checked = { ok: false };
const good = (value: unknown): Checked => ({ ok: true, value });

/** A finite number. `NaN` and `Infinity` are refused: `JSON` writes both as `null`. */
const num = (v: unknown): Checked => (typeof v === 'number' && Number.isFinite(v) ? good(v) : bad);
const bool = (v: unknown): Checked => (typeof v === 'boolean' ? good(v) : bad);
const oneOf = (set: ReadonlySet<string>) => (v: unknown): Checked =>
  (typeof v === 'string' && set.has(v) ? good(v) : bad);
/** Shear planes are `1 | 2` in the type, so they are `1 | 2` on the wire. */
const planes = (v: unknown): Checked => (v === 1 || v === 2 ? good(v) : bad);

const f = (key: string, short: string, check: Field['check']): Field => ({ key, short, check });

/*
 * The tables. Two letters at most, like the nine keys the section tuple already uses: this codec
 * is optimised for URL length because `MAX_URL_SAFE` is a limit `ToolbarProject` actually checks.
 *
 * A field missing from a table is a field that does not travel, and the completeness test in
 * `joint-share.test.ts` is what makes that a failure rather than a discovery.
 */
const BOLT_FIELDS: readonly Field[] = [
  f('diameterMm', 'd', num),
  f('grade', 'g', oneOf(GRADES)),
  f('threads', 'th', oneOf(THREADS)),
  f('count', 'n', num),
  f('rows', 'r', num),
  f('spacingMm', 's', num),
  f('edgeDistanceMm', 'e', num),
  f('edgeFinish', 'ef', oneOf(EDGE_FINISHES)),
  f('exposure', 'x', oneOf(EXPOSURES)),
  f('shearPlanes', 'sp', planes),
  f('deformationConsidered', 'dc', bool),
];

const PLATE_FIELDS: readonly Field[] = [
  f('thicknessMm', 't', num),
  f('fuMPa', 'fu', num),
];

const WELD_FIELDS: readonly Field[] = [
  f('legMm', 'l', num),
  f('lengthMm', 'ln', num),
  f('runs', 'r', num),
  f('fexxMPa', 'fx', num),
  f('thickerPartMm', 'tk', num),
  f('thinnerPartMm', 'tn', num),
  f('process', 'p', oneOf(WELD_PROCESSES)),
  f('loading', 'ld', oneOf(WELD_LOADINGS)),
  f('demandKN', 'dm', num),
];

const BATTEN_FIELDS: readonly Field[] = [
  f('arrangement', 'a', (v) => (isBuiltUpArrangement(v) ? good(v) : bad)),
  f('gapMm', 'g', num),
  f('lengthM', 'l', num),
  f('segments', 's', num),
  f('chordRiMm', 'ri', num),
  f('memberId', 'm', num),
];

/** The four groups of `JointChoices`, their key on the wire, and whether `null` is one of their
 * legitimate values. `plate` is the one that is not nullable in the type, so it is not on the
 * wire either. */
const GROUPS = [
  { key: 'bolts', short: 'b', fields: BOLT_FIELDS, nullable: true },
  { key: 'plate', short: 'p', fields: PLATE_FIELDS, nullable: false },
  { key: 'weld', short: 'w', fields: WELD_FIELDS, nullable: true },
  { key: 'battens', short: 'ba', fields: BATTEN_FIELDS, nullable: true },
] as const;

/** Exported for the completeness test, which is the only reader of it outside this file. */
export const JOINT_SHARE_FIELDS: ReadonlyMap<string, readonly { key: string; short: string }[]> =
  new Map(GROUPS.map((g) => [g.key, g.fields] as [string, readonly Field[]]));

// ── Pack ──────────────────────────────────────────────────────────────────

function packGroup(fields: readonly Field[], value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!value || typeof value !== 'object') return out;
  const src = value as Record<string, unknown>;
  for (const field of fields) {
    const v = src[field.key];
    if (v === undefined || v === null) continue;
    /*
     * Checked on the way OUT as well as in. A value the reader would refuse must not be written:
     * a link the build that made it cannot open is worse than a field left behind.
     */
    const r = field.check(v);
    if (r.ok) out[field.short] = r.value;
  }
  return out;
}

function packChoices(choices: JointChoices): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const src = choices as unknown as Record<string, unknown>;
  for (const g of GROUPS) {
    const v = src[g.key];
    /*
     * `null` travels as `null`, and absent travels as absent.
     *
     * They mean the same thing downstream — `designFor` reads `c.weld ?? null` — but they are
     * different records of what the user did: `setWeld(n, null)` is «this joint has no weld», and
     * an absent key is «nothing was said about a weld». Flattening them would make the round-trip
     * lossy in the one direction nobody would notice.
     */
    if (v === null) { if (g.nullable) out[g.short] = null; continue; }
    if (v === undefined) continue;
    // An empty group still travels: `{ plate: {} }` is a plate the user opened and left blank,
    // and dropping it would turn it into a plate never mentioned.
    out[g.short] = packGroup(g.fields, v);
  }
  return out;
}

/** The joints as the compact object carries them, keyed and versioned. */
export interface PackedJointDesigns {
  v: typeof JOINT_DESIGNS_SCHEMA_VERSION;
  j: unknown[];
}

/**
 * The joint designs for the wire, or `undefined` when there are none.
 *
 * `undefined` for an empty list as well as an absent field: a project whose last joint was just
 * discarded shares the same link as a project that never designed one, because those are the same
 * project. The container version rides along so a future format change has something to key on.
 */
export function packJointDesigns(
  designs: StoredJointDesigns | undefined,
): PackedJointDesigns | undefined {
  const joints = designs?.joints;
  if (!Array.isArray(joints) || joints.length === 0) return undefined;
  const packed = joints
    /*
     * An entry with no usable node id is dropped rather than written.
     *
     * Not a silent loss: `reconcileJointDesigns` already skips such an entry, so it is work that
     * is unreachable in the project it came from too. There is no key to share it under.
     */
    .filter((j) => typeof j?.nodeId === 'number' && Number.isFinite(j.nodeId))
    .map((j) => {
      const at = j.atMm;
      const print = at
        && Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.z)
        ? [at.x, at.y, at.z]
        // `0` rather than an omitted slot, so the tuple keeps four fixed positions and the
        // absence still reads as «no fingerprint» on the way back in.
        : 0;
      const count = Number.isFinite(j.memberCount) ? j.memberCount : -1;
      return [j.nodeId, count, print, packChoices(j.choices ?? {})];
    });
  if (packed.length === 0) return undefined;
  return { v: JOINT_DESIGNS_SCHEMA_VERSION, j: packed };
}

// ── Unpack ────────────────────────────────────────────────────────────────

/** Thrown for a payload this build will not read. Caught by `decompressV2`, which returns null. */
class JointShareError extends Error {}

function reject(what: string): never {
  throw new JointShareError(`joint designs on the share link: ${what}`);
}

function unpackGroup(
  fields: readonly Field[], raw: unknown, where: string,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) reject(`${where} is not an object`);
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const v = src[field.short];
    if (v === undefined) continue;
    const r = field.check(v);
    if (!r.ok) reject(`${where}.${field.key} is not a value this format allows`);
    out[field.key] = r.value;
  }
  // Unknown short keys are deliberately not inspected: they are how a later version adds a field,
  // and refusing them would make this build reject links it could otherwise read.
  return out;
}

function unpackChoices(raw: unknown): JointChoices {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    reject('a joint has no choices object');
  }
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const g of GROUPS) {
    const v = src[g.short];
    if (v === undefined) continue;
    if (v === null) {
      if (!g.nullable) reject(`${g.key} may not be null`);
      out[g.key] = null;
      continue;
    }
    out[g.key] = unpackGroup(g.fields, v, g.key);
  }
  return out as unknown as JointChoices;
}

/**
 * The joint designs a link carries, or `undefined` when it carries none.
 *
 * Total on the absence side and strict on the presence side: an absent payload is «no joint
 * decisions», and a payload that is not what it claims to be throws rather than being partly
 * believed. See the header for why that takes the link with it.
 */
export function unpackJointDesigns(raw: unknown): StoredJointDesigns | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) reject('the container is not an object');
  const c = raw as Record<string, unknown>;
  /*
   * An unreadable container version is refused rather than guessed at.
   *
   * Growth inside version 1 happens through optional keys — that is what the object slots are for
   * — so a version this build does not know is not «a link with more fields», it is a format whose
   * entries may not mean what they look like. Reading them anyway is how a joint designed for
   * something else gets presented as chosen.
   */
  if (c.v !== JOINT_DESIGNS_SCHEMA_VERSION) {
    reject(`container version ${String(c.v)} is not one this build reads`);
  }
  if (!Array.isArray(c.j)) reject('the joint list is not an array');
  const joints: StoredJointDesign[] = (c.j as unknown[]).map((entry) => {
    if (!Array.isArray(entry) || entry.length < 4) reject('a joint is not a four-slot tuple');
    const [nodeId, memberCount, print, choices] = entry as unknown[];
    if (typeof nodeId !== 'number' || !Number.isFinite(nodeId)) reject('a joint has no node id');
    if (typeof memberCount !== 'number' || !Number.isFinite(memberCount)) {
      reject(`joint ${nodeId} has no member count`);
    }
    let atMm: StoredJointDesign['atMm'];
    if (Array.isArray(print)) {
      if (print.length !== 3 || !print.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        reject(`joint ${nodeId} has a fingerprint that is not three finite numbers`);
      }
      atMm = { x: print[0] as number, y: print[1] as number, z: print[2] as number };
    } else if (print !== 0) {
      reject(`joint ${nodeId} has a fingerprint that is neither a position nor absent`);
    }
    /*
     * No fingerprint stays no fingerprint. `reconcileJointDesigns` reads that as `nodeMoved`, so
     * the entry is kept, shown with its reason, and never applied — the same answer the `.ded`
     * path gives. Filling it in from whichever node the opened model happens to have at that id is
     * the silent association I-07 exists to prevent.
     */
    return { nodeId, memberCount, ...(atMm ? { atMm } : {}), choices: unpackChoices(choices) };
  });
  if (joints.length === 0) return undefined;
  return { version: JOINT_DESIGNS_SCHEMA_VERSION, joints };
}
