<script lang="ts">
  import './mohr.css';
  import { PRESETS, PRESET_IDS, principal3, invariants3, onPlane, normalFromAngles, anglesFromNormal, OCTAHEDRAL, type PresetId, type Vec3 } from '../../lib/mohr/space';
  import { UNITS, type Mohr3DState } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';
  import NumberField from './NumberField.svelte';
  import PlotCard from './PlotCard.svelte';
  import NormalSpherePlot, { type SphereSettings } from './NormalSpherePlot.svelte';
  import MohrCircles3DPlot from './MohrCircles3DPlot.svelte';

  let { value = $bindable() }: { value: Mohr3DState } = $props();
  const uid = $props.id();

  const fmt = $derived(formatter(2));
  const fmt3 = $derived(formatter(3));
  const principal = $derived(principal3(value.s));
  const inv = $derived(invariants3(value.s, principal.values));
  const n = $derived(normalFromAngles(value.phi, value.theta));
  const plane = $derived(onPlane(value.s, n));
  const vec = (v: Vec3) => `(${v.map((c) => fmt3(c)).join('; ')})`;

  let settings = $state<SphereSettings>({ density: 250, length: 1, opacity: 0.45, range: 1, showPrincipal: true });
  let sphere = $state<NormalSpherePlot>();

  let preset = $state('');
  function applyPreset(id: string) {
    if (!(PRESET_IDS as string[]).includes(id)) return;
    value.s = { ...PRESETS[id as PresetId] };
    preset = '';
  }
  function pick(v: Vec3) {
    const a = anglesFromNormal(v);
    value.phi = Math.round(a.phi * 10) / 10;
    value.theta = Math.round(a.theta * 10) / 10;
  }
  const faces = [
    { key: 'x', phi: 0, theta: 90 },
    { key: 'y', phi: 90, theta: 90 },
    { key: 'z', phi: 0, theta: 0 },
  ];
  const isAt = (phi: number, theta: number) => Math.abs(value.theta - theta) < 0.05 && (theta === 0 || Math.abs(value.phi - phi) < 0.05);
</script>

<div class="mh mh-3d" data-testid="mohr3d">
  <section class="mh-card mh-inputs">
    <div class="mh-matrix-row">
      <span class="mh-sigma" aria-hidden="true">σ =</span>
      <div class="mh-matrix mh-matrix-3" role="group" aria-label={tm('mohr.stressTensor')}>
        <NumberField label="σx" bind:value={value.s.xx} testid="mohr3d-xx" />
        <NumberField label="τxy" bind:value={value.s.xy} testid="mohr3d-xy" />
        <NumberField label="τxz" bind:value={value.s.xz} testid="mohr3d-xz" />
        <NumberField label="τyx" value={value.s.xy} readonly title={tm('mohr.mirror')} />
        <NumberField label="σy" bind:value={value.s.yy} testid="mohr3d-yy" />
        <NumberField label="τyz" bind:value={value.s.yz} testid="mohr3d-yz" />
        <NumberField label="τzx" value={value.s.xz} readonly title={tm('mohr.mirror')} />
        <NumberField label="τzy" value={value.s.yz} readonly title={tm('mohr.mirror')} />
        <NumberField label="σz" bind:value={value.s.zz} testid="mohr3d-zz" />
      </div>
    </div>
    <div class="mh-row">
      <label for={`${uid}-preset`}>{tm('mohr.preset')}</label>
      <select id={`${uid}-preset`} class="mh-select" bind:value={preset} onchange={() => applyPreset(preset)} data-testid="mohr3d-preset">
        <option value="">{tm('mohr.choose')}</option>
        {#each PRESET_IDS as id (id)}<option value={id}>{tm(`mohr.preset.${id}`)}</option>{/each}
      </select>
    </div>
    <p class="mh-note">{tm('mohr.sign')}</p>

    <h4 class="mh-results-title">{tm('mohr.plane')}</h4>
    <div class="mh-slider">
      <label for={`${uid}-phi`}>{tm('mohr.azimuth')}</label>
      <NumberField label="φ" bind:value={value.phi} min={-180} max={180} step={0.5} suffix="°" testid="mohr3d-phi-input" compact />
      <input id={`${uid}-phi`} type="range" min="-180" max="180" step="0.5" bind:value={value.phi} data-testid="mohr3d-phi" />
    </div>
    <div class="mh-slider">
      <label for={`${uid}-theta`}>{tm('mohr.polar')}</label>
      <NumberField label="θ" bind:value={value.theta} min={0} max={180} step={0.5} suffix="°" testid="mohr3d-theta-input" compact />
      <input id={`${uid}-theta`} type="range" min="0" max="180" step="0.5" bind:value={value.theta} data-testid="mohr3d-theta" />
    </div>
    <div class="mh-buttons">
      {#each faces as f (f.key)}
        <button type="button" class="mh-btn mh-btn-sm" aria-pressed={isAt(f.phi, f.theta)} onclick={() => { value.phi = f.phi; value.theta = f.theta; }} data-testid={`mohr3d-face-${f.key}`}>{tm('mohr.face', { axis: f.key })}</button>
      {/each}
      <button type="button" class="mh-btn mh-btn-sm" aria-pressed={isAt(OCTAHEDRAL.phi, OCTAHEDRAL.theta)} onclick={() => { value.phi = OCTAHEDRAL.phi; value.theta = OCTAHEDRAL.theta; }} data-testid="mohr3d-octahedral">{tm('mohr.octahedral')}</button>
    </div>
    <p class="mh-note">{tm('mohr.pickTip')}</p>
    <dl class="mh-dl">
      <dt>n</dt><dd data-testid="mohr3d-n">{vec(n)}</dd>
      <dt>σ<sub>n</sub></dt><dd data-testid="mohr3d-sn">{fmt(plane.sigmaN)}</dd>
      <dt>τ<sub>n</sub></dt><dd data-testid="mohr3d-tn">{fmt(plane.tauN)}</dd>
    </dl>

    <h4 class="mh-results-title">{tm('mohr.principalDirections')}</h4>
    <dl class="mh-dl mh-principal-list">
      {#each principal.values as v, i (i)}
        <dt>σ<sub>{i + 1}</sub></dt><dd><span data-testid={`mohr3d-s${i + 1}`}>{fmt(v)}</span> <span class="mh-dir">{vec(principal.directions[i])}</span></dd>
      {/each}
      <dt>τ<sub>max</sub></dt><dd data-testid="mohr3d-tmax">{fmt(inv.tauMax)}</dd>
      <dt title={tm('mohr.mean')}>σ<sub>m</sub></dt><dd data-testid="mohr3d-mean">{fmt(inv.mean)}</dd>
      <dt title={tm('mohr.vonMises')}>σ<sub>VM</sub></dt><dd data-testid="mohr3d-vm">{fmt(inv.vonMises)}</dd>
    </dl>
  </section>

  <PlotCard title={tm('mohr.sphere')} file="stress-sphere" testid="mohr3d-sphere-card">
    {#snippet tools()}
      <button type="button" class="mh-btn mh-btn-sm" onclick={() => sphere?.resetView()}>{tm('mohr.resetView')}</button>
    {/snippet}
    <NormalSpherePlot bind:this={sphere} s={value.s} {n} {principal} {settings} unit={value.unit} onpick={pick} />
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

  <PlotCard title={tm('mohr.circles3d')} file="mohr-circles" testid="mohr3d-circles-card">
    {#snippet tools()}
      <select class="mh-select" bind:value={value.unit} aria-label={tm('mohr.unit')} title={tm('mohr.unitNote')} data-testid="mohr3d-unit">
        {#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
      </select>
    {/snippet}
    <MohrCircles3DPlot values={principal.values} sigmaN={plane.sigmaN} tauN={plane.tauN} unit={value.unit} />
    <p class="mh-note">{tm('mohr.circlesNote')}</p>
  </PlotCard>
</div>
