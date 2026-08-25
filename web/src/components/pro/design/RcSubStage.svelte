<script lang="ts">
  /**
   * An optional step INSIDE a stage.
   *
   * ── Why this is not `StageSection` ─────────────────────────────────
   *
   * `StageSection` is a stage of the pipeline and renders its POSITION — a number in a circle,
   * or a tick once it is finished. A sub-step has no position: the floor pass is part of
   * DISEÑAR, not a sixth thing after it, and a "3" next to a "3" says the panel has two step
   * threes. That is the same class of defect this branch just removed from the tab, which had
   * five sections numbered 0, 1, 4, 5 and 6.
   *
   * Everything else is deliberately identical: the testid conventions (`{testid}-state`,
   * `{testid}-purpose`, the badge and attention ids), the glyph-plus-word state chip so the
   * state never depends on colour, and `open` as a bindable. Twenty-one specs address the floor
   * block by those ids and they keep working.
   *
   * F3 needs this shape three more times — Elementos lineales, superficiales and Fundaciones are
   * groups inside DETALLE, not stages of their own — which is why it is a component rather than
   * fifteen lines inlined into the tab.
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../../lib/i18n';

  /**
   * A sub-step is `optional` or it is `done`. It is never `blocked` or `current`: those are
   * statements about pipeline position, and a sub-step has none — its stage owns that.
   */
  type SubState = 'optional' | 'done';

  interface Props {
    testid: string;
    title: string;
    /** One sentence: what this step is for. Never a restatement of the title. */
    purpose: string;
    state: SubState;
    /** A count worth seeing without opening. */
    badge?: string | number;
    badgeTestid?: string;
    /** Something that needs attention, shown as a warning chip. */
    attention?: string;
    attentionTestid?: string;
    open?: boolean;
    children: Snippet;
  }

  let {
    testid, title, purpose, state, badge, badgeTestid, attention, attentionTestid,
    open = $bindable(false), children,
  }: Props = $props();

  /** Glyph and word per state, so the state is legible with the colour removed. */
  const STATE_TEXT: Record<SubState, { glyph: string; key: string }> = {
    done: { glyph: '✓', key: 'design.stageCard.done' },
    optional: { glyph: '○', key: 'design.stageCard.optional' },
  };
</script>

<details class="sub" data-testid={testid} data-state={state} bind:open>
  <summary>
    <!--
      A dot, not a number. It marks that this is a step without claiming a position in the
      pipeline — see the header for why a number here would be a second "3".
    -->
    <span class="marker" data-state={state} aria-hidden="true">
      {STATE_TEXT[state].glyph}
    </span>
    <span class="head">
      <span class="title-row">
        <span class="title">{title}</span>
        <span class="state" data-testid={`${testid}-state`}>
          <span aria-hidden="true">{STATE_TEXT[state].glyph}</span>
          {t(STATE_TEXT[state].key)}
        </span>
        {#if badge !== undefined}
          <span class="badge" data-testid={badgeTestid ?? `${testid}-badge`}>{badge}</span>
        {/if}
        {#if attention}
          <span class="attention" data-testid={attentionTestid ?? `${testid}-attention`}
            >⚠ {attention}</span>
        {/if}
      </span>
      <span class="purpose" data-testid={`${testid}-purpose`}>{purpose}</span>
    </span>
  </summary>
  <div class="body">{@render children()}</div>
</details>

<style>
  /*
   * Indented and hairline-led, so it reads as "inside the stage above" rather than as a peer of
   * it. No nested scroller: the column scrolls, and a stage that scrolled inside a stage would
   * make the wheel ambiguous — the defect `StageSection` records having removed.
   */
  .sub {
    flex: 0 0 auto;
    margin: 0.4rem 0 0 0.5rem;
    border-left: 2px solid var(--st-hair);
    background: var(--st-surface-2);
    border-radius: 0 4px 4px 0;
    font-family: var(--st-sans);
  }

  summary {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    padding: 0.4rem 0.5rem;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker { display: none; }
  summary:hover { background: var(--st-surface-3); }
  summary:focus-visible { outline: 2px solid var(--st-value); outline-offset: -2px; }

  .marker {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 1.1rem;
    height: 1.1rem;
    margin-top: 0.05rem;
    border: 1px dashed var(--st-hair-strong);
    border-radius: 50%;
    font-size: 0.65rem;
    line-height: 1;
    color: var(--st-text-2);
  }
  .marker[data-state='done'] {
    border-style: solid;
    border-color: var(--st-ok);
    color: var(--st-ok);
  }

  .head { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .title-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem; }
  .title { font-size: 0.8rem; font-weight: 600; color: var(--st-text); }

  .state { font-size: 0.68rem; color: var(--st-text-2); }
  .sub[data-state='done'] .state { color: var(--st-ok); }

  .badge {
    font-size: 0.68rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: var(--st-surface-3);
    color: var(--st-text-2);
  }
  .attention { font-size: 0.68rem; color: var(--st-warn); }
  .purpose { font-size: 0.7rem; line-height: 1.35; color: var(--st-text-2); }

  .body { padding: 0 0.5rem 0.5rem; }
</style>
