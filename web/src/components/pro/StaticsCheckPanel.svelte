<script lang="ts">
  import { plainNumber } from '../../lib/utils/units';
  /**
   * Does the structure balance? One row per solved load case.
   *
   * Σ(applied) + Σ(reactions) = 0 in all six components. The solver satisfies that by
   * construction, so a residual does not accuse the solver: it says the two sides describe
   * different things — a load that never reached the solve, a support not counted, a member
   * removed with the weight it carried. The applied side is summed here independently, from the
   * model, which is what gives the check its value.
   *
   * One row per solved load case, then one per solved combination (`store/statics-rows.ts`,
   * shared with the report). The six components of both sides are one click away, and the CSV
   * carries them all.
   */
  import { t, tp } from '../../lib/i18n';
  import { downloadText } from '../../lib/store/file';
  import { staticsRows, staticsCsv, BALANCED } from '../../lib/store/statics-rows';
  import type { StaticsCheckRow } from '../../lib/engine/statics-check';

  const all = $derived(staticsRows());
  const rows = $derived(all ? [...all.cases, ...all.combos] : null);
  let full = $state(false);
  const K = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const;

  function csv() {
    if (!all) return;
    downloadText(staticsCsv(all, {
      kind: t('pro.statics.kind'), name: t('pro.statics.case'), caseLabel: t('pro.statics.kindCase'), comboLabel: t('pro.statics.kindCombo'),
      applied: t('pro.statics.applied'), reactions: t('pro.statics.reactions'), residual: t('pro.statics.residual'), relative: t('pro.statics.relative'),
    }), 'statics.csv', 'text/csv;charset=utf-8');
  }

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

  const fmt = (v: number) => (Math.abs(v) < 5e-4 ? '0' : plainNumber(v, 2));
  const pct = (v: number) => (v < 1e-9 ? '0' : v < 1e-4 ? v.toExponential(1) : (v * 100).toFixed(2) + ' %');
</script>

<div class="sc" data-testid="statics-check">
  <div class="sc-head">
    <div class="sc-title">{t('pro.statics.title')}</div>
    {#if rows}
      <label class="sc-full"><input type="checkbox" bind:checked={full} data-testid="statics-full" /> {t('pro.statics.sixComponents')}</label>
      <button class="pk-btn sc-csv" onclick={csv} data-testid="statics-csv">CSV</button>
    {/if}
  </div>
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
        {#each rows as r, i (i)}
          {@const ok = r.worstRelative < BALANCED}
          {@const k = dominant(r)}
          {@const key = 'comboId' in r ? `c${r.comboId}` : (r.caseId ?? 'single')}
          <tr data-testid="statics-row-{key}" class:sc-combo={'comboId' in r}>
            <td>{r.caseName || t('pro.statics.singleSolve')}{#if r.selfWeightIncluded}<span class="sc-sw"> {t('pro.statics.selfWeightBadge')}</span>{/if}</td>
            <td class="num"><span class="sc-ax">{AXIS[k]}</span> {fmt(r.applied[k])}</td>
            <td class="num"><span class="sc-ax">{AXIS[k]}</span> {fmt(r.reactions[k])}</td>
            <td class="num">{pct(r.worstRelative)}</td>
            <td class="sc-state" class:bad={!ok}>{ok ? '✓ ' + t('pro.statics.balances') : '⚠ ' + t('pro.statics.doesNotBalance')}</td>
          </tr>
          {#if full}
            <tr class="sc-detail sc-six">
              <td colspan="5"><div class="sc-sixrow">
                {#each K as c (c)}<span><b>Σ{c.toUpperCase()}</b> {fmt(r.applied[c])} / {fmt(r.reactions[c])}</span>{/each}
              </div></td>
            </tr>
          {/if}
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
    {#if all?.magnitude?.length}
      <!-- SRSS and ABS combinations: magnitudes, in no equilibrium by nature, so not checked (`statics-rows.ts`). -->
      <div class="sc-hint" data-testid="statics-magnitude">{tp('pro.statics.magnitude', { names: all.magnitude.map((m) => m.name).join(', ') })}</div>
    {/if}
    <div class="sc-hint">{t('pro.statics.selfWeightNote')}</div>
  {/if}
</div>

<style>
  .sc { display: flex; flex-direction: column; gap: 4px; }
  .sc-head { display: flex; gap: 8px; align-items: center; }
  .sc-title { font-size: 0.68rem; font-weight: 600; color: var(--st-text-2); }
  .sc-full { margin-left: auto; font-size: 0.6rem; color: var(--st-text-3); display: inline-flex; gap: 4px; align-items: center; }
  .sc-csv { min-height: 22px; padding: 0.1rem 0.5rem; font-size: 0.62rem; }
  .sc-combo td:first-child { font-style: italic; }
  .sc-sixrow { display: flex; gap: 10px; flex-wrap: wrap; }
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
