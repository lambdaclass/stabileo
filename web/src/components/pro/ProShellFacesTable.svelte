<script lang="ts">
  /**
   * The shells' faces, criteria and transverse shears for the result on screen: Von Mises and
   * Tresca on the top and bottom faces (membrane ± 6M/t²) and the MITC4 quads' qx, qy. Its CSV and
   * Excel are the project workbook's ShellCentres sheet for this result, every column of it.
   */
  import { t } from '../../lib/i18n';
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { downloadText } from '../../lib/store/file';
  import { exportToExcel } from '../../lib/export/excel';
  import { toCsv } from '../../lib/engine/result-tables';
  import { shellCentreRows } from '../../lib/engine/shell-results';
  import { shellCentreTable } from '../../lib/export/workbook-results';

  const shells = $derived({ nodes: modelStore.nodes, plates: modelStore.plates, quads: modelStore.quads });
  const rows = $derived(resultsStore.results3D ? shellCentreRows(resultsStore.results3D, shells) : []);
  const hasQ = $derived(rows.some((r) => r.qx !== undefined));
  const fmt = (v: number | undefined) => (v === undefined ? '—' : Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0) ? v.toExponential(3) : v.toFixed(2));

  function table() {
    const r = resultsStore.results3D!;
    return shellCentreTable([{ kind: 'case', id: 0, name: '', results: r }], shells);
  }
  function csv() {
    const s = table();
    downloadText(toCsv(s.rows[0]!.map(String), s.rows.slice(1)), 'shells.csv', 'text/csv');
  }
  function xlsx() {
    void exportToExcel({ filename: 'shells.xlsx', onlyExtras: true, extraSheets: [table()] });
  }
</script>

{#if rows.length > 0}
  <div class="shell-faces" data-testid="shell-faces">
    <div class="sf-head">
      <span class="sf-title">{t('shellFaces.title')}</span>
      <button class="sf-btn" data-testid="shell-faces-csv" onclick={csv}>CSV</button>
      <button class="sf-btn" data-testid="shell-faces-xlsx" onclick={xlsx}>Excel</button>
    </div>
    <table class="result-table">
      <thead><tr>
        <th>ID</th><th>{t('shellFaces.type')}</th>
        <th>{t('shellFaces.topVm')}</th><th>{t('shellFaces.bottomVm')}</th>
        <th>{t('shellFaces.topTresca')}</th><th>{t('shellFaces.bottomTresca')}</th>
        {#if hasQ}<th>qx</th><th>qy</th>{/if}
      </tr></thead>
      <tbody>
        {#each rows as r (r.kind + r.id)}
          {@const key = (r.kind === 'plate' ? 'p' : 'q') + r.id}
          <tr class:selected={uiStore.selectedShells.has(key)} onclick={() => { uiStore.selectMode = 'shells'; uiStore.selectShell(key, false); }} style="cursor:pointer">
            <td class="col-id">{r.id}</td>
            <td class="col-type">{r.kind === 'plate' ? t('shellFaces.plate') : t('shellFaces.quad')}</td>
            <td class="col-num">{fmt(r.top.vonMises)}</td><td class="col-num">{fmt(r.bottom.vonMises)}</td>
            <td class="col-num">{fmt(r.top.tresca)}</td><td class="col-num">{fmt(r.bottom.tresca)}</td>
            {#if hasQ}<td class="col-num">{fmt(r.qx)}</td><td class="col-num">{fmt(r.qy)}</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="sf-note">{t('shellFaces.note')}</p>
  </div>
{/if}

<style>
  .shell-faces { margin-top: 6px; }
  .sf-head { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .sf-title { flex: 1; font-size: 0.66rem; font-weight: 600; color: var(--st-text); }
  .sf-btn { font-size: 0.62rem; padding: 1px 6px; }
  .sf-note { font-size: 0.6rem; color: var(--st-text-2); margin: 3px 0 0; }
</style>
