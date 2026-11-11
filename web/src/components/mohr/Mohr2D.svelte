<script lang="ts">
  import './mohr.css';
  import { principalPlane, rotatePlane } from '../../lib/mohr/plane';
  import { UNITS, wrapAngle, type Mohr2DState } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';
  import NumberField from './NumberField.svelte';
  import PlotCard from './PlotCard.svelte';
  import MohrCircle2DPlot from './MohrCircle2DPlot.svelte';
  import StressElementPlot from './StressElementPlot.svelte';

  let { value = $bindable() }: { value: Mohr2DState } = $props();
  const uid = $props.id();

  const fmt = $derived(formatter(2));
  const p = $derived(principalPlane(value));
  const r = $derived(rotatePlane(value, value.theta));
  const degenerate = $derived(p.radius <= 1e-9 * Math.max(Math.abs(value.sx), Math.abs(value.sy), 1e-12));
  const deg = (v: number) => `${fmt(v)}°`;

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

  let showTauHelp = $state(false);
</script>

<div class="mh mh-2d" data-testid="mohr2d">
  <section class="mh-card mh-inputs">
    <div class="mh-matrix-row">
      <span class="mh-sigma" aria-hidden="true">σ =</span>
      <div class="mh-matrix" role="group" aria-label={tm('mohr.stressTensor')}>
        <NumberField label="σx" bind:value={value.sx} testid="mohr2d-sx" />
        <NumberField label="τxy" bind:value={value.txy} testid="mohr2d-txy" />
        <NumberField label="τyx" value={value.txy} readonly title={tm('mohr.mirror')} />
        <NumberField label="σy" bind:value={value.sy} testid="mohr2d-sy" />
      </div>
      <div class="mh-rotation">
        <label for={`${uid}-theta`}>{tm('mohr.rotation')}</label>
        <div class="mh-rotation-value">
          <NumberField label="θ" bind:value={value.theta} min={-180} max={180} step={0.5} suffix="°" testid="mohr2d-theta-input" compact />
        </div>
        <input id={`${uid}-theta`} type="range" min="-180" max="180" step="0.5" bind:value={value.theta} data-testid="mohr2d-theta" />
        <label class="mh-check"><input type="checkbox" bind:checked={animate} data-testid="mohr2d-animate" /> {tm('mohr.animate')}</label>
      </div>
    </div>
    <p class="mh-note">{tm('mohr.sign')}</p>
    <div class="mh-results">
      <div>
      <h4 class="mh-results-title">{tm('mohr.principal')}</h4>
      <dl>
        <dt>σ<sub>1</sub></dt><dd data-testid="mohr2d-s1">{fmt(p.sigma1)}</dd>
        <dt>θ<sub>1</sub></dt><dd data-testid="mohr2d-theta1">{deg(p.theta1)}</dd>
        <dt>σ<sub>2</sub></dt><dd data-testid="mohr2d-s2">{fmt(p.sigma2)}</dd>
        <dt>θ<sub>2</sub></dt><dd>{deg(p.theta2)}</dd>
        <dt>τ<sub>max</sub></dt><dd data-testid="mohr2d-tmax">{fmt(p.tauMax)}</dd>
      </dl>
      </div>
      <div>
      <h4 class="mh-results-title">{tm('mohr.rotated')}</h4>
      <dl>
        <dt>σ<sub>x′</sub></dt><dd data-testid="mohr2d-sxr">{fmt(r.sx)}</dd>
        <dt>σ<sub>y′</sub></dt><dd data-testid="mohr2d-syr">{fmt(r.sy)}</dd>
        <dt>τ<sub>x′y′</sub></dt><dd data-testid="mohr2d-txyr">{fmt(r.txy)}</dd>
      </dl>
      </div>
    </div>
    {#if degenerate}<p class="mh-note" role="status">{tm('mohr.degenerate')}</p>{/if}
  </section>

  <PlotCard title={tm('mohr.circle')} file="mohr-circle" testid="mohr2d-circle-card">
    {#snippet tools()}
      <label class="mh-check"><input type="checkbox" bind:checked={value.tauDown} data-testid="mohr2d-taudown" /> {tm('mohr.tauDown')}</label>
      <button type="button" class="mh-btn mh-btn-sm mh-info" aria-expanded={showTauHelp} aria-label={tm('mohr.conventions')} title={tm('mohr.tauDownHelp')} onclick={() => (showTauHelp = !showTauHelp)}>?</button>
      <select class="mh-select" bind:value={value.unit} aria-label={tm('mohr.unit')} title={tm('mohr.unitNote')} data-testid="mohr2d-unit">
        {#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
      </select>
    {/snippet}
    {#if showTauHelp}<p class="mh-note mh-popover" role="note">{tm('mohr.tauDownHelp')}</p>{/if}
    <MohrCircle2DPlot sx={value.sx} sy={value.sy} txy={value.txy} theta={value.theta} tauDown={value.tauDown} unit={value.unit} />
  </PlotCard>

  <PlotCard title={tm('mohr.element')} file="stress-element" testid="mohr2d-element-card">
    <StressElementPlot sx={value.sx} sy={value.sy} txy={value.txy} theta={value.theta} />
  </PlotCard>
</div>
