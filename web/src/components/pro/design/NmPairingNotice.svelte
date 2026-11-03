<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { verificationStore } from '../../../lib/store/verification.svelte';

  let { elementId }: { elementId: number } = $props();

  const paired = $derived((verificationStore.designMap.get(elementId)?.checks ?? []).filter(c => c.notice === 'RC-NM-PAIRING'));
</script>

{#if paired.length > 0}
  <div class="nm-pairing" role="alert" data-testid={`nm-pairing-${elementId}`}>
    <p>{t('knownIssue.RC-NM-PAIRING')} (#1316)</p>
    <ul>
      {#each paired as c (c.name)}
        <li><span>{c.name}</span>: <span class="combo">{c.comboName}</span></li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .nm-pairing { font-size: 0.75rem; line-height: 1.35; padding: 4px 6px; margin-bottom: 6px; border-left: 3px solid var(--st-warn); overflow-wrap: anywhere; max-width: 100%; box-sizing: border-box; }
  .nm-pairing p { margin: 0 0 2px; }
  .nm-pairing ul { margin: 0; padding-left: 16px; }
  .combo { font-family: var(--st-mono, monospace); }
</style>
