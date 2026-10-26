<script lang="ts">
  /**
   * Each level's weight, centre of mass, centre of rigidity and the eccentricity between them; and
   * each storey's stability index Q, whether it sways (§6.6.4.3) and the δs its slender columns
   * take (§6.6.4.6).
   */
  import { t } from '../../../lib/i18n';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { resultsStore } from '../../../lib/store';
  import { modelStoreyStability } from '../../../lib/store/storey-sway';
  import type { LevelCentres } from '../../../lib/engine/building/level-centres';
  let { centres }: { centres: LevelCentres[] } = $props();
  const storeys = $derived.by(() => {
    void resultsStore.perCombo3D;
    const cols = [...verificationStore.contexts.values()].filter((c) => c.elementType === 'column').map((c) => c.elementId);
    return cols.length && resultsStore.hasCombinations3D ? modelStoreyStability(cols) : [];
  });
  const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
</script>

<div class="dl" data-testid="desk-levels">
  <p class="dl-hint">{t('desk.centresHint')}</p>
  <table>
    <thead><tr><th>{t('desk.level')}</th><th>{t('desk.weight')}</th><th>CM x · y</th><th>CR x · y</th><th>ex · ey</th></tr></thead>
    <tbody>
      {#each centres as c (c.levelId)}
        <tr data-testid="desk-level-row-{c.name}">
          <td>{c.name}</td><td class="num">{f(c.weight, 0)} kN</td>
          <td class="num">{c.cm ? `${f(c.cm.x)} · ${f(c.cm.y)}` : '—'}</td>
          <td class="num">{c.cr ? `${f(c.cr.x)} · ${f(c.cr.y)}` : '—'}</td>
          <td class="num">{f(c.ex)} · {f(c.ey)} m</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if storeys.length}
    <h5 class="dl-h">{t('desk.stability')}</h5>
    <p class="dl-hint">{t('desk.stabilityHint')}</p>
    <table data-testid="desk-storeys">
      <thead><tr><th>{t('desk.storey')}</th><th>Q</th><th>{t('desk.governs')}</th><th></th><th>δs</th></tr></thead>
      <tbody>
        {#each storeys as s (s.zLo)}
          <tr class:dl-sway={s.sway}>
            <td>z = {f(s.zLo)}–{f(s.zHi)} m</td><td class="num">{f(s.Q, 3)}</td>
            <td>{s.combo ?? '—'}{s.direction ? ` · ${s.direction}` : ''}</td>
            <td>{s.sway ? t('desk.sway') : t('desk.nonSway')}</td>
            <td class="num">{s.method === 'unstable' ? t('desk.unstable') : f(s.deltaS, 3)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .dl { padding: 10px; overflow: auto; }
  .dl-hint { font-size: 0.7rem; color: var(--st-text-3); margin: 0 0 6px; }
  table { border-collapse: collapse; font-size: 0.72rem; width: 100%; }
  th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 2px 6px; }
  td { padding: 2px 6px; border-top: 1px solid var(--st-hair); }
  .num { font-variant-numeric: tabular-nums; }
  .dl-h { margin: 12px 0 2px; font-size: 0.76rem; font-weight: 600; }
  .dl-sway td { color: var(--st-warn); }
</style>
