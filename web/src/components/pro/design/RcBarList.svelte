<script lang="ts">
  /**
   * The assembly's bars, named the way a person names them, with the state each one is in.
   *
   * ── Why this is its own component ──────────────────────────────────
   *
   * `DetailingWorkflow.svelte` was at 509 lines against the 600 the gate enforces, and objective 5
   * adds a census, a badge, a reason line and their styles. §9.5 already decided the outcome:
   * if it grows, it becomes a component mounted ONCE, as `RcMemberList` was. Mounted once matters
   * — a second mount is a second `markOf` map and a second opinion about how many bars are
   * unmarked.
   *
   * ── What it renders, and what it refuses to decide ─────────────────
   *
   * The naming is `rc-bar-label.ts`'s and the state is `rc-bar-status.ts`'s. Nothing here decides
   * what a bar is called or whether it is provisional; it reads both and lays them out. That
   * split is the point: the assertion that the primary label is never an engine key is a unit
   * test over a pure function, and it stays true only while the component has no second way to
   * produce a label.
   *
   * The three states come from two axes on purpose — see `rc-bar-status.ts`. The row shows the
   * badge AND keeps the mark, so "provisional" never costs a bender the tag they fabricate from.
   *
   * ── Accessibility ──────────────────────────────────────────────────
   *
   * The badge carries a glyph and a word, so a reader who cannot tell violet from grey still
   * reads the state — the same rule `DetailingProblems` passes for severity. The provisional
   * REASON is rendered as text on the row rather than living in a `title`: a tooltip is not
   * reachable by keyboard and is not read by every screen reader, and the reason is the part
   * that tells a reviewer which of the two proposals they are looking at.
   *
   * The list is not a listbox. Bars are not selectable yet — fixing and releasing is objective 6
   * — so inventing `role="option"` here would announce a selection that does not exist. The one
   * interactive control per row is the lock button, which is focusable, ordinary, and already
   * carries `aria-pressed`.
   */
  import { t, tp } from '../../../lib/i18n';
  import { rcBarLabel, rcBarLabelParts } from '../../../lib/flow/rc-bar-label';
  import { rcBarStatus, rcBarStateCounts } from '../../../lib/flow/rc-bar-status';
  import type { BarPath } from '../../../lib/codes/cirsoc201/bar-geometry';

  interface Props {
    bars: readonly BarPath[];
    /** Bar id → drawing mark. The caller builds it from `assignMarks`' output. */
    markOf: ReadonlyMap<string, string>;
    /**
     * `DetailingAssembly.provisionalMembers` — members whose OWN design is a proposal.
     *
     * The assembly's field, not a set derived from bar ownership. `scene-model.ts` records what
     * inferring it costs: 202 members counted against 117 provisional beams.
     */
    provisionalMembers: ReadonlySet<number>;
    onToggleLock: (barId: string) => void;
  }
  const { bars, markOf, provisionalMembers, onToggleLock }: Props = $props();

  /** One pass over the bars, so the census and the rows cannot disagree about a single one. */
  const rows = $derived(bars.map((bar) => {
    const label = rcBarLabel(bar, (id) => markOf.get(id));
    return {
      bar,
      label,
      parts: rcBarLabelParts(label),
      status: rcBarStatus(bar, (id) => markOf.get(id), provisionalMembers),
    };
  }));

  const counts = $derived(rcBarStateCounts(rows.map((r) => r.status)));

  /** Glyph per state. Redundant with the word on purpose: neither is load-bearing alone. */
  const GLYPH = { provisional: '◆', marked: '●', unmarked: '○' } as const;
</script>

<details class="bars" data-testid="bar-list">
  <!--
    The count first, because three specs read it, and the census after it, because a reviewer
    deciding whether to open the list wants to know what is in it before they do.
  -->
  <summary>
    {tp('detailing.barsCount', { n: bars.length })}
    {#if counts.total > 0}
      <span class="census" data-testid="barcensus">
        {#if counts.provisional > 0}
          <span class="chip st-provisional">
            {GLYPH.provisional} {tp('detailing.bar.census.provisional', { n: counts.provisional })}
          </span>
        {/if}
        {#if counts.unmarked > 0}
          <span class="chip st-unmarked">
            {GLYPH.unmarked} {tp('detailing.bar.census.unmarked', { n: counts.unmarked })}
          </span>
        {/if}
        {#if counts.marked > 0}
          <span class="chip st-marked">
            {GLYPH.marked} {tp('detailing.bar.census.marked', { n: counts.marked })}
          </span>
        {/if}
      </span>
    {/if}
  </summary>

  <ul class="barlist">
    {#each rows as { bar, label, parts, status } (bar.id)}
      <li
        data-testid={`bar-${bar.id}`}
        data-bar-state={status.state}
        class:locked={bar.locked}
        class:provisional={status.state === 'provisional'}
      >
        <span class="bar-mark" data-testid={`bar-mark-${bar.id}`}>{parts.lead}</span>

        <!--
          The state, as a glyph and a word.

          `data-bar-state` on the row is what a test and a stylesheet both key on, so neither has
          to parse the label to find out what the row is.
        -->
        <span
          class="bar-state st-{status.state}"
          data-testid={`barstate-${bar.id}`}
        >
          <span aria-hidden="true">{GLYPH[status.state]}</span> {t(status.stateKey)}
        </span>

        <span class="bar-dia">Ø{bar.diameterMm}</span>
        <span class="bar-len">{bar.cuttingLength.toFixed(2)} m</span>
        <span class="bar-role">{t(`detailing.barRole.${bar.role}`)}</span>

        <!-- Secondary, and selectable: the exact key, for whoever is reconciling a record. -->
        <code class="bar-id" data-testid={`bar-id-${bar.id}`}
              title={t('detailing.bar.technicalId')}>{label.technicalId}</code>

        <button data-testid="bar-lock" class="lock"
                aria-pressed={bar.locked === true}
                onclick={() => onToggleLock(bar.id)}>
          {bar.locked ? t('detailing.unlockBar') : t('detailing.lockBar')}
        </button>

        <!--
          Why it is provisional, in words, on its own line.

          Two different proposals reach this row — the bar is one, or it runs through a member
          that is one — and they are resolved differently. A reviewer who cannot tell them apart
          goes looking in the wrong place.
        -->
        {#if status.reasonKey}
          <p class="bar-note" data-testid={`barnote-${bar.id}`}>
            {t(status.reasonKey)}
            {#if status.provisionalOwners.length > 0}
              <span class="owners">
                {tp('detailing.bar.provisional.owners', {
                  ids: status.provisionalOwners.join(', '),
                })}
              </span>
            {/if}
          </p>
        {/if}
      </li>
    {/each}
  </ul>
</details>

<style>
  details.bars { margin: 0.5rem 0; }
  details.bars summary { cursor: pointer; font-size: 0.8rem; }

  .census { display: inline-flex; flex-wrap: wrap; gap: 0.25rem; margin-left: 0.35rem; }
  .chip {
    font-size: 0.66rem;
    font-weight: 600;
    padding: 0 0.35rem;
    border-radius: 3px;
    background: var(--st-surface-3);
  }

  ul.barlist { list-style: none; margin: 0.3rem 0 0; padding: 0; max-height: 16rem; overflow: auto; }
  ul.barlist > li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.76rem;
    padding: 0.15rem 0;
    border-top: 1px solid var(--st-hair);
  }
  ul.barlist > li.locked { background: var(--st-blue); }
  /*
    The violet is `--st-provisional`, and it is the SAME violet the 3-D view paints provisional
    steel with and the workspace banner borders itself with. One colour, one meaning — a fourth
    shade for the same fact is how a reader learns to distrust all of them.

    A tint plus a rule rather than an opaque fill, for the reason the `.superseded` chip in
    `DetailingWorkflow` records: `--st-text` on an opaque accent measures under AA at this size.
  */
  ul.barlist > li.provisional {
    background: var(--st-provisional-bg);
    border-left: 2px solid var(--st-provisional);
    padding-left: 0.35rem;
  }

  /* The mark leads: same weight as the rest of the row, first in reading order. */
  .bar-mark { min-width: 3rem; font-weight: 600; }

  .bar-state { font-size: 0.68rem; font-weight: 600; white-space: nowrap; }
  .st-provisional { color: var(--st-provisional-text); }
  .st-unmarked { color: var(--st-warn); }
  /* Marked is the ordinary case, so it is stated without being emphasised. */
  .st-marked { color: var(--st-text-2); }

  /*
   * The id, one level down. Smaller and dimmer, and `--st-text-3` is the token reserved for
   * exactly this — text that is present for reference rather than for reading.
   */
  .bar-id {
    font-family: monospace;
    font-size: 0.68rem;
    color: var(--st-text-3);
    user-select: all;
  }
  .bar-dia, .bar-len { min-width: 4rem; }
  .bar-role { flex: 1; opacity: 0.8; }
  .lock { font-size: 0.7rem; padding: 0.05rem 0.35rem; }

  /* The reason takes the full row so it is read as a sentence, not as another column. */
  .bar-note {
    flex-basis: 100%;
    margin: 0 0 0.15rem;
    font-size: 0.68rem;
    color: var(--st-text-2);
  }
  .owners { color: var(--st-text-3); }
</style>
