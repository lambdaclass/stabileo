<script lang="ts" module>
  export interface Preset { id: string; label: string; ids: readonly string[] }
</script>

<script lang="ts">
  /** Quick sets of drawings above the checks: pressing one sets the checks, which stay editable. */
  let { presets, chosen, onpick, testid }: {
    presets: Preset[];
    chosen: readonly string[];
    onpick: (ids: readonly string[]) => void;
    testid: string;
  } = $props();
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
</script>

<div class="xs-seg dp" role="group">
  {#each presets as p (p.id)}
    {@const on = same(chosen, p.ids)}
    <button type="button" class:on aria-pressed={on} onclick={() => onpick(p.ids)} data-testid={`${testid}-preset-${p.id}`}>{p.label}</button>
  {/each}
</div>

<style>
  .dp { align-self: flex-start; }
</style>
