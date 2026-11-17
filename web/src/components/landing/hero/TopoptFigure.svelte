<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t, tpPublic as tp, i18n } from '../../../lib/i18n/store.svelte';
  import { NELX, NELY, ITERATIONS, FRAMES, FRAME_ITERATION, FRAME_COMPLIANCE } from './topopt-data';
  import { mouseOnly, HeroLoop, clamp01, smooth } from './loop.svelte';

  type Props = { prefersReducedMotion?: boolean; paused?: boolean };
  let { prefersReducedMotion = false, paused = false }: Props = $props();

  const PERIOD = 16, RUN = 10, FADE_AT = 14.4;
  const CITATION = 'Andreassen et al. (2011)';
  const loop = new HeroLoop(PERIOD, () => prefersReducedMotion, 12 / PERIOD);
  onMount(() => loop.start());
  const hover = mouseOnly((on) => (loop.hovered = on));
  $effect(() => { loop.paused = paused; });

  const DENSITY = FRAMES.map((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const out = new Float32Array(NELX * NELY);
    bytes.forEach((v, k) => { out[2 * k] = (v >> 4) / 15; out[2 * k + 1] = (v & 15) / 15; });
    return out;
  });

  const CELL = 3.3, X0 = 10, Y0 = 62;
  const LEVELS = 12;

  const time = $derived(loop.seconds);
  const position = $derived(smooth(time / RUN) * 0.35 + clamp01(time / RUN) * 0.65);
  const frame = $derived(Math.round(position * (FRAMES.length - 1) * 8) / 8);
  const fade = $derived(Math.min(loop.laps > 0 ? smooth(time / 0.6) : 1, 1 - smooth((time - FADE_AT) / (PERIOD - FADE_AT))));

  const layers = $derived.by(() => {
    const i = Math.min(FRAMES.length - 2, Math.floor(frame)), w = frame - i;
    const a = DENSITY[i], b = DENSITY[i + 1];
    const paths = Array.from({ length: LEVELS }, () => '');
    for (let row = 0; row < NELY; row++) {
      let runStart = 0, runLevel = -1;
      const flush = (end: number) => {
        if (runLevel > 0) paths[runLevel - 1] += `M${(X0 + runStart * CELL).toFixed(1)} ${(Y0 + row * CELL).toFixed(1)}h${((end - runStart) * CELL).toFixed(1)}v${CELL}h${(-(end - runStart) * CELL).toFixed(1)}z`;
      };
      for (let col = 0; col < 2 * NELX; col++) {
        const src = col < NELX ? NELX - 1 - col : col - NELX;
        const k = src * NELY + row;
        const level = Math.round((a[k] + (b[k] - a[k]) * w) * LEVELS);
        if (level !== runLevel) { flush(col); runStart = col; runLevel = level; }
      }
      flush(2 * NELX);
    }
    return paths;
  });

  const exactIteration = $derived.by(() => {
    const i = Math.min(FRAMES.length - 2, Math.floor(frame)), w = frame - i;
    return FRAME_ITERATION[i] + (FRAME_ITERATION[i + 1] - FRAME_ITERATION[i]) * w;
  });
  const iteration = $derived(Math.round(exactIteration));
  const compliance = $derived.by(() => {
    const i = Math.min(FRAMES.length - 2, Math.floor(frame)), w = frame - i;
    return FRAME_COMPLIANCE[i] + (FRAME_COMPLIANCE[i + 1] - FRAME_COMPLIANCE[i]) * w;
  });

  const CH = { x: 452, y: 44, w: 96, h: 84 };
  const INITIAL = FRAME_COMPLIANCE[0];
  const share = (c: number) => (100 * c) / INITIAL;
  const cx = (it: number) => CH.x + ((it - 1) / (ITERATIONS - 1)) * CH.w;
  const cy = (c: number) => CH.y + CH.h - (share(c) / 100) * CH.h;
  const CURVE = FRAME_ITERATION.map((it, i) => `${cx(it).toFixed(1)},${cy(FRAME_COMPLIANCE[i]).toFixed(1)}`).join(' ');
  const fmt0 = $derived(new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 0 }));
  const fmt = $derived(new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

  const W = 2 * NELX * CELL, HGT = NELY * CELL;
</script>

<figure class="to-fig">
  <svg
    viewBox="0 -45 560 270"
    role="img"
    aria-labelledby="to-title to-desc"
    onpointerenter={hover.enter}
    onpointerleave={hover.leave}
  >
    <title id="to-title">{t('landing.topTitle')}</title>
    <desc id="to-desc">{t('landing.topDesc')}</desc>
    <g aria-hidden="true">
      <rect class="to-domain" x={X0} y={Y0} width={W} height={HGT} />
      <g style="opacity: {fade}">
        {#each layers as d, i}
          {#if d}<path {d} class="to-cell" style="fill-opacity: {(i + 1) / LEVELS}" />{/if}
        {/each}
      </g>
      <line class="to-sym" x1={X0 + W / 2} y1={Y0 - 6} x2={X0 + W / 2} y2={Y0 + HGT + 6} />
      <g class="to-load" transform="translate({X0 + W / 2} {Y0})">
        <line x1="0" y1="-24" x2="0" y2="-6" />
        <path d="M-4 -11 L0 -3 L4 -11 z" />
      </g>
      {#each [X0, X0 + W] as sx, i}
        <path class="to-support" d="M{sx} {Y0 + HGT} l-6 10 h12 z" />
        {#if i === 1}
          <line class="to-support" x1={sx - 9} y1={Y0 + HGT + 13} x2={sx + 9} y2={Y0 + HGT + 13} />
        {/if}
      {/each}
    </g>
    <g aria-hidden="true">
      <text class="hf-axis to-end" x={CH.x + CH.w} y={CH.y - 14}>{t('landing.topCompliance')}</text>
      <line class="to-chart-axis" x1={CH.x} y1={CH.y - 4} x2={CH.x} y2={CH.y + CH.h} />
      <line class="to-chart-axis" x1={CH.x} y1={CH.y + CH.h} x2={CH.x + CH.w} y2={CH.y + CH.h} />
      <text class="hf-axis to-tick" x={CH.x - 4} y={CH.y + 4}>100 %</text>
      <text class="hf-axis to-tick" x={CH.x - 4} y={CH.y + CH.h}>0</text>
      <polyline class="to-curve" points={CURVE} />
      <circle class="to-dot" cx={cx(exactIteration)} cy={cy(compliance)} r="3" />
      <text class="hf-axis" x={CH.x} y={CH.y + CH.h + 14}>1</text>
      <text class="hf-axis to-end" x={CH.x + CH.w} y={CH.y + CH.h + 14}>{ITERATIONS}</text>
      <text class="hf-axis to-mid" x={CH.x + CH.w / 2} y={CH.y + CH.h + 28}>{t('landing.topIteration')}</text>
    </g>
  </svg>
  <figcaption class="hf-row">
    <span class="hf-tag">{t('landing.topTag')} · {CITATION}</span>
    <span class="hf-item">{t('landing.topIteration')} <b>{iteration} / {ITERATIONS}</b></span>
    <span class="hf-item">{t('landing.topCompliance')} <b>{tp('landing.topShare', { v: fmt0.format(share(compliance)) })}</b></span>
  </figcaption>
</figure>

<style>
  .to-tick {
    text-anchor: end;
  }
  .to-end {
    text-anchor: end;
  }
  .to-mid {
    text-anchor: middle;
  }
  .to-fig {
    margin: 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  .to-domain {
    fill: none;
    stroke: var(--fg-2);
    stroke-opacity: 0.35;
    stroke-width: 0.8;
  }
  .to-cell {
    fill: #e8edf2;
  }
  .to-sym {
    stroke: var(--lp-accent);
    stroke-width: 0.8;
    stroke-dasharray: 3 3;
    opacity: 0.6;
  }
  .to-load line,
  .to-load path {
    stroke: var(--lp-accent);
    fill: var(--lp-accent);
    stroke-width: 1.6;
  }
  .to-support {
    fill: none;
    stroke: var(--fg-2);
    stroke-width: 1;
  }
  .to-curve {
    fill: none;
    stroke: var(--fg-2);
    stroke-width: 1;
    opacity: 0.7;
  }
  .to-chart-axis {
    stroke: var(--fg-2);
    stroke-opacity: 0.35;
    stroke-width: 0.7;
  }
  .to-dot {
    fill: var(--lp-accent);
  }
</style>
