<script lang="ts">
  /**
   * The mass source: which load cases are mass for the dynamic analyses, and by how much.
   *
   * Every row shows where its factor came from. A default is the code's value for that case
   * type and says so; editing any factor states the whole table, so what the project records is
   * the table the user saw, not a mix of stated and implied values.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { resolveMassFactors, type MassSourceReport } from '../../../lib/engine/dynamics/mass-source';

  let { report = null }: { report?: MassSourceReport | null } = $props();

  const rows = $derived(resolveMassFactors(modelStore.model.loadCases, modelStore.model.massSource));
  const stated = $derived(!!modelStore.model.massSource);

  const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

  let error = $state<string | null>(null);

  function setFactor(caseId: number, raw: string) {
    error = null;
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) {
      error = t('pro.massSource.badFactor');
      return;
    }
    modelStore.setMassSource({
      factors: rows.map((r) => ({ caseId: r.caseId, factor: r.caseId === caseId ? v : r.factor })),
    });
  }
</script>

<div class="ms" data-testid="mass-source">
  <div class="ms-head">
    <span class="ms-title">{t('pro.massSource.title')}</span>
    {#if stated}
      <button class="ms-reset" onclick={() => modelStore.setMassSource(null)} data-testid="mass-source-reset">
        {t('pro.massSource.useDefaults')}
      </button>
    {/if}
  </div>
  <div class="ms-hint">{t('pro.massSource.selfWeight')}</div>
  <table class="ms-table">
    <thead><tr><th>{t('pro.massSource.case')}</th><th>{t('pro.massSource.factor')}</th><th>{t('pro.massSource.basis')}</th></tr></thead>
    <tbody>
      {#each rows as r (r.caseId)}
        <tr>
          <td>{r.name} <span class="ms-type">{r.type}</span></td>
          <td>
            <input
              type="number" class="ms-num" min="0" step="0.05" value={r.factor}
              onchange={(e) => setFactor(r.caseId, (e.target as HTMLInputElement).value)}
              data-testid="mass-factor-{r.caseId}"
            />
          </td>
          <td class="ms-basis" class:assumed={r.basis === 'codeDefault'}>{t(`pro.massSource.basis.${r.basis}`)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if error}<div class="ms-error" role="alert">{error}</div>{/if}
  {#if report}
    <div class="ms-summary" data-testid="mass-source-summary">
      {tp('pro.massSource.summary', {
        self: fmt(report.selfWeightT),
        added: fmt(report.totalT - report.selfWeightT),
        total: fmt(report.totalT),
      })}
    </div>
    {#if report.excludedNodalKN > 0}
      <div class="ms-warn" data-testid="mass-source-excluded">{tp('pro.massSource.excludedNodal', { kn: fmt(report.excludedNodalKN) })}</div>
    {/if}
    {#if report.excludedUpwardKN > 0}
      <div class="ms-warn">{tp('pro.massSource.excludedUpward', { kn: fmt(report.excludedUpwardKN) })}</div>
    {/if}
  {/if}
</div>

<style>
  .ms { display: flex; flex-direction: column; gap: 4px; }
  .ms-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .ms-title { font-size: 0.68rem; font-weight: 600; color: var(--st-text-2); }
  .ms-reset {
    padding: 2px 6px; font-size: 0.62rem; color: var(--st-text-3);
    background: transparent; border: 1px solid var(--st-surface-3); border-radius: 3px; cursor: pointer;
  }
  .ms-hint { font-size: 0.6rem; color: var(--st-text-3); font-style: italic; }
  .ms-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
  .ms-table th {
    padding: 3px 5px; text-align: left; font-size: 0.6rem; font-weight: 600; color: var(--st-text-3);
    text-transform: uppercase; background: var(--st-surface); border-bottom: 1px solid var(--st-surface-3);
  }
  .ms-table td { padding: 3px 5px; border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .ms-type { color: var(--st-text-3); font-family: monospace; font-size: 0.6rem; }
  .ms-num {
    width: 55px; padding: 3px 5px; font-size: 0.68rem; background: var(--st-surface);
    border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text-2); text-align: right;
  }
  .ms-basis { font-size: 0.6rem; color: var(--st-text-3); }
  .ms-basis.assumed { color: var(--st-warn); }
  .ms-summary { font-size: 0.68rem; color: var(--st-text-2); font-family: monospace; }
  .ms-warn { font-size: 0.62rem; color: var(--st-warn); }
  .ms-error { font-size: 0.62rem; color: var(--st-danger); }
</style>
