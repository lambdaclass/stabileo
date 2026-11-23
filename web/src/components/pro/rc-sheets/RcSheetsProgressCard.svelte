<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { sheetsProgress } from '../../../lib/store/rc-sheets-progress.svelte';
  import RcSheetsProgress from './RcSheetsProgress.svelte';
</script>

{#if sheetsProgress.now}
  <div class="rspc" data-testid="rc-progress-card">
    <strong>{t('rcSheets.progressTitle')}</strong>
    <RcSheetsProgress progress={sheetsProgress.now} />
  </div>
{/if}

<style>
  .rspc { pointer-events: auto; display: flex; flex-direction: column; gap: 4px; min-width: 240px; max-width: 350px; padding: 0.6rem 1rem; border-radius: 6px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-left: 3px solid var(--st-accent); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); font-size: 0.8rem; color: var(--st-text); }
  .rspc strong { font-weight: 600; }
</style>
