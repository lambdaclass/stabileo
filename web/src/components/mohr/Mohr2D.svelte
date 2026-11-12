<script lang="ts">
  import './mohr.css';
  import { principalPlane, rotatePlane } from '../../lib/mohr/plane';
  import { UNITS, UNIT_DIGITS, UNIT_STEP, PER_MPA, wrapAngle, type Mohr2DState } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';
  import NumberField from './NumberField.svelte';
  import PlotCard from './PlotCard.svelte';
  import MohrMenu from './MohrMenu.svelte';
  import MohrCircle2DPlot from './MohrCircle2DPlot.svelte';
  import StressElementPlot from './StressElementPlot.svelte';
  import MohrLegend from './MohrLegend.svelte';
  import MohrIcon from './MohrIcon.svelte';
  import type { Focus2D } from './focus';

  let { value = $bindable(), fit = false }: { value: Mohr2DState; fit?: boolean } = $props();
  const uid = $props.id();

  const k = $derived(PER_MPA[value.unit]);
  const digits = $derived(UNIT_DIGITS[value.unit]);
  const shown = $derived({ sx: value.sx * k, sy: value.sy * k, txy: value.txy * k });
  const fmt = $derived(formatter(digits));
  const fmt1 = $derived(formatter(1));
  const p = $derived(principalPlane(shown));
  const r = $derived(rotatePlane(shown, value.theta));
  const degenerate = $derived(p.radius <= 1e-9 * Math.max(Math.abs(shown.sx), Math.abs(shown.sy), 1e-12));
  const deg = (v: number) => `${formatter(2)(v)}°`;
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
  const hover = (f: Focus2D) => ({ onpointerenter: () => (focus = f), onpointerleave: () => (focus = null) });
</script>

<div class="mh mh-2d" class:mh-fit={fit} data-testid="mohr2d">
  <div class="mh-layout">
    <section class="mh-side" aria-labelledby={`${uid}-state`}>
      <div class="mh-side-head">
        <h3 id={`${uid}-state`} class="mh-kicker">{tm('mohr.state')}</h3>
        <select class="mh-select mh-unit" bind:value={value.unit} aria-label={tm('mohr.unit')} title={tm('mohr.unitNote')} data-testid="mohr2d-unit">
          {#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
        </select>
      </div>
      <div class="mh-fields" role="group" aria-label={tm('mohr.stressTensor')}>
        <NumberField label="σx" bind:value={value.sx} scale={k} places={digits + 1} step={UNIT_STEP[value.unit]} testid="mohr2d-sx" />
        <NumberField label="σy" bind:value={value.sy} scale={k} places={digits + 1} step={UNIT_STEP[value.unit]} testid="mohr2d-sy" />
        <NumberField label="τxy" bind:value={value.txy} scale={k} places={digits + 1} step={UNIT_STEP[value.unit]} testid="mohr2d-txy" shear />
      </div>
      {#if degenerate}<p class="mh-note mh-callout" role="status">{tm('mohr.degenerate')}</p>{/if}

      <div class="mh-block">
        <label class="mh-kicker" for={`${uid}-theta`}>{tm('mohr.rotation')}</label>
        <div class="mh-angle-row">
          <NumberField label="θ" bind:value={value.theta} min={-180} max={180} step={0.5} suffix="°" testid="mohr2d-theta-input" compact />
          <input id={`${uid}-theta`} class="mh-range" type="range" min="-180" max="180" step="0.5" bind:value={value.theta} data-testid="mohr2d-theta" />
          <button type="button" class="mh-btn mh-btn-icon" aria-pressed={animate} onclick={() => (animate = !animate)} data-testid="mohr2d-animate" aria-label={tm('mohr.animate')} title={tm('mohr.animate')}>
            <MohrIcon name={animate ? 'pause' : 'play'} />
          </button>
        </div>
        <div class="mh-chips" role="group" aria-label={tm('mohr.turnTo')}>
          <button type="button" class="mh-chip" aria-pressed={!degenerate && near(p.theta1)} disabled={degenerate} onclick={turnTo(p.theta1)} {...hover('p1')} data-testid="mohr2d-to-principal">{tm('mohr.goPrincipal')}</button>
          <button type="button" class="mh-chip" aria-pressed={!degenerate && near(p.theta1 - 45)} disabled={degenerate} onclick={turnTo(p.theta1 - 45)} {...hover('tmax')} data-testid="mohr2d-to-shear">{tm('mohr.goShear')}</button>
          <button type="button" class="mh-chip" aria-pressed={value.theta === 0} onclick={turnTo(0)} data-testid="mohr2d-to-origin">{tm('mohr.goOrigin')}</button>
        </div>
        <dl class="mh-current" aria-label={tm('mohr.rotated')}>
          <dt>{tm('mohr.onPlane', { angle: `${fmt1(value.theta)}°` })}</dt>
          <dd><span class="mh-sym">σ<sub>x′</sub></span><span class="mh-current-num" data-testid="mohr2d-sxr">{fmt(r.sx)}</span></dd>
          <dd><span class="mh-sym">σ<sub>y′</sub></span><span class="mh-current-num" data-testid="mohr2d-syr">{fmt(r.sy)}</span></dd>
          <dd><span class="mh-sym">τ<sub>x′y′</sub></span><span class="mh-current-num" data-testid="mohr2d-txyr">{fmt(r.txy)}</span></dd>
        </dl>
      </div>
      <p class="mh-note mh-hint">{tm('mohr.dragHint')}</p>
    </section>

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
        <dd><span class="mh-ro-num" data-testid="mohr2d-theta1">{deg(p.theta1)}</span> <span class="mh-ro-sub">θ<sub>2</sub> = {deg(p.theta2)}</span></dd>
      </div>
    </dl>

    <div class="mh-board mh-board-2d">
      <PlotCard title={tm('mohr.circle')} testid="mohr2d-circle-card" hero>
        {#snippet tools()}
          <label class="mh-switch" title={tm('mohr.tauDownHelp')}><input type="checkbox" role="switch" bind:checked={value.tauDown} data-testid="mohr2d-taudown" /> <span>{tm('mohr.tauDown')}</span></label>
          <MohrMenu label={tm('mohr.conventions')} wide>
            {#snippet summary()}?{/snippet}
            <p class="mh-menu-text">{tm('mohr.tauDownHelp')}</p>
          </MohrMenu>
        {/snippet}
        <MohrCircle2DPlot sx={shown.sx} sy={shown.sy} txy={shown.txy} bind:theta={value.theta} tauDown={value.tauDown} unit={value.unit} bind:focus {fit} {digits} />
      </PlotCard>
      <PlotCard title={tm('mohr.element')} testid="mohr2d-element-card">
        <StressElementPlot sx={shown.sx} sy={shown.sy} txy={shown.txy} bind:theta={value.theta} bind:focus {fit} {digits} />
      </PlotCard>
    </div>
    <MohrLegend />
  </div>
</div>
