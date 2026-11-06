<script lang="ts">
  import { rs } from '../i18n';
  import { num, qty } from '../shell/format';
  import ParamRow from '../shell/ParamRow.svelte';
  import NumberField from './NumberField.svelte';
  import { solverStepCount, finalLoad } from './steps';
  import { LIMITS, MESHES, inRange, type Limited, type Params } from './model';
  import type { SimulationController } from './simulation.svelte';

  type Props = {
    params: Params;
    invalid: Record<Limited, boolean>;
    sim: SimulationController;
    frameCount: number;
    expectedSteps: number;
    valid: boolean;
    isReference: boolean;
    onstart: (force: boolean) => void;
    onrestart: () => void;
    onreset: () => void;
    onback: () => void;
  };
  let { params = $bindable(), invalid = $bindable(), sim, frameCount, expectedSteps, valid, isReference, onstart, onrestart, onreset, onback }: Props = $props();
  const strings = $derived(rs());
  const run = $derived(sim.current);
  const hOverL = $derived(MESHES[params.meshKey].mesh.h_fine / params.l0);
  const sigmaC = $derived(Math.sqrt((27 * params.e * params.gc) / (256 * params.l0)));
  const fmt = (v: number, d = 4) => (Math.abs(v) >= 1e-3 || v === 0 ? num(v, { dp: d }) : num(v, { sig: 3 }));
</script>

<div class="rs-params-list">
  <ParamRow id="p-e" name={strings.youngModulus} unit="kN/mm²" hint="10–400" invalid={invalid.e || !inRange(params.e, LIMITS.e)}>{#snippet symbol()}<var>E</var>{/snippet}<NumberField id="p-e" label={strings.youngModulusLabel} min={LIMITS.e[0]} max={LIMITS.e[1]} bind:value={params.e} bind:invalid={invalid.e} /></ParamRow>
  <ParamRow id="p-nu" name={strings.poissonRatio} hint="0–{num(0.45)}" invalid={invalid.nu || !inRange(params.nu, LIMITS.nu)}>{#snippet symbol()}<var>ν</var>{/snippet}<NumberField id="p-nu" label={strings.poissonRatioLabel} min={LIMITS.nu[0]} max={LIMITS.nu[1]} bind:value={params.nu} bind:invalid={invalid.nu} /></ParamRow>
  <ParamRow id="p-gc" name={strings.fractureToughness} unit="kN/mm" hint="{num(0.0001)}–{num(0.01)}" invalid={invalid.gc || !inRange(params.gc, LIMITS.gc)}>{#snippet symbol()}<var>G</var><sub>c</sub>{/snippet}<NumberField id="p-gc" label={strings.fractureToughnessLabel} min={LIMITS.gc[0]} max={LIMITS.gc[1]} bind:value={params.gc} bind:invalid={invalid.gc} /></ParamRow>
  <ParamRow id="p-l0" name={strings.lengthScale} unit="mm" hint="{num(0.003)}–{num(0.03)}" invalid={invalid.l0 || !inRange(params.l0, LIMITS.l0)}>{#snippet symbol()}<var>ℓ</var>{/snippet}<NumberField id="p-l0" label={strings.lengthScaleLabel} min={LIMITS.l0[0]} max={LIMITS.l0[1]} bind:value={params.l0} bind:invalid={invalid.l0} /></ParamRow>
  <ParamRow id="p-u" name={strings.topDisplacement} unit="mm" hint="{num(0.004)}–{num(0.02)}" invalid={invalid.u || !inRange(params.u, LIMITS.u)}>{#snippet symbol()}<var>u</var>{/snippet}<NumberField id="p-u" label={strings.topDisplacementLabel} min={LIMITS.u[0]} max={LIMITS.u[1]} bind:value={params.u} bind:invalid={invalid.u} /></ParamRow>
  <ParamRow id="p-dt" name={strings.loadStep}>{#snippet symbol()}Δ<var>t</var>{/snippet}
    <select id="p-dt" bind:value={params.dt}>
      {#each [0.005, 0.01, 0.02, 0.03, 0.06] as v (v)}<option value={v}>{num(v)} ({num(solverStepCount(v, 0.8))} {strings.stepsParen}</option>{/each}
    </select>
  </ParamRow>
  <ParamRow id="p-mesh" name={strings.mesh}>
    <select id="p-mesh" bind:value={params.meshKey}>
      {#each Object.entries(MESHES) as [k, m] (k)}<option value={k}>{strings[m.label]} · h = {qty(m.mesh.h_fine, 'mm', { sig: 3 })}</option>{/each}
    </select>
  </ParamRow>
  <label class="rs-check"><input type="checkbox" bind:checked={params.history} /> {strings.historyField}</label>
</div>
<p class="rs-derived">
  {strings.planeStrainLoaded}{num(finalLoad(params.dt, params.u).time)} ({qty(finalLoad(params.dt, params.u).displacement, 'mm')}). σ<sub>c</sub> = {fmt(sigmaC, 3)} {strings.refinedRatio} {num(hOverL, { dp: 2 })}{#if hOverL > 0.5}<strong class="warnt"> {strings.underResolved}</strong>{/if}.
</p>
<div class="rs-buttons">
  {#if run?.status === 'running'}
    <button class="btn btn-ghost btn-sm" type="button" onclick={() => sim.stop()}>{strings.stop}</button>
    <button class="btn btn-ghost btn-sm" type="button" onclick={onrestart}>{strings.restart}</button>
  {:else}
    <button class="btn btn-primary btn-sm" type="button" disabled={!valid} onclick={() => onstart(false)}>{strings.run}</button>
    <button class="btn btn-ghost btn-sm" type="button" disabled={!valid} onclick={() => onstart(true)}>{strings.solveAgain}</button>
  {/if}
  {#if !isReference}<button class="btn btn-ghost btn-sm" type="button" onclick={onreset}>{strings.resetParameters}</button>{/if}
  {#if run}<button class="btn btn-ghost btn-sm" type="button" onclick={onback}>{strings.backToReplay}</button>{/if}
</div>
<p class="rs-status" aria-live="polite">
  {#if sim.available === false}
    <span class="warnt">{strings.solverUnavailable}</span>
  {:else if run?.status === 'running'}
    {strings.solvingStep} {frameCount + 1} {strings.of} {expectedSteps}…
  {:else if run?.status === 'done'}
    {strings.done} {frameCount} {strings.steps}{run.seconds ? ` ${strings.inTime} ${num(run.seconds, { dp: 1 })} s` : ''}{strings.completedRunsKept}
  {:else if run?.status === 'stopped'}
    {strings.stoppedAfter} {frameCount} {strings.stepsPeriod}
  {:else if run?.status === 'error'}
    <span class="warnt">{strings.solverRefused} {strings.meshFailed}</span>
  {:else if isReference}
    {strings.runReuseNote}
  {:else}
    {strings.runBrowserNote}
  {/if}
</p>

<style>
  .rs-params-list {
    display: grid;
    gap: 0.15rem;
  }
  .rs-params-list :global(select) {
    height: var(--rs-control-h);
    background: var(--st-surface-3);
    color: var(--fg);
    border: 1px solid var(--rs-control-border);
    border-radius: var(--st-radius, 3px);
    font: 0.9375rem var(--st-sans);
  }
  .rs-check input {
    flex: none;
    accent-color: var(--st-accent);
    width: 2.75rem;
    height: 2.75rem;
  }
  .rs-check {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    min-height: 2.75rem;
    font-size: var(--rs-ui);
  }
  .rs-derived,
  .rs-status {
    font-size: 0.82rem;
    color: var(--fg-2);
    margin: 0.4rem 0;
  }
  .warnt {
    color: #d9a441;
  }
  .rs-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
</style>
