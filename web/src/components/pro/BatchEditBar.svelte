<script lang="ts">
  /**
   * Group editing over the selection, above a table: shown when more than one row is selected,
   * with the fields that apply to every one of them (the members table: material, section and
   * specification; the shells table: material and thickness). Each change is one undo step over
   * the whole selection, made by the caller.
   */
  import type { Snippet } from 'svelte';
  import { tp } from '../../lib/i18n';

  interface Props {
    count: number;
    /** i18n key of "Group editing: {n} …". */
    labelKey: string;
    children: Snippet;
    testid?: string;
  }
  let { count, labelKey, children, testid = 'batch-edit' }: Props = $props();
</script>

<div class="be" role="group" aria-label={tp(labelKey, { n: count })} data-testid={testid}>
  <span class="be-title">{tp(labelKey, { n: count })}</span>
  <div class="be-fields">{@render children()}</div>
</div>

<style>
  .be {
    display: flex; flex-direction: column; gap: 6px;
    margin: 6px 10px; padding: 6px 8px 8px;
    border: 1px solid var(--st-accent); border-radius: var(--st-radius);
    background: var(--st-surface-2); font-size: 0.7rem; color: var(--st-text-2);
  }
  .be-title { font-weight: 600; color: var(--st-text); }
  .be-fields { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 10px; }
  .be-fields :global(label) { display: flex; flex-direction: column; gap: 2px; font-size: 0.64rem; color: var(--st-text-3); }
  .be-fields :global(select), .be-fields :global(input) { min-width: 7rem; }
</style>
