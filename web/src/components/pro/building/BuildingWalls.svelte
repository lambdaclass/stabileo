<script lang="ts">
  /**
   * Walls: the typology (drawn), the thickness, along which axis and between which crossing axes,
   * from one level to another, its doors and windows, and a strip footing under it when asked.
   * Built in the building's concrete, or masonry for a masonry wall.
   */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import TypologyPicker from './TypologyPicker.svelte';
  import { physicalGroups } from '../../../lib/store/physical';
  import { stripUnderWall, supportWallBase } from '../../../lib/model/foundation/generate';
  import { placeWall, type PlaceResult, type WallOpening } from '../../../lib/model/building/build-on-grid';
  import { buildingUi } from '../../../lib/store/building-ui.svelte';

  let { meshSize, report }: { meshSize: number; report: (r: PlaceResult) => void } = $props();

  const grid = $derived(modelStore.grid);
  const levels = $derived([...(grid?.levels ?? [])].sort((a, b) => a.z - b.z));
  const xs = $derived((grid?.axes ?? []).filter((a) => a.axis === 'x').sort((a, b) => a.at - b.at));
  const ys = $derived((grid?.axes ?? []).filter((a) => a.axis === 'y').sort((a, b) => a.at - b.at));
  let typology = $state('concrete'), thickness = $state(0.2);
  let withStrip = $state(false), stripThickness = $state(0.4);
  let axis = $state(''), from = $state(''), to = $state(''), levelFrom = $state(''), levelTo = $state('');
  let openings = $state<WallOpening[]>([]);
  const crossing = $derived.by(() => {
    const a = grid?.axes.find((x) => x.id === axis);
    return a ? (a.axis === 'x' ? ys : xs) : [];
  });
  $effect(() => {
    const all = [...xs, ...ys];
    if (!all.some((a) => a.id === axis) && all[0]) axis = all[0].id;
    if (!crossing.some((a) => a.id === from) && crossing[0]) from = crossing[0].id;
    if (!crossing.some((a) => a.id === to) && crossing.length > 0) to = crossing[crossing.length - 1]!.id;
    if (!levels.some((l) => l.id === levelFrom) && levels[0]) levelFrom = levels[0].id;
    if (!levels.some((l) => l.id === levelTo) && levels.length > 0) levelTo = levels[levels.length - 1]!.id;
  });
  const addOpening = (door: boolean) => {
    const end = openings.reduce((m, w) => Math.max(m, w.offset + w.width), 0);
    openings = [...openings, door ? { offset: end + 0.5, width: 0.9, sill: 0, height: 2.1 } : { offset: end + 0.5, width: 1.2, sill: 0.9, height: 1.2 }];
  };
  function place() {
    const g = grid;
    if (!g) return;
    let res: PlaceResult = { created: 0, elements: 0, shells: 0 };
    // The wall and, asked for, its strip footing with its base stood on the ground: one step.
    modelStore.batch(() => {
      const before = new Set(physicalGroups().map((x) => x.id));
      res = placeWall(g, { axis, from, to, levelFrom, levelTo, thickness, materialId: buildingUi.concreteId, meshSize, typology, openings });
      if (!withStrip || res.created === 0) return;
      const zOf = (id?: string) => levels.find((l) => l.id === id)?.z ?? Infinity;
      const fresh = physicalGroups().filter((x) => x.physical.kind === 'wall' && !before.has(x.id));
      const lowest = Math.min(...fresh.map((x) => zOf(x.physical.levelFrom)));
      for (const w of fresh.filter((x) => zOf(x.physical.levelFrom) === lowest)) { supportWallBase(w.id); stripUnderWall(w.id, stripThickness); }
    });
    report(res);
  }
</script>

<section class="pk-card" data-testid="building-walls">
  <TypologyPicker kind="wall" bind:value={typology} testid="building-wall-typology" />
  <div class="bw-grid">
    <label>{t('building.thickness')}<input type="number" min="0.05" step="0.01" bind:value={thickness} /></label>
    <label>{t('building.alongAxis')}<select bind:value={axis} data-testid="building-wall-axis">{#each [...xs, ...ys] as a}<option value={a.id}>{a.name}</option>{/each}</select></label>
    <label>{t('building.betweenAxes')}
      <span class="bw-pair">
        <select bind:value={from}>{#each crossing as a}<option value={a.id}>{a.name}</option>{/each}</select>
        <select bind:value={to}>{#each crossing as a}<option value={a.id}>{a.name}</option>{/each}</select>
      </span>
    </label>
    <label>{t('building.from')}<select bind:value={levelFrom}>{#each levels as l}<option value={l.id}>{l.name}</option>{/each}</select></label>
    <label>{t('building.to')}<select bind:value={levelTo}>{#each levels as l}<option value={l.id}>{l.name}</option>{/each}</select></label>
  </div>
  <div class="bw-sub">{t('building.openings')}</div>
  {#if openings.length > 0}
    <table class="bw-open" data-testid="building-openings">
      <thead><tr><th>{t('building.opening.kind')}</th><th>{t('building.opening.offset')}</th><th>{t('building.opening.width')}</th><th>{t('building.opening.sill')}</th><th>{t('building.opening.height')}</th><th></th></tr></thead>
      <tbody>
        {#each openings as w, i}
          <tr>
            <td>{w.sill > 0 ? t('building.opening.window') : t('building.opening.door')}</td>
            <td><input type="number" step="0.1" min="0" bind:value={w.offset} /></td>
            <td><input type="number" step="0.1" min="0.1" bind:value={w.width} /></td>
            <td><input type="number" step="0.1" min="0" bind:value={w.sill} /></td>
            <td><input type="number" step="0.1" min="0.1" bind:value={w.height} /></td>
            <td><button class="pk-btn" title={t('grid.remove')} onclick={() => (openings = openings.filter((_, j) => j !== i))}>×</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <div class="pk-row">
    <button class="pk-btn" onclick={() => addOpening(true)} data-testid="building-add-door">{t('building.opening.addDoor')}</button>
    <button class="pk-btn" onclick={() => addOpening(false)} data-testid="building-add-window">{t('building.opening.addWindow')}</button>
  </div>
  <p class="pk-hint">{t('building.openingsHint')}</p>
  <div class="pk-row">
    <label class="bw-check"><input type="checkbox" bind:checked={withStrip} data-testid="building-wall-strip" /> {t('building.withStrip')}</label>
    <label class="bw-check">{t('building.thickness')} <input type="number" min="0.2" step="0.05" bind:value={stripThickness} disabled={!withStrip} /></label>
  </div>
  <button class="pk-btn pk-btn-primary" onclick={place} disabled={from === to} data-testid="building-place-wall">{t('building.place')}</button>
</section>

<style>
  .bw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 6px; margin: 4px 0 6px; }
  .bw-grid label { display: flex; flex-direction: column; gap: 2px; font-size: 0.7rem; color: var(--st-text-2); }
  .bw-grid select, .bw-grid input { font-size: 0.72rem; }
  .bw-pair { display: flex; gap: 4px; }
  .bw-pair select { flex: 1; min-width: 0; }
  .bw-check { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--st-text-2); }
  .bw-check input[type='number'] { width: 4rem; }
  .bw-sub { font-size: 0.66rem; font-weight: 600; color: var(--st-text-2); margin-top: 4px; }
  .bw-open { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
  .bw-open th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 1px 3px; }
  .bw-open input { width: 100%; min-width: 0; font-size: 0.68rem; }
</style>
