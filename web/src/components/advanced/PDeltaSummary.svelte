<script lang="ts">
  /**
   * A P-Δ run as the panel reports it: B₂ of the first mode and the iterations on one line, what
   * B₂ is and how much the displacements actually grew under it, and, folded, the iterations one
   * by one, the engine's answer beside the method chosen, and the answer as members are cut.
   */
  import { t, tp } from '../../lib/i18n';
  import { modelStore, uiStore } from '../../lib/store';
  import { formatPDeltaFactor } from '../../lib/engine/pdelta-result';
  import { sigQ, unitQ, fmtQ } from '../../lib/store/display-units.svelte';
  import { pdeltaConvergence, type ConvergenceRow, type PDeltaInfo } from '../../lib/engine/second-order/run-pdelta';
  import { openSecondOrderSteps } from '../../lib/actions/second-order';

  let { result }: { result: any } = $props();
  const K = 'course.second-order.pd';
  const info = $derived(result.secondOrder as (PDeltaInfo | { lambda1: number | null; b2: number } | undefined));
  const full = $derived(info && 'settings' in info ? info : null);
  const shown = $derived(result.converged && result.isStable);

  let conv = $state<ConvergenceRow[] | null>(null);
  let convError = $state<string | null>(null);
  let busy = $state(false);

  function runConvergence() {
    if (!full) return;
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) return;
    busy = true;
    setTimeout(() => {
      try { conv = pdeltaConvergence(input, full.settings); convError = null; } catch (e) { convError = String((e as Error)?.message ?? e); }
      busy = false;
    }, 0);
  }
  const num = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const disp = (v: number | null) => (v === null ? '—' : sigQ(v, 'displacement'));
</script>

<div class="adv-result-info" style="font-size:10px" data-testid="pdelta-result">
  P-Δ: B₂ = {formatPDeltaFactor(result.b2Factor)} |
  {result.converged ? `${result.iterations} iter` : t('advanced.notConvergedShort')} |
  {result.isStable ? t('advanced.stable') : t('advanced.unstable')}
</div>
{#if info && info.lambda1 !== null && Number.isFinite(info.lambda1)}
  <p class="pd-line" data-testid="pdelta-b2-line">
    {tp(`${K}.b2Line`, { lambda: num(info.lambda1) })}
    {#if full?.amplification && shown}
      {tp(`${K}.ampLine`, { amp: num(full.amplification.ratio), node: full.amplification.nodeId })}
    {/if}
  </p>
{:else if info && info.lambda1 === Infinity}
  <p class="pd-line">{t(`${K}.noCompression`)}</p>
{/if}
{#if full}
  {#if full.history?.length}
    <details class="pd-fold" data-testid="pdelta-iterations">
      <summary>{tp(`${K}.iterations`, { n: full.history.length })}</summary>
      <p class="pd-note">{t(`${K}.iterationsNote`)}</p>
      <table class="pd-table">
        <thead><tr><th>k</th><th>N<sub>min</sub> [{unitQ('force')}]</th><th>u<sub>max</sub> [{unitQ('displacement')}]</th><th>‖ΔD‖/‖D‖</th></tr></thead>
        <tbody>
          {#each full.history as h (h.k)}
            <tr><td>{h.k}</td><td>{fmtQ(h.nmin, 'force')}</td><td>{sigQ(h.umax, 'displacement')}</td><td>{h.change.toExponential(2)}</td></tr>
          {/each}
        </tbody>
      </table>
      {#if full.historyMatchesEngine}<p class="pd-note">{t(`${K}.sameAsEngine`)}</p>{/if}
    </details>
  {/if}
  {#if full.compare}
    <details class="pd-fold" data-testid="pdelta-compare">
      <summary>{t(`${K}.compare`)}</summary>
      <table class="pd-table">
        <thead><tr><th></th><th>{t(`course.second-order.opts.short.${full.settings.method}`)}</th><th>{t(`${K}.engine`)}</th></tr></thead>
        <tbody>
          <tr><td>u [{unitQ('displacement')}]</td><td>{sigQ(full.compare.method.u, 'displacement')}</td><td>{sigQ(full.compare.engine.u, 'displacement')}</td></tr>
          <tr><td>|M|<sub>max</sub> [{unitQ('moment')}]</td><td>{fmtQ(full.compare.method.m, 'moment')}</td><td>{fmtQ(full.compare.engine.m, 'moment')}</td></tr>
          <tr><td>λ₁</td><td>{num(full.compare.method.lambda1)}</td><td>{num(full.compare.engine.lambda1)}</td></tr>
          <tr><td>B₂</td><td>{formatPDeltaFactor(full.compare.method.b2)}</td><td>{formatPDeltaFactor(full.compare.engine.b2)}</td></tr>
        </tbody>
      </table>
      <p class="pd-note">{tp(`${K}.compareNote`, { n: full.settings.n })}</p>
    </details>
  {/if}
  <details class="pd-fold" data-testid="pdelta-convergence">
    <summary>{t(`${K}.convergence`)}</summary>
    <p class="pd-note">{t(`${K}.convergenceNote`)}</p>
    {#if conv}
      <table class="pd-table">
        <thead><tr><th>{t(`${K}.discretization`)}</th><th>u [{unitQ('displacement')}]</th><th>|M|<sub>max</sub></th><th>λ₁</th></tr></thead>
        <tbody>
          {#each conv as r (r.label + r.n)}
            <tr class:phi={r.label === 'phi'}><td>{r.label === 'phi' ? t(`${K}.phiRow`) : `n = ${r.n}`}</td><td>{disp(r.u)}</td><td>{r.m === null ? '—' : fmtQ(r.m, 'moment')}</td><td>{num(r.lambda1)}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <button class="small-btn" disabled={busy} onclick={runConvergence} data-testid="pdelta-convergence-run">{busy ? t(`${K}.running`) : t(`${K}.runConvergence`)}</button>
    {/if}
    {#if convError}<p class="pd-note">{convError}</p>{/if}
  </details>
  <button class="small-btn pd-steps" onclick={() => openSecondOrderSteps(full.settings.method === 'phi' ? 'so-pdelta-phi' : 'so-pdelta-kg', full.settings)} data-testid="pdelta-open-steps">{t(`${K}.openSteps`)}</button>
{/if}

<style>
  .pd-line { margin: 0.1rem 0 0.2rem 0.25rem; font-size: 0.64rem; line-height: 1.4; color: var(--st-text-2); }
  .pd-fold { margin: 0.15rem 0 0 0.25rem; font-size: 0.66rem; color: var(--st-text-2); }
  .pd-fold summary { cursor: pointer; color: var(--st-text); padding: 0.1rem 0; }
  .pd-note { margin: 0.15rem 0; font-size: 0.62rem; line-height: 1.4; color: var(--st-text-3); }
  .pd-table { width: 100%; border-collapse: collapse; font-size: 0.64rem; margin: 2px 0; font-variant-numeric: tabular-nums; }
  .pd-table th { color: var(--st-text-3); font-weight: 500; text-align: right; padding: 2px 3px; }
  .pd-table td { text-align: right; padding: 2px 3px; color: var(--st-text-2); }
  .pd-table th:first-child, .pd-table td:first-child { text-align: left; }
  .pd-table tr.phi td { color: var(--st-accent); }
  .pd-steps { margin: 0.3rem 0 0 0.25rem; }
</style>
