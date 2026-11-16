<script lang="ts">
  import './mohr.css';
  import { PRESETS, principal3, invariants3, onPlane, normalFromAngles, anglesFromNormal, maxShearNormal, octahedralNormal, type PresetId, type Tensor3, type Vec3 } from '../../lib/mohr/space';
  import { UNITS, UNIT_DIGITS, UNIT_STEP, PER_MPA, type Mohr3DState } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';
  import NumberField from './NumberField.svelte';
  import PlotCard from './PlotCard.svelte';
  import MohrMenu from './MohrMenu.svelte';
  import NormalSpherePlot, { SPHERE_VIEW, type SphereSettings } from './NormalSpherePlot.svelte';
  import PlaneCubePlot from './PlaneCubePlot.svelte';
  import MohrCircles3DPlot from './MohrCircles3DPlot.svelte';
  import MohrLegend from './MohrLegend.svelte';
  import PresetPicker from './PresetPicker.svelte';
  import MohrIcon from './MohrIcon.svelte';
  import type { Focus3D } from './focus';

  let { value = $bindable(), fit = false }: { value: Mohr3DState; fit?: boolean } = $props();
  const uid = $props.id();

  const k = $derived(PER_MPA[value.unit]);
  const digits = $derived(UNIT_DIGITS[value.unit]);
  const step = $derived(UNIT_STEP[value.unit]);
  const shown = $derived(Object.fromEntries(Object.entries(value.s).map(([key, v]) => [key, v * k])) as unknown as Tensor3);
  const fmt = $derived(formatter(digits));
  const fmt3 = $derived(formatter(3));
  const principal = $derived(principal3(shown));
  const inv = $derived(invariants3(shown, principal.values));
  const n = $derived(normalFromAngles(value.phi, value.theta));
  const plane = $derived(onPlane(shown, n));
  const peak = $derived(Math.max(Math.abs(principal.values[0]), Math.abs(principal.values[2]), 1e-12));
  const vec = (v: Vec3) => `(${v.map((c) => fmt3(c)).join(';\u2009')})`;

  let settings = $state<SphereSettings>({ density: 250, length: 1, opacity: 0.55, range: 1, showPrincipal: true });
  let alpha = $state(SPHERE_VIEW.alpha), beta = $state(SPHERE_VIEW.beta);
  let focus = $state<Focus3D>(null);

  function applyPreset(id: PresetId) {
    value.s = { ...PRESETS[id] };
  }
  function pick(v: Vec3, places = 1) {
    const a = anglesFromNormal(v);
    value.phi = Number(a.phi.toFixed(places));
    value.theta = Number(a.theta.toFixed(places));
  }
  const faces = [
    { key: 'x', phi: 0, theta: 90 },
    { key: 'y', phi: 90, theta: 90 },
    { key: 'z', phi: 0, theta: 0 },
  ];
  const isAt = (phi: number, theta: number) => Math.abs(value.theta - theta) < 0.05 && (theta === 0 || Math.abs(value.phi - phi) < 0.05);
  const octahedral = $derived(octahedralNormal(principal.directions));
  const onOctahedral = $derived(Math.abs(n[0] * octahedral[0] + n[1] * octahedral[1] + n[2] * octahedral[2]) > 1 - 1e-7);
  const keys = ['s1', 's2', 's3'] as const;
  const hover = (f: Focus3D) => ({ onpointerenter: () => (focus = f), onpointerleave: () => (focus = null) });
</script>

<div class="mh mh-3d" class:mh-fit={fit} data-testid="mohr3d">
  <div class="mh-layout">
    <section class="mh-side" aria-labelledby={`${uid}-state`}>
      <div class="mh-side-head">
        <h3 id={`${uid}-state`} class="mh-kicker">{tm('mohr.state')}</h3>
        <select class="mh-select mh-unit" bind:value={value.unit} aria-label={tm('mohr.unit')} title={tm('mohr.unitNote')} data-testid="mohr3d-unit">
          {#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
        </select>
      </div>
      <PresetPicker value={value.s} onpick={applyPreset} />
      <div class="mh-tensor" role="group" aria-label={tm('mohr.stressTensor')}>
        <NumberField label="σx" bind:value={value.s.xx} scale={k} places={digits + 1} {step} testid="mohr3d-xx" />
        <NumberField label="τxy" bind:value={value.s.xy} scale={k} places={digits + 1} {step} testid="mohr3d-xy" shear />
        <NumberField label="τxz" bind:value={value.s.xz} scale={k} places={digits + 1} {step} testid="mohr3d-xz" shear />
        <span class="mh-sym-cell" title={tm('mohr.mirror')}>{tm('mohr.sym')}</span>
        <NumberField label="σy" bind:value={value.s.yy} scale={k} places={digits + 1} {step} testid="mohr3d-yy" />
        <NumberField label="τyz" bind:value={value.s.yz} scale={k} places={digits + 1} {step} testid="mohr3d-yz" shear />
        <span class="mh-tensor-gap" aria-hidden="true"></span>
        <NumberField label="σz" bind:value={value.s.zz} scale={k} places={digits + 1} {step} testid="mohr3d-zz" />
      </div>

      <div class="mh-block">
        <h3 class="mh-kicker">{tm('mohr.plane')}</h3>
        <div class="mh-angle-row" title={tm('mohr.azimuth')}>
          <NumberField label="φ" bind:value={value.phi} min={-180} max={180} step={0.5} suffix="°" testid="mohr3d-phi-input" compact title={tm('mohr.azimuth')} />
          <input id={`${uid}-phi`} class="mh-range" type="range" min="-180" max="180" step="0.5" bind:value={value.phi} aria-label={tm('mohr.azimuth')} data-testid="mohr3d-phi" />
        </div>
        <div class="mh-angle-row" title={tm('mohr.polar')}>
          <NumberField label="θ" bind:value={value.theta} min={0} max={180} step={0.5} suffix="°" testid="mohr3d-theta-input" compact title={tm('mohr.polar')} />
          <input id={`${uid}-theta`} class="mh-range" type="range" min="0" max="180" step="0.5" bind:value={value.theta} aria-label={tm('mohr.polar')} data-testid="mohr3d-theta" />
        </div>
        <div class="mh-chips">
          {#each faces as f (f.key)}
            <button type="button" class="mh-chip" aria-pressed={isAt(f.phi, f.theta)} onclick={() => { value.phi = f.phi; value.theta = f.theta; }} data-testid={`mohr3d-face-${f.key}`}>{tm('mohr.face', { axis: f.key })}</button>
          {/each}
          <button type="button" class="mh-chip" aria-pressed={onOctahedral} title={tm('mohr.octahedralNote')} onclick={() => pick(octahedral, 4)} data-testid="mohr3d-octahedral">{tm('mohr.octahedral')}</button>
        </div>
        <dl class="mh-current" aria-label={tm('mohr.cutting')}>
          <dt><span class="mh-sym">n</span> <span class="mh-current-vec" data-testid="mohr3d-n">{vec(n)}</span></dt>
          <dd><span class="mh-sym">σ<sub>n</sub></span><span class="mh-current-num" data-testid="mohr3d-sn">{fmt(plane.sigmaN)}</span></dd>
          <dd><span class="mh-sym">τ<sub>n</sub></span><span class="mh-current-num" data-testid="mohr3d-tn">{fmt(plane.tauN)}</span></dd>
        </dl>
      </div>
    </section>

    <dl class="mh-readout" aria-label={tm('mohr.principalDirections')}>
      {#each principal.values as v, i (i)}
        <div class="mh-ro" class:mh-on={focus === keys[i]} {...hover(keys[i])}>
          <dt><span class="mh-sym">σ<sub>{i + 1}</sub></span> {tm(`mohr.r.p${i + 1}`)}</dt>
          <dd><span class="mh-ro-num" data-testid={`mohr3d-s${i + 1}`}>{fmt(v)}</span> <span class="mh-ro-unit">{value.unit}</span></dd>
          <dd class="mh-ro-dir" title={`${tm('mohr.directions')}: ${vec(principal.directions[i])}`}>{vec(principal.directions[i])}</dd>
        </div>
      {/each}
      <div class="mh-ro" class:mh-on={focus === 'tmax'} {...hover('tmax')}>
        <dt><span class="mh-sym">τ<sub>max</sub></span> {tm('mohr.r.tmax')}</dt>
        <dd><span class="mh-ro-num" data-testid="mohr3d-tmax">{fmt(inv.tauMax)}</span> <span class="mh-ro-unit">{value.unit}</span></dd>
      </div>
      <div class="mh-ro">
        <dt title={tm('mohr.vonMises')}><span class="mh-sym">σ<sub>VM</sub></span> {tm('mohr.r.vm')}</dt>
        <dd><span class="mh-ro-num" data-testid="mohr3d-vm">{fmt(inv.vonMises)}</span> <span class="mh-ro-unit">{value.unit}</span></dd>
        <dd class="mh-ro-dir" title={tm('mohr.mean')}>σ<sub>m</sub> = <span data-testid="mohr3d-mean">{fmt(inv.mean)}</span></dd>
      </div>
    </dl>

    <div class="mh-board mh-board-3d">
      <PlotCard title={tm('mohr.sphere')} testid="mohr3d-sphere-card" hero>
        {#snippet tools()}
          <MohrMenu label={tm('mohr.howTo')} wide>
            {#snippet summary()}?{/snippet}
            <p class="mh-menu-text">{tm('mohr.pickTip')}</p>
          </MohrMenu>
          <button type="button" class="mh-btn mh-btn-ghost" onclick={() => { alpha = SPHERE_VIEW.alpha; beta = SPHERE_VIEW.beta; }} aria-label={tm('mohr.resetView')} title={tm('mohr.resetView')}><MohrIcon name="reset" /></button>
          <MohrMenu label={tm('mohr.viewSettings')} wide testid="mohr3d-settings">
            {#snippet summary()}<MohrIcon name="sliders" />{/snippet}
            <p class="mh-menu-title">{tm('mohr.viewSettings')}</p>
            <div class="mh-settings-grid">
              <label>{tm('mohr.density')} <span class="mh-val">{settings.density}</span>
                <input type="range" min="50" max="800" step="10" bind:value={settings.density} /></label>
              <label>{tm('mohr.arrowLength')} <span class="mh-val">×{formatter(2)(settings.length)}</span>
                <input type="range" min="0.25" max="2" step="0.05" bind:value={settings.length} /></label>
              <label>{tm('mohr.opacity')} <span class="mh-val">{Math.round(settings.opacity * 100)} %</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={settings.opacity} /></label>
              <label>{tm('mohr.range')} <span class="mh-val">{Math.round(settings.range * 100)} %</span>
                <input type="range" min="0.1" max="2" step="0.05" bind:value={settings.range} /></label>
              <label class="mh-check"><input type="checkbox" bind:checked={settings.showPrincipal} /> {tm('mohr.showPrincipal')}</label>
            </div>
          </MohrMenu>
        {/snippet}
        <NormalSpherePlot s={shown} {n} {principal} {settings} unit={value.unit} onpick={pick} bind:alpha bind:beta {focus} {fit} {digits} />
      </PlotCard>
      <PlotCard title={tm('mohr.cube')} testid="mohr3d-cube-card">
        <PlaneCubePlot s={shown} {n} {peak} bind:alpha bind:beta {fit} />
      </PlotCard>
      <PlotCard title={tm('mohr.circles3d')} testid="mohr3d-circles-card">
        <MohrCircles3DPlot values={principal.values} sigmaN={plane.sigmaN} tauN={plane.tauN} unit={value.unit} bind:focus {fit} {digits}
          onprincipal={(i) => pick(principal.directions[i], 4)} onmaxshear={() => pick(maxShearNormal(principal.directions), 4)} />
      </PlotCard>
    </div>
    <MohrLegend />
  </div>
</div>
