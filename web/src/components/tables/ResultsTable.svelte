<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  let resultsSubTab = $state<'displacements' | 'reactions' | 'forces'>('displacements');
</script>

{#if resultsStore.hasCombinations}
  <div class="results-sub-tabs combo-view-tabs">
    <button class:active={resultsStore.activeView === 'envelope'} onclick={() => { resultsStore.activeView = 'envelope'; }}>{t('resultsTable.envelope')}</button>
    {#each modelStore.combinations as combo}
      <button class:active={resultsStore.activeView === 'combo' && resultsStore.activeComboId === combo.id} onclick={() => { resultsStore.activeView = 'combo'; resultsStore.activeComboId = combo.id; }}>{combo.name}</button>
    {/each}
  </div>
{/if}
<div class="results-sub-tabs">
  <button class:active={resultsSubTab === 'displacements'} onclick={() => resultsSubTab = 'displacements'}>{t('resultsTable.displacements')}</button>
  <button class:active={resultsSubTab === 'reactions'} onclick={() => resultsSubTab = 'reactions'}>{t('resultsTable.reactions')}</button>
  <button class:active={resultsSubTab === 'forces'} onclick={() => resultsSubTab = 'forces'}>{t('resultsTable.internalForces')}</button>
</div>

<div class="results-content">
  {#if resultsStore.results3D && uiStore.analysisMode === '3d'}
    <!-- 3D Results -->
    {#if resultsSubTab === 'displacements'}
      <table>
        <thead>
          <tr><th>{t('table.nodeLabel')}</th><th>ux (mm)</th><th>uy (mm)</th><th>uz (mm)</th><th>rx (mrad)</th><th>ry (mrad)</th><th>rz (mrad)</th></tr>
        </thead>
        <tbody>
          {#each resultsStore.results3D.displacements as d}
            <tr>
              <td class="id-cell">{d.nodeId}</td>
              <td class="num">{(d.ux * 1000).toFixed(4)}</td>
              <td class="num">{(d.uy * 1000).toFixed(4)}</td>
              <td class="num">{(d.uz * 1000).toFixed(4)}</td>
              <td class="num">{(d.rx * 1000).toFixed(4)}</td>
              <td class="num">{(d.ry * 1000).toFixed(4)}</td>
              <td class="num">{(d.rz * 1000).toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

    {:else if resultsSubTab === 'reactions'}
      <table>
        <thead>
          <tr><th>{t('table.nodeLabel')}</th><th>Rx (kN)</th><th>Ry (kN)</th><th>Rz (kN)</th><th>Mx (kN&middot;m)</th><th>My (kN&middot;m)</th><th>Mz (kN&middot;m)</th></tr>
        </thead>
        <tbody>
          {#each resultsStore.results3D.reactions as r}
            <tr>
              <td class="id-cell">{r.nodeId}</td>
              <td class="num">{r.fx.toFixed(4)}</td>
              <td class="num">{r.fy.toFixed(4)}</td>
              <td class="num">{r.fz.toFixed(4)}</td>
              <td class="num">{(-r.mx).toFixed(4)}</td>
              <td class="num">{(-r.my).toFixed(4)}</td>
              <td class="num">{(-r.mz).toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

    {:else if resultsSubTab === 'forces'}
      <table>
        <thead>
          <tr><th>{t('table.elemLabel')}</th><th>Ni</th><th>Nj</th><th>Vyi</th><th>Vyj</th><th>Vzi</th><th>Vzj</th><th>Mxi</th><th>Mxj</th><th>Myi</th><th>Myj</th><th>Mzi</th><th>Mzj</th></tr>
        </thead>
        <tbody>
          {#each resultsStore.results3D.elementForces as ef}
            <tr>
              <td class="id-cell">{ef.elementId}</td>
              <td class="num">{ef.nStart.toFixed(2)}</td>
              <td class="num">{ef.nEnd.toFixed(2)}</td>
              <td class="num">{ef.vyStart.toFixed(2)}</td>
              <td class="num">{ef.vyEnd.toFixed(2)}</td>
              <td class="num">{ef.vzStart.toFixed(2)}</td>
              <td class="num">{ef.vzEnd.toFixed(2)}</td>
              <td class="num">{(-ef.mxStart).toFixed(2)}</td>
              <td class="num">{(-ef.mxEnd).toFixed(2)}</td>
              <td class="num">{(-ef.myStart).toFixed(2)}</td>
              <td class="num">{(-ef.myEnd).toFixed(2)}</td>
              <td class="num">{(-ef.mzStart).toFixed(2)}</td>
              <td class="num">{(-ef.mzEnd).toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

  {:else if resultsStore.results}
    <!-- 2D Results -->
    {#if resultsSubTab === 'displacements'}
      <table>
        <thead>
          <tr><th>{t('table.nodeLabel')}</th><th>ux (mm)</th><th>uy (mm)</th><th>&theta;z (mrad)</th></tr>
        </thead>
        <tbody>
          {#each resultsStore.results.displacements as d}
            <tr>
              <td class="id-cell">{d.nodeId}</td>
              <td class="num">{(d.ux * 1000).toFixed(4)}</td>
              <td class="num">{(d.uy * 1000).toFixed(4)}</td>
              <td class="num">{(d.rz * 1000).toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

    {:else if resultsSubTab === 'reactions'}
      <table>
        <thead>
          <tr><th>{t('table.nodeLabel')}</th><th>Rx (kN)</th><th>Ry (kN)</th><th>Mz (kN&middot;m)</th></tr>
        </thead>
        <tbody>
          {#each resultsStore.results.reactions as r}
            <tr>
              <td class="id-cell">{r.nodeId}</td>
              <td class="num">{r.rx.toFixed(4)}</td>
              <td class="num">{r.ry.toFixed(4)}</td>
              <td class="num">{(-r.mz).toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

    {:else if resultsSubTab === 'forces'}
      <table>
        <thead>
          <tr><th>{t('table.elemLabel')}</th><th>Ni (kN)</th><th>Nj (kN)</th><th>Vi (kN)</th><th>Vj (kN)</th><th>Mi (kN&middot;m)</th><th>Mj (kN&middot;m)</th></tr>
        </thead>
        <tbody>
          {#each resultsStore.results.elementForces as ef}
            <tr>
              <td class="id-cell">{ef.elementId}</td>
              <td class="num">{ef.nStart.toFixed(4)}</td>
              <td class="num">{ef.nEnd.toFixed(4)}</td>
              <td class="num">{ef.vStart.toFixed(4)}</td>
              <td class="num">{ef.vEnd.toFixed(4)}</td>
              <td class="num">{(-ef.mStart).toFixed(4)}</td>
              <td class="num">{(-ef.mEnd).toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</div>

<style>
  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    padding: 0.25rem 0.35rem;
    color: #888;
    font-weight: 500;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid #0f3460;
    position: sticky;
    top: 0;
    background: #16213e;
    white-space: nowrap;
  }

  td {
    padding: 0.2rem 0.35rem;
    border-bottom: 1px solid #0a1a30;
    color: #ccc;
    white-space: nowrap;
  }

  .id-cell {
    color: #4ecdc4;
    font-weight: 600;
  }

  .num {
    font-family: 'Courier New', monospace;
    text-align: right;
  }

  tr:hover {
    background: rgba(78, 205, 196, 0.05);
  }

  .results-sub-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #0f3460;
    background: #12192e;
    flex-shrink: 0;
  }

  .results-sub-tabs button {
    padding: 0.35rem 0.75rem;
    border: none;
    background: transparent;
    color: #777;
    cursor: pointer;
    font-size: 0.72rem;
    border-bottom: 2px solid transparent;
  }
  .results-sub-tabs button:hover { color: #eee; }
  .results-sub-tabs button.active {
    color: #e9c46a;
    border-bottom-color: #e9c46a;
  }

  .combo-view-tabs {
    background: #1a2040 !important;
  }
  .combo-view-tabs button.active {
    color: #4ecdc4 !important;
    border-bottom-color: #4ecdc4 !important;
  }

  .results-content {
    flex: 1;
    overflow: auto;
  }
</style>
