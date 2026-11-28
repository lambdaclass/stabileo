<script lang="ts">
  import type { SectionStressResult } from '../../lib/engine/section-stress';
  import type { SectionStressResult3D } from '../../lib/engine/section-stress-3d';
  import { i18n, t, tp } from '../../lib/i18n';
  import { fmt } from './fmt';

  interface Props {
    showTensional: boolean;
    is3D: boolean;
    isMassive: boolean;
    analysis2D: SectionStressResult | null;
    analysis3D: SectionStressResult3D | null;
  }

  let { showTensional = $bindable(), is3D, isMassive, analysis2D, analysis3D }: Props = $props();
  const hasRefusedStress = $derived(is3D && analysis3D && (
    analysis3D.refusal ||
    analysis3D.distributionY.some(point => point.refusal) ||
    analysis3D.distributionZ.some(point => point.refusal)
  ));
  const notices = $derived(hasRefusedStress ? import('../../lib/provenance/applicability') : null);
</script>

{#if hasRefusedStress}
  <p class="ssp-stress-refusal" role="alert">
    {#await notices}
      {t('stress.combinedShearRefused')}
    {:then loaded}
      {loaded?.noticeExplanation('combined-section-shear-refusal', i18n.locale) ?? t('stress.combinedShearRefused')}
    {:catch}
      {t('stress.combinedShearRefused')}
    {/await}
  </p>
{/if}

<!-- Stress state -->
<button class="ssp-section-toggle" onclick={() => showTensional = !showTensional}>
  <span class="ssp-chevron">{showTensional ? '▾' : '▸'}</span>
  {t('stress.stressState')}
</button>
{#if showTensional}
  <div class="ssp-stress-detail">
    {#if is3D && analysis3D}
      <!-- 3D stress state: σ, τ_Vy, τ_Vz, τ_T, σ_vm -->
      <div class="ssp-stress-row">
        <span>&sigma;<sub>x</sub> =</span>
        <span class="ssp-stress-val" class:tension={analysis3D.sigmaAtFiber > 0} class:compression={analysis3D.sigmaAtFiber < 0}>
          {fmt(analysis3D.sigmaAtFiber)} MPa
        </span>
        <span class="ssp-help" title={t('stress.sigmaBiaxHelp')}>?</span>
      </div>
      <div class="ssp-stress-row">
        <span>&tau;<sub>Vy</sub> =</span>
        <span class="ssp-stress-val">{fmt(analysis3D.tauVyAtFiber)} MPa</span>
        <span class="ssp-stress-hint">(Jourawski, {t('stress.planeXY')})</span>
      </div>
      <div class="ssp-stress-row">
        <span>&tau;<sub>Vz</sub> =</span>
        <span class="ssp-stress-val">{fmt(analysis3D.tauVzAtFiber)} MPa</span>
        <span class="ssp-stress-hint">(Jourawski, {t('stress.planeXZ')})</span>
      </div>
      {#if Math.abs(analysis3D.tauTorsion) > 0.001}
        <div class="ssp-stress-row">
          <span>&tau;<sub>T</sub> =</span>
          <span class="ssp-stress-val">{fmt(analysis3D.tauTorsion)} MPa</span>
          <span class="ssp-stress-hint">({tp('stress.torsionTheory', { theory: analysis3D.resolved.shape === 'RHS' || analysis3D.resolved.shape === 'CHS' ? 'Bredt' : 'St-Venant' })})</span>
        </div>
      {/if}
      {#if !analysis3D.refusal && analysis3D.failure && analysis3D.mohr && analysis3D.tauTotal !== null}
        {@const { failure, mohr, tauTotal } = analysis3D}
        <div class="ssp-stress-row">
          <span>&tau;<sub>total</sub> =</span>
          <span class="ssp-stress-val">{fmt(tauTotal)} MPa</span>
          <span class="ssp-help" title={t('stress.tauTotalHelp')}>?</span>
        </div>
        <div class="ssp-divider"></div>
        <div class="ssp-stress-row">
          <span>&sigma;<sub>vm</sub> =</span>
          <span class="ssp-stress-val">{fmt(failure.vonMises)} MPa</span>
          {#if failure.ratioVM !== null}
            <span class="ssp-ratio" class:ok={failure.ok} class:fail={!failure.ok}>
              ({(failure.ratioVM * 100).toFixed(1)}% f<sub>y</sub>)
            </span>
          {/if}
          <span class="ssp-help" title={t('stress.vonMisesHelp')}>?</span>
        </div>
        <div class="ssp-stress-row">
          <span>Tresca:</span>
          <span class="ssp-stress-val">&tau;<sub>max</sub> = {fmt(mohr.tauMax)} MPa</span>
          {#if failure.ratioTresca !== null}
            <span class="ssp-ratio" class:ok={failure.ratioTresca <= 1} class:fail={failure.ratioTresca > 1}>
              ({(failure.ratioTresca * 100).toFixed(1)}% f<sub>y</sub>)
            </span>
          {/if}
          <span class="ssp-help" title={t('stress.trescaHelp')}>?</span>
        </div>
        <div class="ssp-stress-row">
          <span>Rankine:</span>
          <span class="ssp-stress-val">&sigma;<sub>max</sub> = {fmt(failure.rankine)} MPa</span>
          {#if failure.ratioRankine !== null}
            <span class="ssp-ratio" class:ok={failure.ratioRankine <= 1} class:fail={failure.ratioRankine > 1}>
              ({(failure.ratioRankine * 100).toFixed(1)}% f<sub>y</sub>)
            </span>
          {/if}
          <span class="ssp-help" title={t('stress.rankineHelp')}>?</span>
        </div>
        {#if failure.fy}
          <div class="ssp-fy-bar">
            <div
              class="ssp-fy-fill"
              class:ok={failure.ok}
              class:fail={!failure.ok}
              style="width: {Math.min(100, (failure.ratioVM ?? 0) * 100)}%"
            ></div>
          </div>
          <div class="ssp-fy-legend">
            <span>0</span>
            <span>f<sub>y</sub> = {failure.fy} MPa</span>
          </div>
        {/if}
      {/if}
      <!-- Neutral axis info -->
      {#if analysis3D.neutralAxis.exists}
        <div class="ssp-divider"></div>
        <div class="ssp-stress-row">
          <span>{t('stress.neutralAxis')}</span>
          {#if analysis3D.neutralAxis.slope === Infinity}
            <span class="ssp-stress-val">vertical (z = {fmt(analysis3D.neutralAxis.intercept * 1000)} mm)</span>
          {:else if Math.abs(analysis3D.neutralAxis.slope) < 0.001}
            <span class="ssp-stress-val">horizontal (y = {fmt(analysis3D.neutralAxis.intercept * 1000)} mm)</span>
          {:else}
            <span class="ssp-stress-val">&theta; = {(analysis3D.neutralAxis.angle * 180 / Math.PI).toFixed(1)}&deg;</span>
          {/if}
          <span class="ssp-help" title={t('stress.neutralAxis3dHelp')}>?</span>
        </div>
      {/if}
    {:else if analysis2D}
      <!-- 2D stress state (original) -->
      <div class="ssp-stress-row">
        <span>&sigma; =</span>
        <span class="ssp-stress-val" class:tension={analysis2D.sigmaAtY > 0} class:compression={analysis2D.sigmaAtY < 0}>
          {fmt(analysis2D.sigmaAtY)} MPa
        </span>
        <span class="ssp-help" title={t('stress.sigma2dHelp')}>?</span>
      </div>
      <div class="ssp-stress-row">
        <span>&tau;<sub>xy</sub> =</span>
        <span class="ssp-stress-val">{fmt(analysis2D.tauAtY)} MPa</span>
        <span class="ssp-help" title={isMassive ? t('stress.tauMassiveHelp') : t('stress.tauThinHelp')}>?</span>
      </div>
      {#if Math.max(...analysis2D.distribution.map(p => Math.abs(p.tau))) > 0.01}
        {@const maxAbsTau = Math.max(...analysis2D.distribution.map(p => Math.abs(p.tau)))}
        <div class="ssp-stress-row ssp-tau-note">
          <span>&tau;<sub>max</sub> =</span>
          <span class="ssp-stress-val">{fmt(maxAbsTau)} MPa</span>
          <span class="ssp-stress-hint">({t('stress.neutralAxisLabel')})</span>
        </div>
      {/if}
      <div class="ssp-stress-row ssp-2d-note">
        <span>{t('stress.note2dTauOnly')}</span>
      </div>
      <div class="ssp-stress-row ssp-2d-note">
        <span>{t('stress.note2dNoTorsion')}</span>
      </div>
      <div class="ssp-divider"></div>
      <div class="ssp-stress-row">
        <span>&sigma;<sub>vm</sub> =</span>
        <span class="ssp-stress-val">{fmt(analysis2D.failure.vonMises)} MPa</span>
        {#if analysis2D.failure.ratioVM !== null}
          <span class="ssp-ratio" class:ok={analysis2D.failure.ok} class:fail={!analysis2D.failure.ok}>
            ({(analysis2D.failure.ratioVM * 100).toFixed(1)}% f<sub>y</sub>)
          </span>
        {/if}
        <span class="ssp-help" title={t('stress.vonMisesHelp')}>?</span>
      </div>
      <div class="ssp-stress-row">
        <span>Tresca:</span>
        <span class="ssp-stress-val">&tau;<sub>max</sub> = {fmt(analysis2D.mohr.tauMax)} MPa</span>
        {#if analysis2D.failure.ratioTresca !== null}
          <span class="ssp-ratio" class:ok={analysis2D.failure.ratioTresca <= 1} class:fail={analysis2D.failure.ratioTresca > 1}>
            ({(analysis2D.failure.ratioTresca * 100).toFixed(1)}% f<sub>y</sub>)
          </span>
        {/if}
        <span class="ssp-help" title={t('stress.trescaHelp')}>?</span>
      </div>
      <div class="ssp-stress-row">
        <span>Rankine:</span>
        <span class="ssp-stress-val">&sigma;<sub>max</sub> = {fmt(analysis2D.failure.rankine)} MPa</span>
        {#if analysis2D.failure.ratioRankine !== null}
          <span class="ssp-ratio" class:ok={analysis2D.failure.ratioRankine <= 1} class:fail={analysis2D.failure.ratioRankine > 1}>
            ({(analysis2D.failure.ratioRankine * 100).toFixed(1)}% f<sub>y</sub>)
          </span>
        {/if}
        <span class="ssp-help" title={t('stress.rankineHelp')}>?</span>
      </div>
      {#if analysis2D.failure.fy}
        <div class="ssp-fy-bar">
          <div
            class="ssp-fy-fill"
            class:ok={analysis2D.failure.ok}
            class:fail={!analysis2D.failure.ok}
            style="width: {Math.min(100, (analysis2D.failure.ratioVM ?? 0) * 100)}%"
          ></div>
        </div>
        <div class="ssp-fy-legend">
          <span>0</span>
          <span>f<sub>y</sub> = {analysis2D.failure.fy} MPa</span>
        </div>
      {/if}
      <!-- Neutral axis in 2D -->
      {#if analysis2D.neutralAxisY !== null}
        <div class="ssp-divider"></div>
        <div class="ssp-stress-row">
          <span>{t('stress.neutralAxis')}</span>
          <span class="ssp-stress-val">y = {fmt(analysis2D.neutralAxisY * 1000, 1)} mm</span>
          <span class="ssp-help" title={t('stress.neutralAxis2dHelp')}>?</span>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .ssp-stress-refusal {
    color: var(--st-accent);
    font-size: 0.72rem;
    margin: 6px 0;
  }

  .ssp-section-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 3px 0;
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    border-bottom: 1px solid rgba(26, 74, 122, 0.3);
  }

  .ssp-section-toggle:hover {
    color: var(--st-text-2);
  }

  .ssp-chevron {
    font-size: 0.6rem;
    width: 10px;
  }

  .ssp-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: rgba(127, 212, 204, 0.12);
    color: var(--st-value);
    font-size: 0.5rem;
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
    border: 1px solid rgba(127, 212, 204, 0.25);
    opacity: 0.6;
    transition: opacity 0.15s;
    font-style: normal;
    line-height: 1;
    vertical-align: middle;
  }

  .ssp-help:hover {
    opacity: 1;
    background: rgba(127, 212, 204, 0.25);
  }

  .ssp-stress-detail {
    padding: 4px 0 6px;
  }

  .ssp-stress-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 2px;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }

  .ssp-stress-val {
    font-family: 'Courier New', monospace;
    color: var(--st-text);
  }

  .ssp-stress-val.tension {
    color: var(--st-danger);
  }

  .ssp-stress-val.compression {
    color: var(--st-info);
  }

  .ssp-ratio {
    font-size: 0.65rem;
  }

  .ssp-ratio.ok {
    color: var(--st-ok);
  }

  .ssp-ratio.fail {
    color: var(--st-accent);
  }

  .ssp-tau-note {
    font-size: 0.65rem;
    opacity: 0.85;
  }

  .ssp-stress-hint {
    font-size: 0.6rem;
    color: var(--st-text-3);
    font-style: italic;
  }

  .ssp-2d-note {
    font-size: 0.6rem;
    color: var(--st-text-3);
    font-style: italic;
  }

  .ssp-divider {
    height: 1px;
    background: rgba(26, 74, 122, 0.3);
    margin: 4px 0;
  }

  .ssp-fy-bar {
    height: 4px;
    background: var(--st-surface-3);
    border-radius: 2px;
    margin-top: 4px;
    overflow: hidden;
  }

  .ssp-fy-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.2s;
  }

  .ssp-fy-fill.ok {
    background: var(--st-ok);
  }

  .ssp-fy-fill.fail {
    background: var(--st-accent);
  }

  .ssp-fy-legend {
    display: flex;
    justify-content: space-between;
    font-size: 0.55rem;
    color: var(--st-text-3);
    margin-top: 1px;
  }
</style>
