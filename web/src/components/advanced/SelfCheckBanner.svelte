<script lang="ts">
  import type { StructuredDiagnostic } from '../../lib/engine/types';
  import { selfCheckGroups } from '../../lib/engine/self-checks';
  import { t } from '../../lib/i18n';
  let { results, labels = [] }: { results: Array<{ structuredDiagnostics?: StructuredDiagnostic[] } | null | undefined>; labels?: string[] } = $props();
  const groups = $derived(selfCheckGroups(results, labels));
  const count = $derived(groups.reduce((n, group) => n + group.warnings.length, 0));
</script>

{#if count}
  <div role="alert" class="self-check-warning" data-testid="self-check-warning">
    <details>
      <summary>⚠ {t('diag.warnings')}: {count} · {t('resultChecks.title')}</summary>
      <!-- Keyboard users must be able to focus and scroll the bounded details. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="warning-details" role="region" aria-label={t('resultChecks.title')} tabindex="0">
        {#each groups as group}
          {#if group.label}<strong>{group.label}</strong>{/if}
          {#each group.warnings as warning}<p>{warning.message}</p>{/each}
        {/each}
      </div>
    </details>
  </div>
{/if}

<style>
  .self-check-warning { margin: 6px 0; padding: 0 8px; border: 2px solid var(--st-warn); border-radius: 4px; color: var(--st-text); font-size: 12px; overflow-wrap: anywhere; min-width: 0; }
  summary { min-height: 44px; align-content: center; cursor: pointer; }
  .warning-details { max-height: 160px; overflow: auto; }
  p { margin: 6px 0; }
</style>
