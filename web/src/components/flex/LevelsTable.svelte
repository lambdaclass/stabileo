<script lang="ts">
  /**
   * FCR-VERIF's five levels, each a distance from the BOTTOM face — the
   * sheet's own arrangement. A level's area can be typed or built from a bar
   * count and diameter; a row with zero area is ignored, as the sheet ignores
   * an empty level.
   */
  import { t } from '../../lib/i18n';
  import { DIAMETERS, areaOf } from './bar-areas';

  let {
    levels = $bindable(),
    levelBars = $bindable(),
  }: {
    levels: Array<{ distanceFromBottom: number; areaCm2: number }>;
    levelBars: Array<{ n: number; dia: number }>;
  } = $props();
</script>

<table class="fp-levels">
  <colgroup>
    <col style="width: 1.2rem" /><col /><col style="width: 2.6rem" /><col style="width: 3.4rem" /><col />
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th>{t('flex.in.levelDist')} [cm]</th>
      <th>n</th>
      <th>Ø</th>
      <th>As [cm²]</th>
    </tr>
  </thead>
  <tbody>
    {#each levels as lvl, k}
      <tr>
        <th>{k + 1}</th>
        <td><input type="number" bind:value={lvl.distanceFromBottom} min="0" step="1" /></td>
        <td>
          <input
            type="number" min="0" max="20" step="1"
            bind:value={levelBars[k].n}
            oninput={() => { if (levelBars[k].n > 0) lvl.areaCm2 = areaOf(levelBars[k].n, levelBars[k].dia); }}
          />
        </td>
        <td>
          <select
            bind:value={levelBars[k].dia}
            onchange={() => { if (levelBars[k].n > 0) lvl.areaCm2 = areaOf(levelBars[k].n, levelBars[k].dia); }}
          >
            {#each DIAMETERS as d}<option value={d}>{d}</option>{/each}
          </select>
        </td>
        <td><input type="number" bind:value={lvl.areaCm2} min="0" step="0.5" /></td>
      </tr>
    {/each}
  </tbody>
</table>
<p class="fp-levels-note">{t('flex.in.levelsNote')}</p>

<style>
  /* The five levels, as a compact grid rather than ten loose fields. */
  .fp-levels {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.68rem;
  }
  .fp-levels th {
    color: var(--st-text-3);
    font-weight: 400;
    text-align: left;
    padding: 0.1rem 0.3rem 0.1rem 0;
  }
  .fp-levels td { padding: 0.1rem 0.15rem; }
  .fp-levels-note {
    margin: 0.25rem 0 0;
    font-size: 0.6rem;
    line-height: 1.4;
    color: var(--st-text-3);
  }
  .fp-levels { table-layout: fixed; }
  .fp-levels select {
    width: 100%;
    min-width: 0;
    padding: 0.2rem 0.1rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: inherit;
    font-size: 0.7rem;
  }
  .fp-levels input {
    width: 100%;
    padding: 0.2rem 0.3rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: inherit;
    font-size: 0.7rem;
  }
</style>
