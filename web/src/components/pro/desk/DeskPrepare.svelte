<script lang="ts">
  /**
   * Design's «Prepare»: what the model still lacks before it can be designed, and the tools that
   * supply it, opened in context.
   *
   * With nothing to design yet (`empty`), it is design's way in, with two routes, each listing
   * what is missing for it:
   *
   *  - prepare an existing model: the physical pieces recognised from the analytical model
   *    (`ProPhysicalPanel`'s recognition, reviewed before it is applied), its levels from the
   *    model, its solve;
   *  - start from scratch, oriented to design: the building constructor on the grid and levels.
   *
   * Both open the existing tools of the model stage. Nothing here builds or changes the model.
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { axesOf, sortedLevels } from '../../../lib/model/grid';
  import { physicalGroups } from '../../../lib/store/physical';
  import { materialFamilyOf } from '../../../lib/engine/steel/material-family';
  import { catalogueGradeFamily } from '../../../lib/engine/steel/grade-family';
  import { openDeskAt, openModelTool } from '../../../lib/pro/design-navigation';
  import DesignOverview from '../design/DesignOverview.svelte';

  let { empty }: { empty: boolean } = $props();

  const members = $derived(modelStore.elements.size);
  const solved = $derived(!!resultsStore.results3D || !!resultsStore.results);
  const levels = $derived(sortedLevels(modelStore.grid).length);
  const axes = $derived(modelStore.grid ? axesOf(modelStore.grid, 'x').length + axesOf(modelStore.grid, 'y').length : 0);
  const pieces = $derived.by(() => { void modelStore.model.groups; return physicalGroups().length; });
  /** Members of a material design reads: concrete or steel. */
  const designable = $derived.by(() => {
    let n = 0;
    for (const e of modelStore.elements.values()) {
      const fam = materialFamilyOf(modelStore.materials.get(e.materialId) as never, catalogueGradeFamily).family;
      if (fam === 'concrete' || fam === 'steel') n++;
    }
    return n;
  });

  /** What an existing model still lacks, in the order it is supplied. */
  const existingMissing = $derived([
    ...(members === 0 ? ['desk.prep.miss.members'] : []),
    ...(members > 0 && designable === 0 ? ['desk.prep.miss.material'] : []),
    ...(levels === 0 ? ['desk.prep.miss.levels'] : []),
    ...(pieces === 0 ? ['desk.prep.miss.pieces'] : []),
    ...(!solved ? ['desk.prep.miss.solve'] : []),
  ]);
  /** What a model started for design still lacks. */
  const scratchMissing = $derived([
    ...(axes === 0 ? ['desk.prep.miss.axes'] : []),
    ...(levels === 0 ? ['desk.prep.miss.levels'] : []),
    ...(members === 0 ? ['desk.prep.miss.building'] : []),
  ]);
</script>

<div class="pp" data-testid="desk-prepare">
  {#if empty}
    <p class="pp-lead">{t('desk.prep.emptyLead')}</p>
    <div class="pp-routes">
      <section class="pp-route" data-testid="desk-route-existing">
        <h4>{t('desk.prep.existing')}</h4>
        <p class="pp-hint">{t('desk.prep.existingHint')}</p>
        <h5>{t('desk.prep.missing')}</h5>
        {#if existingMissing.length}
          <ul data-testid="desk-route-existing-missing">{#each existingMissing as k (k)}<li>{t(k)}</li>{/each}</ul>
        {:else}<p class="pp-hint" data-testid="desk-route-existing-ready">{t('desk.prep.readyToDesign')}</p>{/if}
        <div class="pp-actions">
          <button class="pp-primary" disabled={members === 0} onclick={() => openModelTool('physical')} data-testid="desk-route-recognize">{t('desk.prep.recognize')}</button>
          <button disabled={members === 0} onclick={() => openModelTool('grid')} data-testid="desk-route-levels">{t('desk.prep.levelsFromModel')}</button>
        </div>
      </section>
      <section class="pp-route" data-testid="desk-route-scratch">
        <h4>{t('desk.prep.scratch')}</h4>
        <p class="pp-hint">{t('desk.prep.scratchHint')}</p>
        <h5>{t('desk.prep.missing')}</h5>
        <ul data-testid="desk-route-scratch-missing">{#each scratchMissing as k (k)}<li>{t(k)}</li>{/each}</ul>
        <div class="pp-actions">
          <button class="pp-primary" onclick={() => openModelTool('building')} data-testid="desk-route-building">{t('desk.prep.building')}</button>
          <button onclick={() => openModelTool('grid')} data-testid="desk-route-grid">{t('grid.title')}</button>
        </div>
      </section>
    </div>
  {:else}
    <section class="pp-route" data-testid="desk-prepare-check">
      <h4>{t('desk.prep.title')}</h4>
      <h5>{t('desk.prep.missing')}</h5>
      {#if existingMissing.length}
        <ul data-testid="desk-prepare-missing">{#each existingMissing as k (k)}<li>{t(k)}</li>{/each}</ul>
      {:else}<p class="pp-hint">{tp('desk.prep.nothingMissing', { n: members })}</p>{/if}
    </section>
  {/if}
  {#if members > 0}
    <!-- The state of the project: the code in force, the member counts, the way to the 3-D view. -->
    <section class="pp-overview" data-testid="desk-overview"><h4>{t('design.overview.title')}</h4><DesignOverview onOpenRegulations={() => openDeskAt('designData')} /></section>
  {/if}

  <!-- The model's tools for design, on demand: they are out of the model ribbon's way until asked for. -->
  <section class="pp-tools" data-testid="desk-prepare-tools">
    <h5>{t('desk.prep.tools')}</h5>
    <div class="pp-actions">
      <button onclick={() => openModelTool('physical')} data-testid="desk-prep-physical">{t('physical.title')} ↗</button>
      <button onclick={() => openModelTool('grid')} data-testid="desk-prep-grid">{t('grid.title')} ↗</button>
      <button onclick={() => openModelTool('building')} data-testid="desk-prep-building">{t('building.title')} ↗</button>
      <button onclick={() => openModelTool('foundations')} data-testid="desk-prep-foundations">{t('fdn.title')} ↗</button>
      <button onclick={() => openModelTool('generators')} data-testid="desk-prep-generators">{t('proRibbon.cmdGenerators')} ↗</button>
      <button onclick={() => openDeskAt('stairs')} data-testid="desk-prep-stairs">{t('desk.tab.stairs')}</button>
      <button onclick={() => openDeskAt('geometry')} data-testid="desk-prep-geometry">{t('desk.tab.geometry')}</button>
      <button onclick={() => openDeskAt('designData')} data-testid="desk-prep-design-data">{t('designData.title')}</button>
    </div>
    <p class="pp-hint">{t('desk.prep.toolsHint')}</p>
  </section>
</div>

<style>
  .pp { display: flex; flex-direction: column; gap: 10px; padding: 12px; font-size: 0.74rem; color: var(--st-text); }
  .pp-lead { margin: 0; color: var(--st-text-2); }
  .pp-routes { display: flex; flex-wrap: wrap; gap: 10px; }
  .pp-route { flex: 1 1 16rem; border: 1px solid var(--st-hair-strong); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 6px; background: var(--st-surface); }
  .pp-route h4 { margin: 0; font-size: 0.82rem; }
  .pp h5 { margin: 0; font-size: 0.7rem; color: var(--st-text-2); text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--st-mono); }
  .pp ul { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 2px; }
  .pp-hint { margin: 0; color: var(--st-text-3); }
  .pp-actions { display: flex; flex-wrap: wrap; gap: 4px; }
  .pp-actions button { font-size: 0.72rem; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); cursor: pointer; }
  .pp-actions button:disabled { opacity: 0.45; cursor: default; }
  .pp-actions .pp-primary { border-color: var(--st-accent); }
  .pp-overview { border: 1px solid var(--st-hair); border-radius: 6px; padding-top: 6px; }
  .pp-overview h4 { margin: 0 10px; font-size: 0.82rem; }
  .pp-tools { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--st-hair); padding-top: 8px; }
</style>
