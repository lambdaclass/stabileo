<script module lang="ts">
  export { centreLevels } from '../../lib/store/level-centres';
</script>

<script lang="ts">
  /** Each level's weight, centre of mass, centre of rigidity and the eccentricity between them (`store/level-centres.ts`). */
  import Hint from './Hint.svelte';
  import { t } from '../../lib/i18n';
  import { modelStore } from '../../lib/store';
  import { modelLevelCentres } from '../../lib/store/level-centres';

  const centres = $derived.by(() => { void modelStore.modelVersion; void modelStore.model.loads; void modelStore.model.groups; return modelLevelCentres(); });
  const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
</script>

<div class="lc" data-testid="level-centres">
  <Hint text={t('centres.hint')} />
  {#if centres.length === 0}
    <p class="lc-note" data-testid="level-centres-none">{t('centres.none')}</p>
  {:else}
    <table>
      <thead><tr><th>{t('centres.level')}</th><th>{t('centres.weight')}</th><th>CM x · y</th><th>CR x · y</th><th>ex · ey</th></tr></thead>
      <tbody>
        {#each centres as c (c.levelId)}
          <tr data-testid="level-centres-row-{c.name}">
            <td>{c.name}</td><td class="num">{f(c.weight, 0)} kN</td>
            <td class="num">{c.cm ? `${f(c.cm.x)} · ${f(c.cm.y)}` : '—'}</td>
            <td class="num">{c.cr ? `${f(c.cr.x)} · ${f(c.cr.y)}` : '—'}</td>
            <td class="num">{f(c.ex)} · {f(c.ey)} m</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .lc { padding: 4px 0; overflow-x: auto; }
  .lc-note { margin: 0; font-size: 0.72rem; color: var(--st-text-2); }
  table { border-collapse: collapse; font-size: 0.72rem; width: 100%; }
  th { text-align: left; font-weight: 500; color: var(--st-text-2); padding: 2px 6px; }
  td { padding: 2px 6px; border-top: 1px solid var(--st-hair); color: var(--st-text); }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
