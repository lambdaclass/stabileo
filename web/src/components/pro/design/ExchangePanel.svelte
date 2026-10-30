<!--
  The project for other programs: the designed building as IFC (members, slabs, walls, footings,
  bars, plates and bolts, with the design state as properties), the project workbook with its
  design sheets, and the forces of each physical member as CSV.
-->
<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { exportProjectIfc } from '../../../lib/store/ifc-export';
  import { physicalForcesCsv } from '../../../lib/store/design-exchange';
  import { downloadResultText, prepareExportProvenance } from '../../../lib/export/provenance-attach';
  import { resultsStore } from '../../../lib/store/results.svelte';
  import OutdatedNotice from './OutdatedNotice.svelte';
  import { designData, patchDesignData } from '../../../lib/store/design-data';
  import type { IfcColumnTop } from '../../../lib/store/ifc-physical';

  let { projectName }: { projectName: string } = $props();

  const hasResults = $derived(!!resultsStore.results3D);
  const base = () => (projectName || 'stabileo').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || 'stabileo';

  function save(name: string, type: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /*
   * Both carry the results' provenance and stale status, as every export of results does
   * (`export/provenance-attach.ts`); a project that moved while the record was prepared writes
   * nothing and says so.
   */
  async function ifc() {
    const record = await prepareExportProvenance();
    if (record) save(`${base()}.ifc`, 'application/x-step', exportProjectIfc(t, i18n.locale, projectName, record));
  }
  const csv = () => void downloadResultText(physicalForcesCsv(), `${base()}-physical-forces.csv`, 'text/csv');
  const xlsx = async () => {
    const { downloadProjectWorkbook } = await import('../../../lib/store/project-workbook');
    await downloadProjectWorkbook(5);
  };

  const columnTop = $derived<IfcColumnTop>(designData().exchange?.ifcColumnTop ?? 'slabTop');
  const setColumnTop = (v: IfcColumnTop) => patchDesignData({ exchange: { ...designData().exchange, ifcColumnTop: v } });
</script>

<section class="exchange" data-testid="exchange-panel" aria-labelledby="exchange-title">
  <h4 id="exchange-title">{t('exch.title')}</h4>
  <p class="lead">{t('exch.lead')}</p>
  <OutdatedNotice what="exchange" testid="exchange-outdated" />
  <label class="opt">
    <span>{t('exch.ifcColumnTop')}</span>
    <select data-testid="exchange-ifc-column-top" value={columnTop} onchange={(e) => setColumnTop(e.currentTarget.value as IfcColumnTop)}>
      <option value="slabTop">{t('exch.ifcColumnTop.slabTop')}</option>
      <option value="slabSoffit">{t('exch.ifcColumnTop.slabSoffit')}</option>
      <option value="axis">{t('exch.ifcColumnTop.axis')}</option>
    </select>
  </label>
  <p class="hint">{t('exch.ifcColumnTop.hint')}</p>
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
  .opt { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; font-size: 0.68rem; color: var(--st-text-2); }
  .opt select { font-size: 0.68rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; }
  .hint { margin: 0; font-size: 0.68rem; color: var(--st-text-2); line-height: 1.35; }
  .actions button {
    font-size: 0.7rem; padding: 0.2rem 0.5rem; background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer;
  }
  .actions button:hover:not(:disabled) { background: var(--st-hair-strong); }
  .actions button:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
