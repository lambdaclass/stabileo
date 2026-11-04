<script lang="ts">
  import type { Snippet } from 'svelte';
  import AdvFold from '../kit/AdvFold.svelte';

  let { title, summary = '', help = '', testid, children }: { title: string; summary?: string; help?: string; testid: string; children: Snippet } = $props();
  let open = $state(false);
</script>

<div class="cs">
  <AdvFold {title} {summary} {help} {testid} bind:open>
    <div class="cs-body">{@render children()}</div>
  </AdvFold>
</div>

<style>
  .cs-body { display: flex; flex-direction: column; gap: 6px; }
</style>
