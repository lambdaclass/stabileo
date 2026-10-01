<script lang="ts">
  /**
   * Specifications › List: each distinct specification the model holds and what it applies to.
   * Derived from the fields of each member, support and shell, which remain the one place a
   * specification is stored; clicking a row selects what it lists. Read only.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import { specificationRows, type SpecRow } from '../../../lib/pro/specification-list';

  const rows = $derived(specificationRows(modelStore.model, t));

  // The section first: opening it sets what the pointer selects, which can clear a selection.
  function select(r: SpecRow) {
    if (r.kind === 'member') { uiStore.specSection = 'members'; uiStore.setSelection(new Set(), new Set(r.ids)); }
    else if (r.kind === 'support') { uiStore.specSection = 'supports'; uiStore.clearSelection(); for (const id of r.ids) uiStore.selectSupport(id, true); }
    else { uiStore.specSection = 'surfaces'; uiStore.setSelection(new Set(), new Set(), false, new Set(r.shellKeys)); }
  }
</script>

<div class="sl" data-testid="spec-list">
  {#if rows.length === 0}
    <p class="sl-empty">{t('spec.list.empty')}</p>
  {:else}
    <table>
      <thead><tr><th>{t('spec.list.what')}</th><th>{t('spec.list.value')}</th><th>{t('spec.list.count')}</th></tr></thead>
      <tbody>
        {#each rows as r (r.key)}
          <tr onclick={() => select(r)} data-testid="spec-list-row">
            <td>{r.what}</td><td>{r.value}</td><td class="n">{r.ids.length}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="sl-hint">{t('spec.list.hint')}</p>
  {/if}
</div>

<style>
  .sl { padding: 6px 10px; font-size: 0.66rem; color: var(--st-text-2); }
  .sl-empty, .sl-hint { margin: 4px 0 0; font-size: 0.62rem; color: var(--st-text-3); }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: normal; color: var(--st-text-3); padding: 2px 4px; border-bottom: 1px solid var(--st-hair); }
  td { padding: 2px 4px; border-bottom: 1px solid var(--st-hair); }
  tr:hover td { background: var(--st-surface-3); cursor: pointer; }
  .n { text-align: right; font-family: var(--st-mono); }
</style>
