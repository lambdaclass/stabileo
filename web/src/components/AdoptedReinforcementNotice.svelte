<script lang="ts">
  import { i18n, t } from '../lib/i18n';
  import { ignoresAdoptedReinforcement, inactivePlacementRules } from '../lib/model/ignored-adoption';
  import placementNotice from '../lib/provenance/result-changes/saved-placement-offsets.json';
  import { registryLocale } from '../lib/provenance/registry';
  import { modelStore } from '../lib/store/model.svelte';
</script>

{#if ignoresAdoptedReinforcement(modelStore.designData)}
  <div class="notice" role="status">{t('project.adoptedReinforcementIgnored')}</div>
{/if}

{#if inactivePlacementRules(modelStore.designData)}
  <div class="notice" role="status" data-testid="stored-placement-offsets">{placementNotice.explanation[registryLocale(i18n.locale, placementNotice.explanation)]}</div>
{/if}

<style>
  .notice {
    padding: 6px 12px;
    background: var(--st-surface);
    color: var(--st-text);
    border-inline-start: 3px solid var(--st-warn);
  }
</style>
