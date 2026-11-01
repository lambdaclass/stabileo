<script lang="ts">
  /**
   * The model as an n degree of freedom system: bar model or shear building,
   * free vibration from the static deflection or the loads times sin Ωt; its
   * first modes and the response rebuilt mode by mode, against the direct
   * integration. The full derivation is the explained document.
   */
  import CourseSection from './CourseSection.svelte';
  import NumField from './NumField.svelte';
  import StepPlot from '../../steps/StepPlot.svelte';
  import { modelStore } from '../../../lib/store';
  import { courseDynamics } from '../../../lib/store/course-dynamics.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { numText } from '../../../lib/engine/steps/format';
  import { resolveMdof } from '../../../lib/engine/steps/dynamics/mdof-build';
  import { superpositionPlotOf } from '../../../lib/engine/steps/dynamics/mdof-doc';
  import { dofText } from '../../../lib/engine/dynamics/course/mdof-system';
  import { dynamicsSettings } from '../../../lib/engine/dynamics/course/settings';
  import { openExplainedMethod } from '../../../lib/actions/step-wizards';

  const s = $derived(courseDynamics.mdof);
  const c = $derived.by(() => {
    void modelStore.modelVersion; void courseDynamics.mdof; void courseDynamics.mass;
    try { return resolveMdof({ model: modelStore.model }, dynamicsSettings()); } catch { return { refusal: 'mdof.err.singular' }; }
  });
  const ok = $derived('refusal' in c ? null : c);
  const src = $derived(t(s.source === 'shear' ? 'course.dynamics.ui.mdof.shear' : 'course.dynamics.ui.mdof.model'));
  const summary = $derived(ok ? tp('course.dynamics.ui.mdof.summary', { src, n: ok.dofs.length }) : src);
</script>

<CourseSection title={t('course.dynamics.ui.mdof.title')} {summary} help={t('course.dynamics.ui.mdof.help')} testid="dyn-mdof">
  <span class="cf-lbl">{t('course.dynamics.ui.mdof.source')}</span>
  <div class="cf-seg" role="group">
    <button class:on={s.source === 'model'} onclick={() => courseDynamics.set({ mdof: { source: 'model' } })} data-testid="dyn-mdof-model">{t('course.dynamics.ui.mdof.model')}</button>
    <button class:on={s.source === 'shear'} onclick={() => courseDynamics.set({ mdof: { source: 'shear' } })} data-testid="dyn-mdof-shear">{t('course.dynamics.ui.mdof.shear')}</button>
  </div>
  <span class="cf-lbl">{t('course.dynamics.ui.mdof.excitation')}</span>
  <div class="cf-seg" role="group">
    <button class:on={s.excitation === 'free'} onclick={() => courseDynamics.set({ mdof: { excitation: 'free' } })} data-testid="dyn-mdof-free">{t('course.dynamics.ui.mdof.free')}</button>
    <button class:on={s.excitation === 'harmonic'} onclick={() => courseDynamics.set({ mdof: { excitation: 'harmonic' } })} data-testid="dyn-mdof-harmonic">{t('course.dynamics.ui.mdof.harmonic')}</button>
  </div>
  <p class="cf-hint">{t(s.excitation === 'free' ? 'course.dynamics.ui.mdof.freeHint' : 'course.dynamics.ui.mdof.harmonicHint')}</p>
  <div class="cf-grid">
    <NumField label="ξ (%)" value={s.xi} scale={100} min={0} max={99} onSet={(v) => courseDynamics.set({ mdof: { xi: v } })} testid="dyn-mdof-xi" />
    {#if s.excitation === 'harmonic'}
      <NumField label="Ω/ω₁" value={s.ratio} min={0} onSet={(v) => courseDynamics.set({ mdof: { ratio: v } })} testid="dyn-mdof-ratio" />
    {/if}
  </div>
  <label class="cf-check"><input type="checkbox" checked={s.barMass} onchange={(e) => courseDynamics.set({ mdof: { barMass: e.currentTarget.checked } })} /> {t('course.dynamics.ui.mdof.barMass')}</label>

  {#if ok}
    <table class="cf-table" data-testid="dyn-mdof-modes">
      <thead><tr><th>#</th><th>f (Hz)</th><th>T (s)</th><th>M_ef X</th></tr></thead>
      <tbody>
        {#each ok.sol.modes.slice(0, 4) as m, i}
          <tr><td>{i + 1}</td><td>{numText(m.f, 4)}</td><td>{numText(m.T, 4)}</td><td>{ok.sol.totalMassX > 0 ? `${numText((100 * m.meffX) / ok.sol.totalMassX, 3)} %` : '—'}</td></tr>
        {/each}
      </tbody>
    </table>
    <p class="cf-caption">{t('course.dynamics.ui.mdof.modesCaption')}</p>
    <div class="cf-plot"><StepPlot plot={superpositionPlotOf(ok, dofText(ok.dofs[ok.at]), 3)} /></div>
    <p class="cf-caption">{tp('course.dynamics.ui.mdof.plotCaption', { dof: dofText(ok.dofs[ok.at]) })}</p>
    <button class="cf-primary" onclick={() => openExplainedMethod('mdofModal')} data-testid="dyn-mdof-open">{t('course.dynamics.ui.stepByStep')}</button>
  {:else if 'refusal' in c}
    <p class="cf-err" data-testid="dyn-mdof-error">{tp(`course.dynamics.${c.refusal}`, (c as { params?: Record<string, number> }).params ?? {})}</p>
  {/if}
</CourseSection>

<style>
  .cf-lbl { color: var(--st-text-3); font-size: 0.64rem; margin-bottom: -3px; }
</style>
