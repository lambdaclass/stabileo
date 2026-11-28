<script lang="ts">
  import { i18n, t } from '../lib/i18n';
  import { ignoresAdoptedReinforcement, inactivePlacementRules } from '../lib/model/ignored-adoption';
  import { modelStore } from '../lib/store/model.svelte';

  const placementRules = $derived(inactivePlacementRules(modelStore.designData));
  const notices = $derived(placementRules ? import('../lib/provenance/applicability') : null);
</script>

{#if ignoresAdoptedReinforcement(modelStore.designData)}
  <div class="notice" role="status">{t('project.adoptedReinforcementIgnored')}</div>
{/if}

{#if placementRules}
  <div class="notice" role="status" data-testid="stored-placement-offsets">
    {#await notices}
      {t('recheck.loading')}
    {:then loaded}
      {loaded?.noticeExplanation('saved-placement-offsets', i18n.locale) ?? t('recheck.detailsUnavailable')}
    {:catch}
      {t('recheck.detailsUnavailable')}
    {/await}
  </div>
{/if}

<style>
  .notice {
    padding: 6px 12px;
    background: var(--st-surface);
    color: var(--st-text);
    border-inline-start: 3px solid var(--st-warn);
  }
</style>
