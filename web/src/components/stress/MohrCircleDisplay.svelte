<script lang="ts">
  import type { MohrCircle } from '../../lib/engine/section-stress';
  import { t } from '../../lib/i18n';
  import { fmt } from './fmt';

  interface Props {
    showMohr: boolean;
    mohrData: MohrCircle | null;
    mohrSigma: number;
    mohrTau: number;
  }

  let { showMohr = $bindable(), mohrData, mohrSigma, mohrTau }: Props = $props();
</script>

<button class="ssp-section-toggle" onclick={() => showMohr = !showMohr}>
  <span class="ssp-chevron">{showMohr ? '▾' : '▸'}</span>
  {t('stress.mohrCircle')}
  <span class="ssp-help ssp-help-inline" title={t('stress.mohrCircleHelp')}>?</span>
</button>
{#if showMohr && mohrData}
  {@const m = mohrData}
  {@const maxVal = Math.max(Math.abs(m.sigma1), Math.abs(m.sigma2), m.radius, 1)}
  {@const mScale = 80 / maxVal}
  <div class="ssp-svg-container">
    <svg viewBox="-110 -110 220 220" class="ssp-mohr-svg">
      <line x1="-100" y1="0" x2="100" y2="0" stroke="#444" stroke-width="0.5" />
      <line x1="0" y1="-100" x2="0" y2="100" stroke="#444" stroke-width="0.5" />
      <text x="95" y="-5" fill="#888" font-size="8">&sigma;</text>
      <text x="5" y="-90" fill="#888" font-size="8">&tau;</text>

      <circle
        cx={m.center * mScale}
        cy="0"
        r={m.radius * mScale}
        fill="none"
        stroke="#4ecdc4"
        stroke-width="1.5"
        opacity="0.8"
      />

      {#if m.radius > 0.01}
        <line
          x1={m.center * mScale}
          y1="0"
          x2={m.center * mScale}
          y2={-m.radius * mScale}
          stroke="#4ecdc4"
          stroke-width="0.5"
          stroke-dasharray="2,2"
          opacity="0.5"
        />
        <text
          x={m.center * mScale + 4}
          y={-m.radius * mScale / 2}
          fill="#4ecdc4" font-size="6" opacity="0.7"
        >&tau;<tspan font-size="4.5" dy="1.5">max</tspan></text>
      {/if}

      {#if Math.abs(m.center) > 0.01}
        <line
          x1={m.center * mScale}
          y1="2"
          x2={m.center * mScale}
          y2="6"
          stroke="#888"
          stroke-width="0.5"
        />
        <text
          x={m.center * mScale}
          y="13"
          fill="#888" font-size="5.5" text-anchor="middle"
        >C</text>
      {/if}

      <circle
        cx={mohrSigma * mScale}
        cy={-mohrTau * mScale}
        r="4"
        fill="#e94560"
      />
      <circle
        cx="0"
        cy={mohrTau * mScale}
        r="3"
        fill="#e94560"
        opacity="0.5"
      />
      <line
        x1={mohrSigma * mScale}
        y1={-mohrTau * mScale}
        x2="0"
        y2={mohrTau * mScale}
        stroke="#e94560"
        stroke-width="0.8"
        stroke-dasharray="3,2"
      />

      <circle cx={m.sigma1 * mScale} cy="0" r="3" fill="#4ecdc4" />
      <circle cx={m.sigma2 * mScale} cy="0" r="3" fill="#4ecdc4" />

      <text x={m.sigma1 * mScale} y="12" fill="#4ecdc4" font-size="7" text-anchor="middle">&sigma;<tspan font-size="5" dy="1">1</tspan></text>
      <text x={m.sigma2 * mScale} y="12" fill="#4ecdc4" font-size="7" text-anchor="middle">&sigma;<tspan font-size="5" dy="1">2</tspan></text>

      <text
        x={mohrSigma * mScale + 6}
        y={-mohrTau * mScale - 5}
        fill="#e94560" font-size="5.5"
      >(&sigma;, &tau;)</text>
    </svg>
  </div>
  <div class="ssp-mohr-values">
    <div class="ssp-mohr-row">
      <span class="ssp-mohr-label">&sigma;<sub>1</sub></span>
      <span class="ssp-mohr-val">{fmt(mohrData.sigma1)} MPa</span>
      <span class="ssp-help" title={t('stress.sigma1Help')}>?</span>
    </div>
    <div class="ssp-mohr-row">
      <span class="ssp-mohr-label">&sigma;<sub>2</sub></span>
      <span class="ssp-mohr-val">{fmt(mohrData.sigma2)} MPa</span>
    </div>
    <div class="ssp-mohr-row">
      <span class="ssp-mohr-label">&theta;<sub>p</sub></span>
      <span class="ssp-mohr-val">{(mohrData.thetaP * 180 / Math.PI).toFixed(1)}&deg;</span>
      <span class="ssp-help" title={t('stress.thetaPHelp')}>?</span>
    </div>
  </div>
{/if}

<style>
  .ssp-section-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 3px 0;
    background: none;
    border: none;
    color: #888;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    border-bottom: 1px solid rgba(26, 74, 122, 0.3);
  }
  .ssp-section-toggle:hover { color: #ccc; }
  .ssp-chevron { font-size: 0.6rem; width: 10px; }

  .ssp-svg-container {
    display: flex;
    justify-content: center;
    margin: 4px 0;
  }

  .ssp-mohr-svg {
    width: 200px;
    height: 200px;
    background: rgba(15, 52, 96, 0.3);
    border-radius: 6px;
    border: 1px solid rgba(26, 74, 122, 0.4);
  }

  .ssp-mohr-values {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px 0 6px;
  }
  .ssp-mohr-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 0.68rem;
    color: #aaa;
  }
  .ssp-mohr-label { min-width: 24px; color: #888; }
  .ssp-mohr-val { font-family: 'Courier New', monospace; color: #ccc; }

  .ssp-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: rgba(78, 205, 196, 0.12);
    color: #4ecdc4;
    font-size: 0.5rem;
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
    border: 1px solid rgba(78, 205, 196, 0.25);
    opacity: 0.6;
    transition: opacity 0.15s;
    font-style: normal;
    line-height: 1;
    vertical-align: middle;
  }
  .ssp-help:hover { opacity: 1; background: rgba(78, 205, 196, 0.25); }
  .ssp-help-inline { margin-left: auto; }
</style>
