<script lang="ts">
  /**
   * The direct analysis method, run and read: its settings, a row per combination saying where the
   * notional loads went, the drift ratio, how many members took τb below one, and whether a
   * second-order equilibrium exists. The member check reads these forces with K = 1.
   */
  import { t, tp } from '../../lib/i18n';
  import { modelStore } from '../../lib/store';
  import { directAnalysis } from '../../lib/store/direct-analysis.svelte';

  const rows = $derived(directAnalysis.result ? [...directAnalysis.result.info.values()] : []);
  const comboName = (id: number) => modelStore.model.combinations.find((c) => c.id === id)?.name ?? `#${id}`;
  const unstable = $derived(rows.filter((r) => !r.stable).length);
</script>

<div class="da" data-testid="direct-analysis">
  <p class="pk-hint">{t('direct.note')}</p>
  <div class="pk-row da-settings">
    <label>{t('direct.notional')}
      <input type="number" min="0" max="0.01" step="0.001" bind:value={directAnalysis.settings.notional} data-testid="direct-notional" />
    </label>
    <label>{t('direct.tauB')}
      <select bind:value={directAnalysis.settings.tauB} data-testid="direct-taub">
        <option value="iterate">{t('direct.tauB.iterate')}</option>
        <option value="unity">{t('direct.tauB.unity')}</option>
      </select>
    </label>
    <button class="pk-btn" disabled={directAnalysis.running} onclick={() => directAnalysis.run()} data-testid="direct-run">
      {directAnalysis.running ? t('direct.running') : t('direct.run')}
    </button>
  </div>
  {#if directAnalysis.error}
    <p class="pk-warn" data-testid="direct-error">{directAnalysis.error === 'noCombinations' ? t('direct.noCombinations') : directAnalysis.error}</p>
  {/if}
  {#if directAnalysis.result}
    {#if !directAnalysis.fresh}<p class="pk-warn" data-testid="direct-stale">{t('direct.stale')}</p>{/if}
    {#if unstable > 0}<p class="pk-warn" data-testid="direct-unstable">{tp('direct.unstable', { n: unstable })}</p>{/if}
    <table class="da-table" data-testid="direct-table">
      <thead><tr><th>{t('direct.col.combo')}</th><th>{t('direct.col.notional')}</th><th class="num">Δ₂/Δ₁</th><th class="num">τb &lt; 1</th><th>{t('direct.col.state')}</th></tr></thead>
      <tbody>
        {#each rows as r (r.comboId)}
          <tr class:bad={!r.stable}>
            <td>{comboName(r.comboId)}</td>
            <td>{t(`direct.dir.${r.notional}`)}</td>
            <td class="num">{Number.isFinite(r.b2) ? r.b2.toFixed(3) : '∞'}</td>
            <td class="num">{r.tauB.size}</td>
            <td>{!r.stable ? t('direct.state.unstable') : r.converged ? t('direct.state.ok') : t('direct.state.notConverged')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .da { display: flex; flex-direction: column; gap: 6px; }
  .da-settings label { display: flex; align-items: center; gap: 4px; font-size: 0.66rem; color: var(--st-text-2); }
  .da-settings input { width: 4.5rem; }
  .da-table { border-collapse: collapse; font-size: 0.64rem; width: 100%; }
  .da-table th { text-align: left; color: var(--st-text-3); font-weight: normal; padding: 2px 4px; }
  .da-table td { padding: 2px 4px; border-top: 1px solid var(--st-hair); color: var(--st-text); }
  .da-table .num { text-align: right; font-family: var(--st-mono, monospace); }
  .da-table tr.bad td { color: var(--st-danger); }
</style>
