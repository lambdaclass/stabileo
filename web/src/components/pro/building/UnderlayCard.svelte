<script lang="ts">
  /**
   * Templates: DXF plans laid at their levels, to model over and to convert from. One drawing can
   * hold several plans, each laid at its own level (`UnderlayImport`); each template shows what it
   * is and how it is laid, and edits it without moving the structure (`UnderlayRow`). New nodes
   * capture the drawn layers' points while the axes snap is on (`model/underlay.ts`). Saved with
   * the project; touches no result.
   */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import { sortedLevels } from '../../../lib/model/grid';
  import UnderlayImport from './UnderlayImport.svelte';
  import UnderlayRow from './UnderlayRow.svelte';

  const levels = $derived(sortedLevels(modelStore.grid));
  const list = $derived(modelStore.underlays);
  let note = $state<string | null>(null);
</script>

<section class="pk-card" data-testid="underlay-card">
  <h4 class="pk-heading">{t('underlay.title')}</h4>
  <p class="pk-hint">{t('underlay.hint')}</p>
  <UnderlayImport {levels} onlaid={(n) => (note = n)} />
  {#if note}<p class="pk-hint" role="status" data-testid="underlay-note">{note}</p>{/if}

  {#if list.length > 0}
    <table class="ul-table" data-testid="underlay-list">
      <thead><tr><th></th><th>{t('underlay.name')}</th><th>{t('underlay.level')}</th><th></th><th>{t('underlay.opacity')}</th><th></th></tr></thead>
      <tbody>
        {#each list as u (u.id)}<UnderlayRow {u} {levels} />{/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .ul-table { width: 100%; border-collapse: collapse; font-size: 0.66rem; margin-top: 6px; }
  .ul-table :global(th) { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 1px 3px; }
  .ul-table :global(td) { padding: 1px 3px; }
</style>
