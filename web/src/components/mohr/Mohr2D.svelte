<script lang="ts">
  import './mohr.css';
  import { principalPlane, rotatePlane } from '../../lib/mohr/plane';
  import { UNITS, wrapAngle, type Mohr2DState } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';
  import NumberField from './NumberField.svelte';
  import PlotCard from './PlotCard.svelte';
  import MohrCircle2DPlot from './MohrCircle2DPlot.svelte';
  import StressElementPlot from './StressElementPlot.svelte';
  import MohrLegend from './MohrLegend.svelte';
  import type { Focus2D } from './focus';

  let { value = $bindable() }: { value: Mohr2DState } = $props();
  const uid = $props.id();

  const fmt = $derived(formatter(2));
  const fmt1 = $derived(formatter(1));
  const p = $derived(principalPlane(value));
  const r = $derived(rotatePlane(value, value.theta));
  const degenerate = $derived(p.radius <= 1e-9 * Math.max(Math.abs(value.sx), Math.abs(value.sy), 1e-12));
  const deg = (v: number) => `${fmt(v)}°`;
  let focus = $state<Focus2D>(null);

  let animate = $state(false);
  $effect(() => {
    if (!animate) return;
    let frame = 0, last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      value.theta = Math.round(wrapAngle(value.theta + 45 * dt) * 10) / 10;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });
  const turnTo = (t: number) => () => { animate = false; value.theta = Number(wrapAngle(t).toFixed(4)); };
  const near = (t: number) => Math.abs(wrapAngle(value.theta - t)) < 0.05 || Math.abs(wrapAngle(value.theta - t - 180)) < 0.05;

  let showTauHelp = $state(false);
  const hover = (f: Focus2D) => ({ onpointerenter: () => (focus = f), onpointerleave: () => (focus = null) });
</script>

<div class="mh mh-2d" data-testid="mohr2d">
  <div class="mh-layout">
    <section class="mh-side" aria-labelledby={`${uid}-state`}>
      <div class="mh-side-head">
        <h3 id={`${uid}-state`} class="mh-kicker">{tm('mohr.state')}</h3>
        <select class="mh-select mh-unit" bind:value={value.unit} aria-label={tm('mohr.unit')} title={tm('mohr.unitNote')} data-testid="mohr2d-unit">
          {#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
        </select>
      </div>
      <div class="mh-fields mh-fields-3" role="group" aria-label={tm('mohr.stressTensor')}>
        <NumberField label="σx" bind:value={value.sx} testid="mohr2d-sx" />
        <NumberField label="σy" bind:value={value.sy} testid="mohr2d-sy" />
        <NumberField label="τxy" bind:value={value.txy} testid="mohr2d-txy" shear />
      </div>

      <div class="mh-angle">
        <label class="mh-kicker" for={`${uid}-theta`}>{tm('mohr.rotation')}</label>
        <div class="mh-angle-head">
          <NumberField label="θ" bind:value={value.theta} min={-180} max={180} step={0.5} suffix="°" testid="mohr2d-theta-input" compact />
          <button type="button" class="mh-btn mh-btn-icon" aria-pressed={animate} onclick={() => (animate = !animate)} data-testid="mohr2d-animate" title={tm('mohr.animate')}>
            <span aria-hidden="true">{animate ? '❚❚' : '▶'}</span><span class="mh-btn-text">{tm('mohr.animate')}</span>
          </button>
        </div>
        <input id={`${uid}-theta`} class="mh-range" type="range" min="-180" max="180" step="0.5" bind:value={value.theta} data-testid="mohr2d-theta" />
        <div class="mh-chips" role="group" aria-label={tm('mohr.turnTo')}>
          <button type="button" class="mh-chip" aria-pressed={!degenerate && near(p.theta1)} disabled={degenerate} onclick={turnTo(p.theta1)} {...hover('p1')} data-testid="mohr2d-to-principal">{tm('mohr.goPrincipal')}</button>
          <button type="button" class="mh-chip" aria-pressed={!degenerate && near(p.theta1 - 45)} disabled={degenerate} onclick={turnTo(p.theta1 - 45)} {...hover('tmax')} data-testid="mohr2d-to-shear">{tm('mohr.goShear')}</button>
          <button type="button" class="mh-chip" aria-pressed={value.theta === 0} onclick={turnTo(0)} data-testid="mohr2d-to-origin">{tm('mohr.goOrigin')}</button>
        </div>
      </div>
      <p class="mh-note">{tm('mohr.sign')}</p>
      <p class="mh-note mh-hint">{tm('mohr.dragHint')}</p>
    </section>

    <div class="mh-main">
      <dl class="mh-readout" aria-label={tm('mohr.principal')}>
        <div class="mh-ro" class:mh-on={focus === 'p1'} {...hover('p1')}>
          <dt><span class="mh-sym">σ<sub>1</sub></span> {tm('mohr.r.major')}</dt>
          <dd><span class="mh-ro-num" data-testid="mohr2d-s1">{fmt(p.sigma1)}</span> <span class="mh-ro-unit">{value.unit}</span></dd>
        </div>
        <div class="mh-ro" class:mh-on={focus === 'p2'} {...hover('p2')}>
          <dt><span class="mh-sym">σ<sub>2</sub></span> {tm('mohr.r.minor')}</dt>
          <dd><span class="mh-ro-num" data-testid="mohr2d-s2">{fmt(p.sigma2)}</span> <span class="mh-ro-unit">{value.unit}</span></dd>
        </div>
        <div class="mh-ro" class:mh-on={focus === 'tmax'} {...hover('tmax')}>
          <dt><span class="mh-sym">τ<sub>max</sub></span> {tm('mohr.r.tmax')}</dt>
          <dd><span class="mh-ro-num" data-testid="mohr2d-tmax">{fmt(p.tauMax)}</span> <span class="mh-ro-unit">{value.unit}</span></dd>
        </div>
        <div class="mh-ro">
          <dt><span class="mh-sym">θ<sub>p</sub></span> {tm('mohr.r.thetap')}</dt>
          <dd><span class="mh-ro-num" data-testid="mohr2d-theta1">{deg(p.theta1)}</span></dd>
          <dd class="mh-ro-sub">θ<sub>2</sub> = {deg(p.theta2)}</dd>
        </div>
      </dl>

      <dl class="mh-strip" aria-label={tm('mohr.rotated')}>
        <dt class="mh-strip-title">{tm('mohr.onPlane', { angle: `${fmt1(value.theta)}°` })}</dt>
        <dd><span class="mh-sym">σ<sub>x′</sub></span> <span class="mh-strip-num" data-testid="mohr2d-sxr">{fmt(r.sx)}</span></dd>
        <dd><span class="mh-sym">σ<sub>y′</sub></span> <span class="mh-strip-num" data-testid="mohr2d-syr">{fmt(r.sy)}</span></dd>
        <dd><span class="mh-sym">τ<sub>x′y′</sub></span> <span class="mh-strip-num" data-testid="mohr2d-txyr">{fmt(r.txy)}</span></dd>
      </dl>
      {#if degenerate}<p class="mh-note mh-callout" role="status">{tm('mohr.degenerate')}</p>{/if}

      <div class="mh-board mh-board-2d">
        <PlotCard title={tm('mohr.circle')} file="mohr-circle" testid="mohr2d-circle-card" hero>
          {#snippet tools()}
            <label class="mh-switch" title={tm('mohr.tauDownHelp')}><input type="checkbox" role="switch" bind:checked={value.tauDown} data-testid="mohr2d-taudown" /> <span>{tm('mohr.tauDown')}</span></label>
            <button type="button" class="mh-btn mh-btn-ghost mh-info" aria-expanded={showTauHelp} aria-label={tm('mohr.conventions')} title={tm('mohr.tauDownHelp')} onclick={() => (showTauHelp = !showTauHelp)}>?</button>
          {/snippet}
          {#if showTauHelp}<p class="mh-note mh-popover" role="note">{tm('mohr.tauDownHelp')}</p>{/if}
          <MohrCircle2DPlot sx={value.sx} sy={value.sy} txy={value.txy} bind:theta={value.theta} tauDown={value.tauDown} unit={value.unit} bind:focus />
        </PlotCard>
        <PlotCard title={tm('mohr.element')} file="stress-element" testid="mohr2d-element-card">
          <StressElementPlot sx={value.sx} sy={value.sy} txy={value.txy} bind:theta={value.theta} bind:focus />
        </PlotCard>
      </div>
      <MohrLegend />
    </div>
  </div>
</div>
