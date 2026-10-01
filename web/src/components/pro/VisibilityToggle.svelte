<script lang="ts">
  /**
   * Show or hide one thing in the view: the eye of the ribbon's View stage, open while it shows
   * and struck through while it is hidden. Every show/hide control in PRO uses this one, so the
   * same mark means the same action wherever it appears.
   */
  import Icon from '../ribbon/Icon.svelte';

  interface Props {
    visible: boolean;
    ontoggle: () => void;
    /** What pressing it does, in each state: the tooltip and the accessible name. */
    showLabel: string;
    hideLabel: string;
    testid?: string;
  }
  let { visible, ontoggle, showLabel, hideLabel, testid }: Props = $props();
</script>

<button
  type="button"
  class="vt"
  class:off={!visible}
  aria-pressed={visible}
  title={visible ? hideLabel : showLabel}
  aria-label={visible ? hideLabel : showLabel}
  onclick={(e) => { e.stopPropagation(); ontoggle(); }}
  data-testid={testid}
><Icon name={visible ? 'eye' : 'eye-off'} size={15} /></button>

<style>
  .vt {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; padding: 0;
    background: none; border: 1px solid transparent; border-radius: var(--st-radius);
    color: var(--st-text-2); cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }
  .vt:hover { color: var(--st-text); border-color: var(--st-hair-strong); }
  .vt.off { color: var(--st-text-3); opacity: 0.6; }
  .vt:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 1px; }
</style>
