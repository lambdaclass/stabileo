<script lang="ts">
  import type { Snippet } from 'svelte';
  import { knownIssueResultDisposition } from '../lib/engine/known-issues';
  let { result, children }: { result: unknown; children: Snippet } = $props();
  const disposition = $derived(knownIssueResultDisposition(result));
</script>

{#each disposition.messages as message}<div role="alert">{message}</div>{/each}
{#if !disposition.refused}{@render children()}{/if}
