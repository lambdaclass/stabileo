<script lang="ts">
  /**
   * What the active-set solve of the result on screen did: how many iterations, which one-way
   * members it left out and which supports lifted, and, for a superposed combination, what the sum
   * leaves with the sign it forbids. Absent for a model without one-way behaviour.
   */
  import { t } from '../../lib/i18n';
  import { resultsStore } from '../../lib/store';

  const report = $derived(resultsStore.results3D?.nonlinear);
  const list = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join(', ');
  const say = (key: string, ids: readonly number[]) => t(key).replace('{ids}', list(ids));
</script>

{#if report}
  <div class="nl" class:warn={!report.converged || (report.oscillating?.length ?? 0) > 0
    || (report.signViolations?.members.length ?? 0) + (report.signViolations?.supports.length ?? 0) > 0}
    data-testid="nonlinear-report">
    <span class="title">{t('nonlinear.title')}</span>
    <span>{t(report.converged ? 'nonlinear.converged' : 'nonlinear.notConverged').replace('{n}', String(report.iterations))}</span>
    {#if report.slack.length}<span>{say('nonlinear.slack', report.slack)}</span>{/if}
    {#if report.lifted.length}<span>{say('nonlinear.lifted', report.lifted)}</span>{/if}
    {#if report.oscillating?.length}<span>{say('nonlinear.oscillating', report.oscillating)}</span>{/if}
    {#if report.signViolations?.members.length}<span>{say('nonlinear.violatingMembers', report.signViolations.members)}</span>{/if}
    {#if report.signViolations?.supports.length}<span>{say('nonlinear.violatingSupports', report.signViolations.supports)}</span>{/if}
  </div>
{/if}

<style>
  .nl { display: flex; flex-direction: column; gap: 2px; margin: 4px 0; padding: 5px 7px; border: 1px solid var(--st-hair); border-radius: 4px; font-size: 0.66rem; color: var(--st-text-2); line-height: 1.35; }
  .nl.warn { border-color: var(--st-warn); }
  .title { color: var(--st-text); font-weight: 600; }
</style>
