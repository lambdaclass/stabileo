<script lang="ts">
  /**
   * "Write this in the panel": the twin of `DrawInModelButton`.
   *
   * The two add the same thing, one with the pointer in the model and one with the keyboard
   * here, so they sit side by side, look alike and are named alike: Draw node, Write node.
   * Adding used to be a "+ Node" link under a table or a form with its own wording, and nothing
   * said it did what the Draw button did.
   */
  import { t } from '../../lib/i18n';
  import Icon from '../ribbon/Icon.svelte';
  import { drawState } from '../../lib/store/draw-state.svelte';

  interface Props {
    /** Which panel's card this opens. */
    kind: string;
    /** What is being written, for the label: "Write NODE". */
    label: string;
    testid?: string;
  }
  const { kind, label, testid = 'write-in-panel' }: Props = $props();
  const open = $derived(drawState.writing === kind);
</script>

<button
  class="wr-btn"
  class:on={open}
  aria-pressed={open ? 'true' : 'false'}
  aria-expanded={open}
  data-testid={testid}
  onclick={() => { drawState.writing = open ? null : kind; }}
  title={t('pro.writeHint')}
>
  <Icon name="data" size={13} />
  <span>{t('pro.writeIn')} {label}</span>
</button>

<style>
  /* The same button as Draw, so the pair reads as two ways to do one thing. */
  .wr-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 0.24rem 0.45rem;
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    background: var(--st-surface-2); color: var(--st-text-2);
    font: inherit; font-size: 0.7rem; white-space: nowrap; cursor: pointer;
  }
  .wr-btn:hover { color: var(--st-text); border-color: var(--st-accent); }
  .wr-btn.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .wr-btn:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
</style>
