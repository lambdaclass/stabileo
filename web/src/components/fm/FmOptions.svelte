<script lang="ts">
  /**
   * The method's assumptions over the steps, as the explained methods show
   * theirs: the axial term, switchable, with what it changes; and which
   * fundamental is in use, with a way to change it in Step 2.
   */
  import { t } from '../../lib/i18n';
  import { fmStepsStore } from '../../lib/store';
  import { fmChoice } from '../../lib/store/fm-choice.svelte';
  import { resolveFlexibility } from '../../lib/actions/fm-fundamental';
  import Prose from '../steps/Prose.svelte';

  let help = $state(false);
  const r = $derived(fmStepsStore.result);
</script>

{#if r && !r.is3D}
  <div class="fo" data-testid="fm-options">
    <div class="fo-row">
      <label>
        <input type="checkbox" checked={r.axial !== false} data-testid="fm-opt-axial"
          onchange={(e) => resolveFlexibility({ axial: e.currentTarget.checked })} />
        {t('course.statics.fm.axial.label')}
      </label>
      <button class="fo-help" class:on={help} onclick={() => (help = !help)} aria-expanded={help}
        title={t('steps.catalog.help')} data-testid="fm-opt-axial-help">?</button>
    </div>
    {#if help}<p class="fo-text"><Prose text={t('course.statics.fm.axial.help')} /></p>{/if}
    {#if !r.isostatic}
      <div class="fo-row fo-fund">
        <span>{t(r.choice === 'manual' ? 'course.statics.fm.fund.summaryMine' : 'course.statics.fm.fund.summaryAuto')}</span>
        {#if fmStepsStore.currentStep !== 2}
          <button class="fo-link" data-testid="fm-change-fundamental"
            onclick={() => { fmChoice.setMode('manual'); fmStepsStore.goToStep(2); }}>{t('course.statics.fm.fund.change')}</button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .fo { margin: 0.2rem 0.75rem 0.3rem; padding: 0.3rem 0.5rem; border: 1px solid var(--st-hair); border-radius: var(--st-radius); flex: none; }
  .fo-row { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
  .fo-row label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.76rem; color: var(--st-text); cursor: pointer; }
  .fo-fund { font-size: 0.7rem; color: var(--st-text-2); margin-top: 2px; }
  .fo-help {
    width: 20px; height: 20px; flex: none; border-radius: 50%; cursor: pointer; font-size: 0.68rem; font-weight: 700;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2);
  }
  .fo-help.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .fo-text { margin: 0.25rem 0 0.1rem; font-size: 0.74rem; line-height: 1.45; color: var(--st-text-2); }
  .fo-link { background: none; border: none; padding: 0; color: var(--st-accent); font-size: 0.7rem; cursor: pointer; text-decoration: underline; font-family: inherit; }
  @media (pointer: coarse) { .fo-help { width: 28px; height: 28px; } .fo-row label { min-height: 32px; } }
</style>
