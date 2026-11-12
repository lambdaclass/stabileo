<script lang="ts">
  import { planNamesIn } from '../../lib/axes/typed-frame';
  import { along, axisName } from '../../lib/axes/display';
  import { similarityIssues } from '../../lib/model/similar-storeys';
  import Hint from './Hint.svelte';
  /**
   * The structural grid and the levels: typed as bays and storey heights, or read off the model;
   * edited axis by axis; and the level to work on. What is built on it is placed in Building.
   *
   * Every change is one undo step and none touches the analysis (`modelStore.setGrid`).
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import {
    axesFromBays, axesOf, gridFromModel, gridIssues, levelsFromHeights,
    parseBays, sortedLevels, fmt, type AxisNaming, type GridAxis, type Level, type StructuralGrid,
  } from '../../lib/model/grid';
  import { toDisplay, fromDisplay, unitLabel } from '../../lib/utils/units';
  import { unitQ } from '../../lib/store/display-units.svelte';
  import QuantityInput from './loads/QuantityInput.svelte';
  import UnderlayCard from './building/UnderlayCard.svelte';
  import LinkedModelsCard from './building/LinkedModelsCard.svelte';
  import { buildingUi } from '../../lib/store/building-ui.svelte';

  /** Inside the Building panel, its first tool: the way on is that panel's columns, not the panel itself. */
  let { embedded = false }: { embedded?: boolean } = $props();

  const grid = $derived<StructuralGrid>(modelStore.grid ?? { axes: [], levels: [] });
  const xs = $derived(axesOf(grid, 'x'));
  const ys = $derived(axesOf(grid, 'y'));
  const levels = $derived(sortedLevels(grid));
  const issues = $derived(gridIssues(grid));
  const activeZ = $derived(uiStore.workingPlane === 'XY' ? uiStore.nodeCreateZ : null);

  // The bays and the storey heights are typed as text in the display units, read back to SI.
  const lenUnit = $derived(unitLabel('length', uiStore.unitSystem));
  const shownList = (vs: number[]) => vs.map((v) => fmt(toDisplay(v, 'length', uiStore.unitSystem))).join('; ');
  const readList = (s: string) => parseBays(s)?.map((v) => fromDisplay(v, 'length', uiStore.unitSystem)) ?? null;
  /** The bays between the axes, as the bays field takes them, in the display units. */
  const baysShown = (axes: GridAxis[]) => {
    const s = [...axes].sort((a, b) => a.at - b.at);
    return shownList(s.slice(1).map((a, i) => a.at - s[i]!.at));
  };

  // ── Axes typed as bays ──
  let bx = $state({ bays: shownList([6, 6, 6]), origin: 0, naming: 'numbers' as AxisNaming, start: '1' });
  let by = $state({ bays: shownList([5, 5]), origin: 0, naming: 'letters' as AxisNaming, start: 'A' });

  function setGrid(next: StructuralGrid) { modelStore.setGrid(next); }
  const sg = (axis: 'x' | 'y' | 'z') => along(axis === 'x' ? 0 : axis === 'y' ? 1 : 2).sign;

  function generateAxes(axis: 'x' | 'y') {
    const d = axis === 'x' ? bx : by;
    const bays = readList(d.bays);
    if (!bays) return;
    const axes = axesFromBays(bays.map((b) => sg(axis) * b), axis, sg(axis) * d.origin, d.naming, d.start.trim() || (d.naming === 'letters' ? 'A' : '1'));
    setGrid({ ...grid, axes: [...grid.axes.filter((a) => a.axis !== axis), ...axes] });
  }

  function editAxis(a: GridAxis, patch: Partial<GridAxis>) {
    setGrid({ ...grid, axes: grid.axes.map((x) => (x.id === a.id ? { ...x, ...patch } : x)) });
  }
  function removeAxis(a: GridAxis) { setGrid({ ...grid, axes: grid.axes.filter((x) => x.id !== a.id) }); }
  function addAxis(axis: 'x' | 'y') {
    const list = sg(axis) > 0 ? (axis === 'x' ? xs : ys) : [...(axis === 'x' ? xs : ys)].reverse();
    const last = list[list.length - 1];
    const [a] = axesFromBays([], axis, last ? last.at + (list.length > 1 ? last.at - list[list.length - 2]!.at : sg(axis) * 5) : 0,
      axis === 'x' ? bx.naming : by.naming, last ? nextName(last.name) : (axis === 'x' ? bx.start : by.start));
    setGrid({ ...grid, axes: [...grid.axes, a!] });
  }
  const nextName = (n: string) => (/^\d+$/.test(n) ? String(Number(n) + 1)
    : /^[A-Z]+$/i.test(n) ? axesFromBays([1], 'x', 0, 'letters', n.toUpperCase())[1]!.name : `${n}'`);

  // ── Levels typed as storey heights ──
  let heights = $state(shownList([3, 3, 3]));
  let base = $state(0);
  let names = $state('');

  function generateLevels() {
    const h = readList(heights);
    if (!h) return;
    const lv = levelsFromHeights(h, sg('z') * base, names.split(/[;,]/));
    setGrid({ ...grid, levels: lv });
  }
  /** Levels some other level repeats. */
  const masters = $derived(new Set(levels.flatMap((l) => (l.similarTo ? [l.similarTo] : []))));
  const similarIssues = $derived(similarityIssues(levels));
  function editLevel(l: Level, patch: Partial<Level>) {
    setGrid({ ...grid, levels: grid.levels.map((x) => (x.id === l.id ? { ...x, ...patch } : x)) });
  }
  function removeLevel(l: Level) { setGrid({ ...grid, levels: grid.levels.filter((x) => x.id !== l.id) }); }

  function readFromModel() {
    const g = gridFromModel(modelStore.nodes.values(), modelStore.elements.values());
    setGrid(g);
  }

  const issueText = (i: string) => {
    const [kind, what] = i.split(':');
    return tp(`grid.issue.${kind}`, { what: what ?? '' });
  };
</script>

<div class="pk gr" data-testid="grid-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('grid.axesTitle')}</h4>
    <Hint text={t('grid.axesHint')} />
    {#each [{ axis: 'x' as const, d: bx, list: xs }, { axis: 'y' as const, d: by, list: ys }] as row (row.axis)}
      <div class="gr-dir" data-testid="grid-dir-{row.axis}">
        <div class="gr-dir-head">{planNamesIn(t(`grid.dir.${row.axis}`))}</div>
        <div class="pk-row gr-wrap">
          <label class="gr-field gr-grow">{t('grid.bays')}
            <span class="gr-unit"><input bind:value={row.d.bays} placeholder="6; 7,5; 6" data-testid="grid-bays-{row.axis}" /> {lenUnit}</span>
          </label>
          <label class="gr-field gr-narrow">{t('grid.origin')}
            <QuantityInput bind:value={row.d.origin} quantity="length" testid="grid-origin-{row.axis}" />
          </label>
          <label class="gr-field">{t('grid.naming')}
            <select bind:value={row.d.naming}>
              <option value="letters">A, B, C…</option>
              <option value="numbers">1, 2, 3…</option>
            </select>
          </label>
          <label class="gr-field gr-narrow">{t('grid.first')}
            <input bind:value={row.d.start} />
          </label>
          <button class="pk-btn pk-btn-primary" disabled={!parseBays(row.d.bays)} onclick={() => generateAxes(row.axis)} data-testid="grid-generate-{row.axis}">{t('grid.generate')}</button>
        </div>
        {#if row.list.length > 0}
          <table class="gr-table">
            <thead><tr><th>{t('grid.name')}</th><th>{axisName(row.axis === 'x' ? 0 : 1).toLowerCase()} ({unitQ('length')})</th><th></th></tr></thead>
            <tbody>
              {#each row.list as a (a.id)}
                <tr data-testid="grid-axis-{a.name}">
                  <td><input class="gr-cell" value={a.name} onchange={(e) => editAxis(a, { name: e.currentTarget.value.trim() || a.name })} /></td>
                  <td><QuantityInput cls="gr-cell gr-num" wrap="gr-qi" showUnit={false} value={sg(a.axis) * a.at} quantity="length" onchange={(v) => editAxis(a, { at: sg(a.axis) * v })} /></td>
                  <td><button class="pk-btn gr-del" title={t('grid.remove')} onclick={() => removeAxis(a)}>×</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="pk-row">
            <button class="pk-btn" onclick={() => addAxis(row.axis)}>{t('grid.addAxis')}</button>
            <span class="pk-hint">{t('grid.bays')}: {baysShown(row.list) ? `${baysShown(row.list)} ${lenUnit}` : '—'}</span>
          </div>
        {/if}
      </div>
    {/each}
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('grid.levelsTitle')}</h4>
    <Hint text={t('grid.levelsHint')} />
    <div class="pk-row gr-wrap">
      <label class="gr-field gr-grow">{t('grid.heights')}
        <span class="gr-unit"><input bind:value={heights} placeholder="3; 3; 3" data-testid="grid-heights" /> {lenUnit}</span>
      </label>
      <label class="gr-field gr-narrow">{t('grid.base')}
        <QuantityInput bind:value={base} quantity="length" />
      </label>
      <label class="gr-field gr-grow">{t('grid.levelNames')}
        <input bind:value={names} placeholder={t('grid.levelNamesPlaceholder')} />
      </label>
      <button class="pk-btn pk-btn-primary" disabled={!parseBays(heights)} onclick={generateLevels} data-testid="grid-generate-levels">{t('grid.generate')}</button>
    </div>
    {#if levels.length > 0}
      <table class="gr-table">
        <thead><tr><th>{t('grid.name')}</th><th>{axisName(2).toLowerCase()} ({unitQ('length')})</th><th>{t('storeys.similarTo')}</th><th title={t('storeys.spliceHint')}>{t('storeys.splice')}</th><th>{t('storeys.color')}</th><th>{t('grid.workHere')}</th><th></th></tr></thead>
        <tbody>
          {#each [...levels].reverse() as l (l.id)}
            {@const active = activeZ !== null && Math.abs(activeZ - l.z) < 1e-6}
            <tr class:gr-active={active} data-testid="grid-level-{l.name}">
              <td><input class="gr-cell" value={l.name} onchange={(e) => editLevel(l, { name: e.currentTarget.value.trim() || l.name })} /></td>
              <td><QuantityInput cls="gr-cell gr-num" wrap="gr-qi" showUnit={false} value={sg('z') * l.z} quantity="length" onchange={(v) => editLevel(l, { z: sg('z') * v })} /></td>
              <td>
                <select class="gr-cell" value={l.similarTo ?? ''} onchange={(e) => editLevel(l, { similarTo: e.currentTarget.value || undefined })} aria-label={tp('storeys.similarToOf', { name: l.name })} data-testid="grid-similar-{l.name}">
                  <option value="">{masters.has(l.id) ? t('storeys.master') : '—'}</option>
                  {#each levels.filter((x) => x.id !== l.id && !x.similarTo) as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
                </select>
              </td>
              <td><input type="checkbox" checked={!!l.splice} onchange={(e) => editLevel(l, { splice: e.currentTarget.checked || undefined })} aria-label={tp('storeys.spliceOf', { name: l.name })} data-testid="grid-splice-{l.name}" /></td>
              <td><input type="color" class="gr-color" value={l.color ?? '#8fa3b3'} onchange={(e) => editLevel(l, { color: e.currentTarget.value })} aria-label={tp('storeys.colorOf', { name: l.name })} /></td>
              <td><input type="radio" name="gr-active" checked={active} onchange={() => uiStore.setActiveLevel(l.z)} aria-label={tp('grid.workOn', { name: l.name })} data-testid="grid-activate-{l.name}" /></td>
              <td><button class="pk-btn gr-del" title={t('grid.remove')} onclick={() => removeLevel(l)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if levels.length > 1}<Hint text={t('storeys.hint')} />{/if}
    {#each similarIssues as i (i.level + i.issue)}<p class="pk-warn" data-testid="grid-similar-issue">{tp(`storeys.issue.${i.issue}`, { name: levels.find((l) => l.id === i.level)?.name ?? i.level })}</p>{/each}
    <label class="pk-row gr-check"><input type="checkbox" bind:checked={uiStore.snapToAxes} data-testid="grid-snap" /> {t('grid.snap')}</label>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('grid.fromModelTitle')}</h4>
    <Hint text={t('grid.fromModelHint')} />
    <button class="pk-btn" disabled={modelStore.nodes.size === 0} onclick={readFromModel} data-testid="grid-from-model">{t('grid.fromModel')}</button>
    {#if grid.axes.length > 0 || grid.levels.length > 0}
      <button class="pk-btn gr-del" onclick={() => setGrid({ axes: [], levels: [] })} data-testid="grid-clear">{t('grid.clear')}</button>
    {/if}
    {#each issues as i (i)}<p class="pk-hint gr-warn">{issueText(i)}</p>{/each}
  </section>

  <UnderlayCard />
  <LinkedModelsCard />

  {#if xs.length > 0 && ys.length > 0 && levels.length > 0}
    <section class="pk-card">
      <Hint text={t('building.fromGrid')} />
      <button class="pk-btn" onclick={() => { buildingUi.tool = 'columns'; if (!embedded) uiStore.proActiveTab = 'building'; }} data-testid="grid-open-building">{t(embedded ? 'building.next.columns' : 'building.open')}</button>
    </section>
  {/if}
</div>

<style>
  .gr-color { width: 26px; height: 18px; padding: 0; border: 0; background: none; }
  .gr-dir { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-top: 1px solid var(--st-hair); }
  .gr-dir:first-of-type { border-top: none; }
  .gr-dir-head { font-size: 0.66rem; font-weight: 600; color: var(--st-text-2); }
  .gr-wrap { flex-wrap: wrap; align-items: flex-end; }
  .gr-field { display: flex; flex-direction: column; gap: 2px; font-size: 0.62rem; color: var(--st-text-3); }
  .gr-field input, .gr-field select, .gr-field :global(input) { min-width: 0; }
  .gr-unit { display: flex; align-items: center; gap: 4px; }
  .gr-unit input { flex: 1; }
  .gr-grow { flex: 1 1 120px; }
  .gr-narrow { width: 72px; }
  .gr-narrow :global(input) { width: 100%; }
  .gr-table { border-collapse: collapse; font-size: 0.66rem; width: 100%; }
  .gr-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 2px 4px; border-bottom: 1px solid var(--st-hair); }
  .gr-table td { padding: 1px 4px; border-bottom: 1px solid var(--st-hair); }
  .gr-table :global(.gr-qi) { display: flex; }
  .gr-cell, .gr-table :global(input.gr-cell) { width: 100%; min-width: 0; background: transparent; border: 1px solid transparent; font-size: 0.66rem; padding: 1px 3px; color: var(--st-text); }
  .gr-cell:focus, .gr-table :global(input.gr-cell:focus) { border-color: var(--st-interactive); background: var(--st-surface); }
  .gr-table :global(input.gr-num) { text-align: right; font-family: var(--st-mono); }
  .gr-active td { background: var(--st-surface-3); }
  .gr-check { display: flex; gap: 6px; align-items: center; font-size: 0.66rem; }
  .gr-warn { color: var(--st-warn); }
  :global(.gr .gr-del) { min-height: 20px; padding: 0 0.45rem; }
</style>
