<script lang="ts">
  /**
   * What the Dynamic panel's numbers mean: modes, frequency and period,
   * participation and effective mass, and their sum; with the participation
   * factors of the mode on screen, which the panel's line leaves out.
   */
  import CourseSection from './CourseSection.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { numText } from '../../../lib/engine/steps/format';
  import { openExplainedMethod } from '../../../lib/actions/step-wizards';

  type Mode = { omega: number; frequency: number; period: number; participationX: number; participationY: number; effectiveMassX: number; effectiveMassY: number; participationZ?: number; effectiveMassZ?: number };
  let { result, mode, is3D }: { result: { modes: Mode[]; totalMass: number }; mode: number; is3D: boolean } = $props();

  const m = $derived(result.modes[mode]);
  const dirs = $derived(is3D ? (['X', 'Y', 'Z'] as const) : (['X', 'Z'] as const));
  const gamma = (d: string) => (d === 'X' ? m.participationX : d === 'Y' ? (is3D ? m.participationY : 0) : is3D ? (m.participationZ ?? 0) : m.participationY);
  const meff = (d: string) => (d === 'X' ? m.effectiveMassX : d === 'Y' ? (is3D ? m.effectiveMassY : 0) : is3D ? (m.effectiveMassZ ?? 0) : m.effectiveMassY);
</script>

{#if m}
  <CourseSection title={t('course.dynamics.ui.explain.title')} testid="dyn-explain">
    <p class="cf-hint">{t('course.dynamics.ui.explain.mode')}</p>
    <p class="cf-hint">{t('course.dynamics.ui.explain.freq')}</p>
    <p class="cf-hint">{t('course.dynamics.ui.explain.gamma')}</p>
    <table class="cf-table" data-testid="dyn-explain-table">
      <thead><tr><th></th><th>Γ</th><th>M_ef (t)</th><th>%</th></tr></thead>
      <tbody>
        {#each dirs as d}
          <tr><td>{d}</td><td>{numText(gamma(d), 4)}</td><td>{numText(meff(d), 4)}</td><td>{result.totalMass > 0 ? numText((100 * meff(d)) / result.totalMass, 3) : '—'}</td></tr>
        {/each}
      </tbody>
    </table>
    <p class="cf-caption">{tp('course.dynamics.ui.explain.caption', { i: mode + 1 })} ω = {numText(m.omega, 4)} rad/s</p>
    <p class="cf-hint">{t('course.dynamics.ui.explain.sum')}</p>
    <p class="cf-hint">{t('course.dynamics.ui.explain.mass')}</p>
    {#if !is3D}
      <button class="cf-link" onclick={() => openExplainedMethod('mdofModal')} data-testid="dyn-explain-open">{t('course.dynamics.ui.explain.open')}</button>
    {/if}
  </CourseSection>
{/if}
