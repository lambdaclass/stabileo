<script lang="ts">
  import { t } from '../lib/i18n';
  import { ignoresAdoptedReinforcement } from '../lib/model/ignored-adoption';
  import { modelStore } from '../lib/store/model.svelte';
</script>

{#if ignoresAdoptedReinforcement(modelStore.designData)}
  <div class="notice" role="status">{t('project.adoptedReinforcementIgnored')}</div>
{/if}

<style>
  .notice {
    padding: 6px 12px;
    background: var(--st-surface);
    color: var(--st-text);
    border-inline-start: 3px solid var(--st-warn);
  }
</style>
