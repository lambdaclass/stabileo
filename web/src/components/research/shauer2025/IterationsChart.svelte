<script lang="ts">
  import { rs } from '../i18n';
  /** Staggered iterations per load step, on a log axis (one step can need hundreds). */
  import type { Step } from './protocol';

  let { steps, reference = null, height = 160 }: { steps: Step[]; reference?: number[] | null; height?: number } = $props();
  let width = $state(600);
  let hover = $state<number | null>(null);
  const M = { l: 84, r: 16, t: 10, b: 40 };
  const TICKS = [1, 10, 100, 1000];
  const n = $derived(Math.max(steps.length, reference?.length ?? 0, 1));
  const bw = $derived((width - M.l - M.r) / n);
  const LOG_MIN = Math.log10(0.5);
  /** The axis starts below 1 so a one-iteration step is still a visible bar. */
  const sy = (v: number) => M.t + (1 - (Math.log10(Math.max(0.5, v)) - LOG_MIN) / (3 - LOG_MIN)) * (height - M.t - M.b);
  const xTicks = $derived(Array.from({ length: Math.floor((n - 1) / 10) + 1 }, (_, k) => k * 10));
  const strings = $derived(rs());
</script>

<div class="chart" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label={strings.iterationsChartLabel} onpointerleave={() => (hover = null)}>
    {#each TICKS as t (t)}
      <line x1={M.l} x2={width - M.r} y1={sy(t)} y2={sy(t)} class="grid" />
      <text x={M.l - 8} y={sy(t)} class="tick" text-anchor="end" dominant-baseline="middle">{t}</text>
    {/each}
    <text transform="translate(14 {(M.t + height - M.b) / 2}) rotate(-90)" class="label" text-anchor="middle">{strings.iterations}</text>
    {#each xTicks as t (t)}
      <text x={M.l + (t + 0.5) * bw} y={height - M.b + 14} class="tick" text-anchor="middle">{t}</text>
    {/each}
    <text x={(M.l + width - M.r) / 2} y={height - 4} class="label" text-anchor="middle">{strings.loadStepLower}</text>
    {#each steps as s, i (i)}
      <rect
        x={M.l + i * bw + Math.min(1, bw * 0.15)}
        width={Math.max(1, bw - Math.min(2, bw * 0.3))}
        y={sy(s.iterations)}
        height={Math.max(1, sy(0.5) - sy(s.iterations))}
        rx="1"
        class="bar"
        role="presentation"
        onpointerenter={() => (hover = i)}
      />
      {#if reference && reference[i] !== undefined && reference[i] !== s.iterations}
        <circle cx={M.l + (i + 0.5) * bw} cy={sy(reference[i])} r="3" class="ref" />
      {/if}
    {/each}
  </svg>
  {#if hover !== null && steps[hover]}
    {@const s = steps[hover]}
    <div class="readout" style:left="{Math.min(M.l + hover * bw + 10, width - 240)}px">
      {strings.step} {s.step} · {s.iterations} {strings.iterations}{s.converged ? '' : strings.notConvergedSuffix} {strings.residualSuffix} {s.residual.toExponential(2)}{reference && reference[hover] !== undefined ? ` · ${strings.referenceLower} ${reference[hover]}` : ''}
    </div>
  {/if}
</div>

<style>
  .chart {
    position: relative;
  }
  svg {
    display: block;
  }
  .grid {
    stroke: var(--rs-plot-grid);
  }
  .tick {
    fill: var(--fg-2);
    font: var(--rs-micro) var(--st-sans);
    font-variant-numeric: tabular-nums;
  }
  .label {
    fill: var(--fg-2);
    font: 12px var(--lp-sans);
  }
  .bar {
    fill: var(--rs-plot-ours);
  }
  .ref {
    fill: var(--rs-plot-ref);
  }
  .readout {
    position: absolute;
    top: 6px;
    pointer-events: none;
    background: var(--lp-ink, #0c1620);
    border: 1px solid var(--hair);
    color: var(--fg);
    font: var(--rs-micro) var(--st-sans);
    padding: 0.3rem 0.5rem;
    border-radius: 3px;
    white-space: nowrap;
  }
</style>
