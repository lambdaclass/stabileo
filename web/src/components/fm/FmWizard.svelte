<script lang="ts">
  /**
   * "Paso a paso — Mét. Flexibilidades": the force method in nine steps.
   *
   * Laid out like the stiffness wizard beside it — the same header, the same
   * numbered dots, the same footer and arrow keys — so a reader moving between
   * the two methods only has to learn the method, not the panel. An isostatic
   * structure has no redundants, so it stops at Step 1 and says why.
   */
  import { t } from '../../lib/i18n';
  import { fmStepsStore, FM_STEPS } from '../../lib/store/fmSteps.svelte';
  import FmStepsStructure from './FmStepsStructure.svelte';
  import FmStepsSolution from './FmStepsSolution.svelte';
  import FmMatrixView from './FmMatrixView.svelte';

  const r = $derived(fmStepsStore.result);
  /* Every structure walks all nine steps; an isostatic one is told at each what GH = 0 means there. */
  const last = FM_STEPS;

  function close() {
    fmStepsStore.close();
    setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 100);
  }

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (fmStepsStore.showMatrix) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (fmStepsStore.currentStep < last) fmStepsStore.nextStep();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); fmStepsStore.prevStep();
    } else if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="wizard" data-testid="fm-wizard">
  <div class="wizard-header">
    <button class="back-btn" data-testid="fm-back" title={t('adv.backToList')} onclick={close}>← {t('adv.back')}</button>
    <span class="wizard-title">{fmStepsStore.showMatrix ? t('fm.matrixTitle') : t('fm.wizardTitle')}</span>
    <button class="explorer-toggle" class:active={fmStepsStore.showMatrix} data-testid="fm-view-matrix"
      disabled={!r || r.isostatic}
      title={r?.isostatic ? t('fm.matrixNone') : t('fm.matrixTitle')}
      onclick={() => (fmStepsStore.showMatrix = !fmStepsStore.showMatrix)}>
      {fmStepsStore.showMatrix ? t('dsm.stepsBtn') : t('dsm.explorerBtn')}
    </button>
  </div>

  {#if fmStepsStore.showMatrix && r}
    <div class="step-content"><FmMatrixView {r} /></div>
  {:else}
  <div class="step-indicator">
    {#each { length: FM_STEPS } as _, k}
      {@const step = k + 1}
      <button class="step-dot" class:active={fmStepsStore.currentStep === step}
        class:past={fmStepsStore.currentStep > step} disabled={step > last}
        onclick={() => fmStepsStore.goToStep(step)} title="{step}. {t('fm.step' + step + 'Name')}"
        data-testid="fm-dot-{step}">{step}</button>
    {/each}
  </div>

  <div class="step-name" data-testid="fm-step-name">
    {t('dsm.step').replace('{n}', String(fmStepsStore.currentStep)).replace('{name}', t('fm.step' + fmStepsStore.currentStep + 'Name'))}
  </div>
  <div class="mode-banner">{t(r?.is3D ? 'fm.banner3d' : 'fm.banner')}</div>

  <div class="step-content">
    {#if r}
      {#if fmStepsStore.currentStep <= 4}
        <FmStepsStructure {r} step={fmStepsStore.currentStep} />
      {:else}
        <FmStepsSolution {r} step={fmStepsStore.currentStep} />
      {/if}
    {/if}
  </div>

  <div class="wizard-footer">
    <button class="nav-btn" disabled={fmStepsStore.currentStep === 1} onclick={() => fmStepsStore.prevStep()}
      data-testid="fm-prev">{t('dsm.prev')}</button>
    <span class="step-counter">{fmStepsStore.currentStep} / {last}</span>
    <button class="nav-btn" disabled={fmStepsStore.currentStep >= last} onclick={() => fmStepsStore.nextStep()}
      data-testid="fm-next">{t('dsm.next')}</button>
  </div>
  {/if}
</div>

<style>
  .wizard { display: flex; flex-direction: column; height: 100%; background: var(--st-bg); color: var(--st-text); }
  .wizard-header {
    display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem;
    background: var(--st-surface); border-bottom: 1px solid var(--st-hair); flex-shrink: 0;
  }
  .wizard-title { font-size: 0.85rem; font-weight: 600; color: var(--st-value); }
  .back-btn {
    padding: 2px 8px; border: 1px solid var(--st-hair); border-radius: 4px; background: transparent;
    color: var(--st-text-2); font-size: 0.66rem; cursor: pointer; font-family: inherit; margin-right: 8px; flex: none;
  }
  .back-btn:hover { border-color: var(--st-accent); color: var(--st-accent); }
  .explorer-toggle {
    margin-left: auto; padding: 2px 8px; border: 1px solid var(--st-hair); border-radius: 4px;
    background: transparent; color: var(--st-text-3); font-size: 0.7rem; cursor: pointer; font-family: inherit;
  }
  .explorer-toggle:hover:not(:disabled) { color: var(--st-text); border-color: var(--st-interactive); }
  .explorer-toggle.active { color: var(--st-value); border-color: var(--st-interactive); }
  .explorer-toggle:disabled { opacity: 0.35; cursor: default; }
  .step-indicator {
    display: flex; gap: 0.2rem; padding: 0.4rem 0.75rem; background: var(--st-surface);
    border-bottom: 1px solid var(--st-hair); flex-shrink: 0; flex-wrap: wrap;
  }
  .step-dot {
    width: 1.6rem; height: 1.6rem; border-radius: 50%; border: 1.5px solid var(--st-hair); background: transparent;
    color: var(--st-text-3); font-size: 0.6rem; cursor: pointer; display: flex; align-items: center;
    justify-content: center; transition: all 0.15s;
  }
  .step-dot:disabled { opacity: 0.3; cursor: default; }
  .step-dot.active { background: var(--st-value); color: var(--st-surface); border-color: var(--st-interactive); font-weight: 700; }
  .step-dot.past { border-color: var(--st-interactive); color: var(--st-value); }
  .step-dot:hover:not(:disabled) { border-color: var(--st-interactive); color: var(--st-value); }
  .step-name {
    padding: 0.35rem 0.75rem; font-size: 0.75rem; color: var(--st-text); background: var(--st-bg);
    border-bottom: 1px solid var(--st-hair); flex-shrink: 0;
  }
  .mode-banner {
    padding: 0.25rem 0.75rem; font-size: 0.6rem; font-weight: 600; letter-spacing: 0.02em;
    border-bottom: 1px solid var(--st-hair); flex-shrink: 0; background: var(--st-surface-2); color: var(--st-value);
  }
  .step-content { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0.75rem; }
  .wizard-footer {
    display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.75rem;
    background: var(--st-surface); border-top: 1px solid var(--st-hair); flex-shrink: 0;
  }
  .nav-btn {
    padding: 0.3rem 0.8rem; border: 1px solid var(--st-hair); background: transparent; color: var(--st-text);
    cursor: pointer; border-radius: 3px; font-size: 0.7rem; transition: all 0.15s;
  }
  .nav-btn:hover:not(:disabled) { background: var(--st-surface-2); color: var(--st-value); }
  .nav-btn:disabled { opacity: 0.3; cursor: default; }
  .step-counter { font-size: 0.65rem; color: var(--st-text-3); }
</style>
