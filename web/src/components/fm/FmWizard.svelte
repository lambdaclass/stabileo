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
  import StepsHeader from '../steps/StepsHeader.svelte';
  import StepFrame from '../steps/StepFrame.svelte';
  import { explainedSteps } from '../../lib/store/explained-steps.svelte';

  const r = $derived(fmStepsStore.result);
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
</style>
