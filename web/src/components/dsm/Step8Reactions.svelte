<script lang="ts">
  import FitMath from '../steps/FitMath.svelte';
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import VectorDisplay from './VectorDisplay.svelte';

  let { data }: { data: DSMStepData } = $props();

  const nr = $derived(data.dofNumbering.nTotal - data.dofNumbering.nFree);

  const eqReactions = '\\{ R \\} = [K_{rf}] \\cdot \\{ u_f \\} + [K_{rr}] \\cdot \\{ u_r \\} - \\{ F_r \\}';

  // Highlight non-zero reactions
  const nonZero = $derived(
    data.reactionsRaw.reduce((acc, val, i) => {
      if (Math.abs(val) > 1e-10) acc.add(i);
      return acc;
    }, new Set<number>())
  );
</script>

<div class="step">
  <div class="explanation">
    <p>{@html t('dsm.step8.explanation')}</p>
  </div>

  <FitMath tex={eqReactions} narrow />

  <VectorDisplay
    title={t('dsm.step8.reactions').replace('{n}', String(nr))}
    vector={data.reactionsRaw}
    labels={data.restrDofLabels}
    highlightIndices={nonZero}
    precision={4}
  />

  <div class="separator"></div>

  <div class="reactions-table-scroll">
    <table class="reactions-table">
      <thead>
        <tr>
          <th>{t('dsm.step8.dof')}</th>
          <th>{t('dsm.step8.label')}</th>
          <th>{t('dsm.step8.reaction')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.reactionsRaw as val, i}
          <tr>
            <td class="idx">{data.dofNumbering.nFree + i}</td>
            <td class="label-cell">{data.restrDofLabels[i]}</td>
            <td class="val-cell" class:pos={val > 1e-10} class:neg={val < -1e-10} class:zero={Math.abs(val) <= 1e-10}>
              {Math.abs(val) < 1e-10 ? '0' : val.toFixed(4)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.82rem; color: var(--st-text); line-height: 1.45; }
  .explanation p { margin: 0; }
  .separator { border-top: 1px solid var(--st-surface-3); margin: 0.2rem 0; }

  .reactions-table-scroll { overflow: auto; max-height: 250px; }
  .reactions-table {
    width: 100%; border-collapse: collapse;
    font-size: 0.65rem; font-family: 'Courier New', monospace;
  }
  .reactions-table th {
    background: var(--st-surface-2); color: var(--st-text-3); padding: 0.2rem 0.4rem;
    font-weight: 600; position: sticky; top: 0; text-align: left;
    font-size: 0.6rem;
  }
  .reactions-table td {
    padding: 0.15rem 0.4rem; border-bottom: 1px solid var(--st-surface-2);
  }
  .idx { color: var(--st-text-3); }
  .label-cell { color: var(--st-text-2); }
  .val-cell { text-align: right; font-weight: 600; }
  .val-cell.pos { color: var(--st-value); }
  .val-cell.neg { color: var(--st-accent); }
  .val-cell.zero { color: var(--st-text-3); }
</style>
