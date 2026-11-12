<script lang="ts">
  import './mohr.css';
  import { PRESETS, PRESET_IDS, principal3, invariants3, onPlane, normalFromAngles, anglesFromNormal, maxShearNormal, OCTAHEDRAL, type PresetId, type Vec3 } from '../../lib/mohr/space';
  import { UNITS, type Mohr3DState } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';
  import NumberField from './NumberField.svelte';
  import PlotCard from './PlotCard.svelte';
  import NormalSpherePlot, { SPHERE_VIEW, type SphereSettings } from './NormalSpherePlot.svelte';
  import PlaneCubePlot from './PlaneCubePlot.svelte';
  import MohrCircles3DPlot from './MohrCircles3DPlot.svelte';
  import MohrLegend from './MohrLegend.svelte';
  import type { Focus3D } from './focus';

  let { value = $bindable() }: { value: Mohr3DState } = $props();
  const uid = $props.id();

  const fmt = $derived(formatter(2));
  const fmt3 = $derived(formatter(3));
  const principal = $derived(principal3(value.s));
  const inv = $derived(invariants3(value.s, principal.values));
  const n = $derived(normalFromAngles(value.phi, value.theta));
  const plane = $derived(onPlane(value.s, n));
  const peak = $derived(Math.max(Math.abs(principal.values[0]), Math.abs(principal.values[2]), 1e-12));
  const vec = (v: Vec3) => `(${v.map((c) => fmt3(c)).join('; ')})`;

  let settings = $state<SphereSettings>({ density: 250, length: 1, opacity: 0.55, range: 1, showPrincipal: true });
  let alpha = $state(SPHERE_VIEW.alpha), beta = $state(SPHERE_VIEW.beta);
  let focus = $state<Focus3D>(null);

  let preset = $state('');
  function applyPreset(id: string) {
    if (!(PRESET_IDS as string[]).includes(id)) return;
    value.s = { ...PRESETS[id as PresetId] };
    preset = '';
  }
  function pick(v: Vec3, digits = 1) {
    const a = anglesFromNormal(v);
    value.phi = Number(a.phi.toFixed(digits));
    value.theta = Number(a.theta.toFixed(digits));
  }
  const faces = [
    { key: 'x', phi: 0, theta: 90 },
    { key: 'y', phi: 90, theta: 90 },
    { key: 'z', phi: 0, theta: 0 },
  ];
  const isAt = (phi: number, theta: number) => Math.abs(value.theta - theta) < 0.05 && (theta === 0 || Math.abs(value.phi - phi) < 0.05);
  const keys = ['s1', 's2', 's3'] as const;
  const hover = (f: Focus3D) => ({ onpointerenter: () => (focus = f), onpointerleave: () => (focus = null) });
</script>

<div class="mh mh-3d" data-testid="mohr3d">
  <div class="mh-layout">
    <section class="mh-side" aria-labelledby={`${uid}-state`}>
      <div class="mh-side-head">
        <h3 id={`${uid}-state`} class="mh-kicker">{tm('mohr.state')}</h3>
        <select class="mh-select mh-unit" bind:value={value.unit} aria-label={tm('mohr.unit')} title={tm('mohr.unitNote')} data-testid="mohr3d-unit">
          {#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
        </select>
      </div>
      <div class="mh-tensor" role="group" aria-label={tm('mohr.stressTensor')}>
        <NumberField label="σx" bind:value={value.s.xx} testid="mohr3d-xx" />
        <NumberField label="τxy" bind:value={value.s.xy} testid="mohr3d-xy" shear />
        <NumberField label="τxz" bind:value={value.s.xz} testid="mohr3d-xz" shear />
        <span class="mh-tensor-gap" aria-hidden="true"></span>
        <NumberField label="σy" bind:value={value.s.yy} testid="mohr3d-yy" />
        <NumberField label="τyz" bind:value={value.s.yz} testid="mohr3d-yz" shear />
        <span class="mh-sym-cell" title={tm('mohr.mirror')}>{tm('mohr.sym')}</span>
        <span class="mh-tensor-gap" aria-hidden="true"></span>
        <NumberField label="σz" bind:value={value.s.zz} testid="mohr3d-zz" />
      </div>
      <div class="mh-row">
        <label for={`${uid}-preset`}>{tm('mohr.preset')}</label>
        <select id={`${uid}-preset`} class="mh-select" bind:value={preset} onchange={() => applyPreset(preset)} data-testid="mohr3d-preset">
          <option value="">{tm('mohr.choose')}</option>
          {#each PRESET_IDS as id (id)}<option value={id}>{tm(`mohr.preset.${id}`)}</option>{/each}
        </select>
      </div>

      <div class="mh-block">
        <h3 class="mh-kicker">{tm('mohr.plane')}</h3>
        <div class="mh-slider">
          <label for={`${uid}-phi`}>{tm('mohr.azimuth')}</label>
          <NumberField label="φ" bind:value={value.phi} min={-180} max={180} step={0.5} suffix="°" testid="mohr3d-phi-input" compact />
          <input id={`${uid}-phi`} class="mh-range" type="range" min="-180" max="180" step="0.5" bind:value={value.phi} data-testid="mohr3d-phi" />
        </div>
        <div class="mh-slider">
          <label for={`${uid}-theta`}>{tm('mohr.polar')}</label>
          <NumberField label="θ" bind:value={value.theta} min={0} max={180} step={0.5} suffix="°" testid="mohr3d-theta-input" compact />
          <input id={`${uid}-theta`} class="mh-range" type="range" min="0" max="180" step="0.5" bind:value={value.theta} data-testid="mohr3d-theta" />
        </div>
        <div class="mh-chips">
          {#each faces as f (f.key)}
            <button type="button" class="mh-chip" aria-pressed={isAt(f.phi, f.theta)} onclick={() => { value.phi = f.phi; value.theta = f.theta; }} data-testid={`mohr3d-face-${f.key}`}>{tm('mohr.face', { axis: f.key })}</button>
          {/each}
          <button type="button" class="mh-chip" aria-pressed={isAt(OCTAHEDRAL.phi, OCTAHEDRAL.theta)} onclick={() => { value.phi = OCTAHEDRAL.phi; value.theta = OCTAHEDRAL.theta; }} data-testid="mohr3d-octahedral">{tm('mohr.octahedral')}</button>
        </div>
      </div>
      <p class="mh-note">{tm('mohr.sign')}</p>
      <p class="mh-note mh-hint">{tm('mohr.pickTip')}</p>
    </section>

    <div class="mh-main">
      <dl class="mh-readout mh-readout-3d" aria-label={tm('mohr.principalDirections')}>
        {#each principal.values as v, i (i)}
          <div class="mh-ro" class:mh-on={focus === keys[i]} {...hover(keys[i])}>
            <dt><span class="mh-sym">σ<sub>{i + 1}</sub></span> {tm(`mohr.r.p${i + 1}`)}</dt>
            <dd><span class="mh-ro-num" data-testid={`mohr3d-s${i + 1}`}>{fmt(v)}</span> <span class="mh-ro-unit">{value.unit}</span></dd>
            <dd class="mh-ro-dir">{vec(principal.directions[i])}</dd>
          </div>
        {/each}
        <div class="mh-ro" class:mh-on={focus === 'tmax'} {...hover('tmax')}>
          <dt><span class="mh-sym">τ<sub>max</sub></span> {tm('mohr.r.tmax')}</dt>
          <dd><span class="mh-ro-num" data-testid="mohr3d-tmax">{fmt(inv.tauMax)}</span> <span class="mh-ro-unit">{value.unit}</span></dd>
        </div>
        <div class="mh-ro">
          <dt title={tm('mohr.vonMises')}><span class="mh-sym">σ<sub>VM</sub></span> {tm('mohr.r.vm')}</dt>
          <dd><span class="mh-ro-num" data-testid="mohr3d-vm">{fmt(inv.vonMises)}</span> <span class="mh-ro-unit">{value.unit}</span></dd>
          <dd class="mh-ro-sub" title={tm('mohr.mean')}>σ<sub>m</sub> = <span data-testid="mohr3d-mean">{fmt(inv.mean)}</span></dd>
        </div>
      </dl>

      <dl class="mh-strip" aria-label={tm('mohr.plane')}>
        <dt class="mh-strip-title">{tm('mohr.cutting')}</dt>
        <dd><span class="mh-sym">n</span> <span class="mh-strip-num mh-strip-vec" data-testid="mohr3d-n">{vec(n)}</span></dd>
        <dd><span class="mh-sym">σ<sub>n</sub></span> <span class="mh-strip-num" data-testid="mohr3d-sn">{fmt(plane.sigmaN)}</span></dd>
        <dd><span class="mh-sym">τ<sub>n</sub></span> <span class="mh-strip-num" data-testid="mohr3d-tn">{fmt(plane.tauN)}</span></dd>
      </dl>

      <div class="mh-board mh-board-3d">
        <PlotCard title={tm('mohr.sphere')} file="stress-sphere" testid="mohr3d-sphere-card" hero>
          {#snippet tools()}
            <button type="button" class="mh-btn mh-btn-ghost" onclick={() => { alpha = SPHERE_VIEW.alpha; beta = SPHERE_VIEW.beta; }}>{tm('mohr.resetView')}</button>
          {/snippet}
          <NormalSpherePlot s={value.s} {n} {principal} {settings} unit={value.unit} onpick={pick} bind:alpha bind:beta {focus} />
          <details class="mh-settings">
            <summary>{tm('mohr.viewSettings')}</summary>
            <div class="mh-settings-grid">
              <label>{tm('mohr.density')} <span class="mh-val">{settings.density}</span>
                <input type="range" min="50" max="800" step="10" bind:value={settings.density} /></label>
              <label>{tm('mohr.arrowLength')} <span class="mh-val">×{fmt(settings.length)}</span>
                <input type="range" min="0.25" max="2" step="0.05" bind:value={settings.length} /></label>
              <label>{tm('mohr.opacity')} <span class="mh-val">{Math.round(settings.opacity * 100)} %</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={settings.opacity} /></label>
              <label>{tm('mohr.range')} <span class="mh-val">{Math.round(settings.range * 100)} %</span>
                <input type="range" min="0.1" max="2" step="0.05" bind:value={settings.range} /></label>
              <label class="mh-check"><input type="checkbox" bind:checked={settings.showPrincipal} /> {tm('mohr.showPrincipal')}</label>
            </div>
          </details>
        </PlotCard>
        <PlotCard title={tm('mohr.cube')} file="cutting-plane" testid="mohr3d-cube-card">
          <PlaneCubePlot s={value.s} {n} {peak} bind:alpha bind:beta />
        </PlotCard>
        <PlotCard title={tm('mohr.circles3d')} file="mohr-circles" testid="mohr3d-circles-card">
          <MohrCircles3DPlot values={principal.values} sigmaN={plane.sigmaN} tauN={plane.tauN} unit={value.unit} bind:focus
            onprincipal={(i) => pick(principal.directions[i], 4)} onmaxshear={() => pick(maxShearNormal(principal.directions), 4)} />
          <p class="mh-note mh-fig-foot">{tm('mohr.circlesNote')}</p>
        </PlotCard>
      </div>
      <MohrLegend />
    </div>
  </div>
</div>
