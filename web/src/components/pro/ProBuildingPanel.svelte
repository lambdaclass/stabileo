<script lang="ts">
  /**
   * The building, modelled as an engineer thinks of it: first its general data (the concrete, the
   * steel, the codes), then one tool per kind of element, each with its drawn typologies and both
   * ways of placing it (on the grid between axes, or drawn on a level). The levels and the grid
   * come first, in this panel too. What is placed becomes the analysis model and a declared
   * physical element (`model/building`); every placement is one undo step.
   */
  import { modelStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { buildingUi, BUILDING_TOOLS, type BuildingTool } from '../../lib/store/building-ui.svelte';
  import type { PlaceResult } from '../../lib/model/building/build-on-grid';
  import BuildingGeneral from './building/BuildingGeneral.svelte';
  import BuildingColumns from './building/BuildingColumns.svelte';
  import BuildingBeams from './building/BuildingBeams.svelte';
  import BuildingWalls from './building/BuildingWalls.svelte';
  import BuildingSlabs from './building/BuildingSlabs.svelte';
  import BuildingStairs from './building/BuildingStairs.svelte';
  import BuildingTools from './building/BuildingTools.svelte';
  import ProGridPanel from './ProGridPanel.svelte';
  import { untrack } from 'svelte';
  import { physicalGroups } from '../../lib/store/physical';

  const grid = $derived(modelStore.grid);
  const levels = $derived(grid?.levels ?? []);
  const axes = $derived(grid?.axes ?? []);
  const ready = $derived(levels.length >= 2 && axes.filter((a) => a.axis === 'x').length + axes.filter((a) => a.axis === 'y').length >= 2);
  /**
   * Without a grid the only tool that can do anything is the one that makes it. Opened without
   * one, the panel stays on it once the grid is complete too (the heights may still be under
   * way): the next tool is the person's click away.
   */
  if (untrack(() => !ready)) buildingUi.tool = 'levels';
  const tool = $derived<BuildingTool>(ready ? buildingUi.tool : 'levels');
  let meshSize = $state(1);

  /**
   * The steps in the order a building is modelled (the levels and axes, the columns from bottom to
   * top, the walls, the beams that frame into them, the slabs they close), each with whether it
   * holds anything yet. The walls and the stairs are there when the building has them.
   */
  const OPTIONAL = new Set<BuildingTool>(['walls', 'stairs', 'tools']);
  const done = $derived.by(() => {
    void modelStore.model.groups;
    const kinds = new Set(physicalGroups().map((g) => g.physical.kind));
    return { levels: ready, columns: kinds.has('column'), walls: kinds.has('wall'), beams: kinds.has('beam'), slabs: kinds.has('slab'), stairs: kinds.has('stair'), tools: false } as Record<BuildingTool, boolean>;
  });
  /** The next step that holds nothing yet, past the one on screen: the walls and the stairs are skipped. */
  const nextStep = $derived(BUILDING_TOOLS.slice(BUILDING_TOOLS.indexOf(tool) + 1).find((k) => !OPTIONAL.has(k) && !done[k]) ?? null);
  let last = $state<string | null>(null);
  const said = (r: PlaceResult) => (r.refused && r.created === 0 ? t(`building.refused.${r.refused}`) : tp('building.placed', { n: r.created, bars: r.elements, shells: r.shells }));
  const report = (text: string) => (last = text);
  const reportPlaced = (r: PlaceResult) => (last = said(r));
  // A result belongs to the tool that made it.
  $effect(() => { void tool; last = null; });
</script>

<div class="pk bd" data-testid="building-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('building.title')}</h4>
    <p class="pk-hint">{t('building.explain')}</p>
  </section>

  <BuildingGeneral />

  <div class="bd-tabs" role="tablist" aria-label={t('building.title')}>
    {#each BUILDING_TOOLS as k (k)}
      <button role="tab" class="bd-tab" class:on={tool === k} aria-selected={tool === k} disabled={!ready && k !== 'levels'}
              onclick={() => (buildingUi.tool = k)} data-testid="building-tab-{k}" title={t(`building.tab.${k}.hint`)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {#if k === 'levels'}<line x1="3" y1="20" x2="21" y2="20" /><line x1="3" y1="13" x2="21" y2="13" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="7" y1="3" x2="7" y2="22" class="ax" /><line x1="17" y1="3" x2="17" y2="22" class="ax" />
          {:else if k === 'columns'}<rect x="9" y="3" width="6" height="18" /><line x1="4" y1="21" x2="20" y2="21" />
          {:else if k === 'walls'}<rect x="4" y="4" width="16" height="16" /><line x1="4" y1="12" x2="20" y2="12" class="ax" /><line x1="12" y1="4" x2="12" y2="20" class="ax" />
          {:else if k === 'beams'}<rect x="3" y="8" width="18" height="6" /><line x1="5" y1="14" x2="5" y2="21" /><line x1="19" y1="14" x2="19" y2="21" />
          {:else if k === 'slabs'}<polygon points="2,14 8,8 22,8 16,14" /><line x1="2" y1="14" x2="2" y2="17" /><line x1="16" y1="14" x2="16" y2="17" /><line x1="2" y1="17" x2="16" y2="17" />
          {:else if k === 'stairs'}<polyline points="3,21 3,17 8,17 8,13 13,13 13,9 18,9 18,5 21,5" />
          {:else}<circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />{/if}
        </svg>
        <span>{#if !OPTIONAL.has(k) || k === 'walls' || k === 'stairs'}<b class="bd-n">{BUILDING_TOOLS.indexOf(k) + 1}</b> {/if}{t(`building.tab.${k}`)}{#if done[k]} <span class="bd-done" aria-label={t('building.step.done')}>✓</span>{/if}</span>
      </button>
    {/each}
  </div>
  {#if ready && nextStep && done[tool]}
    <button class="pk-btn bd-next" onclick={() => (buildingUi.tool = nextStep)} data-testid="building-next-step">{tp('building.step.next', { step: t(`building.tab.${nextStep}`) })}</button>
  {/if}

  {#if last}<p class="pk-hint bd-result" data-testid="building-result" role="status">{last}</p>{/if}

  {#if tool === 'levels'}
    <ProGridPanel embedded />
  {:else if tool === 'columns'}
    <BuildingColumns {report} />
  {:else if tool === 'walls'}
    <BuildingWalls {meshSize} report={reportPlaced} />
  {:else if tool === 'beams'}
    <BuildingBeams {report} />
  {:else if tool === 'slabs'}
    <BuildingSlabs bind:meshSize report={reportPlaced} />
  {:else if tool === 'stairs'}
    <BuildingStairs />
  {:else}
    <BuildingTools materialId={buildingUi.concreteId} {meshSize} {report} />
  {/if}
</div>

<style>
  .bd-tabs { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.4rem, 1fr)); gap: 4px; margin: 2px 0 6px; }
  .bd-tab { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 5px 2px 4px; font-size: 0.64rem;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); color: var(--st-text-2); cursor: pointer; }
  .bd-tab:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .bd-tab:disabled { opacity: 0.45; cursor: default; }
  .bd-tab.on { border-color: var(--st-accent); color: var(--st-text); background: var(--st-surface-3); }
  .bd-tab svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.4; }
  .bd-tab svg :global(.ax) { stroke-dasharray: 2 2; stroke-width: 0.9; }
  .bd-n { font-weight: 600; color: var(--st-text-3); }
  .bd-done { color: var(--st-ok); }
  .bd-next { align-self: flex-start; font-size: 0.7rem; margin: 0 0 6px; }
  .bd-result { position: sticky; top: 0; z-index: 1; background: var(--st-surface); padding: 4px 6px; border-left: 2px solid var(--st-hair-strong); }
</style>
