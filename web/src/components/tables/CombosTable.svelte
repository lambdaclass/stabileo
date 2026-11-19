<script lang="ts">
  import { caseNameShown, combinationNameShown } from '../../lib/axes/case-names';
  import { modelStore, resultsStore } from '../../lib/store';
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
          <td><input type="text" value={caseNameShown(lc)} onchange={(e) => modelStore.updateLoadCase(lc.id, e.currentTarget.value)} /></td>
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
          <td><input type="text" value={combinationNameShown(combo)} onchange={(e) => modelStore.updateCombination(combo.id, { name: e.currentTarget.value })} /></td>
          <td class="load-values">
            {#each modelStore.loadCases as lc}
              {@const existing = combo.factors.find(f => f.caseId === lc.id)}
              <span class="load-field">{lc.type || caseNameShown(lc)}<input type="number" step="0.1" value={existing?.factor ?? 0} onchange={(e) => {
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
      &#9888; {t('combos.needsRecalcSolve')}
    </div>
  {/if}
  <!--
    No "solve combinations" button here.

    It called `solveCombinations` — which is exactly what pressing Calculate
    already does, on the same model, storing the same results through the same
    store call. Two buttons for one action is two things to keep in step and two
    answers to "did I run it?". The warning above still says the combinations
    are stale; what clears it is the command that produced them.
  -->
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
    color: var(--st-text-3);
    font-weight: 500;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--st-surface-3);
    position: sticky;
    top: 0;
    background: var(--st-surface-2);
    white-space: nowrap;
  }

  td {
    padding: 0.2rem 0.35rem;
    border-bottom: 1px solid var(--st-bg);
    color: var(--st-text-2);
    white-space: nowrap;
  }

  .id-cell {
    color: var(--st-value);
    font-weight: 600;
  }

  td input[type="number"],
  td input[type="text"] {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
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
    color: var(--st-text-3);
  }

  .load-field input {
    width: 50px;
  }

  .combos-section {
    padding: 0.5rem;
  }

  .combos-section h4 {
    color: var(--st-value);
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

  .combo-warning {
    margin: 0.5rem;
    padding: 0.5rem;
    background: rgba(217, 164, 65, 0.1);
    border: 1px solid var(--st-warn);
    border-radius: 4px;
    color: var(--st-warn);
    font-size: 0.78rem;
    text-align: center;
  }

  .del {
    background: none;
    border: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
  }
  .del:hover {
    color: var(--st-accent);
  }

  tr:hover {
    background: rgba(127, 212, 204, 0.05);
  }

  .table-footer {
    padding: 0.5rem;
    border-top: 1px solid var(--st-bg);
  }

  .add-btn {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    color: var(--st-value);
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
  }

  .add-btn:hover {
    background: var(--st-surface-3);
    color: white;
  }
</style>
