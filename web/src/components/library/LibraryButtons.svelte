<script lang="ts">
  import { t } from '../../lib/i18n';
  import { examplesUi } from '../../lib/store/examples-ui.svelte';
  import { projectSettings } from '../../lib/store/project-settings.svelte';

  let { pro = false }: { pro?: boolean } = $props();
</script>

<div class="lb">
  <button class="lb-btn" onclick={() => examplesUi.open('examples')} data-testid="lib-open-examples">{t('appShell.openExample')}</button>
  <button class="lb-btn" onclick={() => examplesUi.open('tutorials')} data-testid="lib-open-tutorials">{t('appShell.tutorials')}</button>
  {#if pro}
    <button class="lb-btn lb-wide" onclick={() => projectSettings.show('data')} data-testid="lib-project-settings">{t('appShell.projectSettings')}</button>
  {/if}
</div>

<style>
  .lb { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .lb-btn {
    padding: 0.45rem 0.5rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .lb-btn:hover { background: var(--st-surface-3); }
  .lb-wide { grid-column: 1 / -1; }
</style>
