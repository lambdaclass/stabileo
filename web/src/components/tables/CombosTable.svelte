<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
</script>

<div class="combos-section">
  <h4>{t('combos.loadCases')}</h4>
  <table>
    <thead><tr><th>ID</th><th>{t('table.type')}</th><th>{t('table.name')}</th><th></th></tr></thead>
    <tbody>
      {#each modelStore.loadCases as lc}
        <tr>
          <td class="id-cell">{lc.id}</td>
          <td><input type="text" value={lc.type} placeholder="&mdash;" style="width:36px;text-align:center" onchange={(e) => { modelStore.updateLoadCaseType(lc.id, e.currentTarget.value); if (resultsStore.hasCombinations) resultsStore.combinationsDirty = true; }} /></td>
          <td><input type="text" value={lc.name} onchange={(e) => modelStore.updateLoadCase(lc.id, e.currentTarget.value)} /></td>
          <td><button class="del" onclick={() => { modelStore.removeLoadCase(lc.id); if (resultsStore.hasCombinations) resultsStore.combinationsDirty = true; }}>&#10005;</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="table-footer">
    <button class="add-btn" onclick={() => modelStore.addLoadCase('')}>{t('combos.addCase')}</button>
  </div>

  <h4>{t('combos.combinations')}</h4>
  <table>
    <thead><tr><th>ID</th><th>{t('table.name')}</th><th>{t('table.factors')}</th><th></th></tr></thead>
    <tbody>
      {#each modelStore.combinations as combo}
        <tr>
          <td class="id-cell">{combo.id}</td>
          <td><input type="text" value={combo.name} onchange={(e) => modelStore.updateCombination(combo.id, { name: e.currentTarget.value })} /></td>
          <td class="load-values">
            {#each modelStore.loadCases as lc}
              {@const existing = combo.factors.find(f => f.caseId === lc.id)}
              <span class="load-field">{lc.type || lc.name}<input type="number" step="0.1" value={existing?.factor ?? 0} onchange={(e) => {
                const val = parseFloat(e.currentTarget.value) || 0;
                const newFactors = modelStore.loadCases.map(c => {
                  if (c.id === lc.id) return { caseId: c.id, factor: val };
                  const ex = combo.factors.find(f => f.caseId === c.id);
                  return { caseId: c.id, factor: ex?.factor ?? 0 };
                }).filter(f => Math.abs(f.factor) > 1e-10);
                modelStore.updateCombination(combo.id, { factors: newFactors });
                if (resultsStore.hasCombinations) resultsStore.combinationsDirty = true;
              }} /></span>
            {/each}
          </td>
          <td><button class="del" onclick={() => { modelStore.removeCombination(combo.id); if (resultsStore.hasCombinations) resultsStore.combinationsDirty = true; }}>&#10005;</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="table-footer">
    <button class="add-btn" onclick={() => {
      const factors = modelStore.loadCases.map(c => ({ caseId: c.id, factor: 1.0 }));
      modelStore.addCombination(t('combos.newCombo'), factors);
      if (resultsStore.hasCombinations) resultsStore.combinationsDirty = true;
    }}>{t('combos.addCombo')}</button>
  </div>

  {#if resultsStore.combinationsDirty}
    <div class="combo-warning">
      &#9888; {t('combos.needsRecalc')}
    </div>
  {/if}
  <div class="table-footer">
    <button class="add-btn solve-combos" onclick={() => {
      if (uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro') {
        const isPro = uiStore.analysisMode === 'pro';
        const result = modelStore.solveCombinations3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', isPro);
        if (typeof result === 'string') {
          uiStore.toast(result, 'error');
        } else if (result) {
          resultsStore.setCombinationResults3D(result.perCase, result.perCombo, result.envelope);
          uiStore.toast(t('combos.solved3d'), 'success');
        }
      } else {
        const result = modelStore.solveCombinations(uiStore.includeSelfWeight);
        if (typeof result === 'string') {
          uiStore.toast(result, 'error');
        } else if (result) {
          resultsStore.setCombinationResults(result.perCase, result.perCombo, result.envelope);
          uiStore.toast(t('combos.solved'), 'success');
        }
      }
    }}>{t('combos.solve')}</button>
  </div>
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

  td input[type="number"],
  td input[type="text"] {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #eee;
    font-size: 0.7rem;
  }

  td input[type="text"] {
    width: 80px;
  }

  .load-values {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .load-field {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.65rem;
    color: #888;
  }

  .load-field input {
    width: 50px;
  }

  .combos-section {
    padding: 0.5rem;
  }

  .combos-section h4 {
    color: #4ecdc4;
    font-size: 0.8rem;
    margin: 0.75rem 0 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .combos-section h4:first-child {
    margin-top: 0;
  }

  .combos-section table {
    margin-bottom: 0.25rem;
  }

  .solve-combos {
    margin-top: 0.5rem;
    background: #0f4a3a !important;
    border-color: #1a7a5a !important;
    color: #4ecdc4 !important;
    font-weight: 600;
  }
  .solve-combos:hover {
    background: #1a7a5a !important;
    color: white !important;
  }

  .combo-warning {
    margin: 0.5rem;
    padding: 0.5rem;
    background: rgba(240, 165, 0, 0.1);
    border: 1px solid #f0a500;
    border-radius: 4px;
    color: #f0a500;
    font-size: 0.78rem;
    text-align: center;
  }

  .del {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
  }
  .del:hover {
    color: #e94560;
  }

  tr:hover {
    background: rgba(78, 205, 196, 0.05);
  }

  .table-footer {
    padding: 0.5rem;
    border-top: 1px solid #0a1a30;
  }

  .add-btn {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #4ecdc4;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
  }

  .add-btn:hover {
    background: #1a4a7a;
    color: white;
  }
</style>
