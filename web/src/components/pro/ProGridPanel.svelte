<script lang="ts">
  /**
   * The structural grid and the levels: typed as bays and storey heights, or read off the model;
   * edited axis by axis; the level to work on; and columns and beams laid between axes.
   *
   * Every change is one undo step and none touches the analysis (`modelStore.setGrid`).
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import {
    axesFromBays, axesOf, baysText, frameBetweenAxes, gridFromModel, gridIssues, levelsFromHeights,
    parseBays, sortedLevels, fmt, type AxisNaming, type GridAxis, type Level, type StructuralGrid,
  } from '../../lib/model/grid';
  import { fragmentFromMembers } from '../../lib/model/edit/fragment';
  import { insertFragment } from '../../lib/model/edit/transformed-copy';
  import { IDENTITY } from '../../lib/model/edit/affine';

  const grid = $derived<StructuralGrid>(modelStore.grid ?? { axes: [], levels: [] });
  const xs = $derived(axesOf(grid, 'x'));
  const ys = $derived(axesOf(grid, 'y'));
  const levels = $derived(sortedLevels(grid));
  const issues = $derived(gridIssues(grid));
  const activeZ = $derived(uiStore.workingPlane === 'XY' ? uiStore.nodeCreateZ : null);

  const num = (s: string) => Number(String(s).replace(',', '.'));

  // ── Axes typed as bays ──
  let bx = $state({ bays: '6; 6; 6', origin: '0', naming: 'numbers' as AxisNaming, start: '1' });
  let by = $state({ bays: '5; 5', origin: '0', naming: 'letters' as AxisNaming, start: 'A' });

  function setGrid(next: StructuralGrid) { modelStore.setGrid(next); }

  function generateAxes(axis: 'x' | 'y') {
    const d = axis === 'x' ? bx : by;
    const bays = parseBays(d.bays);
    if (!bays) return;
    const axes = axesFromBays(bays, axis, num(d.origin) || 0, d.naming, d.start.trim() || (d.naming === 'letters' ? 'A' : '1'));
    setGrid({ ...grid, axes: [...grid.axes.filter((a) => a.axis !== axis), ...axes] });
  }

  function editAxis(a: GridAxis, patch: Partial<GridAxis>) {
    setGrid({ ...grid, axes: grid.axes.map((x) => (x.id === a.id ? { ...x, ...patch } : x)) });
  }
  function removeAxis(a: GridAxis) { setGrid({ ...grid, axes: grid.axes.filter((x) => x.id !== a.id) }); }
  function addAxis(axis: 'x' | 'y') {
    const list = axis === 'x' ? xs : ys;
    const last = list[list.length - 1];
    const [a] = axesFromBays([], axis, last ? last.at + (list.length > 1 ? last.at - list[list.length - 2]!.at : 5) : 0,
      axis === 'x' ? bx.naming : by.naming, last ? nextName(last.name) : (axis === 'x' ? bx.start : by.start));
    setGrid({ ...grid, axes: [...grid.axes, a!] });
  }
  const nextName = (n: string) => (/^\d+$/.test(n) ? String(Number(n) + 1)
    : /^[A-Z]+$/i.test(n) ? axesFromBays([1], 'x', 0, 'letters', n.toUpperCase())[1]!.name : `${n}'`);

  // ── Levels typed as storey heights ──
  let heights = $state('3; 3; 3');
  let base = $state('0');
  let names = $state('');

  function generateLevels() {
    const h = parseBays(heights);
    if (!h) return;
    const lv = levelsFromHeights(h, num(base) || 0, names.split(/[;,]/));
    setGrid({ ...grid, levels: lv });
  }
  function editLevel(l: Level, patch: Partial<Level>) {
    setGrid({ ...grid, levels: grid.levels.map((x) => (x.id === l.id ? { ...x, ...patch } : x)) });
  }
  function removeLevel(l: Level) { setGrid({ ...grid, levels: grid.levels.filter((x) => x.id !== l.id) }); }

  function readFromModel() {
    const g = gridFromModel(modelStore.nodes.values(), modelStore.elements.values());
    setGrid(g);
  }

  // ── Columns and beams between axes ──
  const sections = $derived([...modelStore.sections.values()]);
  const materials = $derived([...modelStore.materials.values()]);
  let fx0 = $state(''), fx1 = $state(''), fy0 = $state(''), fy1 = $state(''), fl0 = $state(''), fl1 = $state('');
  let colSec = $state<number | null>(null), beamXSec = $state<number | null>(null), beamYSec = $state<number | null>(null);
  let matId = $state<number | null>(null);
  let wantCols = $state(true), wantBX = $state(true), wantBY = $state(true);
  let lastReport = $state<string | null>(null);

  // Default the ranges to the whole grid, and keep them valid as the grid changes.
  $effect(() => {
    const pick = (cur: string, list: { id: string }[], end: 'first' | 'last') =>
      list.some((a) => a.id === cur) ? cur : (end === 'first' ? list[0]?.id : list[list.length - 1]?.id) ?? '';
    fx0 = pick(fx0, xs, 'first'); fx1 = pick(fx1, xs, 'last');
    fy0 = pick(fy0, ys, 'first'); fy1 = pick(fy1, ys, 'last');
    fl0 = pick(fl0, levels, 'first'); fl1 = pick(fl1, levels, 'last');
    if (colSec === null || !modelStore.sections.has(colSec)) colSec = sections[0]?.id ?? null;
    if (beamXSec === null || !modelStore.sections.has(beamXSec)) beamXSec = sections[0]?.id ?? null;
    if (beamYSec === null || !modelStore.sections.has(beamYSec)) beamYSec = sections[0]?.id ?? null;
    if (matId === null || !modelStore.materials.has(matId)) matId = materials[0]?.id ?? null;
  });

  const layout = $derived.by(() => {
    if (matId === null) return null;
    const m = matId;
    return frameBetweenAxes(grid, {
      x: [fx0, fx1], y: [fy0, fy1], levels: [fl0, fl1],
      columns: wantCols && colSec !== null ? { sectionId: colSec, materialId: m } : null,
      beamsX: wantBX && beamXSec !== null ? { sectionId: beamXSec, materialId: m } : null,
      beamsY: wantBY && beamYSec !== null ? { sectionId: beamYSec, materialId: m } : null,
    });
  });

  function createFrame() {
    if (!layout) return;
    const r = insertFragment(fragmentFromMembers(layout.nodes, layout.members), [{ A: IDENTITY, t: [0, 0, 0] }]);
    uiStore.setSelection(new Set(r.nodes), new Set(r.elements), true);
    lastReport = tp('grid.frameCreated', { members: r.elements.length, nodes: r.nodes.length, welded: r.welded, duplicates: r.duplicates });
  }

  const issueText = (i: string) => {
    const [kind, what] = i.split(':');
    return tp(`grid.issue.${kind}`, { what: what ?? '' });
  };
</script>

<div class="pk gr" data-testid="grid-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('grid.axesTitle')}</h4>
    <p class="pk-hint">{t('grid.axesHint')}</p>
    {#each [{ axis: 'x' as const, d: bx, list: xs }, { axis: 'y' as const, d: by, list: ys }] as row (row.axis)}
      <div class="gr-dir" data-testid="grid-dir-{row.axis}">
        <div class="gr-dir-head">{t(`grid.dir.${row.axis}`)}</div>
        <div class="pk-row gr-wrap">
          <label class="gr-field gr-grow">{t('grid.bays')}
            <input bind:value={row.d.bays} placeholder="6; 7,5; 6" data-testid="grid-bays-{row.axis}" />
          </label>
          <label class="gr-field gr-narrow">{t('grid.origin')}
            <input bind:value={row.d.origin} data-testid="grid-origin-{row.axis}" />
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
            <thead><tr><th>{t('grid.name')}</th><th>{row.axis} (m)</th><th></th></tr></thead>
            <tbody>
              {#each row.list as a (a.id)}
                <tr data-testid="grid-axis-{a.name}">
                  <td><input class="gr-cell" value={a.name} onchange={(e) => editAxis(a, { name: e.currentTarget.value.trim() || a.name })} /></td>
                  <td><input class="gr-cell gr-num" value={fmt(a.at)} onchange={(e) => { const v = num(e.currentTarget.value); if (Number.isFinite(v)) editAxis(a, { at: v }); }} /></td>
                  <td><button class="pk-btn gr-del" title={t('grid.remove')} onclick={() => removeAxis(a)}>×</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="pk-row">
            <button class="pk-btn" onclick={() => addAxis(row.axis)}>{t('grid.addAxis')}</button>
            <span class="pk-hint">{t('grid.bays')}: {baysText(row.list) || '—'}</span>
          </div>
        {/if}
      </div>
    {/each}
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('grid.levelsTitle')}</h4>
    <p class="pk-hint">{t('grid.levelsHint')}</p>
    <div class="pk-row gr-wrap">
      <label class="gr-field gr-grow">{t('grid.heights')}
        <input bind:value={heights} placeholder="3; 3; 3" data-testid="grid-heights" />
      </label>
      <label class="gr-field gr-narrow">{t('grid.base')}
        <input bind:value={base} />
      </label>
      <label class="gr-field gr-grow">{t('grid.levelNames')}
        <input bind:value={names} placeholder="PB; 1er piso; 2do piso; Techo" />
      </label>
      <button class="pk-btn pk-btn-primary" disabled={!parseBays(heights)} onclick={generateLevels} data-testid="grid-generate-levels">{t('grid.generate')}</button>
    </div>
    {#if levels.length > 0}
      <table class="gr-table">
        <thead><tr><th>{t('grid.name')}</th><th>z (m)</th><th>{t('grid.workHere')}</th><th></th></tr></thead>
        <tbody>
          {#each [...levels].reverse() as l (l.id)}
            {@const active = activeZ !== null && Math.abs(activeZ - l.z) < 1e-6}
            <tr class:gr-active={active} data-testid="grid-level-{l.name}">
              <td><input class="gr-cell" value={l.name} onchange={(e) => editLevel(l, { name: e.currentTarget.value.trim() || l.name })} /></td>
              <td><input class="gr-cell gr-num" value={fmt(l.z)} onchange={(e) => { const v = num(e.currentTarget.value); if (Number.isFinite(v)) editLevel(l, { z: v }); }} /></td>
              <td><input type="radio" name="gr-active" checked={active} onchange={() => uiStore.setActiveLevel(l.z)} aria-label={tp('grid.workOn', { name: l.name })} data-testid="grid-activate-{l.name}" /></td>
              <td><button class="pk-btn gr-del" title={t('grid.remove')} onclick={() => removeLevel(l)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <label class="pk-row gr-check"><input type="checkbox" bind:checked={uiStore.snapToAxes} data-testid="grid-snap" /> {t('grid.snap')}</label>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('grid.fromModelTitle')}</h4>
    <p class="pk-hint">{t('grid.fromModelHint')}</p>
    <button class="pk-btn" disabled={modelStore.nodes.size === 0} onclick={readFromModel} data-testid="grid-from-model">{t('grid.fromModel')}</button>
    {#if grid.axes.length > 0 || grid.levels.length > 0}
      <button class="pk-btn gr-del" onclick={() => setGrid({ axes: [], levels: [] })} data-testid="grid-clear">{t('grid.clear')}</button>
    {/if}
    {#each issues as i (i)}<p class="pk-hint gr-warn">{issueText(i)}</p>{/each}
  </section>

  {#if xs.length > 0 && ys.length > 0 && levels.length > 0}
    <section class="pk-card" data-testid="grid-frame">
      <h4 class="pk-heading">{t('grid.frameTitle')}</h4>
      <p class="pk-hint">{t('grid.frameHint')}</p>
      <div class="gr-grid">
        <span>{t('grid.dir.x')}</span>
        <select bind:value={fx0}>{#each xs as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
        <select bind:value={fx1}>{#each xs as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
        <span>{t('grid.dir.y')}</span>
        <select bind:value={fy0}>{#each ys as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
        <select bind:value={fy1}>{#each ys as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
        <span>{t('grid.levelsTitle')}</span>
        <select bind:value={fl0}>{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
        <select bind:value={fl1}>{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
      </div>
      <div class="gr-grid">
        <label class="gr-check"><input type="checkbox" bind:checked={wantCols} /> {t('grid.columns')}</label>
        <select bind:value={colSec} disabled={!wantCols} data-testid="grid-col-section">{#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
        <span></span>
        <label class="gr-check"><input type="checkbox" bind:checked={wantBX} /> {t('grid.beamsX')}</label>
        <select bind:value={beamXSec} disabled={!wantBX}>{#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
        <span></span>
        <label class="gr-check"><input type="checkbox" bind:checked={wantBY} /> {t('grid.beamsY')}</label>
        <select bind:value={beamYSec} disabled={!wantBY}>{#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
        <span></span>
        <span>{t('grid.material')}</span>
        <select bind:value={matId}>{#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select>
        <span></span>
      </div>
      <div class="pk-row">
        <button class="pk-btn pk-btn-primary" disabled={!layout} onclick={createFrame} data-testid="grid-frame-create">
          {layout ? tp('grid.frameCreate', { n: layout.members.length }) : t('grid.frameNothing')}
        </button>
      </div>
      {#if lastReport}<p class="pk-hint" data-testid="grid-frame-report">{lastReport}</p>{/if}
    </section>
  {/if}
</div>

<style>
  .gr-dir { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-top: 1px solid var(--st-hair); }
  .gr-dir:first-of-type { border-top: none; }
  .gr-dir-head { font-size: 0.66rem; font-weight: 600; color: var(--st-text-2); }
  .gr-wrap { flex-wrap: wrap; align-items: flex-end; }
  .gr-field { display: flex; flex-direction: column; gap: 2px; font-size: 0.62rem; color: var(--st-text-3); }
  .gr-field input, .gr-field select { min-width: 0; }
  .gr-grow { flex: 1 1 120px; }
  .gr-narrow { width: 56px; }
  .gr-narrow input { width: 100%; }
  .gr-table { border-collapse: collapse; font-size: 0.66rem; width: 100%; }
  .gr-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 2px 4px; border-bottom: 1px solid var(--st-hair); }
  .gr-table td { padding: 1px 4px; border-bottom: 1px solid var(--st-hair); }
  .gr-cell { width: 100%; min-width: 0; background: transparent; border: 1px solid transparent; font-size: 0.66rem; padding: 1px 3px; color: var(--st-text); }
  .gr-cell:focus { border-color: var(--st-interactive); background: var(--st-surface); }
  .gr-num { text-align: right; font-family: var(--st-mono); }
  .gr-active td { background: var(--st-surface-3); }
  .gr-check { display: flex; gap: 6px; align-items: center; font-size: 0.66rem; }
  .gr-grid { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); gap: 4px 6px; align-items: center; font-size: 0.66rem; margin: 4px 0; }
  .gr-warn { color: var(--st-warning); }
  :global(.gr .gr-del) { min-height: 20px; padding: 0 0.45rem; }
</style>
