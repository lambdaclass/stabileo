<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { t, tp, tpn } from '../../../lib/i18n';
  import type { SheetRows } from '../../../lib/store/rc-sheets.svelte';
  import { REBAR_FAMILIES, rebarView, saveGhostPreference, sheetBars3d, sheetGhosts3d, shownBars, shownGhosts } from '../../../lib/store/rc-rebar-3d.svelte';
  import { sceneHost } from '../../../lib/viewport3d/scene-host.svelte';
  import { createRebarLayer } from '../../../lib/three/rebar-3d-layer';
  import { createGhostLayer } from '../../../lib/three/rebar-ghost-layer';
  import Icon from '../../ribbon/Icon.svelte';

  let { rows }: { rows: SheetRows | null } = $props();

  const layer = createRebarLayer();
  const ghostLayer = createGhostLayer();

  const all = $derived(rebarView.on && rows ? sheetBars3d(rows) : []);
  const levels = $derived([...new Set(all.map((b) => b.level ?? ''))].sort((p, q) => p.localeCompare(q, undefined, { numeric: true })));
  const shown = $derived(rebarView.on ? shownBars(all, rebarView) : []);
  const ghosts = $derived(rebarView.on && rebarView.ghost && rows ? shownGhosts(sheetGhosts3d(rows), shown, rebarView) : []);

  $effect(() => {
    const host = sceneHost.current;
    const on = rebarView.on && !!rows;
    untrack(() => sceneHost.setSolo(on));
    if (on) layer.show(host, shown);
    else layer.clear(host);
  });

  $effect(() => {
    const host = sceneHost.current;
    if (ghosts.length) ghostLayer.show(host, ghosts);
    else ghostLayer.clear(host);
  });

  $effect(() => saveGhostPreference(rebarView.ghost));

  onDestroy(() => { layer.clear(sceneHost.current); ghostLayer.clear(sceneHost.current); sceneHost.setSolo(false); });
</script>

<div class="r3d" data-testid="rc-rebar-3d">
  <button type="button" class="r3d-btn" class:on={rebarView.on} aria-pressed={rebarView.on} disabled={!rows} onclick={() => (rebarView.on = !rebarView.on)} data-testid="rc-rebar-3d-toggle">
    <Icon name="view3d" size={18} />
    <span>{t(rebarView.on ? 'rcSheets.r3d.hide' : 'rcSheets.r3d.show')}</span>
    {#if rebarView.on}<span class="r3d-n" data-testid="rc-rebar-3d-count">{tpn('rcSheets.r3d.bars', shown.length)}</span>{/if}
  </button>
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
    <label class="r3d-ghost">
      <input type="checkbox" bind:checked={rebarView.ghost} data-testid="rc-rebar-3d-ghost" />
      <span>{t('rcSheets.r3d.ghost')}</span>
    </label>
    <p class="r3d-hint">{t('rcSheets.r3d.hint')}</p>
  {/if}
</div>

<style>
  .r3d { display: flex; flex-direction: column; gap: 6px; }
  .r3d-btn { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: 1px solid var(--st-accent); border-radius: var(--st-radius); background: var(--st-surface-2); color: var(--st-text); font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
  .r3d-btn:hover:not(:disabled) { background: var(--st-surface-3); }
  .r3d-btn.on { background: var(--st-accent); color: #fff; }
  .r3d-btn:disabled { opacity: 0.55; cursor: default; border-color: var(--st-hair-strong); }
  .r3d-btn:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
  .r3d-n { margin-left: auto; font-size: 0.7rem; font-weight: 400; opacity: 0.85; font-family: var(--st-mono); }
  fieldset { border: 1px solid var(--st-hair); border-radius: 6px; padding: 4px 8px 6px; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  legend { font-size: 0.66rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--st-text-2); padding: 0 4px; }
  .r3d-row { display: flex; justify-content: space-between; gap: 8px; font-size: 0.74rem; color: var(--st-text); }
  .r3d-link { border: none; background: none; padding: 0; color: var(--st-accent, var(--st-text)); text-decoration: underline; cursor: pointer; font-size: 0.72rem; }
  .r3d-field { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.74rem; color: var(--st-text-2); }
  .r3d-field select { font: inherit; padding: 2px 6px; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; }
  .r3d-fams { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 0.72rem; color: var(--st-text-2); }
  .r3d-fams label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  .r3d-ghost { display: flex; align-items: center; gap: 6px; font-size: 0.74rem; color: var(--st-text-2); cursor: pointer; }
  .r3d-hint { margin: 0; font-size: 0.68rem; line-height: 1.45; color: var(--st-text-3); }
</style>
