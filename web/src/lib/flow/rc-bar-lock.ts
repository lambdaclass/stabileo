/**
 * What pinning does, and what it is a pin ON.
 *
 * ── The unit is the MEMBER, and that is a product decision ──────────
 *
 * "Fijar congela el elemento/miembro completo. Si el usuario modifica una barra de una viga,
 * fijar esa modificación congela la viga completa frente a regeneraciones posteriores."
 *
 * It had to be DECIDED rather than inferred, because the two engines that consume the flag
 * consume it at two different granularities and neither is wrong on its own:
 *
 *   `runDetailing`  takes `lockedBars` — those bars are carried through untouched. Per BAR.
 *   the repair loop takes `lockedMembers`, built by walking every locked bar's
 *                   `ownerElementIds`. Per MEMBER.
 *
 * Pinned per BAR, a regeneration kept the pinned bar and replaced every other bar in the same
 * beam — so a user who pinned the arrangement they had just edited got that one bar back inside
 * a cage that had moved around it. Pinning the MEMBER means the store sets the flag on every bar
 * the member owns, so both engines see the same frozen set and the two granularities agree.
 *
 * ── The reach a user cannot otherwise see ───────────────────────────
 *
 * A bar continuous over a support belongs to the beam it was designed for AND to the column it
 * passes through, so pinning through it freezes both. That is what this module computes and what
 * the row states — the same trap §9.1 and `rc-bar-status.ts` document twice already: a fact that
 * is true per bar presented as if the bar were the whole of its consequence.
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
  /**
   * Bars carrying the flag.
   *
   * NOT what any surface leads with. A lock is a lock on the member, so one press flags every
   * bar the member owns — fourteen of them on an ordinary beam — while the viewer and every
   * export count that as one locked member. A list that led with the bar count would be a
   * fourth opinion about the same lock. Kept because the two numbers relate and a test asserts
   * how, not because anything renders it.
   */
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

/**
 * Which bars a press on one bar's control flips, and to what.
 *
 * ── The rule, as a function rather than as a comment ───────────────
 *
 * A pin is a pin on the MEMBER, so pressing the control on any bar of a member flips every bar
 * that member owns. This is that rule: it was four lines inside `detailingStore.toggleLock` with
 * a paragraph above them explaining what they meant, which is exactly the shape of thing that
 * gets "simplified" back to `b.id === barId` by somebody reading the code and not the paragraph.
 *
 * The frozen set is the pressed bar's own `ownerElementIds`, which is what `lockedMemberIds()`
 * walks — so the bars this returns and the members the repair loop refuses to repair are one
 * fact. A bar continuous over a support therefore flips the column's bars as well as the beam's,
 * which is the reach `rcBarLock` states on the row before the press.
 *
 * Returns the ids and the value, never a mutated list: the caller owns the assembly and this
 * module owns the rule.
 */
export interface RcLockToggle {
  /** Bar ids to write `locked` on. Empty when the pressed bar is not in the list. */
  barIds: readonly string[];
  /** What to write. The opposite of what the PRESSED bar currently is. */
  locked: boolean;
  /** The members being frozen or released, ascending — what the caller may report. */
  members: readonly number[];
}

export function rcLockToggle(
  bars: readonly RcBarLockLike[], barId: string,
): RcLockToggle {
  const pressed = bars.find((b) => b.id === barId);
  if (!pressed) return { barIds: [], locked: false, members: [] };
  const members = new Set(pressed.ownerElementIds);
  return {
    barIds: bars
      .filter((b) => b.ownerElementIds.some((id) => members.has(id)))
      .map((b) => b.id),
    locked: pressed.locked !== true,
    members: [...members].sort((a, b) => a - b),
  };
}
