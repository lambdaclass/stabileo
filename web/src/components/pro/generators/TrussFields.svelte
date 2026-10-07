<script lang="ts">
  /**
   * The parameters of a truss or beam, the one set of fields for the beam generator and for the
   * roof of a shed: whatever a beam generated on its own can be, the shed's can be too.
   *
   * The span is the beam generator's own field; a shed owns its span and leaves it out.
   *
   * In two parts, each its own section of the form: the outline of the beam (`shape`) and the
   * members inside it (`web`).
   */
  import { t } from '../../../lib/i18n';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import GenRow from './GenRow.svelte';
  import {
    TRUSS_KINDS, ARCH_CURVES, WEB_PATTERNS, subdivisionApplies, type TrussParams,
  } from '../../../lib/engine/generators/truss-topology';

  interface Props {
    p: TrussParams | Omit<TrussParams, 'spanM'>;
    /** Shows the span field (the beam generator; a shed has its own span). */
    withSpan?: boolean;
    /** The label of the shape select. */
    shapeKey?: string;
    part: 'shape' | 'web';
  }
  let { p = $bindable(), withSpan = false, shapeKey = 'generator.ui.trussShape', part }: Props = $props();
  const hint = (key: string) => ({ hint: t(`generator.hint.${key}`), hintId: `gen-hint-${key}` });
  const full = $derived(p as TrussParams);
</script>

{#if part === 'shape'}
  <GenRow name={t(shapeKey)}>
    <select bind:value={p.kind} data-testid="gen-truss-kind">
      {#each TRUSS_KINDS as k (k)}<option value={k}>{t(`generator.truss.${k}`)}</option>{/each}
    </select>
  </GenRow>
  {#if withSpan}
    <GenRow name={t('generator.ui.span')} {...hint('span')}><QuantityInput quantity="length" bind:value={full.spanM} describedBy="gen-hint-span" testid="gen-span" /></GenRow>
  {/if}
  <GenRow name={t('generator.ui.rise')} {...hint('rise')}><QuantityInput quantity="length" bind:value={p.riseM} describedBy="gen-hint-rise" /></GenRow>
  {#if p.kind === 'trapezoidal' || p.kind === 'arch'}
    <GenRow name={t('generator.ui.endDepth')} {...hint('endDepth')}><QuantityInput quantity="length" bind:value={p.endDepthM} describedBy="gen-hint-endDepth" /></GenRow>
  {/if}
  {#if p.kind === 'parallelChord' || p.kind === 'pratt'}
    <GenRow name={t('generator.ui.depth')} {...hint('depth')}><QuantityInput quantity="length" bind:value={p.depthM} describedBy="gen-hint-depth" /></GenRow>
  {/if}
  {#if p.kind === 'trapezoidal'}
    <GenRow name={t('generator.ui.plateau')} {...hint('plateau')}><QuantityInput quantity="length" bind:value={p.plateauM} describedBy="gen-hint-plateau" /></GenRow>
  {/if}
  {#if p.kind === 'arch'}
    <GenRow name={t('generator.ui.archCurve')}>
      <select bind:value={p.archCurve}>
        {#each ARCH_CURVES as c (c)}<option value={c}>{t(`generator.archCurve.${c}`)}</option>{/each}
      </select>
    </GenRow>
  {/if}
  <GenRow name={t('generator.ui.halfTruss')} check><input type="checkbox" bind:checked={p.halfTruss} data-testid="gen-half-truss" /></GenRow>
{:else if p.kind !== 'rolledPortal'}
  <GenRow name={t('generator.ui.panels')} {...hint('panels')}><input type="number" min="1" step="1" bind:value={p.panelsPerHalf} aria-describedby="gen-hint-panels" data-testid="gen-panels" /></GenRow>
  <GenRow name={t('generator.ui.webPattern')}>
    <select bind:value={p.webPattern} data-testid="gen-web-pattern">
      {#each WEB_PATTERNS as w (w)}<option value={w}>{t(`generator.webPattern.${w}`)}</option>{/each}
    </select>
  </GenRow>
  <!--
    Shown only where it does something. `subdivisionApplies` refuses a single panel per half,
    where the new panel point would land on the existing midspan one, so the control cannot be
    ticked into a no-op.
  -->
  {#if subdivisionApplies(full)}
    <GenRow name={t('generator.ui.subdivideDiagonals')} check><input type="checkbox" bind:checked={p.subdivideDiagonals} data-testid="gen-subdivide" /></GenRow>
    <p class="gen-note" data-testid="gen-subdivide-hint">{t('generator.ui.subdivideDiagonalsHelp')}</p>
  {/if}
{:else}
  <!-- A solid-web beam: one section throughout, or one at the supports and another at mid-span. -->
  <GenRow name={t('generator.ui.variableSection')} check>
    <input type="checkbox" checked={!!p.variableSection} onchange={(e) => { p.variableSection = e.currentTarget.checked; }} data-testid="gen-variable-rafter" />
  </GenRow>
  <p class="gen-note">{t('generator.ui.variableRafterHelp')}</p>
{/if}
