<script lang="ts">
  /**
   * The stiffness wizard's one switchable assumption, shown like the explained
   * methods' options: frame members held at their length. Switching it solves
   * the wizard again and keeps the reader on the same step.
   */
  import Prose from '../steps/Prose.svelte';
  import { t } from '../../lib/i18n';
  import { dsmStepsStore, modelStore, uiStore } from '../../lib/store';
  import { solveDetailed } from '../../lib/engine/solver-detailed';

  const data = $derived(dsmStepsStore.stepData);
  const on = $derived(!!data?.rigidStatus && data.rigidStatus !== 'none');
  let help = $state(false);

  function toggle(v: boolean) {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) return;
    const keep = dsmStepsStore.currentStep;
    const keepElem = dsmStepsStore.selectedElemForStep;
    dsmStepsStore.setStepData(solveDetailed(input, { axialRigid: v }));
    dsmStepsStore.goToStep(keep);
    if (keepElem !== null) dsmStepsStore.selectElement(keepElem);
  }
</script>

<div class="dao" data-testid="dsm-options">
  <div class="dao-row">
    <label>
      <input type="checkbox" checked={on} onchange={(e) => toggle(e.currentTarget.checked)} data-testid="dsm-opt-rigid" />
      {t('course.kinematics.dsm.rigid.label')}
    </label>
    <button class="dao-help" class:on={help} onclick={() => (help = !help)} aria-expanded={help}
      title={t('steps.catalog.help')} data-testid="dsm-opt-rigid-help">?</button>
  </div>
  {#if help}<p class="dao-text"><Prose text={t('course.kinematics.dsm.rigid.help')} /></p>{/if}
  {#if data?.rigidStatus === 'mechanism' || data?.rigidStatus === 'imposed'}
    <p class="dao-warn" data-testid="dsm-opt-rigid-warn">{t(data.rigidStatus === 'mechanism' ? 'course.kinematics.dsm.rigid.mechanism' : 'course.kinematics.req.imposedRigid')}</p>
  {/if}
</div>

<style>
  .dao { margin: 0.2rem 0.75rem 0.3rem; padding: 0.3rem 0.5rem; border: 1px solid var(--st-hair); border-radius: var(--st-radius); flex: none; }
  .dao-row { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
  .dao-row label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.76rem; color: var(--st-text); cursor: pointer; }
  .dao-help {
    width: 20px; height: 20px; flex: none; border-radius: 50%; cursor: pointer; font-size: 0.68rem; font-weight: 700;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2);
  }
  .dao-help.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .dao-text { margin: 0.25rem 0 0.1rem; font-size: 0.74rem; line-height: 1.45; color: var(--st-text-2); }
  .dao-warn { margin: 0.25rem 0 0.1rem; font-size: 0.74rem; line-height: 1.4; color: var(--st-warn); }
  @media (pointer: coarse) { .dao-help { width: 28px; height: 28px; } .dao-row label { min-height: 32px; } }
</style>
