<script lang="ts">
  /**
   * Build on the grid: columns at its intersections, beams along its axes, slabs in its bays and
   * walls between axes, each placed from one level to another as an engineer thinks of it. What is
   * placed becomes the analysis model and a declared physical element (`model/building`). Every
   * placement is one undo step.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import TypologyPicker from './building/TypologyPicker.svelte';
  import BuildingLevelTools from './building/BuildingLevelTools.svelte';
  import NewSectionButton from './building/NewSectionButton.svelte';
  import { physicalGroups } from '../../lib/store/physical';
  import { stripUnderWall, supportWallBase } from '../../lib/model/foundation/generate';
  import { placeFrame, placeSlabs, placeWall, type PlaceResult, type WallOpening } from '../../lib/model/building/build-on-grid';
  import { frameBetweenAxes } from '../../lib/model/grid';
  import { familyOfMaterial, fittingChoice, sectionFits, typologyFamily, type TypologyFamily } from '../../lib/model/building/typology-defaults';
  import { untrack } from 'svelte';

  const grid = $derived(modelStore.grid);
  const levels = $derived([...(grid?.levels ?? [])].sort((a, b) => a.z - b.z));
  const xs = $derived((grid?.axes ?? []).filter((a) => a.axis === 'x').sort((a, b) => a.at - b.at));
  const ys = $derived((grid?.axes ?? []).filter((a) => a.axis === 'y').sort((a, b) => a.at - b.at));
  const ready = $derived(levels.length >= 2 && xs.length + ys.length >= 2);
  const materials = $derived([...modelStore.materials.values()]);
  const sections = $derived([...modelStore.sections.values()]);

  let materialId = $state(0);
  let sectionCol = $state(0), sectionBX = $state(0), sectionBY = $state(0);
  $effect(() => {
    if (!modelStore.materials.has(materialId) && materials[0]) materialId = materials[0].id;
    if (!modelStore.sections.has(sectionCol) && sections[0]) sectionCol = sections[0].id;
    if (!modelStore.sections.has(sectionBX) && sections[0]) sectionBX = sections[0].id;
    if (!modelStore.sections.has(sectionBY) && sections[0]) sectionBY = sections[0].id;
  });

  let levelFrom = $state(''), levelTo = $state('');
  $effect(() => {
    if (!levels.some((l) => l.id === levelFrom) && levels[0]) levelFrom = levels[0].id;
    if (!levels.some((l) => l.id === levelTo) && levels.length > 0) levelTo = levels[levels.length - 1]!.id;
  });
  const above = $derived(levels.filter((l) => l.z > (levels.find((x) => x.id === levelFrom)?.z ?? -Infinity)));

  // ── Columns and beams between axes: the ranges default to the whole grid ──
  let fx0 = $state(''), fx1 = $state(''), fy0 = $state(''), fy1 = $state('');
  $effect(() => {
    const pick = (cur: string, list: { id: string }[], end: 'first' | 'last') =>
      list.some((a) => a.id === cur) ? cur : (end === 'first' ? list[0]?.id : list[list.length - 1]?.id) ?? '';
    fx0 = pick(fx0, xs, 'first'); fx1 = pick(fx1, xs, 'last');
    fy0 = pick(fy0, ys, 'first'); fy1 = pick(fy1, ys, 'last');
  });
  let wantCols = $state(true), wantBX = $state(true), wantBY = $state(true);
  let colTypology = $state('concrete'), beamTypology = $state('dropped'), fixBase = $state(true), colAngle = $state(0);
  let fixedPoint = $state<[number, number]>([0, 0]), beamAlign = $state(0), beamEcc = $state(0);
  /*
   * The typology proposes the material and section it is built in. Followed only when the typology
   * changes (or the panel opens), so a section the person picks afterwards is theirs; a pick that
   * does not fit the typology is said under the frame, not undone.
   */
  let materialBeam = $state(0);
  const colFam = $derived(wantCols ? typologyFamily('column', colTypology) : null);
  const beamFam = $derived(wantBX || wantBY ? typologyFamily('beam', beamTypology) : null);
  $effect(() => {
    const fam = colFam;
    untrack(() => {
      if (!fam) return;
      const c = fittingChoice(fam, 'column', materials, sections, { materialId, sectionId: sectionCol });
      if (c.materialId !== null) materialId = c.materialId;
      if (c.sectionId !== null) sectionCol = c.sectionId;
    });
  });
  $effect(() => {
    const fam = beamFam;
    untrack(() => {
      if (!fam) return;
      const cur = materialBeam || materialId;
      const x = fittingChoice(fam, 'beam', materials, sections, { materialId: cur, sectionId: sectionBX });
      const y = fittingChoice(fam, 'beam', materials, sections, { materialId: cur, sectionId: sectionBY });
      materialBeam = x.materialId ?? cur;
      if (x.sectionId !== null) sectionBX = x.sectionId;
      if (y.sectionId !== null) sectionBY = y.sectionId;
    });
  });
  $effect(() => { if (!modelStore.materials.has(materialBeam) && materials[0]) materialBeam = materialId; });
  /** What does not fit the typology, said rather than silently built. */
  const mismatch = $derived.by(() => {
    const out: Array<{ part: 'columns' | 'beams'; fam: TypologyFamily; what: string; none: boolean }> = [];
    const check = (part: 'columns' | 'beams', fam: TypologyFamily | null, matId: number, secIds: number[]) => {
      if (!fam) return;
      const m = modelStore.materials.get(matId);
      const bad = [...(m && familyOfMaterial(m) !== fam ? [m.name] : []),
        ...secIds.map((id) => modelStore.sections.get(id)).filter((x) => x && !sectionFits(fam, x)).map((x) => x!.name)];
      if (bad.length === 0) return;
      const none = !materials.some((x) => familyOfMaterial(x) === fam) || !sections.some((x) => sectionFits(fam, x));
      out.push({ part, fam, what: [...new Set(bad)].join(', '), none });
    };
    check('columns', colFam, materialId, wantCols ? [sectionCol] : []);
    check('beams', beamFam, materialBeam || materialId, [...(wantBX ? [sectionBX] : []), ...(wantBY ? [sectionBY] : [])]);
    return out;
  });
  const frameSpec = $derived({
    x: [fx0, fx1] as [string, string], y: [fy0, fy1] as [string, string], levels: [levelFrom, levelTo] as [string, string],
    columns: wantCols ? { sectionId: sectionCol, materialId } : null,
    beamsX: wantBX ? { sectionId: sectionBX, materialId: materialBeam || materialId } : null,
    beamsY: wantBY ? { sectionId: sectionBY, materialId: materialBeam || materialId } : null,
  });
  const layout = $derived(grid ? frameBetweenAxes(grid, frameSpec) : null);
  let slabTypology = $state('solid'), slabThickness = $state(0.15), slabLevels = $state<string[]>([]);
  let wallTypology = $state('concrete'), wallThickness = $state(0.2);
  let withStrip = $state(false), stripThickness = $state(0.4);
  let wallAxis = $state(''), wallFrom = $state(''), wallTo = $state('');
  let meshSize = $state(1);
  let openings = $state<WallOpening[]>([]);
  const addOpening = (door: boolean) => {
    const end = openings.reduce((m, w) => Math.max(m, w.offset + w.width), 0);
    openings = [...openings, door ? { offset: end + 0.5, width: 0.9, sill: 0, height: 2.1 } : { offset: end + 0.5, width: 1.2, sill: 0.9, height: 1.2 }];
  };
  const crossing = $derived.by(() => {
    const a = grid?.axes.find((x) => x.id === wallAxis);
    return a ? (a.axis === 'x' ? ys : xs) : [];
  });
  $effect(() => {
    const all = [...xs, ...ys];
    if (!all.some((a) => a.id === wallAxis) && all[0]) wallAxis = all[0].id;
    if (!crossing.some((a) => a.id === wallFrom) && crossing[0]) wallFrom = crossing[0].id;
    if (!crossing.some((a) => a.id === wallTo) && crossing.length > 0) wallTo = crossing[crossing.length - 1]!.id;
  });

  let last = $state<{ what: string; r: PlaceResult; text?: string } | null>(null);
  const floors = (sel: string[]) => (sel.length > 0 ? sel : above.map((l) => l.id));

  function placeFrameNow() {
    if (!grid) return;
    const r = placeFrame(grid, frameSpec, { columnTypology: wantCols ? colTypology : undefined, beamTypology: wantBX || wantBY ? beamTypology : undefined, fixBase: wantCols && fixBase, columnAngle: colAngle, columnFixedPoint: fixedPoint, beamAlign, beamEccentricity: beamEcc });
    uiStore.setSelection(new Set(), new Set(r.bars), false);
    last = { what: 'frame', r, text: tp('grid.frameCreated', { members: r.elements, nodes: r.nodes, welded: r.welded, duplicates: r.duplicates }) };
  }

  /** Slabs and walls are concrete (or masonry) shells: the panel's material when it is a concrete, else the first concrete. */
  const shellMaterial = () => {
    const m = modelStore.materials.get(materialId);
    return m && familyOfMaterial(m) === 'concrete' ? materialId : materials.find((x) => familyOfMaterial(x) === 'concrete')?.id ?? materialId;
  };

  function run(what: 'slabs' | 'wall') {
    if (!grid) return;
    let r: PlaceResult;
    if (what === 'slabs') r = placeSlabs(grid, { levels: floors(slabLevels), thickness: slabThickness, materialId: shellMaterial(), meshSize, typology: slabTypology });
    else {
      let res: PlaceResult = { created: 0, elements: 0, shells: 0 };
      const g = grid;
      // The wall and, asked for, its strip footing with its base stood on the ground: one step.
      modelStore.batch(() => {
        const before = new Set(physicalGroups().map((x) => x.id));
        res = placeWall(g, { axis: wallAxis, from: wallFrom, to: wallTo, levelFrom, levelTo, thickness: wallThickness, materialId: shellMaterial(), meshSize, typology: wallTypology, openings });
        if (!withStrip || res.created === 0) return;
        const zOf = (id?: string) => levels.find((l) => l.id === id)?.z ?? Infinity;
        const fresh = physicalGroups().filter((x) => x.physical.kind === 'wall' && !before.has(x.id));
        const lowest = Math.min(...fresh.map((x) => zOf(x.physical.levelFrom)));
        for (const w of fresh.filter((x) => zOf(x.physical.levelFrom) === lowest)) { supportWallBase(w.id); stripUnderWall(w.id, stripThickness); }
      });
      r = res;
    }
    last = { what, r };
  }
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
</script>

<div class="pk bd" data-testid="building-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('building.title')}</h4>
    <p class="pk-hint">{t('building.explain')}</p>
    {#if !ready}
      <p class="pk-hint" data-testid="building-no-grid">{t('building.noGrid')}</p>
      <button class="pk-btn" onclick={() => (uiStore.proActiveTab = 'grid')} data-testid="building-open-grid">{t('building.openGrid')}</button>
    {:else}
      <div class="bd-grid">
        <label>{t('building.material')}
          <select bind:value={materialId} data-testid="building-material">
            {#each materials as m}<option value={m.id}>{m.name}</option>{/each}
          </select>
        </label>
        <label>{t('building.from')}
          <select bind:value={levelFrom} data-testid="building-level-from">
            {#each levels as l}<option value={l.id}>{l.name}</option>{/each}
          </select>
        </label>
        <label>{t('building.to')}
          <select bind:value={levelTo} data-testid="building-level-to">
            {#each levels as l}<option value={l.id}>{l.name}</option>{/each}
          </select>
        </label>
        <label>{t('building.meshSize')}
          <input type="number" min="0.1" step="0.1" bind:value={meshSize} />
        </label>
      </div>
    {/if}
  </section>

  {#if ready && last}
    <p class="pk-hint bd-result" data-testid="building-result" role="status">
      {#if last.text}{last.text}
      {:else if last.r.refused && last.r.created === 0}{t(`building.refused.${last.r.refused}`)}
      {:else}{tp('building.placed', { n: last.r.created, bars: last.r.elements, shells: last.r.shells })}{/if}
    </p>
  {/if}

  {#if ready}
    <section class="pk-card" data-testid="grid-frame">
      <h5 class="bd-h">
        <svg viewBox="0 0 20 20" aria-hidden="true"><line x1="4" y1="18" x2="4" y2="4" /><line x1="16" y1="18" x2="16" y2="4" /><line x1="2" y1="5" x2="18" y2="5" /><line x1="2" y1="18" x2="18" y2="18" /></svg>
        {t('grid.frameTitle')}
      </h5>
      <p class="pk-hint">{t('grid.frameHint')}</p>
      <div class="bd-ranges">
        <span>{t('grid.dir.x')}</span>
        <select bind:value={fx0}>{#each xs as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
        <select bind:value={fx1}>{#each xs as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
        <span>{t('grid.dir.y')}</span>
        <select bind:value={fy0}>{#each ys as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
        <select bind:value={fy1}>{#each ys as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
      </div>
      <div class="bd-ranges">
        <label class="bd-check"><input type="checkbox" bind:checked={wantCols} /> {t('grid.columns')}</label>
        <select bind:value={sectionCol} disabled={!wantCols} data-testid="grid-col-section">{#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
        <span><NewSectionButton disabled={!wantCols} onAdded={(id) => (sectionCol = id)} testid="building-col-new-section" /></span>
        <label class="bd-check"><input type="checkbox" bind:checked={wantBX} /> {t('grid.beamsX')}</label>
        <select bind:value={sectionBX} disabled={!wantBX}>{#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
        <span><NewSectionButton disabled={!wantBX} onAdded={(id) => (sectionBX = id)} /></span>
        <label class="bd-check"><input type="checkbox" bind:checked={wantBY} /> {t('grid.beamsY')}</label>
        <select bind:value={sectionBY} disabled={!wantBY}>{#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
        <span><NewSectionButton disabled={!wantBY} onAdded={(id) => (sectionBY = id)} /></span>
        <span>{t('building.beamMaterial')}</span>
        <select bind:value={materialBeam} disabled={!wantBX && !wantBY} data-testid="building-beam-material">{#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select>
        <span></span>
      </div>
      {#each mismatch as w (w.part)}
        <p class="pk-hint bd-warn" role="status" data-testid="building-mismatch-{w.part}">{tp(w.none ? 'building.mismatchNone' : 'building.mismatch', { part: t(`building.part.${w.part}`), family: t(`building.family.${w.fam}`), what: w.what })}</p>
      {/each}
      <div class="bd-sub">{t('grid.columns')}</div>
      <TypologyPicker kind="column" bind:value={colTypology} disabled={!wantCols} testid="building-col-typology" />
      <div class="bd-sub">{t('building.beamsLabel')}</div>
      <TypologyPicker kind="beam" bind:value={beamTypology} disabled={!wantBX && !wantBY} testid="building-beam-typology" />
      <div class="pk-row">
        <label class="bd-check"><input type="checkbox" bind:checked={fixBase} disabled={!wantCols} /> {t('building.fixBase')}</label>
        <label class="bd-inline">{t('building.columnAngle')} <input type="number" step="15" bind:value={colAngle} disabled={!wantCols} data-testid="building-col-angle" /> °</label>
      </div>
      <div class="pk-row bd-place">
        <div class="bd-inline">
          <span>{t('building.fixedPoint')}</span>
          <div class="bd-fp" role="radiogroup" aria-label={t('building.fixedPoint')}>
            {#each [1, 0, -1] as fy}
              {#each [-1, 0, 1] as fx}
                <button type="button" class:on={fixedPoint[0] === fx && fixedPoint[1] === fy} role="radio" aria-checked={fixedPoint[0] === fx && fixedPoint[1] === fy}
                  aria-label="{fx},{fy}" disabled={!wantCols} onclick={() => (fixedPoint = [fx, fy])} data-testid="building-fp-{fx}-{fy}"></button>
              {/each}
            {/each}
          </div>
        </div>
        <label class="bd-inline">{t('building.beamAlign')}
          <select bind:value={beamAlign} disabled={!wantBX && !wantBY} data-testid="building-beam-align">
            <option value={-1}>{t('building.align.minus')}</option><option value={0}>{t('building.align.centre')}</option><option value={1}>{t('building.align.plus')}</option>
          </select>
        </label>
        <label class="bd-inline">{t('building.eccentricity')} <input type="number" step="0.05" bind:value={beamEcc} disabled={!wantBX && !wantBY} /> m</label>
      </div>
      <div class="pk-row">
        <button class="pk-btn pk-btn-primary" disabled={!layout} onclick={placeFrameNow} data-testid="grid-frame-create">
          {layout ? tp('grid.frameCreate', { n: layout.members.length }) : t('grid.frameNothing')}
        </button>
      </div>
    </section>

    <section class="pk-card" data-testid="building-slabs">
      <h5 class="bd-h">
        <svg viewBox="0 0 20 20" aria-hidden="true"><polygon points="2,12 8,6 18,6 12,12" /><line x1="2" y1="12" x2="2" y2="14" /><line x1="12" y1="12" x2="12" y2="14" /></svg>
        {t('building.slabs')}
      </h5>
      <TypologyPicker kind="slab" bind:value={slabTypology} exclude={['ramp']} testid="building-slab-typology" />
      <div class="bd-grid">
        <label>{t('building.thickness')}
          <input type="number" min="0.05" step="0.01" bind:value={slabThickness} data-testid="building-slab-thickness" />
        </label>
      </div>
      <div class="bd-levels" role="group" aria-label={t('building.atLevels')}>
        {#each levels as l}
          <label><input type="checkbox" checked={slabLevels.includes(l.id)} onchange={() => (slabLevels = toggle(slabLevels, l.id))} /> {l.name}</label>
        {/each}
      </div>
      <p class="pk-hint">{t('building.levelsDefault')}</p>
      <button class="pk-btn pk-btn-primary" onclick={() => run('slabs')} data-testid="building-place-slabs">{t('building.place')}</button>
    </section>

    <section class="pk-card" data-testid="building-walls">
      <h5 class="bd-h">
        <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" /><line x1="3" y1="10" x2="17" y2="10" /></svg>
        {t('building.walls')}
      </h5>
      <TypologyPicker kind="wall" bind:value={wallTypology} testid="building-wall-typology" />
      <div class="bd-grid">
        <label>{t('building.thickness')}
          <input type="number" min="0.05" step="0.01" bind:value={wallThickness} />
        </label>
        <label>{t('building.alongAxis')}
          <select bind:value={wallAxis} data-testid="building-wall-axis">{#each [...xs, ...ys] as a}<option value={a.id}>{a.name}</option>{/each}</select>
        </label>
        <label>{t('building.betweenAxes')}
          <span class="bd-pair">
            <select bind:value={wallFrom}>{#each crossing as a}<option value={a.id}>{a.name}</option>{/each}</select>
            <select bind:value={wallTo}>{#each crossing as a}<option value={a.id}>{a.name}</option>{/each}</select>
          </span>
        </label>
      </div>
      <div class="bd-sub">{t('building.openings')}</div>
      {#if openings.length > 0}
        <table class="bd-open" data-testid="building-openings">
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
        <label class="bd-check"><input type="checkbox" bind:checked={withStrip} data-testid="building-wall-strip" /> {t('building.withStrip')}</label>
        <label class="bd-inline">{t('building.thickness')} <input type="number" min="0.2" step="0.05" bind:value={stripThickness} disabled={!withStrip} /></label>
      </div>
      <button class="pk-btn pk-btn-primary" onclick={() => run('wall')} disabled={wallFrom === wallTo} data-testid="building-place-wall">{t('building.place')}</button>
    </section>

    <BuildingLevelTools {materialId} {meshSize} report={(text) => (last = { what: 'tool', r: { created: 0, elements: 0, shells: 0 }, text })} />
  {/if}
</div>

<style>
  .bd-warn { color: var(--st-warn); }
  .bd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 6px; margin: 4px 0 6px; }
  .bd-grid label { display: flex; flex-direction: column; gap: 2px; font-size: 0.7rem; color: var(--st-text-2); }
  .bd-grid select, .bd-grid input[type='number'] { font-size: 0.72rem; }
  .bd-check { flex-direction: row !important; align-items: center; }
  .bd-pair { display: flex; gap: 4px; }
  .bd-pair select { flex: 1; min-width: 0; }
  .bd-h { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; font-size: 0.78rem; font-weight: 500; }
  .bd-h svg { width: 18px; height: 18px; fill: none; stroke: var(--st-accent); stroke-width: 1.4; }
  .bd-ranges { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); gap: 4px 6px; align-items: center; font-size: 0.7rem; margin: 4px 0; }
  .bd-ranges select { font-size: 0.72rem; min-width: 0; }
  .bd-inline { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--st-text-2); }
  .bd-inline input { width: 4rem; font-size: 0.72rem; }
  .bd-open { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
  .bd-open th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 1px 3px; }
  .bd-open input { width: 100%; min-width: 0; font-size: 0.68rem; }
  .bd-result { position: sticky; top: 0; z-index: 1; background: var(--st-surface); padding: 4px 6px; border-left: 2px solid var(--st-accent); }
  .bd-place { align-items: center; gap: 10px; flex-wrap: wrap; }
  .bd-fp { display: grid; grid-template-columns: repeat(3, 12px); gap: 2px; padding: 2px; border: 1px dashed var(--st-hair-strong); }
  .bd-fp button { width: 12px; height: 12px; padding: 0; border: 1px solid var(--st-hair-strong); background: var(--st-surface); border-radius: 2px; cursor: pointer; }
  .bd-fp button.on { background: var(--st-accent); border-color: var(--st-accent); }
  .bd-sub { font-size: 0.66rem; font-weight: 600; color: var(--st-text-2); margin-top: 4px; }
  .bd-levels { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 0.7rem; }
</style>
