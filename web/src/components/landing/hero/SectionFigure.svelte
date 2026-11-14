<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t, i18n } from '../../../lib/i18n/store.svelte';
  import { HeroLoop, smooth } from './loop.svelte';

  type Props = { prefersReducedMotion?: boolean; paused?: boolean };
  let { prefersReducedMotion = false, paused = false }: Props = $props();

  const PERIOD = 16;
  const loop = new HeroLoop(PERIOD, prefersReducedMotion, 0.25);
  onMount(() => loop.start());
  $effect(() => { loop.paused = paused; });

  const B = 0.2, H = 0.5, N = -13.3;
  const AREA = B * H, INERTIA = (B * H ** 3) / 12;
  const M_LEFT = -12.9, M_RIGHT = -31.4, M_SPAN = 270;
  const moment = (xi: number) => M_LEFT * (1 - xi) + M_RIGHT * xi + M_SPAN * xi * (1 - xi);
  const stress = (y: number, m: number) => (N / AREA - (m * y) / INERTIA) / 1000;

  const FRAME = { x0: 22, x1: 232, top: 52, base: 164 };
  const M_SCALE = 0.55;
  const fx = (xi: number) => FRAME.x0 + xi * (FRAME.x1 - FRAME.x0);
  const DIAGRAM = Array.from({ length: 41 }, (_, i) => i / 40);
  const M_PATH = `M${fx(0)} ${FRAME.top}` + DIAGRAM.map((xi) => `L${fx(xi).toFixed(1)} ${(FRAME.top + moment(xi) * M_SCALE).toFixed(1)}`).join('') + `L${fx(1)} ${FRAME.top}Z`;

  const SEC = { cx: 330, cy: 90, k: 240 };
  const BASE = 440, S_SCALE = 11, HATCH = 26;
  const sy = (y: number) => SEC.cy - y * SEC.k;

  const xi = $derived(0.06 + 0.88 * (0.5 - 0.5 * Math.cos(2 * Math.PI * loop.u)));
  const m = $derived(moment(xi));
  const top = $derived(stress(H / 2, m));
  const bottom = $derived(stress(-H / 2, m));
  const axisY = $derived(Math.abs(m) < 1e-9 ? null : (N / AREA) * INERTIA / m);
  const axisInside = $derived(axisY !== null && Math.abs(axisY) <= H / 2 + 0.06);
  const pressureY = $derived(-m / N);
  const pressureShown = $derived(Math.max(-0.31, Math.min(0.31, pressureY)));
  const pressureOut = $derived(Math.abs(pressureY) > 0.31);

  const hatch = $derived(Array.from({ length: HATCH + 1 }, (_, i) => {
    const y = H / 2 - (i / HATCH) * H;
    const s = stress(y, m);
    return { y: sy(y), x: BASE + s * S_SCALE, s };
  }));
  const outline = $derived(`M${BASE} ${sy(H / 2)}L${(BASE + top * S_SCALE).toFixed(1)} ${sy(H / 2)}L${(BASE + bottom * S_SCALE).toFixed(1)} ${sy(-H / 2)}L${BASE} ${sy(-H / 2)}`);
  const fmt2 = $derived(new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const max = $derived(Math.max(top, bottom));
  const min = $derived(Math.min(top, bottom));
  const pulse = $derived(0.6 + 0.4 * smooth(Math.abs(Math.sin(Math.PI * 2 * loop.u))));
  const KERN = { h: (H / 6) * SEC.k, b: (B / 6) * SEC.k };
  const LEFT_EDGE = SEC.cx - (B / 2) * SEC.k;
</script>

<figure class="sa-fig">
  <svg
    viewBox="0 -45 560 270"
    role="img"
    aria-labelledby="sa-title sa-desc"
    onmouseenter={() => (loop.hovered = true)}
    onmouseleave={() => (loop.hovered = false)}
  >
    <title id="sa-title">{t('landing.secTitle')}</title>
    <desc id="sa-desc">{t('landing.secDesc')}</desc>

    <g aria-hidden="true">
      <path class="sa-mdiag" d={M_PATH} />
      <line class="sa-member" x1={FRAME.x0} y1={FRAME.base} x2={FRAME.x0} y2={FRAME.top} />
      <line class="sa-member" x1={FRAME.x1} y1={FRAME.base} x2={FRAME.x1} y2={FRAME.top} />
      <line class="sa-member" x1={FRAME.x0} y1={FRAME.top} x2={FRAME.x1} y2={FRAME.top} />
      {#each [FRAME.x0, FRAME.x1] as x}
        <path class="sa-fix" d="M{x - 7} {FRAME.base}h14" />
      {/each}
      <line class="sa-cut" x1={fx(xi)} y1={FRAME.top - 9} x2={fx(xi)} y2={FRAME.top + 9} />
      <circle class="sa-cut-dot" cx={fx(xi)} cy={FRAME.top} r="2.6" style="opacity: {pulse}" />
      <line class="sa-leader" x1={fx(xi)} y1={FRAME.top} x2={LEFT_EDGE - 6} y2={sy(H / 2)} />
    </g>

    <g aria-hidden="true">
      <polygon
        class="sa-kern"
        points="{SEC.cx},{SEC.cy - KERN.h} {SEC.cx + KERN.b},{SEC.cy} {SEC.cx},{SEC.cy + KERN.h} {SEC.cx - KERN.b},{SEC.cy}"
      />
      <rect class="sa-section" x={LEFT_EDGE} y={sy(H / 2)} width={B * SEC.k} height={H * SEC.k} />
      <text class="sa-tag-nc" x={SEC.cx} y={SEC.cy - KERN.h - 4}>NC</text>

      {#each hatch as h}
        <line class="sa-hatch" x1={BASE} y1={h.y} x2={h.x} y2={h.y} stroke={h.s < 0 ? 'var(--sa-c)' : 'var(--sa-t)'} />
      {/each}
      <path class="sa-outline" d={outline} />
      <line class="sa-base" x1={BASE} y1={sy(H / 2) - 4} x2={BASE} y2={sy(-H / 2) + 4} />
      <text class="sa-val" x={BASE + top * S_SCALE + (top < 0 ? -3 : 3)} y={sy(H / 2) - 3} text-anchor={top < 0 ? 'end' : 'start'} fill={top < 0 ? 'var(--sa-c)' : 'var(--sa-t)'}>{fmt2.format(top)}</text>
      <text class="sa-val" x={BASE + bottom * S_SCALE + (bottom < 0 ? -3 : 3)} y={sy(-H / 2) + 11} text-anchor={bottom < 0 ? 'end' : 'start'} fill={bottom < 0 ? 'var(--sa-c)' : 'var(--sa-t)'}>{fmt2.format(bottom)}</text>

      {#if axisInside && axisY !== null}
        <line class="sa-en" x1={LEFT_EDGE - 14} y1={sy(axisY)} x2={BASE + 12} y2={sy(axisY)} />
        <text class="sa-tag-en" x={LEFT_EDGE - 16} y={sy(axisY) + 3}>EN</text>
      {/if}
      <g class="sa-cp" transform="translate({SEC.cx} {sy(pressureShown)})">
        <circle r="5" />
        <line x1="-8" y1="0" x2="8" y2="0" />
        <line x1="0" y1="-8" x2="0" y2="8" />
      </g>
      <text class="sa-tag-cp" x={SEC.cx + 10} y={sy(pressureShown) + 3}>CP</text>
      {#if pressureOut}<text class="sa-out" x={SEC.cx + 10} y={sy(pressureShown) + (pressureShown > 0 ? -7 : 12)}>({t('landing.secOut')})</text>{/if}
    </g>

  </svg>
  <figcaption class="hf-row">
    <span class="hf-tag">{t('landing.secTag')}</span>
    <span class="hf-item"><i class="hf-sw" style="background: var(--sa-t)"></i>σ max <b>{fmt2.format(max)} MPa</b></span>
    <span class="hf-item"><i class="hf-sw" style="background: var(--sa-c)"></i>σ min <b>{fmt2.format(min)} MPa</b></span>
  </figcaption>
</figure>

<style>
  .sa-fig {
    --sa-t: #e5482a;
    --sa-c: #4a55e0;
    --sa-teal: #5fd4c4;
    --sa-orange: #e8a33d;
    margin: 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  .sa-member {
    stroke: #c8d0d7;
    stroke-width: 1.6;
  }
  .sa-fix {
    stroke: var(--fg-2);
    stroke-width: 2;
  }
  .sa-mdiag {
    fill: var(--sa-t);
    fill-opacity: 0.12;
    stroke: var(--sa-t);
    stroke-opacity: 0.55;
    stroke-width: 0.9;
  }
  .sa-cut {
    stroke: var(--sa-teal);
    stroke-width: 1.4;
  }
  .sa-cut-dot {
    fill: var(--sa-teal);
  }
  .sa-leader {
    stroke: var(--sa-teal);
    stroke-width: 0.7;
    stroke-dasharray: 2 3;
    opacity: 0.55;
  }
  .sa-section {
    fill: none;
    stroke: var(--sa-teal);
    stroke-width: 1.4;
  }
  .sa-kern {
    fill: var(--sa-orange);
    fill-opacity: 0.12;
    stroke: var(--sa-orange);
    stroke-width: 0.9;
    stroke-dasharray: 3 2;
  }
  .sa-hatch {
    stroke-width: 1;
    opacity: 0.75;
  }
  .sa-outline {
    fill: none;
    stroke: var(--fg-2);
    stroke-width: 0.8;
    stroke-dasharray: 2 2;
  }
  .sa-base {
    stroke: var(--fg-2);
    stroke-width: 0.8;
  }
  .sa-en {
    stroke: var(--sa-teal);
    stroke-width: 1.4;
  }
  .sa-cp circle,
  .sa-cp line {
    fill: none;
    stroke: var(--fg);
    stroke-width: 1;
  }
  .sa-tag-en,
  .sa-tag-nc,
  .sa-tag-cp {
    font-family: var(--lp-mono);
    font-size: 11px;
    font-weight: 600;
  }
  .sa-tag-en {
    fill: var(--sa-teal);
    text-anchor: end;
  }
  .sa-tag-nc {
    fill: var(--sa-orange);
    text-anchor: middle;
  }
  .sa-tag-cp {
    fill: var(--fg);
  }
  .sa-out {
    font-family: var(--lp-mono);
    font-size: 9px;
    fill: var(--fg-2);
  }
  .sa-val {
    font-family: var(--lp-mono);
    font-size: 11px;
  }
</style>
