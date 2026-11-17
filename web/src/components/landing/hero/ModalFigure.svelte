<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t, tpPublic as tp, i18n } from '../../../lib/i18n/store.svelte';
  import { mouseOnly, HeroLoop } from './loop.svelte';

  type Props = { prefersReducedMotion?: boolean; paused?: boolean };
  let { prefersReducedMotion = false, paused = false }: Props = $props();

  const PERIOD = 18, STORIES = 6, BAYS = 3, SHOWN = 3;
  const loop = new HeroLoop(PERIOD, () => prefersReducedMotion, 0.06);
  onMount(() => loop.start());
  const hover = mouseOnly((on) => (loop.hovered = on));
  $effect(() => { loop.paused = paused; });

  const omega = (j: number) => Math.sin(((2 * j - 1) * Math.PI) / (2 * (2 * STORIES + 1)));
  const shape = (j: number, i: number) => Math.sin(((2 * j - 1) * Math.PI * i) / (2 * STORIES + 1));
  const RATIO = [1, 2, 3].map((j) => omega(j) / omega(1));
  const PEAK = [1, 2, 3].map((j) => Math.max(...Array.from({ length: STORIES }, (_, i) => Math.abs(shape(j, i + 1)))));

  const BAY = 74, STORY = 38, X0 = 52, Y0 = 254, AMP = 33;
  const SEGMENT = PERIOD / SHOWN;

  const time = $derived(loop.seconds);
  const mode = $derived(Math.min(SHOWN, Math.floor(time / SEGMENT) + 1));
  const local = $derived(time - (mode - 1) * SEGMENT);
  const envelope = $derived(Math.sin((Math.PI * local) / SEGMENT) ** 2);
  const freq = $derived(0.75 * Math.min(RATIO[mode - 1], 3.2));
  const swing = $derived(envelope * Math.sin(2 * Math.PI * freq * local));
  const drift = $derived(Array.from({ length: STORIES + 1 }, (_, i) => (i === 0 ? 0 : (AMP * swing * shape(mode, i)) / PEAK[mode - 1])));

  const columns = $derived.by(() => {
    const out: string[] = [];
    for (let c = 0; c <= BAYS; c++) {
      let d = `M${X0 + c * BAY} ${Y0}`;
      for (let i = 1; i <= STORIES; i++) {
        const ua = drift[i - 1], ub = drift[i];
        const ya = Y0 - (i - 1) * STORY, yb = Y0 - i * STORY, x = X0 + c * BAY;
        d += `C${(x + ua).toFixed(1)} ${(ya - STORY / 3).toFixed(1)} ${(x + ub).toFixed(1)} ${(yb + STORY / 3).toFixed(1)} ${(x + ub).toFixed(1)} ${yb}`;
      }
      out.push(d);
    }
    return out;
  });
  const fmt = $derived(new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const SHAPES_X = [380, 450, 520];
  const shapeLine = (j: number, x: number) => Array.from({ length: STORIES + 1 }, (_, i) => `${(x + (i === 0 ? 0 : (AMP * 0.9 * shape(j, i)) / PEAK[j - 1])).toFixed(1)},${Y0 - i * STORY}`).join(' ');
</script>

<figure class="md-fig">
  <svg
    viewBox="0 0 560 270"
    role="img"
    aria-labelledby="md-title md-desc"
    onpointerenter={hover.enter}
    onpointerleave={hover.leave}
  >
    <title id="md-title">{t('landing.modTitle')}</title>
    <desc id="md-desc">{t('landing.modDesc')}</desc>
    <g aria-hidden="true">
      {#each Array.from({ length: BAYS + 1 }, (_, c) => c) as c}
        <line class="md-ghost" x1={X0 + c * BAY} y1={Y0} x2={X0 + c * BAY} y2={Y0 - STORIES * STORY} />
      {/each}
      {#each Array.from({ length: STORIES }, (_, i) => i + 1) as i}
        <line class="md-ghost" x1={X0} y1={Y0 - i * STORY} x2={X0 + BAYS * BAY} y2={Y0 - i * STORY} />
      {/each}
      {#each columns as d}<path class="md-col" {d} />{/each}
      {#each Array.from({ length: STORIES }, (_, i) => i + 1) as i}
        <line class="md-beam" x1={X0 + drift[i]} y1={Y0 - i * STORY} x2={X0 + BAYS * BAY + drift[i]} y2={Y0 - i * STORY} />
        <circle class="md-mass" cx={X0 + BAYS * BAY + drift[i] + 9} cy={Y0 - i * STORY} r="2.4" />
      {/each}
      {#each Array.from({ length: BAYS + 1 }, (_, c) => c) as c}
        <path class="md-fix" d="M{X0 + c * BAY - 7} {Y0}h14" />
      {/each}
    </g>
    <g aria-hidden="true">
      {#each SHAPES_X as x, j}
        <line class="md-ghost" x1={x} y1={Y0} x2={x} y2={Y0 - STORIES * STORY} />
        <polyline class="md-shape" class:on={j === mode - 1} points={shapeLine(j + 1, x)} />
        <text class="hf-axis md-shape-label" class:on={j === mode - 1} x={x} y="16">{j + 1}</text>
      {/each}
    </g>
  </svg>
  <figcaption class="hf-row">
    <span class="hf-tag">{t('landing.modTag')}</span>
    <span class="hf-item"><i class="hf-sw" style="background: var(--lp-accent)"></i><b>{tp('landing.modMode', { n: mode })}</b></span>
    <span class="hf-item">ω{['₁', '₂', '₃'][mode - 1]} / ω₁ <b>{fmt.format(RATIO[mode - 1])}</b></span>
  </figcaption>
</figure>

<style>
  .md-fig {
    margin: 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  .md-ghost {
    stroke: var(--fg-2);
    stroke-opacity: 0.22;
    stroke-width: 0.8;
  }
  .md-col {
    fill: none;
    stroke: #c8d0d7;
    stroke-width: 1.8;
  }
  .md-beam {
    stroke: #c8d0d7;
    stroke-width: 2.4;
  }
  .md-mass {
    fill: var(--lp-accent);
  }
  .md-fix {
    stroke: var(--fg-2);
    stroke-width: 2;
  }
  .md-shape {
    fill: none;
    stroke: var(--fg-2);
    stroke-width: 1.3;
    opacity: 0.45;
  }
  .md-shape.on {
    stroke: var(--lp-accent);
    stroke-width: 2;
    opacity: 1;
  }
  .md-shape-label {
    text-anchor: middle;
  }
  .md-shape-label.on {
    fill: var(--lp-accent);
  }
</style>
