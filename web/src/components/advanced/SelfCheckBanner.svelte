<script lang="ts">
  import type { StructuredDiagnostic } from '../../lib/engine/types';
  import { selfCheckWarnings } from '../../lib/engine/self-checks';
  let { results }: { results: Array<{ structuredDiagnostics?: StructuredDiagnostic[] } | null | undefined> } = $props();
  const warnings = $derived(selfCheckWarnings(results));
</script>

{#if warnings.length}
  <div role="alert" class="self-check-warning" data-testid="self-check-warning">
    {#each warnings as warning}<div>{warning.message}</div>{/each}
  </div>
{/if}

<style>
  .self-check-warning { margin: 6px 0; padding: 8px; border: 2px solid var(--st-warn); border-radius: 4px; color: var(--st-text); font-size: 12px; overflow-wrap: anywhere; min-width: 0; }
</style>
