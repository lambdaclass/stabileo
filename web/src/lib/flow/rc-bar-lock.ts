/**
 * What pinning a bar actually does — and to how much of the model.
 *
 * ── The gap this module closes ─────────────────────────────────────
 *
 * `detailingStore.toggleLock` sets one boolean on one bar, and the row said `Fijar` / `Liberar`
 * and nothing else. That reads as a per-bar preference. It is not one. Two engines consume the
 * flag and they consume it at two different granularities:
 *
 *   `runDetailing`  takes `lockedBars` — the bar itself is never regenerated. Per BAR.
 *   the repair loop takes `lockedMembers`, and `lockedMemberIds()` builds that set by walking
 *                   every locked bar's `ownerElementIds`. Per MEMBER.
 *
 * So pinning one bar freezes the DESIGN of every member that bar belongs to, and a bar
 * continuous over a support belongs to the beam it was designed for and to the column it passes
 * through. One pin on a continuous bar therefore stops the feedback loop from repairing a
 * column the user never looked at, silently, with nothing on screen saying so.
 *
 * That reach is what this module computes. It is the same trap §9.1 and `rc-bar-status.ts`
 * document twice already: a fact that is true per bar being presented as if the bar were the
 * whole of its consequence.
 *
 * ── Reading it, not re-deriving it ─────────────────────────────────
 *
 * `ownerElementIds` is the bar's own field — the same one `lockedMemberIds()` walks and the same
 * one `scene-model.ts` copies onto `SceneBar.elementIds`. The row, the viewer and the repair
 * loop are then three readings of one fact instead of three opinions about it. Nothing here
 * infers ownership from geometry.
 *
 * Pure: no store, no runes, no DOM. Names i18n keys, never translated strings.
 */

/** The two states a bar's pin can be in. Named, because `true`/`false` is not a vocabulary. */
export type RcLockState = 'pinned' | 'free';

/** The shape this reads from a bar. Structural, so it needs no engine to be exercised. */
export interface RcBarLockLike {
  id: string;
  /** Members this bar belongs to. A bar continuous over a support names both. */
  ownerElementIds: readonly number[];
  /** `BarPath.locked`. Absent on ordinary bars, which is almost all of them. */
  locked?: boolean;
}

export interface RcBarLock {
  state: RcLockState;
  locked: boolean;
  /** i18n key for what the row says the bar IS. */
  stateKey: string;
  /** i18n key for what pressing the control WILL DO. Never the same key as the state. */
  actionKey: string;
  /**
   * i18n key for the control's ACCESSIBLE NAME, which names the bar as well as the action.
   *
   * Separate from `actionKey` because they answer to different readers. A sighted reader sees
   * `Fijar` next to the row they are pointing at and the row supplies the subject; a screen
   * reader user tabbing a list of two hundred bars hears `Fijar, botón` two hundred times and
   * is given no subject at all. Takes a `{name}` — the row's own primary label, so the button
   * is named the same way the row is rather than by the engine key underneath it.
   */
  actionLabelKey: string;
  /**
   * i18n key for the sentence naming what the pin freezes. Null when the bar is free.
   *
   * Two keys and not one with a plural, because they are different warnings. One member frozen
   * is what the user asked for. More than one is a consequence of the bar being continuous
   * through them, which is the fact the row exists to surface.
   */
  freezesKey: string | null;
  /**
   * Glyph for the state, redundant with the word on purpose.
   *
   * The rule `DetailingProblems` passes for severity and `RcBarList` already passes for the
   * three bar states: a reader who cannot tell the tint from the surface still reads the state.
   */
  glyph: string;
  /**
   * Members whose design this pin freezes, ascending and unique. Empty when the bar is free.
   *
   * This is `lockedMemberIds()`'s contribution from this one bar, computed the same way, so the
   * sentence on the row and the set the repair loop receives cannot disagree.
   */
  frozenMembers: readonly number[];
  /**
   * True when the pin reaches further than the member the bar was designed for.
   *
   * The case worth naming on the row. One member frozen is what a user pinning a bar expects;
   * two is a consequence they did not ask for and cannot see anywhere else.
   */
  reaches: boolean;
  /**
   * A pin on steel that may not be built.
   *
   * Not an error and not blocked — pinning a provisional bar is a legitimate thing to do while
   * a proposal is being reviewed. It is a contradiction the row has to state, because the two
   * facts pull in opposite directions: the pin says "keep this exactly", the proposal says
   * "this is not issuable". Supplied by the caller from `rc-bar-status.ts` rather than
   * re-derived here — two modules deciding what "provisional" means is one too many.
   */
  pinnedProvisional: boolean;
}

const STATE_KEY: Record<RcLockState, string> = {
  pinned: 'detailing.bar.lock.pinned',
  free: 'detailing.bar.lock.free',
};

/**
 * What the CONTROL will do, which is the opposite of what the bar currently is.
 *
 * Separate from `STATE_KEY` because a toggle button that labels itself with its state and a
 * toggle button that labels itself with its action are both valid and mean opposite things —
 * and a single key used for both is how a control comes to read `Pinned` while pinning.
 */
const ACTION_KEY: Record<RcLockState, string> = {
  pinned: 'detailing.unlockBar',
  free: 'detailing.lockBar',
};

/** The same two actions, worded so they name the bar. See `actionLabelKey`. */
const ACTION_LABEL_KEY: Record<RcLockState, string> = {
  pinned: 'detailing.bar.lock.releaseNamed',
  free: 'detailing.bar.lock.pinNamed',
};

/** Filled pin for pinned, open for free. Same two-shape convention as the state glyphs. */
const GLYPH: Record<RcLockState, string> = { pinned: '⬤', free: '◯' };

/**
 * Classify one bar's pin.
 *
 * `provisional` comes from `rcBarStatus(...).state === 'provisional'`; the caller already has it
 * and passing it keeps this module from owning a second definition of provenance.
 */
export function rcBarLock(
  bar: RcBarLockLike,
  opts: { provisional?: boolean } = {},
): RcBarLock {
  const locked = bar.locked === true;
  const state: RcLockState = locked ? 'pinned' : 'free';
  const frozenMembers = locked
    ? [...new Set(bar.ownerElementIds)].sort((a, b) => a - b)
    : [];
  const reaches = frozenMembers.length > 1;
  return {
    state,
    locked,
    stateKey: STATE_KEY[state],
    actionKey: ACTION_KEY[state],
    actionLabelKey: ACTION_LABEL_KEY[state],
    freezesKey: !locked ? null
      : reaches ? 'detailing.bar.lock.freezesMany' : 'detailing.bar.lock.freezesOne',
    glyph: GLYPH[state],
    frozenMembers,
    reaches,
    pinnedProvisional: locked && opts.provisional === true,
  };
}

/**
 * What the list's pins add up to, for the one line above it.
 *
 * ── Why the frozen members are a UNION and not a sum ───────────────
 *
 * Two pins on the same beam freeze one member, not two. A count that added them would tell the
 * user their pins had frozen more of the model than they have, and the number the repair loop
 * actually receives — `lockedMemberIds()`, which is a `Set` — would disagree with the number on
 * screen. The census is built the same way the set is, so it reports the set's size.
 */
export interface RcBarLockCensus {
  /** Bars pinned. */
  pinned: number;
  /** Members frozen by at least one pin, ascending and unique. */
  frozenMembers: readonly number[];
  /** Pins that sit on steel that is itself a proposal. */
  pinnedProvisional: number;
}

export function rcBarLockCensus(locks: readonly RcBarLock[]): RcBarLockCensus {
  const frozen = new Set<number>();
  let pinned = 0;
  let pinnedProvisional = 0;
  for (const l of locks) {
    if (!l.locked) continue;
    pinned += 1;
    if (l.pinnedProvisional) pinnedProvisional += 1;
    for (const id of l.frozenMembers) frozen.add(id);
  }
  return {
    pinned,
    frozenMembers: [...frozen].sort((a, b) => a - b),
    pinnedProvisional,
  };
}

/** Whether anything is pinned at all — the condition the summary line renders under. */
export function rcHasPins(census: RcBarLockCensus): boolean {
  return census.pinned > 0;
}
