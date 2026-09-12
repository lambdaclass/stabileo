<script lang="ts">
  /**
   * "Draw this in the model" — the one place a drawing mode is entered.
   *
   * ── Why the ribbon no longer does this ─────────────────────────────
   *
   * A command in the top bar opens a PANEL. It used to also arm the pointer,
   * which made one press do two things and left the reader in a drawing mode
   * they had not asked to be in: opening the Nodes table to read a coordinate
   * meant the next click on the model left a node behind.
   *
   * So the bar says where you are and this says what you are doing. Exactly
   * one button is lit up there, and it is always the panel on screen; being
   * in a drawing mode is said by the pointer box over the model — which is
   * also where you leave it, because that is where the pointer is.
   *
   * A second press disarms, because a control that can only be switched on
   * makes the reader hunt for the way out.
   */
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import Icon from '../ribbon/Icon.svelte';

  interface Props {
    /** The pointer tool this arms — `uiStore.currentTool`. */
    tool: string;
    /** What is being drawn, for the label: "Draw NODE in the model". */
    label: string;
    icon?: string;
    testid?: string;
  }

  const { tool, label, icon = 'node', testid = 'draw-in-model' }: Props = $props();

  const armed = $derived(uiStore.currentTool === tool);
</script>

<button
  class="dim-btn"
  class:on={armed}
  aria-pressed={armed ? 'true' : 'false'}
  data-testid={testid}
  onclick={() => { uiStore.currentTool = (armed ? 'select' : tool) as never; }}
  title={armed ? t('pro.drawStopHint') : t('pro.drawStartHint')}
>
  <Icon name={icon} size={14} />
  <span>{armed ? t('pro.drawStop') : `${t('pro.drawInModel')} ${label}`}</span>
</button>

<style>
  .dim-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 0.4rem 0.55rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.74rem;
    cursor: pointer;
  }

  .dim-btn:hover { color: var(--st-text); border-color: var(--st-accent); }

  /* Armed reads as a state, not as a hover: the reader is IN this mode until
     they leave it, and the model is about to respond to their clicks. */
  .dim-btn.on {
    background: var(--st-accent);
    border-color: var(--st-accent);
    color: #fff;
  }

  .dim-btn:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
</style>
