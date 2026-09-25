<script lang="ts">
  /**
   * Does the structure balance? One row per solved load case.
   *
   * Σ(applied) + Σ(reactions) = 0 in all six components. The solver satisfies that by
   * construction, so a residual does not accuse the solver: it says the two sides describe
   * different things — a load that never reached the solve, a support not counted, a member
   * removed with the weight it carried. The applied side is summed here independently, from the
   * model, which is what gives the check its value.
   *
   * It reads the last solve. An edit clears the results — the model store's mutation hook — so
   * the table never sets a solve against a model edited after it.
   */
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { staticsCheck, type StaticsCheckRow } from '../../lib/engine/statics-check';

  /** Below this, a residual is round-off. The solve's own residuals sit around 1e-10. */
  const BALANCED = 1e-6;

  const rows = $derived.by((): StaticsCheckRow[] | null => {
    const perCase = resultsStore.perCase3D;
    const single = resultsStore.results3D;
    if (perCase.size === 0 && !single) return null;
    const reactionsByCase = new Map<number | null, any>(
      perCase.size > 0 ? [...perCase].map(([id, r]) => [id, r.reactions]) : [[null, single!.reactions]],
    );
    const md = {
      nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
      loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
      quads: modelStore.quads, plates: modelStore.plates,
    };
    return staticsCheck({
      model: md as never,
      reactionsByCase,
      includeSelfWeight: uiStore.includeSelfWeight,
      caseTypes: new Map(modelStore.model.loadCases.map((c) => [c.id, c.type])),
      caseNames: new Map(modelStore.model.loadCases.map((c) => [c.id, c.name])),
    });
  });

  /**
   * The applied side's largest force component, and its axis. ΣFz alone reads 0 = 0 on a wind
   * case, which is true and says nothing.
   */
  function dominant(r: StaticsCheckRow): 'fx' | 'fy' | 'fz' {
    const a = r.applied;
    const m = Math.max(Math.abs(a.fx), Math.abs(a.fy), Math.abs(a.fz));
    return m === Math.abs(a.fz) ? 'fz' : m === Math.abs(a.fx) ? 'fx' : 'fy';
  }
  const AXIS = { fx: 'Fx', fy: 'Fy', fz: 'Fz' } as const;

  const fmt = (v: number) => (Math.abs(v) < 5e-4 ? '0' : v.toLocaleString(undefined, { maximumFractionDigits: 2 }));
  const pct = (v: number) => (v < 1e-9 ? '0' : v < 1e-4 ? v.toExponential(1) : (v * 100).toFixed(2) + ' %');
</script>

<div class="sc" data-testid="statics-check">
  <div class="sc-title">{t('pro.statics.title')}</div>
  {#if !rows}
    <div class="sc-hint">{t('pro.statics.solveFirst')}</div>
  {:else}
    <div class="sc-hint">{t('pro.statics.explain')}</div>
    <table class="sc-table">
      <thead>
        <tr>
          <th>{t('pro.statics.case')}</th>
          <th>ΣF {t('pro.statics.applied')} (kN)</th>
          <th>ΣF {t('pro.statics.reactions')} (kN)</th>
          <th>{t('pro.statics.residual')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.caseId ?? 'single')}
          {@const ok = r.worstRelative < BALANCED}
          {@const k = dominant(r)}
          <tr data-testid="statics-row-{r.caseId ?? 'single'}">
            <td>{r.caseName || t('pro.statics.singleSolve')}{#if r.selfWeightIncluded}<span class="sc-sw"> +PP</span>{/if}</td>
            <td class="num"><span class="sc-ax">{AXIS[k]}</span> {fmt(r.applied[k])}</td>
            <td class="num"><span class="sc-ax">{AXIS[k]}</span> {fmt(r.reactions[k])}</td>
            <td class="num">{pct(r.worstRelative)}</td>
            <td class="sc-state" class:bad={!ok}>{ok ? '✓ ' + t('pro.statics.balances') : '⚠ ' + t('pro.statics.doesNotBalance')}</td>
          </tr>
          {#if !ok}
            <tr class="sc-detail">
              <td colspan="5">
                {tp('pro.statics.residualDetail', {
                  fx: fmt(r.difference.fx), fy: fmt(r.difference.fy), fz: fmt(r.difference.fz),
                  mx: fmt(r.difference.mx), my: fmt(r.difference.my), mz: fmt(r.difference.mz),
                })}
              </td>
            </tr>
          {/if}
          {#if r.uncovered.length > 0}
            <tr class="sc-detail"><td colspan="5">{tp('pro.statics.uncovered', { kinds: r.uncovered.join(', ') })}</td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
    <div class="sc-hint">{t('pro.statics.selfWeightNote')}</div>
  {/if}
</div>

<style>
  .sc { display: flex; flex-direction: column; gap: 4px; }
  .sc-title { font-size: 0.68rem; font-weight: 600; color: var(--st-text-2); }
  .sc-hint { font-size: 0.6rem; color: var(--st-text-3); font-style: italic; }
  .sc-table { width: 100%; border-collapse: collapse; font-size: 0.66rem; }
  .sc-table th {
    padding: 3px 5px; text-align: left; font-size: 0.58rem; font-weight: 600; color: var(--st-text-3);
    text-transform: uppercase; background: var(--st-surface); border-bottom: 1px solid var(--st-surface-3);
  }
  .sc-table td { padding: 3px 5px; border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .num { font-family: monospace; text-align: right; }
  .sc-ax { color: var(--st-text-3); font-size: 0.58rem; }
  .sc-sw { color: var(--st-text-3); font-size: 0.58rem; }
  .sc-state { color: var(--st-ok); white-space: nowrap; }
  .sc-state.bad { color: var(--st-warn); }
  .sc-detail td { font-size: 0.6rem; color: var(--st-text-3); font-family: monospace; }
</style>
