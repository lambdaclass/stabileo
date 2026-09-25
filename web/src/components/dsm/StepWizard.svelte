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

  let showExplorer = $state(false);

  const is3D = $derived(
    dsmStepsStore.stepData ? dsmStepsStore.stepData.dofNumbering.dofsPerNode > 3 : false
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); dsmStepsStore.nextStep(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); dsmStepsStore.prevStep(); }
    else if (e.key === 'Escape') {
      dsmStepsStore.close();
      setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 100);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="wizard">
  <!--
    "← Back" returns to the list of advanced functions this wizard was opened
    from; "⊞ View matrix" is the short route through the same method.
  -->
  <div class="wizard-header">
    <button class="back-btn" data-testid="dsm-back" title={t('adv.backToList')} onclick={() => {
      dsmStepsStore.close();
      setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 100);
    }}>← {t('adv.back')}</button>
    <span class="wizard-title">{showExplorer ? t('dsm.matrixExplorer') : t('dsm.wizardTitle')}</span>
    <button
      class="explorer-toggle"
      class:active={showExplorer}
      data-testid="dsm-view-matrix"
      onclick={() => { showExplorer = !showExplorer; }}
      title={showExplorer ? t('dsm.backToSteps') : t('dsm.matrixExplorer')}
    >
      {showExplorer ? t('dsm.stepsBtn') : t('dsm.explorerBtn')}
    </button>
  </div>
  {#if dsmStepsStore.stepData && dsmStepsStore.stepData.nullModes.length > 0}
    <!--
      A mechanism the loads do not excite: the equilibrium solution exists and
      is shown, but it is not the only one — say which DOFs are free, rather
      than let a reader take a stable-looking answer for a stable structure.
    -->
    <div class="mode-banner mode-warn" data-testid="dsm-null-modes">
      {t('dsm.nullModes').replace('{dofs}', dsmStepsStore.stepData.nullModes.slice(0, 12).join(', ') + (dsmStepsStore.stepData.nullModes.length > 12 ? '…' : ''))}
    </div>
  {/if}

  {#if showExplorer}
    <!-- Matrix Explorer mode -->
    <div class="step-content">
      {#if dsmStepsStore.stepData}
        <MatrixExplorer data={dsmStepsStore.stepData} editable={dsmStepsStore.quizMode} />
      {/if}
    </div>
  {:else}
    <!-- Step-by-step mode -->
    <div class="step-indicator">
      {#each {length: 9} as _, i}
        {@const step = i + 1}
        <button
          class="step-dot"
          class:active={dsmStepsStore.currentStep === step}
          class:past={dsmStepsStore.currentStep > step}
          onclick={() => dsmStepsStore.goToStep(step)}
          title="{step}. {t('dsm.step' + step + 'Name')}"
        >
          {step}
        </button>
      {/each}
    </div>

    <div class="step-name">
      {t('dsm.step').replace('{n}', String(dsmStepsStore.currentStep)).replace('{name}', t('dsm.step' + dsmStepsStore.currentStep + 'Name'))}
    </div>

    {#if is3D}
      <div class="mode-banner mode-3d">
        {t('dsm.mode3dBanner')}
      </div>
    {:else}
      <div class="mode-banner mode-2d">
        {dsmStepsStore.stepData?.dofNumbering.dofsPerNode === 2 ? t('dsm.mode2dBanner2dof') : t('dsm.mode2dBanner3dof')}
      </div>
    {/if}

    <div class="step-content">
      {#if dsmStepsStore.stepData}
        {#if dsmStepsStore.currentStep === 1}
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
    </div>

    <div class="wizard-footer">
      <button class="nav-btn" disabled={dsmStepsStore.currentStep === 1} onclick={() => dsmStepsStore.prevStep()}>
        {t('dsm.prev')}
      </button>
      <span class="step-counter">{dsmStepsStore.currentStep} / 9</span>
      <button class="nav-btn" disabled={dsmStepsStore.currentStep === 9} onclick={() => dsmStepsStore.nextStep()}>
        {t('dsm.next')}
      </button>
    </div>
  {/if}
</div>

<style>
  .wizard {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--st-bg);
    color: var(--st-text);
  }
  .wizard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-hair);
    flex-shrink: 0;
  }
  .wizard-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--st-value);
  }
  .explorer-toggle {
    margin-left: auto;
    margin-right: 8px;
    padding: 2px 8px;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    background: transparent;
    color: var(--st-text-3);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .explorer-toggle:hover {
    color: var(--st-text);
    border-color: var(--st-interactive);
  }
  .explorer-toggle.active {
    background: rgba(127, 212, 204, 0.15);
    color: var(--st-value);
    border-color: var(--st-interactive);
  }

  .back-btn {
    padding: 2px 8px;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    background: transparent;
    color: var(--st-text-2);
    font-size: 0.66rem;
    cursor: pointer;
    font-family: inherit;
    margin-right: 8px;
    flex: none;
  }
  .back-btn:hover { border-color: var(--st-accent); color: var(--st-accent); }
  .mode-warn { background: color-mix(in srgb, var(--st-warn) 14%, transparent); color: var(--st-warn); font-weight: 500; line-height: 1.4; }
  .close-btn {
    background: none;
    border: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem;
  }
  .close-btn:hover { color: var(--st-accent); }

  .step-indicator {
    display: flex;
    gap: 0.2rem;
    padding: 0.4rem 0.75rem;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-hair);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .step-dot {
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    border: 1.5px solid var(--st-hair);
    background: transparent;
    color: var(--st-text-3);
    font-size: 0.6rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .step-dot.active {
    background: var(--st-value);
    color: var(--st-surface);
    border-color: var(--st-interactive);
    font-weight: 700;
  }
  .step-dot.past {
    border-color: var(--st-interactive);
    color: var(--st-value);
  }
  .step-dot:hover { border-color: var(--st-interactive); color: var(--st-value); }

  .step-name {
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
    color: var(--st-text);
    background: var(--st-bg);
    border-bottom: 1px solid var(--st-hair);
    flex-shrink: 0;
  }

  .step-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.75rem;
  }

  .wizard-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0.75rem;
    background: var(--st-surface);
    border-top: 1px solid var(--st-hair);
    flex-shrink: 0;
  }
  .nav-btn {
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--st-hair);
    background: transparent;
    color: var(--st-text);
    cursor: pointer;
    border-radius: 3px;
    font-size: 0.7rem;
    transition: all 0.15s;
  }
  .nav-btn:hover:not(:disabled) { background: var(--st-surface-2); color: var(--st-value); }
  .nav-btn:disabled { opacity: 0.3; cursor: default; }
  .step-counter { font-size: 0.65rem; color: var(--st-text-3); }

  .mode-banner {
    padding: 0.25rem 0.75rem;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    border-bottom: 1px solid var(--st-hair);
    flex-shrink: 0;
  }
  .mode-3d { background: var(--st-surface-3); color: var(--st-info); }
  .mode-2d { background: var(--st-surface-2); color: var(--st-value); }
</style>
