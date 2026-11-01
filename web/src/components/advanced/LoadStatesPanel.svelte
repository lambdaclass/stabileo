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
  import AdvFold from './kit/AdvFold.svelte';
  import AdvLink from './kit/AdvLink.svelte';
  import AdvValues from './kit/AdvValues.svelte';
</script>

<div class="lsp" data-testid="load-states-panel">
  <AdvValues help={t('course.influence.states.intro')} items={[
    { label: t('course.influence.states.v.cases'), value: String(modelStore.loadCases.length) },
    { label: t('course.influence.states.v.combos'), value: String(modelStore.combinations.length) },
    { label: t('course.influence.states.v.state'), value: on ? (solved && !resultsStore.combinationsDirty ? '✓' : '…') : '—', tone: on && solved ? 'ok' : undefined },
  ]} />
  <AdvFold title={t('course.influence.states.whyTitle')} summary={t('course.influence.states.whySummary')}>
    <p class="lsp-p">{t('course.influence.states.why')}</p>
    <p class="lsp-p">{t('course.influence.states.pattern')}</p>
  </AdvFold>
  <AdvFold title={t('course.influence.states.envTitle')} summary={t('course.influence.states.envSummary')}>
    <p class="lsp-p">{t('course.influence.states.env')}</p>
    <p class="lsp-p">{t('course.influence.states.moving')}</p>
  </AdvFold>

  {#if !on}
    <button class="lsp-primary" onclick={() => setLoadCasesEnabled(true)} data-testid="load-states-enable">{t('course.influence.states.enable')}</button>
    <p class="lsp-note">{t('course.influence.states.enableNote')}</p>
  {:else}
    <AdvFold title={t('course.influence.states.tableTitle')} summary={tp('course.influence.states.tableSummary', { c: modelStore.loadCases.length, k: modelStore.combinations.length })} testid="load-states-table">
      <div class="lsp-table"><CombosTable /></div>
    </AdvFold>
    <div class="lsp-row">
      <AdvLink label={t('course.influence.states.assign')} onclick={openLoadsTable} testid="load-states-assign" />
      <AdvLink label={t('course.influence.states.cirsoc')} onclick={() => addCirsocCombinations()} testid="load-states-cirsoc" />
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
        <AdvFold title={t('course.influence.states.governing')} open={true} testid="load-states-governing-fold">
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
        </AdvFold>
      {/if}
    {/if}
  {/if}

  {#if !uiStore.is3DWorkspace}
    <div class="lsp-row"><AdvLink label={t('course.influence.states.toInfluence')} onclick={onInfluence} testid="load-states-il" /></div>
  {/if}
</div>

<style>
  .lsp { display: flex; flex-direction: column; gap: 3px; margin: 2px 0 6px; font-size: 0.72rem; color: var(--st-text-2); }
  .lsp-p { margin: 0 0 4px; line-height: 1.45; font-size: 0.66rem; }
  .lsp-note { margin: 0; font-size: 0.62rem; line-height: 1.4; color: var(--st-text-3); }
  .lsp-row { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 0; }
  .lsp-table { overflow-x: auto; }
  .lsp-primary {
    align-self: flex-start; padding: 2px 9px; border-radius: 3px; cursor: pointer; font-size: 0.66rem;
    background: rgba(229, 72, 42, 0.12); border: 1px solid var(--st-accent); color: var(--st-accent);
  }
  .lsp-primary:disabled { opacity: 0.4; cursor: default; }
  .lsp-primary.on { background: var(--st-accent); color: #fff; }
  .lsp-gov { width: 100%; border-collapse: collapse; font-size: 0.64rem; font-variant-numeric: tabular-nums; }
  .lsp-gov th { color: var(--st-text-3); font-weight: 500; text-align: left; padding: 2px 3px; border-bottom: 1px solid var(--st-hair-strong); }
  .lsp-gov td { padding: 2px 3px; border-bottom: 1px solid var(--st-hair); color: var(--st-text); }
  .lsp-v { display: block; font-family: 'Courier New', monospace; color: var(--st-text-3); font-size: 0.6rem; }
</style>
