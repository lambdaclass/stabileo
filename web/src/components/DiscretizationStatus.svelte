<script lang="ts">
  /**
   * The two errors of a 3D shell result side by side (testing/docs/DISCRETIZATION.md):
   * the algebraic error, CERTIFIED (`certificate.svelte.ts`), and the discretization error,
   * ESTIMATED and never certified (`discretization.svelte.ts`). Below them, the element error map
   * toggle and the on-demand convergence check.
   */
  import { t } from '../lib/i18n';
  import { uiStore, modelStore } from '../lib/store';
  import { isVariableMember } from '../lib/engine/variable-members';
  import { certificateStore, formatBound } from '../lib/store/certificate.svelte';
  import {
    discretizationStore, discretizationClaims, isInconclusive, approxPercent, percentText, thresholdTick, studyUnit, adaptiveTarget, adaptedChange,
    type QuantityConvergence,
  } from '../lib/store/discretization.svelte';
  import { localizeEngineText } from '../lib/i18n/engine-text';
  import { applyAdaptiveMesh } from '../lib/store/refined-mesh';
  import type { RefinedMeshRefusal } from '../lib/model/edit/refined-mesh';
  import { shellContourColor } from '../lib/three/stress-heatmap';

  const is3D = $derived(uiStore.is3DWorkspace);
  const est = $derived(discretizationStore.estimate);
  const study = $derived(discretizationStore.study);
  const adaptive = $derived(discretizationStore.adaptive);
  let targetPercent = $state(5);
  const target = $derived(adaptiveTarget(targetPercent));
  let applyRefusal = $state<RefinedMeshRefusal | null>(null);
  function runAdaptive() {
    applyRefusal = null;
    if (target !== null) void discretizationStore.runAdaptive(target);
  }
  function applyMesh() {
    const done = applyAdaptiveMesh();
    if ('refused' in done) { applyRefusal = done.refused; return; }
    uiStore.toast(t('discretization.adaptiveApplied').replace('{shells}', String(done.shells)).replace('{nodes}', String(done.nodes)), 'success');
  }
  const visible = $derived(is3D && est.status !== 'idle' && discretizationStore.applies());
  const cert = $derived(certificateStore.shown(true));

  const algebraic = $derived.by(() => {
    if (cert.status === 'pending') return t('discretization.algebraicPending');
    if (cert.status !== 'done') return t('discretization.algebraicNone');
    if (cert.certificate.status === 'certified') return t('discretization.algebraicCertified').replace('{abs}', formatBound(cert.certificate.absBound));
    return t('discretization.algebraicNotCertified');
  });

  function num(x: number | null | undefined): string {
    if (x === null || x === undefined || !Number.isFinite(x)) return '—';
    return Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-2 && x !== 0) ? x.toExponential(3) : x.toPrecision(4);
  }

  function quantityLabel(q: Pick<QuantityConvergence, 'quantity' | 'nodeId'>): string {
    const base = t(`discretization.q.${q.quantity}`);
    const label = q.nodeId !== undefined ? base.replace('{node}', String(q.nodeId)) : base;
    return `${label} [${studyUnit(q.quantity, uiStore.unitSystem).unit}]`;
  }

  /** A study value (SI) in the reader's units. */
  function value(q: Pick<QuantityConvergence, 'quantity'>, v: number | null | undefined): string {
    return num(v == null ? v : v * studyUnit(q.quantity, uiStore.unitSystem).factor);
  }

  /** A refusal the panel can name, else the generic line; the engine's own words stay as detail. */
  function studyFailure(reason: string, line = 'discretization.studyFailed'): string {
    const key = `discretization.refuse.${reason}`;
    return t(line).replace('{reason}', t(key) === key ? t('discretization.refuse.other') : t(key));
  }

  const discretization = $derived(est.status === 'done' ? est.estimate : null);
  /*
   * Members of variable section reach the engine as chains of prismatic pieces
   * (`engine/variable-members.ts`): an approximation the engine cannot see, so its "members are
   * exact" does not hold for them.
   */
  const variableMembers = $derived([...modelStore.elements.values()].filter((e) => isVariableMember(modelStore.model, e)).length);
  const claims = $derived(discretization ? discretizationClaims(discretization, variableMembers) : null);
  const warn = $derived(
    (discretization?.exceedsThreshold ?? false) || (study.status === 'done' && study.study.exceedsThreshold),
  );
  const thresholdPct = $derived(discretization ? 100 * discretization.threshold : 5);
  const threshold = $derived(discretization ? percentText(discretization.threshold) : '5');

  const legend = $derived.by(() => {
    const r = discretizationStore.mapRange();
    const stops: string[] = [];
    for (let i = 0; i <= 10; i++) {
      const v = r.min + (i / 10) * (r.max - r.min);
      stops.push('#' + shellContourColor(v, r.min, r.max).toString(16).padStart(6, '0'));
    }
    return { max: r.max, tick: thresholdTick(thresholdPct, r.max), gradient: `linear-gradient(to right, ${stops.join(', ')})` };
  });
</script>

{#if visible}
  <div class="disc" class:warn data-testid="discretization-status" title={t('discretization.tooltip')}>
    <div class="line">
      <span class="algebraic">{algebraic}</span>
      <span class="sep">·</span>
      {#if est.status === 'pending'}
        <span>{t('discretization.pending')}</span>
      {:else if est.status === 'failed'}
        <span data-testid="discretization-failed" title={localizeEngineText(est.reason)}>{t('discretization.failed')}</span>
      {:else if claims && claims.percent !== null}
        <span data-testid="discretization-estimate">{t('discretization.estimated').replace('{pct}', approxPercent(claims.percent))}</span>
      {:else if claims?.unestimable}
        <span data-testid="discretization-unestimable">{t(`discretization.unestimable.${claims.unestimable}`)}</span>
      {/if}
    </div>

    {#if claims?.warnUnestimable}
      <div class="warning" data-testid="discretization-warning">{t(claims.warnUnestimable)}</div>
    {:else if warn}
      <div class="warning" data-testid="discretization-warning">{t('discretization.warning').replace('{threshold}', threshold)}</div>
    {/if}

    {#if claims?.framesExact}
      <div class="note" data-testid="discretization-frames-exact">{t('discretization.framesExact')}</div>
    {/if}
    {#if claims && claims.warpingMembers > 0}
      <div class="note" data-testid="discretization-frames-inexact">{t('discretization.warpingNotEstimated').replace('{n}', String(claims.warpingMembers))}</div>
    {/if}
    {#if claims && claims.variableMembers > 0}
      <div class="note" data-testid="discretization-variable-members">{t('discretization.variableNotEstimated').replace('{n}', String(claims.variableMembers))}</div>
    {/if}
    {#if claims && claims.isolatedElements > 0}
      <div class="note" data-testid="discretization-isolated">{t('discretization.isolatedNotEstimated').replace('{n}', String(claims.isolatedElements))}</div>
    {/if}
    {#if claims?.curvedBeams}
      <div class="note">{t('discretization.curvedBeamsNotEstimated')}</div>
    {/if}

    {#if claims && claims.percent !== null}
      <label class="toggle">
        <input type="checkbox" checked={discretizationStore.showMap} onchange={(e) => (discretizationStore.showMap = e.currentTarget.checked)} data-testid="discretization-map-toggle" />
        {t('discretization.showMap')}
      </label>
      {#if discretizationStore.showMap}
        <div class="legend">
          <div class="bar" style:background={legend.gradient}>
            <span class="mark" style:left="{legend.tick.at}%"></span>
          </div>
          <div class="ticks">
            <span>0 %</span>
            {#if legend.tick.label}<span class="thr" style:left="{legend.tick.at}%" data-testid="discretization-legend-threshold">{threshold} %</span>{/if}
            <span>{legend.max.toFixed(0)} %</span>
          </div>
          <div class="note">{t('discretization.mapExplain')}</div>
        </div>
      {/if}
    {/if}

    <div class="study">
      {#if study.status === 'running'}
        <span>{t('discretization.studyRunning')}</span>
      {:else if discretizationStore.studyFinishing}
        <span data-testid="discretization-study-finishing">{t('discretization.studyFinishing')}</span>
      {:else}
        <button class="link" disabled={!discretizationStore.canRunStudy()} onclick={() => discretizationStore.runStudy()} data-testid="discretization-run-study">
          {t('discretization.runStudy')}
        </button>
      {/if}
      {#if study.status === 'failed'}
        <div class="note" title={localizeEngineText(study.reason)}>{studyFailure(study.reason)}</div>
      {:else if study.status === 'done'}
        <table data-testid="discretization-study">
          <thead>
            <tr>
              <th>{t('discretization.col.quantity')}</th>
              {#each study.study.levels as _l, i}<th>{i === 0 ? t('discretization.col.model') : `h/${2 ** i}`}</th>{/each}
              <th>{t('discretization.col.extrapolated')}</th>
              <th>{t('discretization.col.order')}</th>
              <th>{t('discretization.col.error')}</th>
            </tr>
          </thead>
          <tbody>
            {#each study.study.quantities as q}
              <tr class:bad={isInconclusive(q.status) || (q.estimatedError ?? q.relativeChange) > study.study.threshold}>
                <td>{quantityLabel(q)}</td>
                {#each q.values as v}<td>{value(q, v)}</td>{/each}
                <td>{value(q, q.extrapolated)}</td>
                <td>{q.observedOrder == null ? '—' : q.observedOrder.toFixed(2)}</td>
                <td title={t(`discretization.status.${q.status}`)}>
                  {q.estimatedError != null ? approxPercent(q.estimatedError) : t(`discretization.status.${q.status}`)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="note">{t('discretization.studyNote').replace('{n}', study.study.levels.map((l) => l.nodes).join(' → '))}</div>
        {#each study.study.caveats as c}
          <div class="note">{t(`discretization.caveat.${c}`).replace('{n}', String(study.study.supportsInferred ?? ''))}</div>
        {/each}
      {/if}
    </div>

    <details class="advanced" data-testid="discretization-adaptive">
      <summary>{t('discretization.adaptiveTitle')}</summary>
      <div class="note">{t('discretization.adaptiveExplain')}</div>
      <label class="toggle">
        {t('discretization.adaptiveTarget')}
        <input type="number" min="0.1" max="50" step="0.5" bind:value={targetPercent} data-testid="discretization-adaptive-target" />
      </label>
      {#if adaptive.status === 'running'}
        <span>{t('discretization.adaptiveRunning')}</span>
      {:else}
        <button class="link" disabled={target === null || !discretizationStore.canRunAdaptive()} onclick={runAdaptive} data-testid="discretization-run-adaptive">
          {t('discretization.adaptiveRun')}
        </button>
      {/if}
      {#if adaptive.status === 'failed'}
        <div class="note" title={localizeEngineText(adaptive.reason)} data-testid="discretization-adaptive-failed">{studyFailure(adaptive.reason, 'discretization.adaptiveFailed')}</div>
      {:else if adaptive.status === 'done'}
        {@const last = adaptive.report.passes[adaptive.report.passes.length - 1]}
        <div class="note" class:warning={adaptive.report.status !== 'converged'} data-testid="discretization-adaptive-status">
          {t(`discretization.adaptiveStatus.${adaptive.report.status}`).replace('{pct}', approxPercent(last.relativeError)).replace('{n}', String(last.shellElements))}
        </div>
        <table data-testid="discretization-adaptive-passes">
          <thead>
            <tr>
              <th>{t('discretization.col.pass')}</th>
              <th>{t('discretization.col.elements')}</th>
              <th>{t('discretization.col.hanging')}</th>
              <th>{t('discretization.col.error')}</th>
            </tr>
          </thead>
          <tbody>
            {#each adaptive.report.passes as p, i}
              <tr>
                <td>{i === 0 ? t('discretization.col.model') : i}</td>
                <td>{p.shellElements}</td>
                <td>{p.hangingNodes}</td>
                <td>{approxPercent(p.relativeError)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if adaptive.report.passes.length > 1}
          <table data-testid="discretization-adaptive-quantities">
            <thead>
              <tr>
                <th>{t('discretization.col.quantity')}</th>
                <th>{t('discretization.col.model')}</th>
                <th>{t('discretization.col.adapted')}</th>
                <th>{t('discretization.col.change')}</th>
              </tr>
            </thead>
            <tbody>
              {#each adaptive.report.quantities as q}
                {@const change = adaptedChange(q.model, q.adapted)}
                <tr class:bad={change === null || change > adaptive.report.estimate.threshold}>
                  <td>{quantityLabel(q)}</td>
                  <td>{value(q, q.model)}</td>
                  <td>{value(q, q.adapted)}</td>
                  <td>{change === null ? '—' : approxPercent(change)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
        <div class="note">{t('discretization.adaptiveNote')}</div>
        {#if adaptive.refined}
          <button class="link" onclick={applyMesh} data-testid="discretization-apply-adaptive">{t('discretization.adaptiveApply')}</button>
          <div class="note">{t('discretization.adaptiveApplyNote')}</div>
          {#if applyRefusal}
            <div class="note warning" data-testid="discretization-apply-refused">{t(`discretization.adaptiveRefused.${applyRefusal}`)}</div>
          {/if}
        {/if}
        {#each adaptive.report.caveats as c}
          <div class="note">{t(`discretization.caveat.${c}`).replace('{n}', String(adaptive.report.supportsInferred ?? ''))}</div>
        {/each}
      {/if}
    </details>
  </div>
{/if}

<style>
  .disc { margin: 4px 0; padding: 3px 7px; border: 1px solid var(--st-hair); border-radius: 4px; font-size: 0.66rem; line-height: 1.35; color: var(--st-text-2); }
  .disc.warn { border-color: var(--st-warn); }
  .line { cursor: help; }
  .sep { margin: 0 4px; opacity: 0.6; }
  .warning { margin-top: 3px; color: var(--st-warn); font-weight: 600; }
  .note { margin-top: 2px; opacity: 0.8; }
  .toggle { display: flex; gap: 4px; align-items: center; margin-top: 3px; cursor: pointer; }
  .legend { margin-top: 3px; }
  .bar { position: relative; height: 8px; border-radius: 2px; }
  .mark { position: absolute; top: -1px; bottom: -1px; width: 1px; background: var(--st-text-2); }
  /* 0 and the maximum at the ends; the threshold where its colour is (`thresholdTick`). */
  .ticks { position: relative; display: flex; justify-content: space-between; font-size: 0.6rem; }
  .thr { position: absolute; top: 0; transform: translateX(-50%); }
  .study { margin-top: 3px; }
  .advanced { margin-top: 4px; }
  .advanced summary { cursor: pointer; }
  .advanced input { width: 4.5em; font: inherit; }
  .link { padding: 0; border: none; background: none; color: var(--st-accent); font: inherit; text-decoration: underline; cursor: pointer; }
  .link:disabled { opacity: 0.5; cursor: default; }
  table { margin-top: 3px; border-collapse: collapse; width: 100%; }
  th, td { padding: 1px 3px; text-align: right; border-bottom: 1px solid var(--st-hair); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; white-space: normal; }
  tr.bad td { color: var(--st-warn); }
</style>
