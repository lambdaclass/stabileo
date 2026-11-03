<script lang="ts">
  import type { Snippet } from 'svelte';
  import { uiStore } from '../../lib/store';

  /** What an option does, under it. Gone when the reader turns the inline help off in Settings. */
  let { text, children, class: cls = '', testid }: { text?: string; children?: Snippet; class?: string; testid?: string } = $props();
</script>

{#if uiStore.inlineHelp}
  <p class="pk-hint {cls}" data-hint data-testid={testid}>{#if children}{@render children()}{:else}{text}{/if}</p>
{/if}
