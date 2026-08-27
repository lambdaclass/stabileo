/**
 * The joint designs a project holds — one store, read by the panel, the 3-D view and a document.
 *
 * ── Why a store and not a `$derived` in the panel ───────────────────
 *
 * Three surfaces need the same joint: the connections panel lists it, the viewport draws its
 * plate, and a document will tabulate it. A `$derived` inside the panel would be reachable from
 * one of the three, so the other two would grow their own — and the brief's «una única entidad
 * compartida» would last exactly until the second consumer.
 *
 * ── Where the choices live, and why not here (I-06) ─────────────────
 *
 * They used to live in a `$state` Map inside this file and in nothing else: not in `snapshot()`,
 * not in `restore()`, not in the URL codec, not in any serialiser. Designing twenty joints of a
 * nave and closing the tab lost all twenty — the only capability in M2 whose result could not be
 * kept.
 *
 * They now live on `modelStore.model.jointDesigns`, and this store is a VIEW over that field.
 * The same shape `regulations.svelte.ts` already has, for the same reason: everything on the
 * model travels `.ded`, undo/redo, tab capture and autosave for free, and a side store travels
 * none of them.
 *
 * ── What is stored and what is derived ──────────────────────────────
 *
 * Still only the CHOICES: which bolts, which plate, which weld, per node. The demands, the
 * capacities, the plate outline and the batten stations are recomputed from the model on read, so
 * a design can never describe a model that has since changed. Storing a computed capacity is how
 * a joint ends up reporting a check against a member that was deleted — and it is now also what
 * would let a *saved* joint do it.
 *
 * ── Obsolete is a third answer (I-07) ──────────────────────────────
 *
 * Choices are keyed by node id, and an id only means something inside the model that issued it.
 * A second model in the same session has its own node 5. Rather than trusting the integer, every
 * read matches each stored joint against the live model — see `reconcileJointDesigns` — and a
 * joint whose node is gone, has moved, or has a different number of members on it is **obsolete**:
 * kept, visible, remediable, and never applied. Applying it would present as chosen something the
 * user never chose for this model.
 *
 * ── The states are the joint's, not the store's ─────────────────────
 *
 * `designJoint` decides them, from the clauses. This file adds no state of its own and no
 * default: a node with no entry is `notDesigned`, which is a fact rather than a placeholder. An
 * obsolete node is `notDesigned` too, because for THIS model nothing was designed there.
 */

import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import {
  designJoint, type JointDesign, type JointDesignInput,
} from '../connection/joint-design';
import type { ComboResults } from '../connection/joint-demands';
import {
  fingerprintNode, incidentMemberCount, reconcileJointDesigns,
  JOINT_DESIGNS_SCHEMA_VERSION,
  type JointChoices, type JointObsolescence, type ReconciledJointDesigns,
  type StoredJointDesign, type StoredJointDesigns,
} from '../connection/joint-choices';

/*
 * Re-exported so the panel and the viewport keep importing the type from where they always did.
 * The declaration moved to `connection/joint-choices.ts` because the MODEL needs it now, and the
 * model cannot import a store that imports the model.
 */
export type { JointChoices, JointObsolescence } from '../connection/joint-choices';

function createJointDesignStore() {
  /**
   * Every combination the analysis produced, in the shape `joint-demands` reads.
   *
   * Falls back to the single result set when a model was solved without combinations — a
   * project can be analysed under one case, and refusing to design its joints because the
   * combination list is empty would be refusing over a modelling choice.
   */
  function combos(): ComboResults[] {
    const perCombo = resultsStore.perCombo3D;
    if (perCombo && perCombo.size > 0) {
      const names = modelStore.model.combinations ?? [];
      return [...perCombo.entries()].map(([id, r]) => ({
        id,
        name: (names as Array<{ id: number; name?: string }>).find((c) => c.id === id)?.name ?? null,
        elementForces: (r.elementForces ?? []) as never,
      }));
    }
    const single = resultsStore.results3D;
    if (!single) return [];
    return [{ id: null, name: null, elementForces: (single.elementForces ?? []) as never }];
  }

  /*
   * The reconciliation memo, and why it is not a `$derived`.
   *
   * `$derived` was the first version and it was measured wrong: this store is created at module
   * scope, so its deriveds have no effect root, and a value read straight after the write that
   * should have invalidated it came back stale. `set()` followed by `choicesFor()` returned
   * nothing — the joint was on the model and the memo still held the empty answer from before it.
   * That is fine for a store only ever read from inside a component, which is why
   * `regulations.svelte.ts` gets away with it, but this one is read by the panel, the viewport
   * AND its own tests.
   *
   * Invalidated on REFERENCE identity of the three inputs instead. That is sound here rather
   * than a shortcut: the model reassigns each Map wholesale on every mutation — the documented
   * convention in `CLAUDE.md`, because `SvelteMap.set` does not reliably re-render — and
   * `jointDesigns` is likewise always replaced, never mutated in place. Three `!==` per read.
   */
  let memo: ReconciledJointDesigns | null = null;
  let memoOf: [unknown, unknown, unknown] | null = null;

  function reconciled(): ReconciledJointDesigns {
    const designs = modelStore.model.jointDesigns;
    const nodes = modelStore.nodes;
    const elements = modelStore.elements;
    if (
      memo && memoOf
      && memoOf[0] === designs && memoOf[1] === nodes && memoOf[2] === elements
    ) {
      return memo;
    }
    memo = reconcileJointDesigns(
      designs,
      nodes as Map<number, { x: number; y: number; z?: number }>,
      elements.values() as Iterable<{ nodeI: number; nodeJ: number }>,
    );
    memoOf = [designs, nodes, elements];
    return memo;
  }

  /** The stored list, or an empty one. Never mutated in place. */
  function stored(): StoredJointDesign[] {
    return modelStore.model.jointDesigns?.joints ?? [];
  }

  /*
   * A closure function rather than `this.choicesFor`, so a destructured setter still reads the
   * right thing. `const { setWeld } = jointDesignStore` is a normal enough thing for a component
   * to write, and it would have silently lost `this`.
   */
  function choicesOf(nodeId: number): JointChoices {
    return reconciled().live.get(nodeId) ?? {};
  }

  /**
   * Write one node's choices onto the model, fingerprinting the node as it is right now.
   *
   * The fingerprint is taken at WRITE time, which is what makes the whole scheme work: it
   * records the joint the user was actually looking at. Taking it at read time would compare the
   * model against itself and always agree.
   *
   * Assigning the field rather than calling a CRUD method is deliberate, and it is what
   * `regulations` does: designing a joint must not bump `modelVersion` or fire the mutation
   * hook, because that would wipe the very analysis results the design was computed from.
   */
  function write(nodeId: number, choices: JointChoices | null): void {
    const rest = stored().filter((j) => j.nodeId !== nodeId);
    if (choices === null) {
      modelStore.model.jointDesigns = rest.length === 0
        // Back to absent rather than an empty container, so `snapshot()`/`restore()` stays a
        // no-op on a project that never designed a joint or has just had its last one cleared.
        ? undefined
        : { version: JOINT_DESIGNS_SCHEMA_VERSION, joints: rest };
      return;
    }
    const node = modelStore.nodes.get(nodeId);
    const print = node
      ? fingerprintNode(
          node,
          incidentMemberCount(
            modelStore.elements.values() as Iterable<{ nodeI: number; nodeJ: number }>,
            nodeId,
          ),
        )
      /*
       * A choice recorded against a node the model does not have. Stored, so nothing is silently
       * discarded, but with NO fingerprint — the absence is the claim that it cannot be vouched
       * for, and reconciliation reads it that way.
       *
       * It was `{ x: NaN, ... }` first, which is wrong the moment the project is written to
       * disk: `JSON` turns `NaN` into `null` and `null` coerces to `0`, so the entry came back
       * matching a node at the origin.
       */
      : { memberCount: -1 };
    modelStore.model.jointDesigns = {
      version: JOINT_DESIGNS_SCHEMA_VERSION,
      joints: [...rest, { nodeId, ...print, choices }],
    };
  }

  return {
    /**
     * The choices for a node, or an empty object. Never null, so a form can bind to it.
     *
     * An OBSOLETE node answers empty, not its stored choices. That is the I-07 decision in one
     * line: the stored bolts are real, but they were chosen for a different joint, and handing
     * them to the panel is how a value the user never chose appears as chosen.
     */
    choicesFor(nodeId: number): JointChoices {
      return choicesOf(nodeId);
    },

    /**
     * Record a weld, or clear it.
     *
     * Passing `null` removes it, which is not the same as an empty one: a joint with no weld is
     * a joint with no weld, and reporting it `incomplete` would make the state meaningless on
     * every purely bolted connection in a model.
     */
    setWeld(nodeId: number, next: Partial<NonNullable<JointChoices['weld']>> | null): void {
      const current = choicesOf(nodeId);
      const weld = next === null ? null : { ...(current.weld ?? {}), ...next };
      write(nodeId, { ...current, weld });
    },

    /** Record batten inputs, or clear them. Same reasoning as the weld. */
    setBattens(nodeId: number, next: Partial<NonNullable<JointChoices['battens']>> | null): void {
      const current = choicesOf(nodeId);
      const battens = next === null
        ? null
        : { arrangement: 'doubleBack' as const, gapMm: 10, ...(current.battens ?? {}), ...next };
      write(nodeId, { ...current, battens });
    },

    /** Record a choice. Merged, so setting a plate does not clear the bolts. */
    set(nodeId: number, next: Partial<JointChoices>): void {
      write(nodeId, { ...choicesOf(nodeId), ...next });
    },

    /**
     * Forget a joint's design entirely.
     *
     * Works on an obsolete joint too, and that is its remedy: `clear` is what the panel's
     * «discard» offers, because an obsolete entry is otherwise unreachable by the setters —
     * `choicesFor` answers empty for it, so editing it would start from nothing anyway.
     */
    clear(nodeId: number): void {
      write(nodeId, null);
    },

    /**
     * The design for a node — recomputed from the model every time.
     *
     * `elementIds` is supplied by the caller because `detectJoints` owns that answer, and two
     * modules deciding which members meet at a node is two modules that can disagree.
     */
    designFor(nodeId: number, elementIds: readonly number[]): JointDesign {
      const c = choicesOf(nodeId);
      const node = modelStore.nodes.get(nodeId);
      const input: JointDesignInput = {
        nodeId,
        elementIds,
        elements: modelStore.elements as never,
        combos: combos(),
        originM: node ? { x: node.x, y: node.y, z: (node as { z?: number }).z ?? 0 } : undefined,
        bolts: c.bolts ?? null,
        plate: c.plate,
        weld: c.weld ?? null,
        battens: c.battens
          ? { arrangement: c.battens.arrangement, gapMm: c.battens.gapMm,
              lengthM: c.battens.lengthM, segments: c.battens.segments }
          : null,
      };
      return designJoint(input);
    },

    /**
     * Node ids with a design that applies to the model that is open now.
     *
     * What a document iterates — and it deliberately excludes the obsolete ones, because a
     * drawing that tabulated a joint reconciliation refused would be publishing the association
     * this whole mechanism exists to avoid.
     */
    get designedNodeIds(): number[] {
      return [...reconciled().live.keys()].sort((a, b) => a - b);
    },

    /** True when the project has at least one joint whose design still applies. */
    get hasAny(): boolean {
      return reconciled().live.size > 0;
    },

    /**
     * Node ids whose stored design could not be matched, with the reason.
     *
     * Exposed so the panel can SAY so. An obsolete joint that is merely not applied is
     * indistinguishable from a joint that was never designed, and the difference matters: one of
     * them is work the user did and can still reach.
     */
    get obsolete(): Array<{ nodeId: number; reason: JointObsolescence }> {
      return [...reconciled().obsolete.entries()]
        .map(([nodeId, reason]) => ({ nodeId, reason }))
        .sort((a, b) => a.nodeId - b.nodeId);
    },

    /** Why a node's stored design does not apply, or null when it does (or there is none). */
    obsolescenceFor(nodeId: number): JointObsolescence | null {
      return reconciled().obsolete.get(nodeId) ?? null;
    },

    /** True when the project carries stored joints that no longer match it. */
    get hasObsolete(): boolean {
      return reconciled().obsolete.size > 0;
    },

    /** The other remedy: drop every unmatched entry at once, keeping the ones that apply. */
    discardObsolete(): void {
      const keep = stored().filter((j) => !reconciled().obsolete.has(j.nodeId));
      modelStore.model.jointDesigns = keep.length === 0
        ? undefined
        : { version: JOINT_DESIGNS_SCHEMA_VERSION, joints: keep };
    },

    /**
     * Dropped wholesale when a project is replaced.
     *
     * Kept, but no longer the thing that has to be remembered: `modelStore.restore()` and
     * `clear()` both replace `model.jointDesigns`, so loading a second model resets this store
     * whether or not anybody calls it. That is the fix for I-07 — a `reset()` nobody called was
     * the defect, and a `reset()` nobody NEEDS to call is the repair.
     */
    reset(): void {
      modelStore.model.jointDesigns = undefined;
    },

    /** The stored form, for a test or a serialiser that wants to look at it directly. */
    get storedDesigns(): StoredJointDesigns | undefined {
      return modelStore.model.jointDesigns;
    },
  };
}

export const jointDesignStore = createJointDesignStore();
