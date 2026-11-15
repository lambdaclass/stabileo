<script lang="ts">
  /**
   * "Paso a paso — Mét. Flexibilidades": the force method in nine steps.
   *
   * Laid out in the frame every step-by-step solution uses (StepFrame), like
   * the stiffness wizard and the explained methods, so a reader moving between
   * methods only has to learn the method, not the panel. An isostatic
   * structure has no redundants, so it stops at Step 1 and says why.
   */
  import { t } from '../../lib/i18n';
  import { fmStepsStore, FM_STEPS } from '../../lib/store/fmSteps.svelte';
  import FmStepsStructure from './FmStepsStructure.svelte';
  import FmStepsSolution from './FmStepsSolution.svelte';
  import FmMatrixView from './FmMatrixView.svelte';
  import FmOptions from './FmOptions.svelte';
  import StepsHeader from '../steps/StepsHeader.svelte';
  import StepFrame from '../steps/StepFrame.svelte';
  import { explainedSteps } from '../../lib/store/explained-steps.svelte';
  import { modelStore } from '../../lib/store';
  import { untrack } from 'svelte';
  import { resolveFlexibility } from '../../lib/actions/fm-fundamental';
  import { openFlexibilityWizard } from '../../lib/actions/step-wizards';

  const r = $derived(fmStepsStore.result);
  let builtAt = $state(-1);
  $effect(() => { void fmStepsStore.result; builtAt = untrack(() => modelStore.modelVersion); });
  const stale = $derived(!!r && builtAt !== modelStore.modelVersion);

  function refresh() {
    if (r?.is3D) { void openFlexibilityWizard(); return; }
    if (!resolveFlexibility({}) && !resolveFlexibility({ releases: null })) void openFlexibilityWizard();
  }
  const last = FM_STEPS;
  /* Opened from the catalog of methods, "back" goes to that list. */
  const fromCatalog = $derived(explainedSteps.returnToCatalog);

  // Closing leaves the model framed as the reader left it (it re-framed it, and
  // so did opening: see step-wizards.ts's showPanel).
  function close() {
    fmStepsStore.close();
  }
  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="wizard" data-testid="fm-wizard">
  <StepsHeader backLabel={fromCatalog ? t('steps.view.back') : t('adv.back')}
    backTitle={fromCatalog ? t('steps.view.backToCatalog') : t('adv.backToList')} onBack={close}
    name={t('steps.catalog.title')} backTestid="fm-back" />

  <StepFrame title={fmStepsStore.showMatrix && r ? t('fm.matrixTitle') : t('steps.m.fm.title')} subtitle={t(r?.is3D ? 'fm.banner3d' : 'fm.banner')}
    step={fmStepsStore.currentStep} {last} onGo={(k) => fmStepsStore.goToStep(k)} showNav={!(fmStepsStore.showMatrix && r)}
    stepTitle={t('fm.step' + fmStepsStore.currentStep + 'Name')} tabTitle={(k) => `${k}. ${t('fm.step' + k + 'Name')}`}
    tabTestid={(k) => `fm-dot-${k}`} headingTestid="fm-step-name" prevTestid="fm-prev" nextTestid="fm-next">
    {#snippet top()}
      <FmOptions />
      {#if stale}
        <div class="fm-stale">
          <span>{t('steps.view.stale')}</span>
          <button onclick={refresh} data-testid="fm-refresh">{t('steps.view.refresh')}</button>
        </div>
      {/if}
    {/snippet}
    {#snippet tabsEnd()}
      <button class="sf-toggle" class:on={fmStepsStore.showMatrix} data-testid="fm-view-matrix" disabled={!r || r.isostatic}
        title={r?.isostatic ? t('fm.matrixNone') : t('fm.matrixTitle')}
        onclick={() => (fmStepsStore.showMatrix = !fmStepsStore.showMatrix)}>
        {fmStepsStore.showMatrix ? t('dsm.stepsBtn') : t('dsm.explorerBtn')}
      </button>
    {/snippet}
    {#if r}
      {#if fmStepsStore.showMatrix}
        <FmMatrixView {r} />
      {:else if fmStepsStore.currentStep <= 4}
        <FmStepsStructure {r} step={fmStepsStore.currentStep} />
      {:else}
        <FmStepsSolution {r} step={fmStepsStore.currentStep} />
      {/if}
    {/if}
  </StepFrame>
</div>

<style>
  .wizard { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--st-text); }
  .fm-stale { display: flex; align-items: center; gap: 0.5rem; margin: 0.3rem 0.75rem; padding: 0.3rem 0.5rem; font-size: 0.74rem; border: 1px solid color-mix(in srgb, var(--st-warn) 60%, transparent); border-radius: var(--st-radius); }
  .fm-stale button { background: transparent; border: 1px solid var(--st-hair-strong); border-radius: 4px; color: var(--st-text-2); font-size: 0.72rem; padding: 0.15rem 0.5rem; cursor: pointer; }
</style>
