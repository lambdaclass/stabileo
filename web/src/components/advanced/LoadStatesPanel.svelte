<script lang="ts">
  /**
   * Load states, combinations and envelopes in Basic, from Advanced: what they are, the switch
   * that turns them on, the states and combinations themselves (the loads fold's own table), the
   * CIRSOC 101 combinations, the envelope, and the combination that governs each member.
   */
  import { t, tp } from '../../lib/i18n';
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import CombosTable from '../tables/CombosTable.svelte';
  import ResultsViewPicker from '../toolbar/ResultsViewPicker.svelte';
  import { setLoadCasesEnabled } from '../../lib/actions/load-cases';
  import { runSolve } from '../../lib/actions/solve';
  import { addCirsocCombinations, governingByMember, openLoadsTable } from '../../lib/actions/load-states';
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';

  let { onInfluence }: { onInfluence: () => void } = $props();

  const on = $derived(uiStore.loadCasesEnabled);
  const solved = $derived(resultsStore.perCombo.size > 0);
  const governing = $derived(solved ? governingByMember() : new Map());
  const rows = $derived([...governing.entries()].sort((a, b) => a[0] - b[0]));

  type Ref = { comboName: string; value: number } | undefined;
  const cellsOf = (g: { moment?: Ref; shear?: Ref; axial?: Ref }): Array<[Ref, 'moment' | 'force']> =>
    [[g.moment, 'moment'], [g.shear, 'force'], [g.axial, 'force']];

  function showEnvelope() {
    resultsStore.activeCaseId = null;
    resultsStore.activeView = 'envelope';
    const dt = resultsStore.diagramType;
    if (dt !== 'moment' && dt !== 'shear' && dt !== 'axial') resultsStore.diagramType = 'moment';
  }
</script>

<div class="lsp" data-testid="load-states-panel">
  <p class="lsp-p">{t('course.influence.states.intro')}</p>
  <details class="lsp-fold">
    <summary>{t('course.influence.states.whyTitle')} <span class="lsp-sum">{t('course.influence.states.whySummary')}</span></summary>
    <p class="lsp-p">{t('course.influence.states.why')}</p>
    <p class="lsp-p">{t('course.influence.states.pattern')}</p>
  </details>
  <details class="lsp-fold">
    <summary>{t('course.influence.states.envTitle')} <span class="lsp-sum">{t('course.influence.states.envSummary')}</span></summary>
    <p class="lsp-p">{t('course.influence.states.env')}</p>
    <p class="lsp-p">{t('course.influence.states.moving')}</p>
  </details>

  {#if !on}
    <button class="lsp-primary" onclick={() => setLoadCasesEnabled(true)} data-testid="load-states-enable">{t('course.influence.states.enable')}</button>
    <p class="lsp-note">{t('course.influence.states.enableNote')}</p>
  {:else}
    <details class="lsp-fold" data-testid="load-states-table">
      <summary>{t('course.influence.states.tableTitle')} <span class="lsp-sum">{tp('course.influence.states.tableSummary', { c: modelStore.loadCases.length, k: modelStore.combinations.length })}</span></summary>
      <div class="lsp-table"><CombosTable /></div>
    </details>
    <div class="lsp-row">
      <button class="lsp-btn" onclick={openLoadsTable} data-testid="load-states-assign">{t('course.influence.states.assign')}</button>
      <button class="lsp-btn" onclick={() => addCirsocCombinations()} data-testid="load-states-cirsoc">{t('course.influence.states.cirsoc')}</button>
    </div>
    <p class="lsp-note">{t('course.influence.states.cirsocNote')}</p>

    {#if !solved || resultsStore.combinationsDirty}
      <button class="lsp-primary" onclick={runSolve} disabled={modelStore.combinations.length === 0} data-testid="load-states-solve">{t('course.influence.states.solve')}</button>
      {#if modelStore.combinations.length === 0}<p class="lsp-note">{t('course.influence.states.needCombos')}</p>{/if}
    {/if}
    {#if solved}
      <div class="lsp-row">
        <button class="lsp-primary" class:on={resultsStore.isEnvelopeActive} onclick={showEnvelope} data-testid="load-states-envelope">{t('course.influence.states.showEnvelope')}</button>
      </div>
      <ResultsViewPicker />
      {#if !uiStore.is3DWorkspace && rows.length}
        <h5 class="lsp-h">{t('course.influence.states.governing')}</h5>
        <table class="lsp-gov" data-testid="load-states-governing">
          <thead><tr><th>#</th><th>M</th><th>V</th><th>N</th></tr></thead>
          <tbody>
            {#each rows as [id, g] (id)}
              <tr>
                <td>{id}</td>
                {#each cellsOf(g) as [ref, kind]}
                  <td title={ref ? `${fmtQ(ref.value, kind)} ${unitQ(kind)}` : ''}>{ref ? ref.comboName : '—'}{#if ref}<span class="lsp-v">{fmtQ(ref.value, kind)}</span>{/if}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="lsp-note">{tp('course.influence.states.governingNote', { m: unitQ('moment'), f: unitQ('force') })}</p>
      {/if}
    {/if}
  {/if}

  {#if !uiStore.is3DWorkspace}
    <button class="lsp-btn" onclick={onInfluence} data-testid="load-states-il">{t('course.influence.states.toInfluence')}</button>
  {/if}
</div>

<style>
  .lsp { display: flex; flex-direction: column; gap: 0.4rem; margin: 0.2rem 0 0.4rem 0.6rem; padding-left: 0.6rem; border-left: 2px solid var(--st-hair); font-size: 0.72rem; color: var(--st-text-2); }
  .lsp-p { margin: 0.2rem 0; line-height: 1.45; }
  .lsp-note { margin: 0; color: var(--st-text-3); font-size: 0.64rem; line-height: 1.4; }
  .lsp-fold { border: 1px solid var(--st-hair); border-radius: var(--st-radius); padding: 0 0.45rem; }
  .lsp-fold summary { cursor: pointer; padding: 0.3rem 0; color: var(--st-text); }
  .lsp-sum { display: block; color: var(--st-text-3); font-size: 0.64rem; margin-top: 0.1rem; }
  .lsp-table { overflow-x: auto; padding-bottom: 0.3rem; }
  .lsp-row { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .lsp-btn, .lsp-primary {
    background: none; border: 1px solid var(--st-hair); border-radius: var(--st-radius); color: var(--st-text-2);
    font-size: 0.7rem; padding: 0.3rem 0.55rem; cursor: pointer; align-self: flex-start;
  }
  .lsp-primary { border-color: var(--st-interactive); color: var(--st-text); }
  .lsp-primary.on { color: var(--st-accent); border-color: var(--st-accent); }
  .lsp-btn:hover, .lsp-primary:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .lsp-primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .lsp-h { margin: 0.3rem 0 0; font-size: 0.68rem; font-weight: 600; color: var(--st-text); }
  .lsp-gov { width: 100%; border-collapse: collapse; font-size: 0.64rem; table-layout: fixed; }
  .lsp-gov th { color: var(--st-text-3); font-weight: 500; text-align: left; padding: 2px 3px; }
  .lsp-gov th:first-child, .lsp-gov td:first-child { width: 1.6rem; }
  .lsp-gov td { padding: 2px 3px; color: var(--st-text-2); border-top: 1px solid var(--st-hair); overflow-wrap: anywhere; vertical-align: top; }
  .lsp-v { display: block; font-family: var(--st-mono); color: var(--st-value); }
</style>
