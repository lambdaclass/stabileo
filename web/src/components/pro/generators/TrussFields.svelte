<script lang="ts">
  /**
   * The parameters of a truss or beam, the one set of fields for the beam generator and for the
   * roof of a shed: whatever a beam generated on its own can be, the shed's can be too.
   *
   * The span is the beam generator's own field; a shed owns its span and leaves it out.
   */
  import { t } from '../../../lib/i18n';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import {
    TRUSS_KINDS, ARCH_CURVES, WEB_PATTERNS, subdivisionApplies, type TrussParams,
  } from '../../../lib/engine/generators/truss-topology';

  interface Props {
    p: TrussParams | Omit<TrussParams, 'spanM'>;
    /** Shows the span field (the beam generator; a shed has its own span). */
    withSpan?: boolean;
    /** The label of the shape select. */
    shapeKey?: string;
  }
  let { p = $bindable(), withSpan = false, shapeKey = 'generator.ui.trussShape' }: Props = $props();
  const full = $derived(p as TrussParams);
</script>

{#snippet fieldHead(key: string)}
  <span class="fname">{t(`generator.ui.${key}`)}</span>
  <span class="fhint" id={`gen-hint-${key}`}>{t(`generator.hint.${key}`)}</span>
{/snippet}

<label><span>{t(shapeKey)}</span>
  <select bind:value={p.kind} data-testid="gen-truss-kind">
    {#each TRUSS_KINDS as k (k)}<option value={k}>{t(`generator.truss.${k}`)}</option>{/each}
  </select></label>
{#if withSpan}
  <label>{@render fieldHead('span')}<QuantityInput quantity="length" bind:value={full.spanM} describedBy="gen-hint-span" testid="gen-span" /></label>
{/if}
<label>{@render fieldHead('rise')}<QuantityInput quantity="length" bind:value={p.riseM} describedBy="gen-hint-rise" /></label>
{#if p.kind === 'trapezoidal' || p.kind === 'arch'}
  <label>{@render fieldHead('endDepth')}<QuantityInput quantity="length" bind:value={p.endDepthM} describedBy="gen-hint-endDepth" /></label>
{/if}
{#if p.kind === 'parallelChord' || p.kind === 'pratt'}
  <label>{@render fieldHead('depth')}<QuantityInput quantity="length" bind:value={p.depthM} describedBy="gen-hint-depth" /></label>
{/if}
{#if p.kind === 'trapezoidal'}
  <label>{@render fieldHead('plateau')}<QuantityInput quantity="length" bind:value={p.plateauM} describedBy="gen-hint-plateau" /></label>
{/if}
{#if p.kind === 'arch'}
  <label><span>{t('generator.ui.archCurve')}</span>
    <select bind:value={p.archCurve}>
      {#each ARCH_CURVES as c (c)}<option value={c}>{t(`generator.archCurve.${c}`)}</option>{/each}
    </select></label>
{/if}
{#if p.kind !== 'rolledPortal'}
  <label>{@render fieldHead('panels')}<input type="number" min="1" step="1" bind:value={p.panelsPerHalf} aria-describedby="gen-hint-panels" data-testid="gen-panels" /></label>
  <label><span>{t('generator.ui.webPattern')}</span>
    <select bind:value={p.webPattern} data-testid="gen-web-pattern">
      {#each WEB_PATTERNS as w (w)}<option value={w}>{t(`generator.webPattern.${w}`)}</option>{/each}
    </select></label>
  <!--
    Shown only where it does something. `subdivisionApplies` refuses a single panel per half,
    where the new panel point would land on the existing midspan one, so the control cannot be
    ticked into a no-op.
  -->
  {#if subdivisionApplies(full)}
    <label class="check">
      <input type="checkbox" bind:checked={p.subdivideDiagonals} data-testid="gen-subdivide" />
      <span>{t('generator.ui.subdivideDiagonals')}</span>
    </label>
    <p class="gen-hint" data-testid="gen-subdivide-hint">{t('generator.ui.subdivideDiagonalsHelp')}</p>
  {/if}
{:else}
  <!-- A solid-web beam: one section throughout, or one at the supports and another at mid-span. -->
  <label class="check">
    <input type="checkbox" checked={!!p.variableSection} onchange={(e) => { p.variableSection = e.currentTarget.checked; }} data-testid="gen-variable-rafter" />
    <span>{t('generator.ui.variableSection')}</span>
  </label>
  <p class="gen-hint">{t('generator.ui.variableRafterHelp')}</p>
{/if}
<label class="check"><input type="checkbox" bind:checked={p.halfTruss} data-testid="gen-half-truss" /><span>{t('generator.ui.halfTruss')}</span></label>
