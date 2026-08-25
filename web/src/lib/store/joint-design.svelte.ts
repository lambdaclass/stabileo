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
 * ── What is stored and what is derived ──────────────────────────────
 *
 * Only the CHOICES are stored: which bolts, which plate, which weld, per node. Everything else —
 * the demands, the capacities, the plate outline, the batten stations — is recomputed from the
 * model on read, so a design can never describe a model that has since changed. Storing a
 * computed capacity is how a joint ends up reporting a check against a member that was deleted.
 *
 * ── The states are the joint's, not the store's ─────────────────────
 *
 * `designJoint` decides them, from the clauses. This file adds no state of its own and no
 * default: a node with no entry is `notDesigned`, which is a fact rather than a placeholder.
 */

import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import {
  designJoint, type JointDesign, type JointDesignInput,
} from '../connection/joint-design';
import type { BoltLayoutChoice } from '../connection/bolted-joint';
import type { WeldInput } from '../connection/fillet-weld';
import type { ComboResults } from '../connection/joint-demands';
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

function createJointDesignStore() {
  /** Node id → the choices made for it. Absent means nothing was designed. */
  let choices = $state<Map<number, JointChoices>>(new Map());

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

  return {
    /** The choices for a node, or an empty object. Never null, so a form can bind to it. */
    choicesFor(nodeId: number): JointChoices {
      return choices.get(nodeId) ?? {};
    },

    /**
     * Record a weld, or clear it.
     *
     * Passing `null` removes it, which is not the same as an empty one: a joint with no weld is
     * a joint with no weld, and reporting it `incomplete` would make the state meaningless on
     * every purely bolted connection in a model.
     */
    setWeld(nodeId: number, next: Partial<NonNullable<JointChoices['weld']>> | null): void {
      const current = choices.get(nodeId) ?? {};
      const weld = next === null ? null : { ...(current.weld ?? {}), ...next };
      const m = new Map(choices);
      m.set(nodeId, { ...current, weld });
      choices = m;
    },

    /** Record batten inputs, or clear them. Same reasoning as the weld. */
    setBattens(nodeId: number, next: Partial<NonNullable<JointChoices['battens']>> | null): void {
      const current = choices.get(nodeId) ?? {};
      const battens = next === null
        ? null
        : { arrangement: 'doubleBack' as const, gapMm: 10, ...(current.battens ?? {}), ...next };
      const m = new Map(choices);
      m.set(nodeId, { ...current, battens });
      choices = m;
    },

    /** Record a choice. Merged, so setting a plate does not clear the bolts. */
    set(nodeId: number, next: Partial<JointChoices>): void {
      const merged = { ...(choices.get(nodeId) ?? {}), ...next };
      const m = new Map(choices);
      m.set(nodeId, merged);
      choices = m;
    },

    /** Forget a joint's design entirely. */
    clear(nodeId: number): void {
      const m = new Map(choices);
      m.delete(nodeId);
      choices = m;
    },

    /**
     * The design for a node — recomputed from the model every time.
     *
     * `elementIds` is supplied by the caller because `detectJoints` owns that answer, and two
     * modules deciding which members meet at a node is two modules that can disagree.
     */
    designFor(nodeId: number, elementIds: readonly number[]): JointDesign {
      const c = choices.get(nodeId) ?? {};
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

    /** Node ids with any choice recorded. What a document would iterate. */
    get designedNodeIds(): number[] {
      return [...choices.keys()].sort((a, b) => a - b);
    },

    /** True when the project has at least one joint with a choice on it. */
    get hasAny(): boolean {
      return choices.size > 0;
    },

    /** Dropped wholesale when a project is replaced. */
    reset(): void {
      choices = new Map();
    },
  };
}

export const jointDesignStore = createJointDesignStore();
