<script lang="ts">
  /**
   * Load zones: a named outline of nodes, picked in order around it; the members picked with it are
   * left out of it; other zones can be its openings. A floor load can target a zone
   * (`floor-definitions.ts`), and the zone limits it to its outline less its openings. A zone is a
   * group of the model, so it is saved, undone and renumbered with the rest.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { addLoadZone, syncDefinedLoads } from '../../../lib/store/defined-loads';
  import { zoneOutline, type DefinitionModel, type ZoneData } from '../../../lib/model/loads/floor-definitions';
  import PickKind from '../PickKind.svelte';

  const zones = $derived([...modelStore.model.groups.values()].filter((g) => g.kind === 'loadZone'));
  let name = $state('');
  let openings = $state<number[]>([]);
  let note = $state<string | null>(null);

  /** The nodes picked, in the order they were picked. */
  const outline = $derived([...uiStore.selectedNodes]);
  const area = (id: number) => {
    const z = zoneOutline(modelStore.model as unknown as DefinitionModel, id);
    if (!z) return 0;
    let s = 0;
    for (let i = 0; i < z.outer.length; i++) { const a = z.outer[i]!, b = z.outer[(i + 1) % z.outer.length]!; s += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(s / 2);
  };

  function add() {
    if (outline.length < 3) { note = t('loadZone.needNodes'); return; }
    const label = name.trim() || tp('loadZone.defaultName', { n: zones.length + 1 });
    addLoadZone(label, outline, [...uiStore.selectedElements], openings);
    note = tp('loadZone.added', { name: label, n: outline.length });
    name = ''; openings = [];
  }
  function remove(id: number) {
    modelStore.batch(() => {
      // Openings that pointed at it lose it.
      for (const g of zones) {
        const d = g.data as ZoneData | undefined;
        if (d?.openings?.includes(id)) modelStore.setGroupData(g.id, { ...d, openings: d.openings.filter((x) => x !== id) });
      }
      modelStore.removeGroup(id);
      syncDefinedLoads();
    });
  }
</script>

<div class="lz" data-testid="load-zones">
  <div class="lz-title">{t('loadZone.title')}</div>
  <p class="lz-hint">{t('loadZone.hint')}</p>
  <div class="lz-row">
    <PickKind kind="nodes" />
    <span data-testid="lz-count">{tp('loadZone.picked', { n: outline.length, m: uiStore.selectedElements.size })}</span>
  </div>
  <div class="lz-row">
    <label>{t('floorLoad.name')} <input type="text" bind:value={name} data-testid="lz-name" /></label>
  </div>
  {#if zones.length}
    <div class="lz-row lz-openings">
      <span>{t('loadZone.openings')}</span>
      {#each zones as z (z.id)}
        <label><input type="checkbox" checked={openings.includes(z.id)} onchange={(e) => (openings = e.currentTarget.checked ? [...openings, z.id] : openings.filter((x) => x !== z.id))} /> {z.name}</label>
      {/each}
    </div>
  {/if}
  <button class="pk-btn" onclick={add} data-testid="lz-add">{t('loadZone.add')}</button>
  {#if note}<p class="lz-hint" data-testid="lz-note">{note}</p>{/if}
  {#if zones.length}
    <ul class="lz-list" data-testid="lz-list">
      {#each zones as z (z.id)}
        {@const d = z.data as ZoneData | undefined}
        <li>
          <span>{z.name}</span>
          <span class="lz-n">{area(z.id).toFixed(2)} m²</span>
          {#if d?.openings?.length}<span class="lz-n">{tp('loadZone.withOpenings', { n: d.openings.length })}</span>{/if}
          {#if z.members.elements?.length}<span class="lz-n">{tp('loadZone.excluded', { n: z.members.elements.length })}</span>{/if}
          <button class="pro-delete-btn" onclick={() => remove(z.id)} aria-label={t('loadTables.delete')}>×</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .lz { display: flex; flex-direction: column; gap: 5px; padding-top: 6px; border-top: 1px solid var(--st-hair); }
  .lz-title { font-size: 0.66rem; font-weight: 600; color: var(--st-text); }
  .lz-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .lz-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .lz-openings label { display: inline-flex; align-items: center; gap: 3px; }
  .lz-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
  .lz-list li { display: flex; align-items: center; gap: 8px; }
  .lz-n { font-family: var(--st-mono); color: var(--st-text-3); }
</style>
