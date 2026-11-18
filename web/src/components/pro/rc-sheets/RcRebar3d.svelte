<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { t, tp, tpn } from '../../../lib/i18n';
  import type { SheetRows } from '../../../lib/store/rc-sheets.svelte';
  import { REBAR_FAMILIES, rebarView, sheetBars3d, shownBars } from '../../../lib/store/rc-rebar-3d.svelte';
  import { viewCategories, type CategoryState } from '../../../lib/store/view-categories.svelte';
  import { sceneHost } from '../../../lib/viewport3d/scene-host.svelte';
  import { createRebarLayer } from '../../../lib/three/rebar-3d-layer';

  let { rows }: { rows: SheetRows | null } = $props();

  const layer = createRebarLayer();
  const CONCRETE = ['members', 'shells', 'loads'] as const;
  let saved: Record<(typeof CONCRETE)[number], CategoryState> | null = null;

  function concrete(halftone: boolean) {
    if (halftone && !saved) {
      saved = { members: viewCategories.state('members'), shells: viewCategories.state('shells'), loads: viewCategories.state('loads') };
      for (const c of CONCRETE) if (saved[c] === 'visible') viewCategories.set(c, 'halftone');
    } else if (!halftone && saved) {
      for (const c of CONCRETE) viewCategories.set(c, saved[c]);
      saved = null;
    }
  }

  const all = $derived(rebarView.on && rows ? sheetBars3d(rows) : []);
  const levels = $derived([...new Set(all.map((b) => b.level ?? ''))].sort((p, q) => p.localeCompare(q, undefined, { numeric: true })));
  const shown = $derived(rebarView.on ? shownBars(all, rebarView) : []);

  $effect(() => {
    const host = sceneHost.current;
    const on = rebarView.on && !!rows;
    untrack(() => concrete(on));
    if (on) layer.show(host, shown);
    else layer.clear(host);
  });

  onDestroy(() => { layer.clear(sceneHost.current); concrete(false); });
</script>

<div class="r3d" data-testid="rc-rebar-3d">
  <label class="r3d-on">
    <input type="checkbox" bind:checked={rebarView.on} disabled={!rows} data-testid="rc-rebar-3d-toggle" />
    <span>{t('rcSheets.r3d.show')}</span>
    {#if rebarView.on}<span class="r3d-n" data-testid="rc-rebar-3d-count">{tpn('rcSheets.r3d.bars', shown.length)}</span>{/if}
  </label>
  {#if rebarView.on}
    <fieldset>
      <legend>{t('rcSheets.r3d.scope')}</legend>
      {#if rebarView.row}
        <div class="r3d-row">
          <span data-testid="rc-rebar-3d-row">{tp('rcSheets.r3d.only', { name: rebarView.row.name })}</span>
          <button type="button" class="r3d-link" onclick={() => (rebarView.row = null)} data-testid="rc-rebar-3d-all">{t('rcSheets.r3d.showAll')}</button>
        </div>
      {:else}
        <label class="r3d-field">
          <span>{t('rcSheets.r3d.level')}</span>
          <select bind:value={rebarView.level} data-testid="rc-rebar-3d-level">
            <option value="">{t('rcSheets.r3d.allLevels')}</option>
            {#each levels.filter(Boolean) as l (l)}<option value={l}>{l}</option>{/each}
          </select>
        </label>
        <div class="r3d-fams">
          {#each REBAR_FAMILIES as f (f)}
            <label><input type="checkbox" bind:checked={rebarView.families[f]} data-testid={`rc-rebar-3d-${f}`} />{t(`rcSheets.family.${f}`)}</label>
          {/each}
        </div>
      {/if}
    </fieldset>
    <p class="r3d-hint">{t('rcSheets.r3d.hint')}</p>
  {/if}
</div>

<style>
  .r3d { display: flex; flex-direction: column; gap: 6px; }
  .r3d-on { display: flex; align-items: center; gap: 6px; font-size: 0.76rem; color: var(--st-text); cursor: pointer; }
  .r3d-n { margin-left: auto; font-size: 0.7rem; color: var(--st-text-3); font-family: var(--st-mono); }
  fieldset { border: 1px solid var(--st-hair); border-radius: 6px; padding: 4px 8px 6px; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  legend { font-size: 0.66rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--st-text-2); padding: 0 4px; }
  .r3d-row { display: flex; justify-content: space-between; gap: 8px; font-size: 0.74rem; color: var(--st-text); }
  .r3d-link { border: none; background: none; padding: 0; color: var(--st-accent, var(--st-text)); text-decoration: underline; cursor: pointer; font-size: 0.72rem; }
  .r3d-field { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.74rem; color: var(--st-text-2); }
  .r3d-field select { font: inherit; padding: 2px 6px; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; }
  .r3d-fams { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 0.72rem; color: var(--st-text-2); }
  .r3d-fams label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  .r3d-hint { margin: 0; font-size: 0.68rem; line-height: 1.45; color: var(--st-text-3); }
</style>
