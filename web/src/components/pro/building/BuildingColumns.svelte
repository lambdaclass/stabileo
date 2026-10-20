<script lang="ts">
  /**
   * Columns, in one place: what they are (the typology, drawn), their section, how they stand (the
   * fixed point, the angle, fixed at the base), and the two ways to place them: at every
   * intersection of an axis range from one level to another, or drawn one by one on a working
   * level. Built in the building's material (`BuildingGeneral`).
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import TypologyPicker from './TypologyPicker.svelte';
  import NewSectionButton from './NewSectionButton.svelte';
  import BuildingRange from './BuildingRange.svelte';
  import { placeFrame } from '../../../lib/model/building/build-on-grid';
  import { frameBetweenAxes } from '../../../lib/model/grid';
  import { fittingChoice, sectionFits, typologyFamily } from '../../../lib/model/building/typology-defaults';
  import { buildingUi } from '../../../lib/store/building-ui.svelte';
  import { nextMember } from '../../../lib/store/next-member.svelte';
  import { setMemberCovers } from '../../../lib/store/design-data';
  import { untrack } from 'svelte';

  let { report }: { report: (text: string) => void } = $props();

  const grid = $derived(modelStore.grid);
  const levels = $derived([...(grid?.levels ?? [])].sort((a, b) => a.z - b.z));
  const sections = $derived([...modelStore.sections.values()]);
  let typology = $state('concrete'), section = $state(0), fixBase = $state(true), angle = $state(0);
  let fixedPoint = $state<[number, number]>([0, 0]);
  /** Effective-length factors about the strong and the weak axis, the head pinned, a cover of its own (mm, empty: the project's). */
  let kStrong = $state(1), kWeak = $state(1), pinnedHead = $state(false), cover = $state<number | null>(null);
  let x0 = $state(''), x1 = $state(''), y0 = $state(''), y1 = $state(''), levelFrom = $state(''), levelTo = $state('');
  const fam = $derived(typologyFamily('column', typology));
  const materialId = $derived(buildingUi.materialFor(fam));
  const fitting = $derived(sections.filter((s) => !fam || sectionFits(fam, s)));
  // The typology proposes a section that fits it; one the person picks afterwards is theirs.
  $effect(() => {
    const f = fam;
    untrack(() => {
      if (!f) return;
      const c = fittingChoice(f, 'column', [...modelStore.materials.values()], sections, { materialId, sectionId: section });
      if (c.sectionId !== null) section = c.sectionId;
    });
  });
  const spec = $derived({ x: [x0, x1] as [string, string], y: [y0, y1] as [string, string], levels: [levelFrom, levelTo] as [string, string], columns: { sectionId: section, materialId }, beamsX: null, beamsY: null });
  const layout = $derived(grid ? frameBetweenAxes(grid, spec) : null);
  const count = $derived(layout?.members.length ?? 0);

  function place() {
    const g = grid;
    if (!g) return;
    const box: { r?: ReturnType<typeof placeFrame> } = {};
    // The columns and what is stated about them: one step.
    modelStore.batch(() => {
      const r = box.r = placeFrame(g, spec, { columnTypology: typology, fixBase, columnAngle: angle, columnFixedPoint: fixedPoint });
      for (const id of r.bars) {
        const e = modelStore.elements.get(id);
        if (!e) continue;
        const zi = modelStore.nodes.get(e.nodeI)?.z ?? 0, zj = modelStore.nodes.get(e.nodeJ)?.z ?? 0;
        const head = { my: true, mz: true, t: false };
        const patch = {
          ...(kStrong !== 1 ? { kStrong } : {}), ...(kWeak !== 1 ? { kWeak } : {}),
          ...(pinnedHead ? (zj >= zi ? { releaseJ: head } : { releaseI: head }) : {}),
        };
        if (Object.keys(patch).length > 0) modelStore.updateElement(id, patch);
      }
      if (cover !== null && cover > 0) setMemberCovers(r.bars, cover / 1000);
    });
    const r = box.r;
    if (!r) return;
    uiStore.setSelection(new Set(), new Set(r.bars), false);
    report(tp('grid.frameCreated', { members: r.elements, nodes: r.nodes, welded: r.welded, duplicates: r.duplicates }));
  }
  let workLevel = $state('');
  $effect(() => { if (!levels.some((l) => l.id === workLevel)) workLevel = levels[1]?.id ?? levels[0]?.id ?? ''; });
  function draw() {
    nextMember.physical = { kind: 'column', typology };
    const l = levels.find((x) => x.id === workLevel);
    if (l) uiStore.setActiveLevel(l.z);
    uiStore.currentTool = 'element';
    report(t('building.col.drawing'));
  }
</script>

<section class="pk-card" data-testid="building-columns">
  <TypologyPicker kind="column" bind:value={typology} testid="building-col-typology" />
  <div class="bk-row">
    <label class="bk-field">{t('building.section')}
      <select bind:value={section} data-testid="grid-col-section">{#each fitting as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
    </label>
    <NewSectionButton onAdded={(id) => (section = id)} testid="building-col-new-section" />
  </div>
  {#if fitting.length === 0}<p class="pk-hint bk-warn" role="status">{tp('building.mismatchNone', { part: t('building.part.columns'), family: t(`building.family.${fam ?? 'concrete'}`), what: '' })}</p>{/if}
  <div class="bk-row">
    <div class="bk-field">
      <span>{t('building.fixedPoint')}</span>
      <div class="bk-fp" role="radiogroup" aria-label={t('building.fixedPoint')}>
        {#each [1, 0, -1] as fy}
          {#each [-1, 0, 1] as fx}
            <button type="button" class:on={fixedPoint[0] === fx && fixedPoint[1] === fy} role="radio" aria-checked={fixedPoint[0] === fx && fixedPoint[1] === fy}
              aria-label="{fx},{fy}" onclick={() => (fixedPoint = [fx, fy])} data-testid="building-fp-{fx}-{fy}"></button>
          {/each}
        {/each}
      </div>
    </div>
    <label class="bk-field">{t('building.columnAngle')} <input type="number" step="15" bind:value={angle} data-testid="building-col-angle" /></label>
    <label class="bk-check"><input type="checkbox" bind:checked={fixBase} /> {t('building.fixBase')}</label>
    <label class="bk-check"><input type="checkbox" bind:checked={pinnedHead} data-testid="building-col-pinned-head" /> {t('building.col.pinnedHead')}</label>
  </div>
  <div class="bk-row">
    <label class="bk-field">{t('building.col.kStrong')} <input type="number" min="0.5" max="3" step="0.05" bind:value={kStrong} data-testid="building-col-k-strong" /></label>
    <label class="bk-field">{t('building.col.kWeak')} <input type="number" min="0.5" max="3" step="0.05" bind:value={kWeak} data-testid="building-col-k-weak" /></label>
    <label class="bk-field">{t('building.col.cover')} <input type="number" min="10" step="5" placeholder={t('building.col.coverProject')} value={cover ?? ''} onchange={(e) => (cover = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} data-testid="building-col-cover" /></label>
  </div>

  <h5 class="bk-h">{t('building.betweenAxesTitle')}</h5>
  <BuildingRange bind:x0 bind:x1 bind:y0 bind:y1 bind:levelFrom bind:levelTo levelsLabel={t('building.col.levels')} />
  <button class="pk-btn pk-btn-primary" disabled={count === 0} onclick={place} data-testid="building-columns-place">
    {count ? tp('building.col.place', { n: count }) : t('grid.frameNothing')}
  </button>

  <h5 class="bk-h">{t('building.drawTitle')}</h5>
  <div class="bk-row">
    <label class="bk-field">{t('building.workLevel')}
      <select bind:value={workLevel}>{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
    </label>
    <button class="pk-btn" onclick={draw} data-testid="building-columns-draw">{t('building.col.draw')}</button>
  </div>
</section>

<style>
  .bk-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 12px; margin: 4px 0; }
  .bk-field { display: flex; flex-direction: column; gap: 2px; font-size: 0.7rem; color: var(--st-text-2); }
  .bk-field input[type='number'] { width: 4.5rem; font-size: 0.72rem; }
  .bk-field select { font-size: 0.72rem; max-width: 12rem; }
  .bk-check { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--st-text-2); }
  .bk-h { margin: 8px 0 2px; font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); }
  .bk-warn { color: var(--st-warn); }
  .bk-fp { display: grid; grid-template-columns: repeat(3, 12px); gap: 2px; padding: 2px; border: 1px dashed var(--st-hair-strong); }
  .bk-fp button { width: 12px; height: 12px; padding: 0; border: 1px solid var(--st-hair-strong); background: var(--st-surface); border-radius: 2px; cursor: pointer; }
  .bk-fp button.on { background: var(--st-accent); border-color: var(--st-accent); }
</style>
