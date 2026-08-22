<script lang="ts">
  /**
   * What is wrong with this assembly, ranked, with a way to get to it.
   *
   * ── The problem this exists for ────────────────────────────────────
   *
   * The detailing column had every fact a reviewer needs and no order among them. Reading down
   * it, you met: the header, the review-state track, the unsupported list, the whole bar list,
   * the conflicts, the sheet, the schedule, the documents. So the assembly's BLOCKING errors sat
   * below a list of several hundred bars — the one thing that stops a sheet from being issued was
   * the thing you had to scroll past the most content to reach — and the warnings sat above it,
   * ranked ahead of the errors by nothing but the order somebody added them in.
   *
   * A review screen has one job: say whether this can be issued, and if not, what to fix. That is
   * an ORDER — errors, then warnings, then the all-clear — and it belongs directly under the
   * header, before anything descriptive.
   *
   * ── Navigation, which is the other half ────────────────────────────
   *
   * `BarConflict.elementIds` has carried the comment "for routing the conflict to a member in the
   * UI" since it was written, and nothing routed anything: the conflict said `barA / barB` and
   * `12 mm / 25 mm` and left the reviewer to find the member by hand. Each conflict now offers
   * the members it involves and the sheet it is drawn on, so "what is wrong" and "where is it"
   * are one gesture apart instead of a search.
   *
   * ── What it deliberately does not do ───────────────────────────────
   *
   * It does not judge. Severity, clearance, required clearance and shortfall are the engine's
   * numbers, shown as the engine produced them; this component ranks and routes, and computes
   * nothing. It also does not resolve anything — there is no "fix" button, because a conflict is
   * resolved by changing the reinforcement, not by dismissing the notice.
   */
  import { t, tp } from '../../../lib/i18n';
  import type { BarConflict } from '../../../lib/engine/detailing/collision';

  interface Props {
    /** Already filtered to the reportable severities by the store. */
    conflicts: BarConflict[];
    conflictIndex: number;
    /** What stands between this assembly and the next review state. */
    stateBlockers: string[];
    /** Cases the detailing engine did not cover — warnings, not blockers. */
    unsupported: { message: string }[];
    /** The state name the blockers are blocking, already translated. */
    stateLabel: string;
    onSelectConflict: (i: number) => void;
    onPrev: () => void;
    onNext: () => void;
    /** Select a member in the model, so the rest of the app follows the conflict. */
    onGoToMember: (elementId: number) => void;
    /** Open the sheet this conflict is drawn on, full size. */
    onShowOnSheet: () => void;
  }
  const {
    conflicts, conflictIndex, stateBlockers, unsupported, stateLabel,
    onSelectConflict, onPrev, onNext, onGoToMember, onShowOnSheet,
  }: Props = $props();

  const errorCount = $derived(conflicts.length + stateBlockers.length);
  const clean = $derived(errorCount === 0 && unsupported.length === 0);

  /** Millimetres, because that is the unit a clearance is argued about in. */
  function mm(m: number): string {
    return `${(m * 1000).toFixed(0)} mm`;
  }

  function severityLabel(s: string): string {
    return s === 'overlap' ? t('detailing.conflict.overlap') : t('detailing.conflict.clearance');
  }
</script>

<!--
  `aria-live` is on the summary alone, not on the whole block.

  The counts change as the reviewer works; announcing the entire list on every change would read
  a page of conflicts aloud each time one is resolved.
-->
<section class="problems" data-testid="detailing-problems" aria-labelledby="problems-title">
  <h5 id="problems-title" class="sr-only">{t('detailing.problems.title')}</h5>

  <p class="summary" data-testid="problems-summary" aria-live="polite">
    {#if clean}
      <span class="chip ok">✓ {t('detailing.problems.none')}</span>
    {:else}
      {#if errorCount > 0}
        <span class="chip err" data-testid="problems-errors">
          ✕ {tp('detailing.problems.errors', { n: errorCount })}
        </span>
      {/if}
      {#if unsupported.length > 0}
        <span class="chip warn" data-testid="problems-warnings">
          ⚠ {tp('detailing.problems.warnings', { n: unsupported.length })}
        </span>
      {/if}
    {/if}
  </p>

  {#if clean}
    <!-- The id every existing spec asserts the all-clear on. Kept, not renamed. -->
    <p class="ok-line" data-testid="no-conflicts">{t('detailing.noConflicts')}</p>
  {/if}

  <!-- ── Blocking, first ─────────────────────────────────────────── -->

  {#if conflicts.length > 0}
    <div class="group group-err">
      <div class="group-head">
        <span class="group-title">{t('detailing.conflicts')}</span>
        <!--
          The pager stays. It is how a reviewer walks a long list without losing their place, and
          three specs step through it; the list below is the same conflicts, addressable directly.
        -->
        <span class="conflict-nav" data-testid="conflict-nav">
          <button type="button" data-testid="conflict-prev"
                  onclick={onPrev} aria-label={t('detailing.prevConflict')}>‹</button>
          <span data-testid="conflict-counter">
            {tp('detailing.conflictOf', { i: conflictIndex + 1, n: conflicts.length })}
          </span>
          <button type="button" data-testid="conflict-next"
                  onclick={onNext} aria-label={t('detailing.nextConflict')}>›</button>
        </span>
      </div>

      <ul class="list" data-testid="conflict-list">
        {#each conflicts as c, i (`${c.barA}|${c.barB}|${i}`)}
          <li
            class="item"
            class:current={i === conflictIndex}
            data-testid={`conflict-item-${i}`}
            aria-current={i === conflictIndex ? 'true' : undefined}
          >
            <!--
              The row itself selects the conflict; the actions inside it go elsewhere. Two
              different destinations, so they are two different controls rather than one row that
              does something different depending on where you hit it.
            -->
            <button type="button" class="row" onclick={() => onSelectConflict(i)}>
              <span class="sev">{severityLabel(c.severity)}</span>
              <span class="bars">{c.barA} / {c.barB}</span>
              <span class="nums">
                {mm(c.clearance)} / {mm(c.required)}
                <span class="short">−{mm(c.shortfall)}</span>
              </span>
            </button>
            <span class="actions">
              {#each c.elementIds as id (id)}
                <button
                  type="button" class="go"
                  data-testid={`conflict-member-${id}`}
                  onclick={() => onGoToMember(id)}
                  title={tp('detailing.problems.goToMember', { id })}
                >{tp('detailing.problems.member', { id })}</button>
              {/each}
              <button
                type="button" class="go"
                data-testid={`conflict-sheet-${i}`}
                onclick={() => { onSelectConflict(i); onShowOnSheet(); }}
              >{t('detailing.problems.onSheet')}</button>
            </span>
          </li>
        {/each}
      </ul>

      <!--
        The one-line detail the pager points at. Its id is a contract; what changed is that it now
        sits with the list it belongs to instead of under the bar list.
      -->
      {#if conflicts[conflictIndex]}
        {@const c = conflicts[conflictIndex]}
        <p class="detail" data-testid="conflict-detail">
          {severityLabel(c.severity)} — {c.barA} / {c.barB}:
          {mm(c.clearance)} / {mm(c.required)}
        </p>
      {/if}
    </div>
  {/if}

  {#if stateBlockers.length > 0}
    <div class="group group-err" data-testid="state-blockers">
      <span class="group-title">{tp('detailing.blockersTitle', { state: stateLabel })}</span>
      <ul class="plain">
        {#each stateBlockers as b, i (i)}<li>{b}</li>{/each}
      </ul>
    </div>
  {/if}

  <!-- ── Then what is merely unhandled ───────────────────────────── -->

  {#if unsupported.length > 0}
    <div class="group group-warn" data-testid="unsupported-list">
      <span class="group-title">{t('detailing.unsupported')}</span>
      <ul class="plain">
        {#each unsupported as u, i (i)}<li>{u.message}</li>{/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  .problems {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0.4rem 0 0.6rem;
  }

  /* The counts, as chips. Glyph and number, so severity never rides on colour alone. */
  .summary { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0; }
  .chip {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.05rem 0.4rem;
    border-radius: 3px;
    background: var(--st-surface-3);
  }
  .chip.ok { color: var(--st-ok); }
  .chip.err { color: var(--st-danger); }
  .chip.warn { color: var(--st-warn); }
  .ok-line { margin: 0; font-size: 0.72rem; color: var(--st-text-2); }

  /*
    A group is a rank, and the rank is carried by a left rule as well as by the order. Removing
    the colour leaves the order and the words, which is the test this has to pass.
  */
  .group {
    border-left: 2px solid var(--st-hair-strong);
    padding: 0.25rem 0 0.25rem 0.5rem;
  }
  .group-err { border-left-color: var(--st-danger); }
  .group-warn { border-left-color: var(--st-warn); }
  .group-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .group-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--st-text);
  }

  .conflict-nav { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.68rem; }
  .conflict-nav button {
    background: none;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    color: var(--st-text-2);
    cursor: pointer;
    padding: 0 0.3rem;
    line-height: 1.3;
  }
  .conflict-nav button:hover { background: var(--st-surface-3); color: var(--st-text); }

  /* The list scrolls itself: a hundred conflicts must not push the sheet off the panel. */
  .list {
    list-style: none;
    margin: 0.25rem 0 0;
    padding: 0;
    max-height: 11rem;
    overflow-y: auto;
  }
  .item {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem;
    padding: 0.1rem 0;
    border-bottom: 1px solid var(--st-hair);
  }
  .item.current { background: var(--st-surface-3); }

  .row {
    display: flex;
    flex: 1 1 12rem;
    min-width: 0;
    gap: 0.35rem;
    align-items: baseline;
    background: none;
    border: 0;
    padding: 0.1rem 0.15rem;
    text-align: left;
    cursor: pointer;
    color: var(--st-text-2);
    font-size: 0.68rem;
  }
  .row:hover { color: var(--st-text); }
  .row:focus-visible, .go:focus-visible {
    outline: 2px solid var(--st-value);
    outline-offset: 1px;
  }
  .sev { font-weight: 600; color: var(--st-danger); white-space: nowrap; }
  .bars { font-family: var(--st-mono, monospace); overflow: hidden; text-overflow: ellipsis; }
  .nums { margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .short { color: var(--st-danger); font-weight: 600; }

  .actions { display: flex; gap: 0.2rem; flex-wrap: wrap; }
  .go {
    font-size: 0.64rem;
    padding: 0 0.3rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: none;
    color: var(--st-interactive);
    cursor: pointer;
    white-space: nowrap;
  }
  .go:hover { background: var(--st-surface-3); }

  .detail { margin: 0.3rem 0 0; font-size: 0.68rem; color: var(--st-text-2); }

  .plain {
    margin: 0.15rem 0 0;
    padding-left: 1rem;
    font-size: 0.68rem;
    color: var(--st-text-2);
  }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
</style>
