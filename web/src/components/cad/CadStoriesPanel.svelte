<script lang="ts">
  import { t, tp } from '../../lib/i18n';
  import { formatFloors, planOfFloor } from '../../lib/cad/floor-regions';

  let {
    nFloors = $bindable(1),
    heights = $bindable([] as number[]),
    storyHeight = $bindable(3),
    plans = [] as Array<{ label: string; floors: number[] }>,
    detected = null as number | null,
    onassign = (() => {}) as (floor: number, plan: number) => void,
    ondetect = (() => {}) as () => void,
  } = $props();

  const n = $derived(Math.max(1, Math.floor(nFloors || 1)));
  const planOf = $derived(planOfFloor(plans.map((p) => p.floors), n));
  const gaps = $derived(plans.length ? planOf.flatMap((p, i) => (p === -1 ? [i + 1] : [])) : []);
  const tops = $derived.by(() => {
    const out: number[] = [];
    let z = 0;
    for (let i = 0; i < n; i++) { z += heights[i] ?? 0; out.push(z); }
    return out;
  });
  const floorsDesc = $derived(Array.from({ length: n }, (_, i) => n - i));
</script>

<details class="panel stories" open data-testid="cad-stories">
  <summary>{t('cad.stories.title')}</summary>
  {#if plans.length === 0}
    <div class="mode" data-testid="cad-stories-mode">{tp('cad.stories.single', { n })}</div>
    <button class="btn mini" onclick={ondetect} data-testid="cad-stories-detect">{t('cad.stories.detect')}</button>
    {#if detected !== null && detected < 2}
      <div class="hint">{t('cad.plans.none')} {t('cad.stories.cropHint')}</div>
    {/if}
  {:else}
    <div class="mode" data-testid="cad-stories-mode">{tp('cad.stories.perFloor', { n: plans.length })}</div>
  {/if}
  <div class="row">
    <label>{t('cad.nFloors')}
      <input type="number" min="1" max="50" step="1" bind:value={nFloors} data-testid="cad-stories-n" />
    </label>
    <label>{t('cad.storyHeight')}
      <input type="number" min="0.1" step="0.1" bind:value={storyHeight} />
    </label>
    <button class="btn mini" onclick={() => { heights = heights.map(() => storyHeight); }}>{t('cad.stories.applyAll')}</button>
  </div>
  <table class="stories-table" data-testid="cad-stories-table">
    <thead>
      <tr><th>{t('cad.stories.floor')}</th><th>{t('cad.stories.height')}</th><th>{t('cad.stories.top')}</th><th>{t('cad.stories.plan')}</th></tr>
    </thead>
    <tbody>
      {#each floorsDesc as k (k)}
        <tr class:gap={plans.length > 0 && planOf[k - 1] === -1} data-testid="cad-story-row">
          <td class="num">{k}</td>
          <td><input type="number" min="0.1" step="0.05" bind:value={heights[k - 1]} data-testid="cad-story-height" /></td>
          <td class="num">{(tops[k - 1] ?? 0).toFixed(2)}</td>
          <td>
            {#if plans.length}
              <select value={planOf[k - 1]} onchange={(e) => onassign(k, Number((e.currentTarget as HTMLSelectElement).value))} data-testid="cad-story-plan">
                {#each plans as p, i}<option value={i}>{p.label}</option>{/each}
                <option value={-1}>{t('cad.stories.noPlan')}</option>
              </select>
            {:else}
              <span class="same">{t('cad.stories.samePlan')}</span>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if gaps.length}
    <div class="warn-text" data-testid="cad-stories-gaps">{tp('cad.stories.gaps', { floors: formatFloors(gaps) })}</div>
  {/if}
</details>

<style>
  .stories { border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius-lg); padding: 0.4rem 0.7rem 0.5rem; }
  .stories > summary { font-size: 0.68rem; text-transform: uppercase; color: var(--st-text-3); cursor: pointer; }
  .mode { font-size: 0.76rem; color: var(--st-text); margin: 0.35rem 0; }
  .hint { font-size: 0.7rem; color: var(--st-text-3); margin-top: 0.25rem; }
  .warn-text { font-size: 0.72rem; color: var(--st-warn); margin-top: 0.3rem; }
  .row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.6rem; margin: 0.5rem 0 0.4rem; }
  .row label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.7rem; color: var(--st-text-3); }
  input, select {
    background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius); font-size: 0.74rem; padding: 0.2rem 0.35rem;
  }
  .row input { width: 80px; }
  .stories-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
  .stories-table th { text-align: left; color: var(--st-text-3); font-weight: normal; padding: 0.2rem 0.3rem; border-bottom: 1px solid var(--st-hair-strong); }
  .stories-table td { padding: 0.15rem 0.3rem; border-bottom: 1px solid var(--st-hair); }
  .stories-table td input { width: 70px; }
  .stories-table .num { color: var(--st-text-2); font-variant-numeric: tabular-nums; }
  .stories-table tr.gap td { background: var(--st-warn-bg); }
  .same { color: var(--st-text-3); }
  .btn { padding: 0.25rem 0.55rem; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); cursor: pointer; font-size: 0.72rem; }
  .btn:hover { border-color: var(--st-text-2); color: var(--st-text); }
</style>
