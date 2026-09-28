<script lang="ts">
  /**
   * Every bar with its coordinates, as the biaxial sheets tabulate it: with
   * three positions and a split there is no other way to see where the steel
   * went. Shown under the inputs on FCO-VERIF and under the answer on FCO.
   */
  import { t } from '../../lib/i18n';
  let { bars }: { bars: Array<{ n: number; area: number; x: number; y: number }> } = $props();
</script>

<!--
  The biaxial sheets tabulate every bar with its coordinates: with three
  positions and a split there is no other way to see where the steel went.
-->
<p class="fp-edge-note">{t('flex.out.barTable')}</p>
<table class="fp-table fp-pointtable" data-testid="flex-bar-table">
  <thead>
    <tr><th>#</th><th>Asi [cm²]</th><th>X [m]</th><th>Y [m]</th></tr>
  </thead>
  <tbody>
    {#each bars as bar (bar.n)}
      <tr>
        <th>{bar.n}</th>
        <td>{bar.area.toFixed(3)}</td>
        <td>{bar.x.toFixed(4)}</td>
        <td>{bar.y.toFixed(4)}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .fp-edge-note {
    font-size: 0.66rem; color: var(--st-text-3);
    margin: 8px 0 2px; line-height: 1.4;
  }
  /* Narrow tables of numbers: the label column wraps, the numbers do not. */
  .fp-pointtable { font-size: 0.66rem; table-layout: auto; }
  .fp-pointtable th { line-height: 1.25; padding-right: 0.3rem; }
  .fp-pointtable td { text-align: right; white-space: nowrap; padding-left: 0.45rem; }
  .fp-pointtable thead th { color: var(--st-text-3); font-weight: 500; font-size: 0.62rem; text-align: right; }
</style>
