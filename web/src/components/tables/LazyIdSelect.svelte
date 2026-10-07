<script lang="ts">
  /**
   * A select of ids that holds its full list only while it is in use.
   *
   * The members table had two of these per row, each listing every node: on the 3D shed that
   * is 709 rows × 2 × 232 nodes, 330 000 options, and arming the member tool (which opens the
   * table) froze the app for three seconds. Closed, the select holds the one option it shows;
   * the list is built on pointer-down or focus, before the browser opens it, and dropped on
   * blur.
   */
  import { flushSync } from 'svelte';

  interface Props {
    value: number;
    ids: readonly number[];
    onchange: (id: number) => void;
    testid?: string;
    class?: string;
  }
  let { value, ids, onchange, testid, class: cls = '' }: Props = $props();

  let open = $state(false);
  function load() { if (!open) flushSync(() => { open = true; }); }
</script>

<select
  class={cls}
  {value}
  data-testid={testid}
  onpointerdown={load}
  onfocus={load}
  onblur={() => { open = false; }}
  onchange={(e) => onchange(Number(e.currentTarget.value))}
>
  {#if open}
    {#each ids as id (id)}<option value={id}>{id}</option>{/each}
  {:else}
    <option {value}>{value}</option>
  {/if}
</select>
