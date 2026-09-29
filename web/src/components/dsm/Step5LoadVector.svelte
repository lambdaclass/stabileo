<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import MathEquation from './MathEquation.svelte';
  import VectorDisplay from './VectorDisplay.svelte';
  import StepBlocks from '../steps/StepBlocks.svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import { memberFixedEndBlocks } from '../../lib/engine/steps/dsm-extras';

  let { data }: { data: DSMStepData } = $props();


  /* In 2D: each loaded member's fixed-end actions, formula by formula. */
  const femBlocks = $derived.by(() => {
    if (data.dofNumbering.dofsPerNode > 3) return [];
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    return input ? memberFixedEndBlocks(input) : [];
  });

  const eqLoadVector = '\\{ F \\} = \\{ F_{\\text{nodal}} \\} + \\{ F_{\\text{equiv}} \\}';

  // DOFs that have non-zero loads
  const nonZeroDofs = $derived(
    data.F.reduce((acc, val, i) => {
      if (Math.abs(val) > 1e-10) acc.add(i);
      return acc;
    }, new Set<number>())
  );
</script>

<div class="step">
  <div class="explanation">
    <p>{@html t('dsm.step5.explanation')}</p>
  </div>

  <MathEquation equation={eqLoadVector} displayMode />

  {#if femBlocks.length}
    <details class="fem-section" open>
      <summary>{t('steps.dsm.fem.title')}</summary>
      <p class="fem-intro">{t('steps.dsm.fem.intro')}</p>
      <StepBlocks blocks={femBlocks} />
    </details>
  {/if}

  <VectorDisplay
    title={t('dsm.step5.globalVector')}
    vector={data.F}
    labels={data.dofLabels}
    highlightIndices={nonZeroDofs}
    precision={4}
  />

  {#if data.loadContributions.length > 0}
    <div class="contrib-section">
      <div class="contrib-title">{t('dsm.step5.contributions')}</div>
      <div class="contrib-scroll">
        <table class="contrib-table">
          <thead>
            <tr>
              <th>{t('dsm.step5.dof')}</th>
              <th>{t('dsm.step5.value')}</th>
              <th>{t('dsm.step5.source')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.loadContributions as c}
              <tr>
                <td class="dof-cell">{c.dofLabel} [{c.dofIndex}]</td>
                <td class="val-cell" class:pos={c.value > 1e-10} class:neg={c.value < -1e-10}>
                  {c.value.toFixed(4)}
                </td>
                <td class="src-cell">{c.source}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else}
    <div class="no-loads">{t('dsm.step5.noLoads')}</div>
  {/if}
</div>

<style>
  .fem-section { border: 1px solid var(--st-hair); border-radius: var(--st-radius); padding: 0.3rem 0.5rem; }
  .fem-section summary { cursor: pointer; font-size: 0.78rem; font-weight: 600; color: var(--st-text); }
  .fem-intro { font-size: 0.72rem; color: var(--st-text-2); line-height: 1.45; margin: 0.3rem 0; }
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.72rem; color: var(--st-text-2); line-height: 1.5; }
  .explanation p { margin: 0; }

  .contrib-section { margin-top: 0.3rem; }
  .contrib-title { font-size: 0.7rem; color: var(--st-text-3); font-weight: 600; margin-bottom: 0.25rem; }
  .contrib-scroll { overflow: auto; max-height: 250px; }
  .contrib-table {
    width: 100%; border-collapse: collapse;
    font-size: 0.6rem; font-family: 'Courier New', monospace;
  }
  .contrib-table th {
    background: var(--st-surface-2); color: var(--st-text-3); padding: 0.2rem 0.4rem;
    font-weight: 600; position: sticky; top: 0; text-align: left;
    font-size: 0.55rem;
  }
  .contrib-table td {
    padding: 0.15rem 0.4rem; border-bottom: 1px solid var(--st-surface-2);
  }
  .dof-cell { color: var(--st-text-2); }
  .val-cell { text-align: right; }
  .val-cell.pos { color: var(--st-value); }
  .val-cell.neg { color: var(--st-accent); }
  .src-cell { color: var(--st-text-3); font-size: 0.55rem; }

  .no-loads { font-size: 0.7rem; color: var(--st-text-3); text-align: center; padding: 1rem; }
</style>
