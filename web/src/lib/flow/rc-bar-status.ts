/**
 * The three things a bar can be — unmarked, marked, provisional — and why they are not one axis.
 *
 * ── What the objective asks for, and the trap in it ────────────────
 *
 * "Distinguish unmarked, marked and provisional." Read as a three-valued enum that is wrong,
 * and wrong in the way §9.1 of the handoff already paid for once: `unknown` flattened into
 * `absent` told a user their building had no columns because they had not pressed a button.
 * The same flattening is available here. A bar has TWO independent facts:
 *
 *   the mark axis        has coordination given it a drawing mark yet?
 *   the provenance axis  is the steel it describes something you may build from?
 *
 * A provisional bar can carry a mark — `assignMarks` groups by geometry and knows nothing about
 * whether the design behind that geometry was certified — so `provisional` is not a third value
 * of "marked". Collapsing them would answer "does this bar have a mark" with "it is provisional",
 * which is not an answer, and would lose the mark on precisely the rows a bender still has to
 * fabricate from.
 *
 * So this module keeps both axes, and computes ONE badge from them for the row that has space
 * for one chip. The badge's precedence is stated below and the axes stay addressable, which is
 * what stops the chip from becoming the only surviving fact.
 *
 * ── Why provisional outranks the mark on the badge ─────────────────
 *
 * Because they are not equally urgent. "Not marked yet" is a stage of work: it resolves by
 * running the coordination again. "Provisional" is a statement about whether the drawing may be
 * issued at all, and `maturity.ts` puts it plainly — provisional results are exportable on
 * purpose, which is exactly why every projection of them has to keep saying so. A row that led
 * with `B12` and said nothing else would present unbuildable steel as ordinary steel.
 *
 * ── Two provisional sources, kept apart ────────────────────────────
 *
 * `DetailingAssembly.provisionalMembers` documents the distinction and this module honours it:
 *
 *   own          `BarPath.provisional` — this bar is itself part of a proposal.
 *   through      an owner of this bar is a member whose OWN design is a proposal.
 *
 * A bar continuous over a support belongs to the beam it was designed for and to the column it
 * passes through, so a fully certified column owns a provisional bar without itself being
 * provisional. Both bars are unbuildable; they are unbuildable for different reasons, and a
 * reviewer chasing one of them needs to know which. The badge is the same; the reason is not.
 *
 * ── The same model the viewer uses ─────────────────────────────────
 *
 * `scene-model.ts` copies `bar.provisional` onto the scene bar it paints violet, and derives
 * `scene.provisionalMembers` from the assemblies' own `provisionalMembers`. Both inputs here are
 * those same two fields, read rather than re-derived. `provisionalMembersOf` records what
 * happened when it was inferred instead: 202 members counted against 117 provisional beams,
 * because bar ownership is wider than design provenance. Nothing here infers.
 */

/** The one chip a row has space for. Precedence: provisional, then the mark axis. */
export type RcBarState = 'provisional' | 'marked' | 'unmarked';

/** Whether coordination has named this bar on the drawing yet. Independent of provenance. */
export type RcMarkState = 'marked' | 'unmarked';

/** Why a bar is provisional. Null when it is not. */
export type RcProvisionalSource = 'own' | 'through';

/** i18n keys for the badge. Keys, never translated strings — the caller translates. */
const STATE_KEY: Record<RcBarState, string> = {
  provisional: 'detailing.bar.state.provisional',
  marked: 'detailing.bar.state.marked',
  unmarked: 'detailing.bar.state.unmarked',
};

/**
 * i18n keys naming what KIND of proposal a bar's own marking records.
 *
 * A map rather than a template, following `rc-bar-label.ts`'s `ROLE_KEY`: `'biaxial'` is the
 * only value `BarPath.provisional` takes today, and a generator that invents a second one gets
 * `null` — a missing explanation — rather than a key that resolves to nothing on screen.
 */
const OWN_REASON_KEY: Record<string, string> = {
  biaxial: 'detailing.bar.provisional.biaxial',
};

/** The reason a bar inherits from a member whose design is a proposal. */
const THROUGH_REASON_KEY = 'detailing.bar.provisional.throughMember';

/** The shape this reads from a bar. Structural, so it needs no engine to be exercised. */
export interface RcBarStatusLike {
  id: string;
  ownerElementIds: readonly number[];
  /** `BarPath.provisional`. Absent on ordinary bars, which is almost all of them. */
  provisional?: string;
}

export interface RcBarStatus {
  /** The badge. See the precedence note above for why provisional wins. */
  state: RcBarState;
  /** i18n key for the badge. */
  stateKey: string;
  /** The mark axis, kept whatever the badge says. */
  markState: RcMarkState;
  /** The mark itself when it has one, so a caller need not ask the map twice. */
  mark: string | null;
  /** This bar is itself part of a proposal. */
  ownProposal: boolean;
  /** It runs through a member whose own design is a proposal. */
  throughProposal: boolean;
  /**
   * Which source the reason names, when the bar is provisional.
   *
   * `'own'` wins when both are true: the bar's own marking is the more specific statement, and
   * the member-level fact is still readable from `throughProposal`.
   */
  provisionalSource: RcProvisionalSource | null;
  /** i18n key explaining the provenance. Null when certified, or when the kind is unnamed. */
  reasonKey: string | null;
  /**
   * The owners that are themselves provisional, sorted.
   *
   * Empty unless `throughProposal`. Carried so the row can route the reviewer to the member
   * that is actually a proposal instead of to every member the bar happens to touch.
   */
  provisionalOwners: readonly number[];
}

/**
 * Classify one bar.
 *
 * `markOf` maps a bar id to its mark, supplied by the caller for the reason `rcBarLabel` states:
 * marks are assigned per assembly by `assignMarks`, and this module must not reach for an
 * assembly to find one. `provisionalMembers` is the assembly's own field, not a set derived from
 * bar ownership — see the header.
 */
export function rcBarStatus(
  bar: RcBarStatusLike,
  markOf: (id: string) => string | undefined,
  provisionalMembers: ReadonlySet<number>,
): RcBarStatus {
  const mark = markOf(bar.id) ?? null;
  const markState: RcMarkState = mark === null ? 'unmarked' : 'marked';

  const provisionalOwners = bar.ownerElementIds
    .filter((id) => provisionalMembers.has(id))
    .slice()
    .sort((a, b) => a - b);

  const ownProposal = bar.provisional !== undefined;
  const throughProposal = provisionalOwners.length > 0;

  const provisionalSource: RcProvisionalSource | null =
    ownProposal ? 'own' : throughProposal ? 'through' : null;

  const reasonKey =
    provisionalSource === 'own' ? OWN_REASON_KEY[bar.provisional as string] ?? null
      : provisionalSource === 'through' ? THROUGH_REASON_KEY
        : null;

  const state: RcBarState = provisionalSource !== null ? 'provisional' : markState;

  return {
    state,
    stateKey: STATE_KEY[state],
    markState,
    mark,
    ownProposal,
    throughProposal,
    provisionalSource,
    reasonKey,
    provisionalOwners,
  };
}

/**
 * How many bars sit in each state, for the one line above the list.
 *
 * Counted over the badge, so the three numbers add up to the number of rows — a summary whose
 * parts overlap is a summary a reader has to do arithmetic on to trust.
 */
export interface RcBarStateCounts {
  provisional: number;
  marked: number;
  unmarked: number;
  total: number;
}

export function rcBarStateCounts(statuses: readonly RcBarStatus[]): RcBarStateCounts {
  const counts: RcBarStateCounts = { provisional: 0, marked: 0, unmarked: 0, total: 0 };
  for (const s of statuses) {
    counts[s.state]++;
    counts.total++;
  }
  return counts;
}
