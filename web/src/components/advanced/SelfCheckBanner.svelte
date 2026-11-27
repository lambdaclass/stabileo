<script lang="ts">
  import type { StructuredDiagnostic } from '../../lib/engine/types';
  import { selfCheckGroups } from '../../lib/engine/self-checks';
  import { selfCheckWarningText } from '../../lib/i18n/engine-text';
  import { t } from '../../lib/i18n';
  import { unifiedPlates } from '../../lib/features';
  import { noticePrefs } from '../../lib/store/notice-prefs.svelte';
  import NoticeRow from '../notices/NoticeRow.svelte';
  let { results, labels = [] }: { results: Array<{ structuredDiagnostics?: StructuredDiagnostic[] } | null | undefined>; labels?: string[] } = $props();
  const groups = $derived(selfCheckGroups(results, labels));
  const count = $derived(groups.reduce((n, group) => n + group.warnings.length, 0));
</script>

{#snippet warnings()}
  {#each groups as group}
    {#if group.label}<strong>{group.label}</strong>{/if}
    {#each group.warnings as warning}<p>{selfCheckWarningText(warning)}</p>{/each}
  {/each}
{/snippet}

{#if count && (!unifiedPlates() || !noticePrefs.isHidden('selfCheck'))}
  <div role="alert" class="self-check-warning" data-testid="self-check-warning">
    {#if unifiedPlates()}
      <NoticeRow kind="selfCheck" level="warning" summary={`${t('notices.kind.selfCheck')} (${count})`}>
        {@render warnings()}
      </NoticeRow>
    {:else}
      <details>
        <summary>⚠ {t('diag.warnings')}: {count} · {t('resultChecks.title')}</summary>
        <div class="warning-details" role="region" aria-label={t('resultChecks.title')} tabindex="0">
          {@render warnings()}
        </div>
      </details>
    {/if}
  </div>
{/if}

<style>
  .self-check-warning { margin: 6px 0; font-size: 12px; min-width: 0; }
  .warning-details { max-height: 160px; overflow: auto; }
  p { margin: 4px 0; }
</style>
