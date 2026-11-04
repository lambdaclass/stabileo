<script lang="ts">
  /**
   * A column's bars at the floors: the anchorage they need (straight ℓd, hooked ℓdh) and the lap
   * between lifts, each with the code's value beside it (§25.4.2, §25.4.3, §25.5.2). The lap is
   * set for the stack and the stacks that repeat it; the detailing lays the set length, and a
   * length under the code's is laid as set and reported by the splice check.
   */
  import { t, tp } from '../../../../lib/i18n';
  import { anchorageFunctions, deriveHookedDevelopment } from '../../../../lib/codes/cirsoc201/anchorage';
  import { CIRSOC201_DESIGN_EDITION } from '../../../../lib/engine/codes/argentina/cirsoc201-basis';
  import { columnLapOf, setColumnLap } from '../../../../lib/store/column-stack-store';
  import { modelStore } from '../../../../lib/store';

  let { columnId, diameter, fc, fy, groupSize }: { columnId: number; diameter: number; fc: number; fy: number; groupSize: number } = $props();

  const code = $derived.by(() => {
    const f = anchorageFunctions({ fy, fc, favourableSpacing: true, psiT: 1.0, edition: CIRSOC201_DESIGN_EDITION } as never);
    return { ld: f.ld(diameter), lap: f.lapSplice(diameter), ldh: deriveHookedDevelopment({ diameterMm: diameter, fy, fc, edition: CIRSOC201_DESIGN_EDITION }).ldhM };
  });
  const set = $derived.by(() => { void modelStore.designDecisions; return columnLapOf(columnId); });
  let value = $state(0);
  $effect(() => { value = +(set ?? code.lap).toFixed(2); });
  const short = $derived(set !== undefined && set + 1e-6 < code.lap);
</script>

<section class="cl" data-testid="column-laps">
  <h5>{tp('colEd.laps.title', { d: diameter })}</h5>
  <table>
    <tbody>
      <tr><td>{t('colEd.laps.ld')}</td><td class="num">{code.ld.toFixed(2)} m</td><td class="ref">25.4.2</td></tr>
      <tr><td>{t('colEd.laps.ldh')}</td><td class="num">{code.ldh.toFixed(2)} m</td><td class="ref">25.4.3</td></tr>
      <tr class:bad={short}>
        <td>{t('colEd.laps.lap')}</td>
        <td class="num"><input type="number" step="0.05" min="0.1" bind:value data-testid="column-lap-input" /> m</td>
        <td class="ref">{tp('colEd.laps.min', { v: code.lap.toFixed(2) })} · 25.5.2</td>
      </tr>
    </tbody>
  </table>
  <div class="cl-row">
    <button onclick={() => setColumnLap(columnId, value)} data-testid="column-lap-apply">{tp('colEd.laps.apply', { n: groupSize })}</button>
    {#if set !== undefined}<button onclick={() => setColumnLap(columnId, null)} data-testid="column-lap-reset">{t('colEd.laps.reset')}</button>{/if}
  </div>
  {#if short}<p class="cl-hint bad">{tp('colEd.laps.short', { v: code.lap.toFixed(2) })}</p>{/if}
</section>

<style>
  .cl { margin-top: 6px; border: 1px solid var(--st-hair); border-radius: 4px; padding: 6px 8px; background: var(--st-surface-2); }
  .cl h5 { margin: 0 0 4px; font-size: 0.74rem; }
  .cl table { border-collapse: collapse; font-size: 0.7rem; }
  .cl td { padding: 1px 8px 1px 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .ref { color: var(--st-text-3); }
  .cl input { width: 4rem; font-size: 0.7rem; }
  .cl-row { display: flex; gap: 6px; margin-top: 4px; }
  .cl button { font-size: 0.68rem; padding: 1px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .bad { color: var(--st-danger); }
  .cl-hint { margin: 4px 0 0; font-size: 0.68rem; }
</style>
