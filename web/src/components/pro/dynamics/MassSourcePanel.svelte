<script lang="ts">
  /**
   * The mass source: which load cases are mass for the dynamic analyses, and by how much.
   *
   * Three states, and the table always says which one it is in:
   *   · nothing stated — self-weight alone, what the analyses always did;
   *   · a code's rule, from the registry in `mass-presets.ts`, with its parameters and clause.
   *     The factors are derived from the load cases, so they follow them;
   *   · a table the user wrote. It can start from a code's factors and be edited case by case.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { resolveMassFactors, type MassSource, type MassSourceReport } from '../../../lib/engine/dynamics/mass-source';
  import { MASS_PRESETS, massPresetById, presetParams, type MassPresetParamValue } from '../../../lib/engine/dynamics/mass-presets';

  let { report = null }: { report?: MassSourceReport | null } = $props();

  const source = $derived(modelStore.model.massSource);
  const rows = $derived(resolveMassFactors(modelStore.model.loadCases, source));
  const preset = $derived(source?.kind === 'preset' ? massPresetById(source.presetId) : undefined);
  const params = $derived(preset && source?.kind === 'preset' ? presetParams(preset, source.params) : {});
  /** `none`, `custom`, or a preset id — what the selector shows. */
  const mode = $derived(!source ? 'none' : source.kind === 'custom' ? 'custom' : source.presetId);

  const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

  let error = $state<string | null>(null);

  function setMode(next: string) {
    error = null;
    if (next === 'none') { modelStore.setMassSource(null); return; }
    if (next === 'custom') {
      // Start from what is on screen, so switching loses nothing the user was looking at.
      modelStore.setMassSource({ kind: 'custom', factors: rows.map((r) => ({ caseId: r.caseId, factor: r.factor })) });
      return;
    }
    const p = massPresetById(next);
    if (p) modelStore.setMassSource({ kind: 'preset', presetId: p.id, params: presetParams(p) });
  }

  function setParam(key: string, value: MassPresetParamValue) {
    if (source?.kind !== 'preset') return;
    modelStore.setMassSource({ kind: 'preset', presetId: source.presetId, params: { ...params, [key]: value } } satisfies MassSource);
  }

  function setFactor(caseId: number, raw: string) {
    error = null;
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) {
      error = t('pro.massSource.badFactor');
      return;
    }
    modelStore.setMassSource({
      kind: 'custom',
      factors: rows.map((r) => ({ caseId: r.caseId, factor: r.caseId === caseId ? v : r.factor })),
    });
  }
</script>

<div class="ms" data-testid="mass-source">
  <div class="ms-head">
    <span class="ms-title">{t('pro.massSource.title')}</span>
    <select class="ms-sel" value={mode} onchange={(e) => setMode((e.target as HTMLSelectElement).value)} data-testid="mass-source-mode">
      <option value="none">{t('pro.massSource.mode.none')}</option>
      {#each MASS_PRESETS as p (p.id)}<option value={p.id}>{t(p.labelKey)}</option>{/each}
      <option value="custom">{t('pro.massSource.mode.custom')}</option>
      {#if source?.kind === 'preset' && !preset}<option value={source.presetId}>{source.presetId}</option>{/if}
    </select>
  </div>
  <div class="ms-hint">{t('pro.massSource.selfWeight')}</div>

  {#if preset}
    <div class="ms-params">
      {#each preset.params as p (p.key)}
        {#if p.kind === 'enum'}
          <label class="ms-label">{t(p.labelKey)}:
            <select class="ms-sel" value={String(params[p.key])} onchange={(e) => setParam(p.key, (e.target as HTMLSelectElement).value)}>
              {#each p.options as o (o.value)}<option value={o.value}>{t(o.labelKey)}</option>{/each}
            </select>
          </label>
        {:else}
          <label class="ms-label">
            <input type="checkbox" checked={params[p.key] === true} onchange={(e) => setParam(p.key, (e.target as HTMLInputElement).checked)} />
            {t(p.labelKey)}
          </label>
        {/if}
      {/each}
    </div>
    <div class="ms-hint">{preset.clause}</div>
  {:else if source?.kind === 'preset'}
    <div class="ms-warn">{tp('pro.massSource.unknownPreset', { id: source.presetId })}</div>
  {/if}

  {#if source}
    <table class="ms-table">
      <thead><tr><th>{t('pro.massSource.case')}</th><th>{t('pro.massSource.factor')}</th><th>{t('pro.massSource.basis')}</th></tr></thead>
      <tbody>
        {#each rows as r (r.caseId)}
          <tr>
            <td>{r.name} <span class="ms-type">{r.type}</span></td>
            <td>
              {#if source.kind === 'custom'}
                <input
                  type="number" class="ms-num" min="0" step="0.05" value={r.factor}
                  onchange={(e) => setFactor(r.caseId, (e.target as HTMLInputElement).value)}
                  data-testid="mass-factor-{r.caseId}"
                />
              {:else}
                <span class="ms-val" data-testid="mass-factor-{r.caseId}">{fmt(r.factor, 2)}</span>
              {/if}
            </td>
            <td class="ms-basis" class:unlisted={r.basis === 'unlisted'}>{t(`pro.massSource.basis.${r.basis}`)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if source.kind === 'preset' && preset}
      <button class="ms-link" onclick={() => setMode('custom')}>{t('pro.massSource.customize')}</button>
    {/if}
  {/if}
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
  .ms-sel {
    padding: 3px 5px; font-size: 0.66rem; background: var(--st-surface);
    border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text-2); cursor: pointer; max-width: 100%;
  }
  .ms-params { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .ms-label { font-size: 0.66rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; }
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
  .ms-val { font-family: monospace; }
  .ms-basis { font-size: 0.6rem; color: var(--st-text-3); }
  .ms-basis.unlisted { color: var(--st-warn); }
  .ms-link {
    align-self: flex-start; padding: 2px 6px; font-size: 0.62rem; color: var(--st-interactive);
    background: transparent; border: 1px solid var(--st-surface-3); border-radius: 3px; cursor: pointer;
  }
  .ms-summary { font-size: 0.68rem; color: var(--st-text-2); font-family: monospace; }
  .ms-warn { font-size: 0.62rem; color: var(--st-warn); }
  .ms-error { font-size: 0.62rem; color: var(--st-danger); }
</style>
