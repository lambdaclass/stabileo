<script lang="ts">
  /**
   * The chrome a standing viewer notice wears: a label that never softens, and a fold.
   *
   * ── Why the chrome is shared and the WORDS are not ─────────────────
   *
   * `ProvisionalBanner` and `TorsionBanner` stay two components, for the reason `TorsionBanner`
   * already writes down: they are different facts about different members, and "a member can be
   * either, both, or neither". What they had in common was only the shape — a strong label, a
   * sentence, a tone — and F6 adds a second common thing, the fold. Two copies of a fold is two
   * chances for one of them to keep a paragraph the other gave up, so the shape lives here and
   * each notice supplies its own words.
   *
   * ── What the fold is not allowed to do ─────────────────────────────
   *
   * Hide the claim. Folded, this still renders the label and the count at full contrast; what
   * goes away is the explanation. A notice that could vanish would be a control for making a
   * provisional drawing look finished, which is the risk `ProvisionalBanner` exists to name.
   *
   * The state lives in `viewer-notices.svelte.ts` — session-scoped, keyed on the count, so a
   * regeneration that changes the number re-opens the notice by itself.
   */
  import { t } from '../../../lib/i18n';
  import { viewerNotices, type ViewerNoticeKind } from '../../../lib/store/viewer-notices.svelte';

  interface Props {
    kind: ViewerNoticeKind;
    /** How many members the notice is about. Zero renders nothing; the caller checks. */
    count: number;
    /** The claim. Rendered in both states, at full strength. */
    label: string;
    /** The explanation. Rendered only while unfolded. */
    detail: string;
    /** `data-testid` for the notice itself, so existing specs keep their locators. */
    testid: string;
  }
  const { kind, count, label, detail, testid }: Props = $props();

  const folded = $derived(viewerNotices.folded(kind, count));
</script>

<p
  class="notice"
  class:folded
  data-testid={testid}
  data-count={count}
  data-folded={folded ? 'true' : 'false'}
>
  <strong>{label}</strong>
  <!--
    The count, on its own, in BOTH states.

    Folded, the sentence that carried it is gone, and "PROVISIONAL" without a number says the
    project has a proposal somewhere. The figure is the part a reader acts on.
  -->
  <span class="count" data-testid={`${testid}-count`}>{count}</span>
  {#if !folded}
    <span class="detail">{detail}</span>
  {/if}
  <button
    type="button"
    class="fold"
    data-testid={`${testid}-fold`}
    aria-expanded={!folded}
    onclick={() => viewerNotices.toggle(kind, count)}
  >{folded ? t('detailing.scene.notice.expand') : t('detailing.scene.notice.fold')}</button>
</p>

<style>
  /*
    One row when folded, a paragraph when not.
    `flex-wrap` is what lets the detail run onto its own line at 820 px without the fold button
    leaving the first row, where a reader looks for it.
  */
  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 0.4rem;
    margin: 0;
    padding: 0.4rem 0.75rem;
    color: var(--st-text);
    font-size: 0.76rem;
    line-height: 1.4;
  }
  /* Folded is a single row and says so in its padding: this is the 48 px per notice F6 is about. */
  .notice.folded { padding: 0.15rem 0.75rem; }

  .notice strong { letter-spacing: 0.02em; }
  /* The figure, as a figure. Tabular so two notices' counts line up when both are folded. */
  .count {
    font-family: var(--st-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  /* The sentence takes the rest of the row and wraps under it. */
  .detail { flex: 1 1 16rem; min-width: 0; }

  /*
    The fold, last, and always a control of ours.

    C1 of `pro-panel-consistency` rejects a control with neither a surface nor a border of ours,
    and it is right to: a bare text button on a coloured band reads as part of the sentence.
  */
  .fold {
    margin-left: auto;
    flex: 0 0 auto;
    padding: 0.05rem 0.4rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.68rem;
    cursor: pointer;
  }
  .fold:hover { background: var(--st-surface-3); color: var(--st-text); }
  .fold:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
</style>
