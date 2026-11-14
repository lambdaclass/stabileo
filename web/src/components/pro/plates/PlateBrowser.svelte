<script lang="ts">
  import { modelStore, resultsStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { physicalPlates, plateStatus, platesNeedingMesh } from '../../../lib/store/physical-plates';
  import { plateArea, plateGeometry } from '../../../lib/model/physical/plate';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import { plateMeshState, thicknessText } from './plate-state';
  import PlateMeshDialog from './PlateMeshDialog.svelte';

  let kind = $state<'all' | 'slab' | 'wall'>('all');
  let level = $state<string>('all');

  const levels = $derived(modelStore.grid?.levels ?? []);
  const zOf = (id?: string) => levels.find((l) => l.id === id)?.z ?? (id?.startsWith('z:') ? Number(id.slice(2)) : 0);
  const levelName = (id?: string) => {
    const l = levels.find((x) => x.id === id);
    if (l) return l.name;
    const z = zOf(id);
    return `${z >= 0 ? '+' : ''}${fmtQ(z, 'length')} ${unitQ('length')}`;
  };

  const rows = $derived.by(() => {
    void modelStore.modelVersion; void modelStore.model.groups;
    return physicalPlates().map((p) => {
      const geo = plateGeometry(modelStore, p.group);
      const status = plateStatus(p.id);
      return {
        id: p.id, name: p.name, wall: p.physical.kind === 'wall', level: p.physical.levelFrom ?? '', z: zOf(p.physical.levelFrom),
        area: geo ? plateArea(geo) : 0, thickness: p.surface.thickness, state: plateMeshState(p, status),
      };
    }).sort((a, b) => a.z - b.z || Number(a.wall) - Number(b.wall) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  });
  const levelIds = $derived([...new Set(rows.map((r) => r.level))]);
  const shown = $derived(rows.filter((r) => (kind === 'all' || (kind === 'wall') === r.wall) && (level === 'all' || r.level === level)));
  const groups = $derived.by(() => {
    const out: Array<{ level: string; rows: typeof shown }> = [];
    for (const r of shown) {
      const last = out.at(-1);
      if (last && last.level === r.level) last.rows.push(r); else out.push({ level: r.level, rows: [r] });
    }
    return out;
  });
  const counts = $derived({ all: rows.length, slab: rows.filter((r) => !r.wall).length, wall: rows.filter((r) => r.wall).length });
  const selected = $derived(uiStore.selectedPlates);
  const allShown = $derived(shown.length > 0 && shown.every((r) => selected.has(r.id)));
  const pending = $derived.by(() => { void rows; return platesNeedingMesh(); });
  let meshIds = $state<number[] | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    const first = [...selected].find((id) => shown.some((r) => r.id === id));
    if (first === undefined || !listEl) return;
    listEl.querySelector<HTMLElement>(`[data-testid="plate-row-${first}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  function pick(id: number, add: boolean) {
    uiStore.selectMode = 'shells';
    uiStore.shellPickScope = 'plate';
    if (add && selected.has(id)) uiStore.selectPlates([...selected].filter((x) => x !== id));
    else uiStore.selectPlates([id], add);
  }
  function pickAll() {
    uiStore.selectMode = 'shells';
    uiStore.shellPickScope = 'plate';
    uiStore.selectPlates(allShown ? [...selected].filter((id) => !shown.some((r) => r.id === id)) : [...new Set([...selected, ...shown.map((r) => r.id)])]);
  }
</script>

{#if rows.length}
  <section class="pb" data-testid="plate-list">
    <div class="pb-bar">
      <div class="pb-seg" role="radiogroup" aria-label={t('plates.filterKind')}>
        {#each [['all', t('plates.kindAll')], ['slab', t('plates.kindSlabs')], ['wall', t('plates.kindWalls')]] as [k, label] (k)}
          <button role="radio" aria-checked={kind === k} class:on={kind === k} disabled={k !== 'all' && counts[k as 'slab' | 'wall'] === 0} onclick={() => (kind = k as typeof kind)} data-testid="plate-filter-{k}">{label} ({counts[k as 'all' | 'slab' | 'wall']})</button>
        {/each}
      </div>
      {#if levelIds.length > 1}
        <select bind:value={level} aria-label={t('plates.filterLevel')} data-testid="plate-filter-level">
          <option value="all">{t('plates.allLevels')}</option>
          {#each levelIds as id (id)}<option value={id}>{levelName(id)}</option>{/each}
        </select>
      {/if}
    </div>

    <div class="pb-head">
      <label class="pb-all"><input type="checkbox" checked={allShown} onchange={pickAll} data-testid="plate-select-all" /> {selected.size ? tp('plates.nSelectedOf', { n: selected.size, of: rows.length }) : t('plates.selectAll')}</label>
      <label class="pb-mesh" title={t('plates.showMeshHint')}><input type="checkbox" checked={uiStore.platesShowMesh ?? resultsStore.results3D != null} onchange={(e) => (uiStore.platesShowMesh = e.currentTarget.checked)} data-testid="plates-show-mesh" /> {t('plates.showMesh')}</label>
    </div>

    <div class="pb-list" bind:this={listEl} role="listbox" aria-multiselectable="true" aria-label={tp('plates.scopePlates', { n: rows.length })}>
      {#each groups as g (g.level)}
        <div class="pb-level">{levelName(g.level)}</div>
        {#each g.rows as r (r.id)}
          <div class="pb-row" class:sel={selected.has(r.id)} role="option" aria-selected={selected.has(r.id)} tabindex="0"
            onclick={(e) => pick(r.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r.id, e.shiftKey || e.metaKey || e.ctrlKey); } }}
            data-testid="plate-row-{r.id}">
            <input type="checkbox" checked={selected.has(r.id)} onclick={(e) => { e.stopPropagation(); pick(r.id, true); }} aria-label={r.name} tabindex="-1" />
            <span class="pb-name">{r.name}</span>
            <span class="pb-kind">{t(r.wall ? 'plates.kind.wall' : 'plates.kind.slab')}</span>
            <span class="pb-num">{fmtQ(r.area, 'planArea')} {unitQ('planArea')}</span>
            <span class="pb-num">{thicknessText(r.thickness)}</span>
            <span class="pb-state tone-{r.state.tone}" data-testid="plate-state-{r.id}">{r.state.text}</span>
          </div>
        {/each}
      {/each}
    </div>

    {#if pending.length}
      <button class="pk-btn" onclick={() => (meshIds = pending)} data-testid="plate-list-mesh-pending">{tp('plates.meshPending', { n: pending.length })}</button>
    {/if}
  </section>
  {#if meshIds}<PlateMeshDialog ids={meshIds} onclose={() => (meshIds = null)} />{/if}
{/if}

<style>
  .pb { margin: 0 8px 8px; display: flex; flex-direction: column; gap: 6px; font-size: 0.72rem; color: var(--st-text-2); }
  .pb-bar, .pb-head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .pb-head { justify-content: space-between; }
  .pb-seg { display: inline-flex; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .pb-seg button { padding: 2px 8px; background: none; border: none; color: var(--st-text-2); font: inherit; cursor: pointer; }
  .pb-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .pb-seg button.on { background: var(--st-selected-bg, var(--st-surface-3)); color: var(--st-text); }
  .pb-seg button:disabled { opacity: 0.4; cursor: default; }
  .pb-bar select { font: inherit; padding: 2px 4px; background: var(--st-ink); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); }
  .pb-all, .pb-mesh { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
  .pb-list { max-height: 260px; overflow-y: auto; border: 1px solid var(--st-hair); border-radius: var(--st-radius); background: var(--st-surface-2); }
  .pb-level { position: sticky; top: 0; z-index: 1; padding: 3px 8px; background: var(--st-surface-3); color: var(--st-text-3); font-size: 0.66rem; }
  .pb-row { user-select: none; display: grid; grid-template-columns: 16px 34px 56px 72px 48px minmax(0, 1fr); gap: 8px; align-items: center; padding: 3px 8px; cursor: pointer; border-left: 2px solid transparent; }
  .pb-row:hover { background: var(--st-surface-3); }
  .pb-row.sel { background: var(--st-selected-bg, var(--st-surface-3)); border-left-color: var(--st-accent); }
  .pb-row:focus-visible { outline: 2px solid var(--st-focus); outline-offset: -2px; }
  .pb-row input { margin: 0; }
  .pb-name { color: var(--st-text); font-weight: 600; }
  .pb-kind { color: var(--st-text-3); }
  .pb-num { font-family: var(--st-font-mono, monospace); text-align: right; white-space: nowrap; }
  .pb-state { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tone-none, .tone-raw { color: var(--st-text-3); }
  .tone-ok { color: var(--st-ok, #5cb85c); }
  .tone-warn { color: var(--st-warn, #d9a441); }
  .tone-bad { color: var(--st-danger, #e06c6c); }
</style>
