<!--
  The project for other programs: the designed building as IFC (members, slabs, walls, footings,
  bars, plates and bolts, with the design state as properties), the project workbook with its
  design sheets, and the forces of each physical member as CSV.
-->
<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { exportProjectIfc } from '../../../lib/store/ifc-export';
  import { physicalForcesCsv } from '../../../lib/store/design-exchange';
  import { downloadProjectWorkbook } from '../../../lib/store/project-workbook';
  import { resultsStore } from '../../../lib/store/results.svelte';
  import OutdatedNotice from './OutdatedNotice.svelte';

  let { projectName }: { projectName: string } = $props();

  const hasResults = $derived(!!resultsStore.results3D);
  const base = () => (projectName || 'stabileo').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || 'stabileo';

  function save(name: string, type: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const ifc = () => save(`${base()}.ifc`, 'application/x-step', exportProjectIfc(t, i18n.locale, projectName));
  const csv = () => save(`${base()}-physical-forces.csv`, 'text/csv', physicalForcesCsv());
  const xlsx = () => void downloadProjectWorkbook(5);
</script>

<section class="exchange" data-testid="exchange-panel" aria-labelledby="exchange-title">
  <h4 id="exchange-title">{t('exch.title')}</h4>
  <p class="lead">{t('exch.lead')}</p>
  <OutdatedNotice what="exchange" testid="exchange-outdated" />
  <div class="actions">
    <button data-testid="exchange-ifc" onclick={ifc}>{t('exch.ifc')}</button>
    <button data-testid="exchange-xlsx" onclick={xlsx}>{t('exch.xlsx')}</button>
    <button data-testid="exchange-csv" onclick={csv} disabled={!hasResults} title={hasResults ? '' : t('exch.noResults')}>{t('exch.csv')}</button>
  </div>
</section>

<style>
  .exchange { border-top: 1px solid var(--st-hair); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  h4 { margin: 0; font-size: 0.75rem; }
  .lead { margin: 0; font-size: 0.68rem; color: var(--st-text-2); line-height: 1.35; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .actions button {
    font-size: 0.7rem; padding: 0.2rem 0.5rem; background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer;
  }
  .actions button:hover:not(:disabled) { background: var(--st-hair-strong); }
  .actions button:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
