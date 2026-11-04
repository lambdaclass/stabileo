<script lang="ts">
  import type { Snippet } from 'svelte';
  import AdvFold from '../kit/AdvFold.svelte';

  let { title, summary = '', help = '', testid, open = $bindable(false), children }: {
    title: string; summary?: string; help?: string; testid: string; open?: boolean; children: Snippet;
  } = $props();
</script>

<AdvFold {title} {summary} {help} {testid} bind:open>
  <div class="ps-body">{@render children()}</div>
</AdvFold>

<style>
  .ps-body { font-size: 0.68rem; line-height: 1.45; color: var(--st-text-2); }
</style>
