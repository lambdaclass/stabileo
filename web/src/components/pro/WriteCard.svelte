<script lang="ts">
  /**
   * The card a "Write …" button opens: the fields of one new thing and the button that adds it.
   *
   * A form, so Enter adds from any field, and the first field takes the focus when the card
   * opens: typing ten nodes is ten rows of X, Tab, Y, Tab, Z, Enter.
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import { drawState } from '../../lib/store/draw-state.svelte';

  interface Props {
    title: string;
    /** Without one the card has no button of its own: its fields carry their own (Loads). */
    submitLabel?: string;
    onsubmit?: () => void;
    error?: string | null;
    disabled?: boolean;
    testid?: string;
    children: Snippet;
  }
  const { title, submitLabel, onsubmit = () => {}, error = null, disabled = false, testid = 'write-card', children }: Props = $props();

  let form = $state<HTMLElement | null>(null);
  $effect(() => {
    form?.querySelector<HTMLElement>('input, select')?.focus();
  });
</script>

<!-- A form only when the card has its own button; the Loads card's fields carry theirs, and
     Enter in a form without one would press the first button it finds. -->
<svelte:element
  this={submitLabel ? 'form' : 'div'}
  novalidate
  class="wc"
  bind:this={form}
  data-testid={testid}
  onsubmit={(e: SubmitEvent) => { e.preventDefault(); if (!disabled) { onsubmit(); form?.querySelector<HTMLElement>('input, select')?.focus(); } }}
>
  <div class="wc-head">
    <span class="wc-title">{title}</span>
    <button type="button" class="wc-close" onclick={() => (drawState.writing = null)} aria-label={t('pro.writeClose')} title={t('pro.writeClose')}>×</button>
  </div>
  <div class="wc-fields">{@render children()}</div>
  {#if error}<div class="wc-error" role="alert" data-testid="{testid}-error">{error}</div>{/if}
  {#if submitLabel}<button type="submit" class="wc-submit" {disabled} data-testid="{testid}-submit">{submitLabel}</button>{/if}
</svelte:element>

<style>
  .wc {
    margin: 8px 10px; padding: 8px 10px 10px;
    border: 1px solid var(--st-accent); border-radius: var(--st-radius);
    background: var(--st-surface-2);
    display: flex; flex-direction: column; gap: 8px;
    font-size: 0.72rem;
  }
  .wc-head { display: flex; align-items: center; justify-content: space-between; }
  .wc-title { font-weight: 600; color: var(--st-text); }
  .wc-close { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 0.9rem; line-height: 1; }
  .wc-close:hover { color: var(--st-text); }
  .wc-fields { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
  .wc-fields :global(label) { display: inline-flex; align-items: center; gap: 5px; color: var(--st-text-2); white-space: nowrap; }
  .wc-fields :global(input[type='number']), .wc-fields :global(input.wc-num) { width: 70px; }
  .wc-fields :global(input.wc-ids) { width: 110px; }
  .wc-error { color: var(--st-red-text, #e8705f); }
  .wc-submit {
    align-self: flex-start;
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--st-accent); border-radius: var(--st-radius);
    background: var(--st-accent); color: #fff; font: inherit; cursor: pointer;
  }
  .wc-submit:disabled { opacity: 0.45; cursor: default; }
</style>
