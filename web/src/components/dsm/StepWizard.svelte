<script lang="ts">
  import { dsmStepsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import Step1DOFNumbering from './Step1DOFNumbering.svelte';
  import Step2LocalMatrices from './Step2LocalMatrices.svelte';
  import Step3Transformation from './Step3Transformation.svelte';
  import Step4Assembly from './Step4Assembly.svelte';
  import Step5LoadVector from './Step5LoadVector.svelte';
  import Step6Partitioning from './Step6Partitioning.svelte';
  import Step7Solution from './Step7Solution.svelte';
  import Step8Reactions from './Step8Reactions.svelte';
  import Step9InternalForces from './Step9InternalForces.svelte';
  import MatrixExplorer from './MatrixExplorer.svelte';

  import StepsHeader from '../steps/StepsHeader.svelte';
  import StepFrame from '../steps/StepFrame.svelte';
  import { explainedSteps } from '../../lib/store/explained-steps.svelte';

  let showExplorer = $state(false);

  const is3D = $derived(
    dsmStepsStore.stepData ? dsmStepsStore.stepData.dofNumbering.dofsPerNode > 3 : false
  );
  const banner = $derived(is3D ? t('dsm.mode3dBanner')
    : dsmStepsStore.stepData?.dofNumbering.dofsPerNode === 2 ? t('dsm.mode2dBanner2dof') : t('dsm.mode2dBanner3dof'));
  /* Opened from the catalog of methods, "back" goes to that list. */
  const fromCatalog = $derived(explainedSteps.returnToCatalog);

  // Closing leaves the model framed as the reader left it (it re-framed it, and
  // so did opening: see step-wizards.ts's showPanel).
  function close() {
    dsmStepsStore.close();
  }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!--
  Laid out in the frame every step-by-step solution uses (StepFrame): the same
  header, title, step tabs, step heading and footer as the explained methods
  and the flexibility wizard. "⊞ View matrix" is the short route through the
  same method.
-->
<div class="wizard">
  <StepsHeader backLabel={fromCatalog ? t('steps.view.back') : t('adv.back')}
    backTitle={fromCatalog ? t('steps.view.backToCatalog') : t('adv.backToList')} onBack={close}
    name={t('steps.catalog.title')} backTestid="dsm-back" />

  <StepFrame title={showExplorer ? t('dsm.matrixExplorer') : t('steps.m.dsm.title')} subtitle={banner}
    step={dsmStepsStore.currentStep} last={9} onGo={(k) => dsmStepsStore.goToStep(k)} showNav={!showExplorer}
    stepTitle={t('dsm.step' + dsmStepsStore.currentStep + 'Name')} tabTitle={(k) => `${k}. ${t('dsm.step' + k + 'Name')}`}
    tabTestid={(k) => `dsm-dot-${k}`} headingTestid="dsm-step-name" prevTestid="dsm-prev" nextTestid="dsm-next">
    {#snippet tabsEnd()}
      <button class="sf-toggle" class:on={showExplorer} data-testid="dsm-view-matrix" onclick={() => { showExplorer = !showExplorer; }}
        title={showExplorer ? t('dsm.backToSteps') : t('dsm.matrixExplorer')}>
        {showExplorer ? t('dsm.stepsBtn') : t('dsm.explorerBtn')}
      </button>
    {/snippet}
    {#snippet top()}
      {#if dsmStepsStore.stepData && dsmStepsStore.stepData.nullModes.length > 0}
        <!--
          A mechanism the loads do not excite: the equilibrium solution exists and
          is shown, but it is not the only one — say which DOFs are free, rather
          than let a reader take a stable-looking answer for a stable structure.
        -->
        <div class="mode-warn" data-testid="dsm-null-modes">
          {t('dsm.nullModes').replace('{dofs}', dsmStepsStore.stepData.nullModes.slice(0, 12).join(', ') + (dsmStepsStore.stepData.nullModes.length > 12 ? '…' : ''))}
        </div>
      {/if}
    {/snippet}
    {#if dsmStepsStore.stepData}
      {#if showExplorer}
        <MatrixExplorer data={dsmStepsStore.stepData} editable={dsmStepsStore.quizMode} />
      {:else if dsmStepsStore.currentStep === 1}
        <Step1DOFNumbering data={dsmStepsStore.stepData} />
      {:else if dsmStepsStore.currentStep === 2}
        <Step2LocalMatrices data={dsmStepsStore.stepData} editable={dsmStepsStore.quizMode} />
      {:else if dsmStepsStore.currentStep === 3}
        <Step3Transformation data={dsmStepsStore.stepData} editable={dsmStepsStore.quizMode} />
      {:else if dsmStepsStore.currentStep === 4}
        <Step4Assembly data={dsmStepsStore.stepData} editable={dsmStepsStore.quizMode} />
      {:else if dsmStepsStore.currentStep === 5}
        <Step5LoadVector data={dsmStepsStore.stepData} />
      {:else if dsmStepsStore.currentStep === 6}
        <Step6Partitioning data={dsmStepsStore.stepData} editable={dsmStepsStore.quizMode} />
      {:else if dsmStepsStore.currentStep === 7}
        <Step7Solution data={dsmStepsStore.stepData} />
      {:else if dsmStepsStore.currentStep === 8}
        <Step8Reactions data={dsmStepsStore.stepData} />
      {:else if dsmStepsStore.currentStep === 9}
        <Step9InternalForces data={dsmStepsStore.stepData} />
      {/if}
    {/if}
  </StepFrame>
</div>

<style>
  .wizard { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--st-text); }
  .mode-warn {
    margin: 0.2rem 0.75rem 0.3rem; padding: 0.35rem 0.55rem; font-size: 0.74rem; line-height: 1.4; flex: none;
    border: 1px solid color-mix(in srgb, var(--st-warn) 60%, transparent); border-radius: var(--st-radius); color: var(--st-warn);
  }
</style>
