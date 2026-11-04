<script lang="ts">
  /**
   * How the bars are cut and their mass taken to the nodes: n segments per
   * member (the model untouched) and lumped, consistent or condensed mass.
   * Shows the first frequencies of that choice beside the engine's with the
   * same cuts, and opens the convergence document.
   */
  import CourseSection from './CourseSection.svelte';
  import NumField from './NumField.svelte';
  import { modelStore } from '../../../lib/store';
  import { courseDynamics } from '../../../lib/store/course-dynamics.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { numText } from '../../../lib/engine/steps/format';
  import { frequenciesOf } from '../../../lib/engine/dynamics/course/convergence';
  import { SystemError } from '../../../lib/engine/dynamics/course/mdof-system';
  import { N_PER_MEMBER_MAX } from '../../../lib/engine/dynamics/course/settings';
  import type { MassModel } from '../../../lib/engine/dynamics/course/mass-model';
  import { engineFrequencies } from '../../../lib/engine/steps/methods/dynamics';
  import { openExplainedMethod } from '../../../lib/actions/step-wizards';

  const s = $derived(courseDynamics.mass);
  const MODELS: MassModel[] = ['lumped', 'consistent', 'guyan'];

  const rows = $derived.by(() => {
    void modelStore.modelVersion;
    const points = modelStore.model.massSource?.points ?? [];
    try {
      const mine = frequenciesOf(modelStore.model, points, { nPerMember: s.nPerMember, massModel: s.massModel, barMass: true }, 4).f;
      const eng = engineFrequencies({ model: modelStore.model }, s.nPerMember, true, 4);
      return { mine, eng, error: null as string | null };
    } catch (e) {
      const key = e instanceof SystemError ? `course.dynamics.mdof.err.${e.code}` : 'course.dynamics.mdof.err.singular';
      return { mine: [] as number[], eng: null, error: tp(key, e instanceof SystemError ? e.params : {}) };
    }
  });
</script>

<CourseSection title={t('course.dynamics.ui.mass.title')} help={t('course.dynamics.ui.mass.help')} testid="dyn-mass"
  summary={`n = ${s.nPerMember} · ${t(`course.dynamics.ui.mass.${s.massModel}`)}`}>
  <div class="cf-grid">
    <NumField label={t('course.dynamics.ui.mass.n')} value={s.nPerMember} min={1} max={N_PER_MEMBER_MAX} step={1}
      onSet={(v) => courseDynamics.set({ mass: { nPerMember: Math.round(v) } })} testid="dyn-mass-n" />
    <label class="cf-field">
      <span>{t('course.dynamics.ui.mass.model')}</span>
      <select value={s.massModel} onchange={(e) => courseDynamics.set({ mass: { massModel: e.currentTarget.value as MassModel } })} data-testid="dyn-mass-model">
        {#each MODELS as m}<option value={m}>{t(`course.dynamics.ui.mass.${m}`)}</option>{/each}
      </select>
    </label>
  </div>
  <p class="cf-hint">{t('course.dynamics.ui.mass.nHint')} {tp('course.dynamics.ui.mass.range', { max: N_PER_MEMBER_MAX })}</p>
  {#if rows.error}
    <p class="cf-err">{rows.error}</p>
  {:else}
    <table class="cf-table" data-testid="dyn-mass-table">
      <thead><tr><th>#</th><th>{t('course.dynamics.ui.mass.colThis')}</th>{#if rows.eng}<th>{t('course.dynamics.ui.mass.colEngine')}</th>{/if}</tr></thead>
      <tbody>
        {#each rows.mine as f, i}
          <tr><td>{i + 1}</td><td>{numText(f, 4)}</td>{#if rows.eng}<td>{rows.eng[i] !== undefined ? numText(rows.eng[i], 4) : '—'}</td>{/if}</tr>
        {/each}
      </tbody>
    </table>
    <p class="cf-caption">{tp('course.dynamics.ui.mass.tableCaption', { n: s.nPerMember })}</p>
    <button class="cf-primary" onclick={() => openExplainedMethod('massDiscretization')} data-testid="dyn-mass-open">{t('course.dynamics.ui.stepByStep')}</button>
  {/if}
</CourseSection>
