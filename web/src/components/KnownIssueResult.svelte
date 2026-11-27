<script lang="ts">
  import type { Snippet } from 'svelte';
  import { knownIssueResultDisposition } from '../lib/engine/known-issues';
  import * as UnifiedKnownIssueNotices from './UnifiedKnownIssueNotices.svelte';
  let { result, children }: { result: unknown; children: Snippet } = $props();
  const disposition = $derived(__PUBLIC_FEATURES__.proPlatesUnified ? UnifiedKnownIssueNotices.review(result) : knownIssueResultDisposition(result));
</script>

{#if __PUBLIC_FEATURES__.proPlatesUnified}
  <UnifiedKnownIssueNotices.default {disposition} />
{:else}
{#each disposition.messages as message}<div role="alert">{message}</div>{/each}
{/if}
{#if !disposition.refused}{@render children()}{/if}
