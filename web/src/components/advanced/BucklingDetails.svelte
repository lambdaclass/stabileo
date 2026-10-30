<script lang="ts">
  /**
   * Under the critical load: how it was calculated (and the warning one element per member
   * deserves), and, folded, every factor found (beside the engine's when the method is another),
   * each compressed member's effective length factor, and λ₁ as the members are cut.
   */
  import { t, tp } from '../../lib/i18n';
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { fmtQ, unitQ, fmtCoord } from '../../lib/store/display-units.svelte';
  import { bucklingConvergence, type BucklingConvergenceRow, type BucklingInfo } from '../../lib/engine/second-order/run-buckling';
  import { openSecondOrderSteps } from '../../lib/actions/second-order';

  let { result }: { result: any } = $props();
  const K = 'course.second-order.bk';
  const info = $derived(result.secondOrder as BucklingInfo | undefined);
  const data = $derived((result.elementData ?? []) as Array<{ elementId: number; axialForce: number; criticalForce: number; kEffective: number; effectiveLength: number }>);

  let conv = $state<BucklingConvergenceRow[] | null>(null);
  let busy = $state(false);
  const phiValue = $derived(conv?.find((r) => r.label === 'phi')?.lambda1 ?? null);

  function runConvergence() {
    if (!info) return;
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) return;
    busy = true;
    setTimeout(() => { try { conv = bucklingConvergence(input, info.settings); } finally { busy = false; } }, 0);
  }
  const num = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const err = (v: number | null) => (v === null || phiValue === null ? '—' : `${(100 * (v / phiValue - 1)).toFixed(2)} %`);
</script>

{#if info}
  <p class="bk-line" data-testid="buckling-how">
    {tp(`${K}.how`, { method: t(`course.second-order.opts.short.${info.settings.method}`), n: info.settings.n })}
  </p>
  {#if info.settings.n === 1 && info.settings.method !== 'phi'}
    <p class="bk-warn" data-testid="buckling-n1-warning">{t(`${K}.n1Warn`)}</p>
  {/if}
  <details class="bk-fold" data-testid="buckling-factors">
    <summary>{tp(`${K}.factors`, { n: result.modes.length })}</summary>
    <table class="bk-table">
      <thead><tr><th>{t(`${K}.mode`)}</th><th>λ</th>{#if info.engineFactors}<th>{t('course.second-order.pd.engine')}</th>{/if}</tr></thead>
      <tbody>
        {#each result.modes as m, i (i)}
          <tr class:now={resultsStore.activeBucklingMode === i}>
            <td><button class="bk-pick" onclick={() => { resultsStore.activeBucklingMode = i; resultsStore.diagramType = 'bucklingMode'; }} aria-pressed={resultsStore.activeBucklingMode === i}>{i + 1}</button></td><td>{num(m.loadFactor)}</td>{#if info.engineFactors}<td>{num(info.engineFactors[i])}</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if info.engineFactors}<p class="bk-note">{tp(`${K}.engineNote`, { n: info.settings.n })}</p>{/if}
  </details>
{/if}
{#if data.length}
  <details class="bk-fold" data-testid="buckling-keff">
    <summary>{t(`${K}.keff`)}</summary>
    <p class="bk-note">{t(`${K}.keffNote`)}</p>
    <table class="bk-table">
      <thead><tr><th>{t(`${K}.member`)}</th><th>N [{unitQ('force')}]</th><th>P<sub>cr</sub></th><th>K</th><th>KL [{unitQ('length')}]</th></tr></thead>
      <tbody>
        {#each data as d (d.elementId)}
          <tr><td>{d.elementId}</td><td>{fmtQ(d.axialForce, 'force')}</td><td>{fmtQ(d.criticalForce, 'force')}</td><td>{d.kEffective.toFixed(3)}</td><td>{fmtCoord(d.effectiveLength)}</td></tr>
        {/each}
      </tbody>
    </table>
  </details>
{/if}
{#if info}
  <details class="bk-fold" data-testid="buckling-convergence">
    <summary>{t(`${K}.convergence`)}</summary>
    <p class="bk-note">{t(`${K}.convergenceNote`)}</p>
    {#if conv}
      <table class="bk-table">
        <thead><tr><th>{t('course.second-order.pd.discretization')}</th><th>λ₁</th><th>{t(`${K}.error`)}</th></tr></thead>
        <tbody>
          {#each conv as r (r.label + r.n)}
            <tr class:phi={r.label === 'phi'}><td>{r.label === 'phi' ? t('course.second-order.pd.phiRow') : `n = ${r.n}`}</td><td>{num(r.lambda1, 4)}</td><td>{r.label === 'phi' ? '' : err(r.lambda1)}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <button class="small-btn" disabled={busy} onclick={runConvergence} data-testid="buckling-convergence-run">{busy ? t('course.second-order.pd.running') : t('course.second-order.pd.runConvergence')}</button>
    {/if}
  </details>
  <button class="small-btn bk-steps" onclick={() => openSecondOrderSteps(info.settings.method === 'phi' ? 'so-buckling-phi' : 'so-buckling-kg', info.settings)} data-testid="buckling-open-steps">{t('course.second-order.pd.openSteps')}</button>
{/if}

<style>
  .bk-line { margin: 0.1rem 0 0.1rem 0.25rem; font-size: 0.64rem; line-height: 1.4; color: var(--st-text-2); }
  .bk-warn { margin: 0.1rem 0 0.2rem 0.25rem; font-size: 0.64rem; line-height: 1.35; color: var(--st-amber-text); }
  .bk-fold { margin: 0.15rem 0 0 0.25rem; font-size: 0.66rem; color: var(--st-text-2); }
  .bk-fold summary { cursor: pointer; color: var(--st-text); padding: 0.1rem 0; }
  .bk-note { margin: 0.15rem 0; font-size: 0.62rem; line-height: 1.4; color: var(--st-text-3); }
  .bk-table { width: 100%; border-collapse: collapse; font-size: 0.64rem; margin: 2px 0; font-variant-numeric: tabular-nums; }
  .bk-table th { color: var(--st-text-3); font-weight: 500; text-align: right; padding: 2px 3px; }
  .bk-table td { text-align: right; padding: 2px 3px; color: var(--st-text-2); }
  .bk-table th:first-child, .bk-table td:first-child { text-align: left; }
  .bk-table tr.now td { color: var(--st-accent); font-weight: 600; }
  .bk-table tr.phi td { color: var(--st-accent); }
  .bk-pick { background: none; border: none; padding: 0 0.2rem; color: inherit; cursor: pointer; font: inherit; text-decoration: underline dotted; }
  .bk-steps { margin: 0.3rem 0 0 0.25rem; }
</style>
