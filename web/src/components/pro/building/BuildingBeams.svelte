<script lang="ts">
  /**
   * Beams, in one place: their typology (drawn), a section along X and one along Y, how they sit
   * (aligned to a face of the axis, an eccentricity), and the two ways to place them: along the
   * axes of a range on each level of a range, or drawn one by one on a working level (a brace
   * too). Built in the building's material (`BuildingGeneral`).
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
  import { untrack } from 'svelte';

  let { report }: { report: (text: string) => void } = $props();

  const grid = $derived(modelStore.grid);
  const levels = $derived([...(grid?.levels ?? [])].sort((a, b) => a.z - b.z));
  const sections = $derived([...modelStore.sections.values()]);
  let typology = $state('dropped'), sectionX = $state(0), sectionY = $state(0), wantX = $state(true), wantY = $state(true);
  /** Where a beam sits across its axis: −1, centred, +1, or the edges' beams flush with the columns' outer face. */
  let align = $state<number | 'perimeter'>(0), ecc = $state(0);
  /** The beams' top face on the level, the slab's top. */
  let topFlush = $state(false);
  /** Each span pinned at both ends (simply supported on what carries it). */
  let pinned = $state(false);
  let x0 = $state(''), x1 = $state(''), y0 = $state(''), y1 = $state(''), levelFrom = $state(''), levelTo = $state('');
  const fam = $derived(typologyFamily('beam', typology));
  const materialId = $derived(buildingUi.materialFor(fam));
  const fitting = $derived(sections.filter((s) => !fam || sectionFits(fam, s)));
  $effect(() => {
    const f = fam;
    untrack(() => {
      if (!f) return;
      const mats = [...modelStore.materials.values()];
      const x = fittingChoice(f, 'beam', mats, sections, { materialId, sectionId: sectionX });
      const y = fittingChoice(f, 'beam', mats, sections, { materialId, sectionId: sectionY });
      if (x.sectionId !== null) sectionX = x.sectionId;
      if (y.sectionId !== null) sectionY = y.sectionId;
    });
  });
  const spec = $derived({
    x: [x0, x1] as [string, string], y: [y0, y1] as [string, string], levels: [levelFrom, levelTo] as [string, string], columns: null,
    beamsX: wantX ? { sectionId: sectionX, materialId } : null, beamsY: wantY ? { sectionId: sectionY, materialId } : null,
  });
  const layout = $derived(grid ? frameBetweenAxes(grid, spec) : null);
  const count = $derived(layout?.members.length ?? 0);

  function place() {
    const g = grid;
    if (!g) return;
    const box: { r?: ReturnType<typeof placeFrame> } = {};
    modelStore.batch(() => {
      const r = box.r = placeFrame(g, spec, {
        beamTypology: typology, beamAlign: align === 'perimeter' ? 0 : align, beamEccentricity: ecc,
        ...(align === 'perimeter' ? { beamPerimeterFlush: true } : {}), ...(topFlush ? { beamTopFlush: true } : {}),
      });
      if (pinned) for (const id of r.bars) modelStore.updateElement(id, { releaseI: { my: true, mz: true, t: false }, releaseJ: { my: true, mz: true, t: false } });
    });
    const r = box.r;
    if (!r) return;
    uiStore.setSelection(new Set(), new Set(r.bars), false);
    report(tp('grid.frameCreated', { members: r.elements, nodes: r.nodes, welded: r.welded, duplicates: r.duplicates }));
  }
  let drawKind = $state<'beam' | 'brace'>('beam'), workLevel = $state('');
  $effect(() => { if (!levels.some((l) => l.id === workLevel)) workLevel = levels[1]?.id ?? levels[0]?.id ?? ''; });
  function draw() {
    nextMember.physical = { kind: drawKind, typology: drawKind === 'brace' ? (fam === 'timber' ? 'timber' : 'steel') : typology };
    const l = levels.find((x) => x.id === workLevel);
    if (l) uiStore.setActiveLevel(l.z);
    uiStore.currentTool = 'element';
    report(t(drawKind === 'brace' ? 'building.beam.drawingBrace' : 'building.beam.drawing'));
  }
</script>

<section class="pk-card" data-testid="building-beams">
  <TypologyPicker kind="beam" bind:value={typology} testid="building-beam-typology" />
  <div class="bk-row">
    <label class="bk-check"><input type="checkbox" bind:checked={wantX} /> {t('grid.beamsX')}</label>
    <select bind:value={sectionX} disabled={!wantX} data-testid="building-beam-section-x">{#each fitting as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
    <NewSectionButton disabled={!wantX} onAdded={(id) => (sectionX = id)} />
  </div>
  <div class="bk-row">
    <label class="bk-check"><input type="checkbox" bind:checked={wantY} /> {t('grid.beamsY')}</label>
    <select bind:value={sectionY} disabled={!wantY} data-testid="building-beam-section-y">{#each fitting as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
    <NewSectionButton disabled={!wantY} onAdded={(id) => (sectionY = id)} />
  </div>
  {#if fitting.length === 0}<p class="pk-hint bk-warn" role="status">{tp('building.mismatchNone', { part: t('building.part.beams'), family: t(`building.family.${fam ?? 'concrete'}`), what: '' })}</p>{/if}
  <div class="bk-row">
    <label class="bk-field">{t('building.beamAlign')}
      <select bind:value={align} data-testid="building-beam-align">
        <option value={-1}>{t('building.align.minus')}</option><option value={0}>{t('building.align.centre')}</option><option value={1}>{t('building.align.plus')}</option>
        <option value="perimeter">{t('building.align.perimeter')}</option>
      </select>
    </label>
    <label class="bk-check"><input type="checkbox" bind:checked={topFlush} data-testid="building-beam-top-flush" /> {t('building.beam.topFlush')}</label>
    <label class="bk-field">{t('building.eccentricity')} <input type="number" step="0.05" bind:value={ecc} /></label>
    <label class="bk-check"><input type="checkbox" bind:checked={pinned} data-testid="building-beam-pinned" /> {t('building.beam.pinned')}</label>
  </div>

  <!-- How the chosen seat reads, in plan and in section: the column, the beam, the level. -->
  <figure class="bk-fig" data-testid="building-beam-figure">
    <svg viewBox="0 0 200 74" role="img" aria-label={t('building.beam.figure')}>
      <g class="plan">
        <rect class="col" x="20" y="14" width="24" height="24" />
        <rect class="col" x="150" y="14" width="24" height="24" />
        {#if align === 'perimeter'}
          <rect class="beam" x="44" y="14" width="106" height="14" />
          <line class="axis" x1="10" y1="26" x2="184" y2="26" />
        {:else}
          {@const dy = align === -1 ? -5 : align === 1 ? 5 : 0}
          <rect class="beam" x="44" y={19 + dy} width="106" height="14" />
          <line class="axis" x1="10" y1="26" x2="184" y2="26" />
        {/if}
        <text x="97" y="50">{t(align === 'perimeter' ? 'building.beam.figPerimeter' : 'building.beam.figAxis')}</text>
      </g>
      <g class="section" transform="translate(0 4)">
        <line class="level" x1="10" y1="58" x2="190" y2="58" />
        <rect class="beam" x="80" y={topFlush ? 58 : 50} width="40" height="16" />
        <text x="130" y="56">{t(topFlush ? 'building.beam.figTop' : 'building.beam.figCentre')}</text>
      </g>
    </svg>
  </figure>

  <h5 class="bk-h">{t('building.betweenAxesTitle')}</h5>
  <BuildingRange bind:x0 bind:x1 bind:y0 bind:y1 bind:levelFrom bind:levelTo levelsLabel={t('building.beam.levels')} />
  <button class="pk-btn pk-btn-primary" disabled={count === 0} onclick={place} data-testid="building-beams-place">
    {count ? tp('building.beam.place', { n: count }) : t('grid.frameNothing')}
  </button>

  <h5 class="bk-h">{t('building.drawTitle')}</h5>
  <div class="bk-row">
    <div class="bk-seg" role="radiogroup" aria-label={t('physical.kindCol')}>
      {#each ['beam', 'brace'] as const as k}
        <button class="pk-btn" class:on={drawKind === k} role="radio" aria-checked={drawKind === k} onclick={() => (drawKind = k)} data-testid="building-draw-{k}">{t(`physical.kind.${k}`)}</button>
      {/each}
    </div>
    <label class="bk-field">{t('building.workLevel')}
      <select bind:value={workLevel}>{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
    </label>
    <button class="pk-btn" onclick={draw} data-testid="building-beams-draw">{t('building.draw')}</button>
  </div>
</section>

<style>
  .bk-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 12px; margin: 4px 0; font-size: 0.7rem; }
  .bk-row select { font-size: 0.72rem; max-width: 12rem; min-width: 0; }
  .bk-field { display: flex; flex-direction: column; gap: 2px; font-size: 0.7rem; color: var(--st-text-2); }
  .bk-field input[type='number'] { width: 4.5rem; font-size: 0.72rem; }
  .bk-check { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); min-width: 6rem; }
  .bk-h { margin: 8px 0 2px; font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); }
  .bk-warn { color: var(--st-warn); }
  .bk-seg { display: flex; gap: 4px; }
  .bk-seg .on { border-color: var(--st-accent); color: var(--st-text); }
  .bk-fig { margin: 4px 0; }
  .bk-fig svg { width: 100%; max-width: 18rem; height: auto; display: block; }
  .bk-fig .col { fill: var(--st-surface-3); stroke: var(--st-text-2); stroke-width: 1; }
  .bk-fig .beam { fill: color-mix(in srgb, var(--st-accent) 25%, transparent); stroke: var(--st-accent); stroke-width: 1; }
  .bk-fig .axis { stroke: var(--st-text-3); stroke-dasharray: 4 3; stroke-width: 0.8; }
  .bk-fig .level { stroke: var(--st-text-2); stroke-width: 1; }
  .bk-fig text { font-size: 7px; fill: var(--st-text-2); text-anchor: middle; }
  .bk-fig .section text { text-anchor: start; }
</style>
