<script lang="ts">
  /**
   * A select that holds its full list only while it is in use.
   *
   * A table with a select per row repeats the whole list in every row: on a large model that is
   * tens of thousands of options for a tab to build before it can draw. Closed, the select holds
   * the one option it shows; the list is built on pointer-down or focus, before the browser opens
   * it, and dropped on blur. `options` is a function so the list itself is not built until then.
   */
  import { flushSync } from 'svelte';

  type V = string | number;
  interface Props {
    value: V;
    /** What the closed select shows for `value`. */
    label: string;
    options: () => ReadonlyArray<{ value: V; label: string }>;
    onchange: (value: string) => void;
    testid?: string;
    class?: string;
    title?: string;
    disabled?: boolean;
    /** Keep a click on it from reaching the row (a row that selects on click). */
    stopClick?: boolean;
  }
  let { value, label, options, onchange, testid, class: cls = '', title, disabled = false, stopClick = false }: Props = $props();

  let open = $state(false);
  function load() { if (!open) flushSync(() => { open = true; }); }
</script>

<select
  class={cls}
  value={String(value)}
  {title}
  {disabled}
  data-testid={testid}
  onpointerdown={load}
  onfocus={load}
  onblur={() => { open = false; }}
  onclick={(e) => { if (stopClick) e.stopPropagation(); }}
  onchange={(e) => onchange(e.currentTarget.value)}
>
  {#if open}
    {#each options() as o (o.value)}<option value={String(o.value)}>{o.label}</option>{/each}
  {:else}
    <option value={String(value)}>{label}</option>
  {/if}
</select>
