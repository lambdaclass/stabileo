<script lang="ts">
  /**
   * The view: named cameras, a second window on one of them, what the labels say, and the
   * magnifier.
   *
   * A named view is part of the project (`modelStore.views`): it is saved with it and carried by
   * the model code, so "the north frame" means the same camera to everyone who opens the file.
   * Which view sits in the corner window, and what member labels read, are this reader's.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { viewState, viewVisibility, MEMBER_LABELS, type MemberLabel } from '../../lib/store/view-state.svelte';
  import ViewCubeIcon, { type CubeFace } from './ViewCubeIcon.svelte';
  import { categoryCss } from '../../lib/viewport/element-colour';
  import type { SavedViewDisplay } from '../../lib/store/model.svelte';
  import { placementStore } from '../../lib/store/placement.svelte';
  import { addNote } from '../../lib/model/annotations';
  import { UNIT_SYSTEMS } from '../../lib/utils/units';
  import { displayUnits, unitQ, DECIMAL_QUANTITIES } from '../../lib/store/display-units.svelte';

  const PRESETS: CubeFace[] = ['top', 'front', 'right', 'iso', 'bottom', 'back', 'left'];
  const selection = () => ({ nodes: uiStore.selectedNodes, elements: uiStore.selectedElements, shells: uiStore.selectedShells });
  const selectionCount = $derived(uiStore.selectedNodes.size + uiStore.selectedElements.size + uiStore.selectedShells.size);
  const hiddenCount = $derived(viewVisibility.hidden ? viewVisibility.hidden.elements.size + viewVisibility.hidden.shells.size : 0);

  /** What each colour means, while members are coloured by a category. */
  const colourLegend = $derived.by(() => {
    const m = uiStore.elementColorMode;
    const used = new Set<number>();
    if (m === 'bySection') for (const e of modelStore.elements.values()) used.add(e.sectionId);
    if (m === 'byMaterial') for (const e of modelStore.elements.values()) used.add(e.materialId);
    if (m === 'bySection') return [...used].sort((a, b) => a - b).map((id) => ({ id, name: modelStore.sections.get(id)?.name ?? String(id) }));
    if (m === 'byMaterial') return [...used].sort((a, b) => a - b).map((id) => ({ id, name: modelStore.materials.get(id)?.name ?? String(id) }));
    if (m === 'byGroup') return [...modelStore.model.groups.values()].filter((g) => (g.members.elements?.length ?? 0) > 0).map((g) => ({ id: g.id, name: g.name }));
    return [];
  });

  let name = $state('');
  let noteText = $state('');
  let noteAt = $state('');
  const parseAt = (v: string) => {
    const p = v.split(/[;\s]+/).filter(Boolean).map((x) => Number(x.replace(',', '.')));
    return p.length === 3 && p.every(Number.isFinite) ? { x: p[0]!, y: p[1]!, z: p[2]! } : null;
  };
  function pickNotePoint() {
    placementStore.pickPoints(1, () => t('view.notePick'), (pts) => { const p = pts[0]; if (p) noteAt = `${+p[0].toFixed(3)}; ${+p[1].toFixed(3)}; ${+p[2].toFixed(3)}`; });
  }
  function addNoteNow() {
    const at = parseAt(noteAt);
    if (!at || !noteText.trim()) return;
    modelStore.setNotes(addNote(modelStore.notes, at, noteText));
    noteText = '';
  }
  const views = $derived(modelStore.views);
  const hasSelection = $derived(uiStore.selectedNodes.size + uiStore.selectedElements.size > 0);

  /** What a view keeps beyond the camera: projection, zoom, the hidden, the labels, the colours. */
  function display(): SavedViewDisplay {
    const h = viewVisibility.hidden;
    return {
      camera: uiStore.cameraMode3D,
      ...(uiStore.cameraMode3D === 'orthographic' ? { orthoZoom: uiStore.cameraOrthoZoom3D } : {}),
      ...(h ? { hidden: { elements: [...h.elements], shells: [...h.shells] } } : {}),
      labels: { nodes: uiStore.showNodeLabels3D, members: uiStore.showElementLabels3D, memberLabel: viewState.memberLabel, lengths: uiStore.showLengths3D, shells: uiStore.showShellLabels3D },
      colourBy: uiStore.elementColorMode,
    };
  }

  function save() {
    const n = name.trim() || tp('view.defaultName', { n: views.length + 1 });
    modelStore.saveView(n, uiStore.cameraPosition3D, uiStore.cameraTarget3D, display());
    name = '';
  }

  function show(id: number) {
    const v = views.find((x) => x.id === id);
    if (!v) return;
    const d = v.display;
    if (d) {
      uiStore.cameraMode3D = d.camera;
      viewVisibility.restore(d.hidden);
      uiStore.showNodeLabels3D = d.labels.nodes;
      uiStore.showElementLabels3D = d.labels.members;
      viewState.memberLabel = d.labels.memberLabel as MemberLabel;
      uiStore.showLengths3D = d.labels.lengths;
      uiStore.showShellLabels3D = d.labels.shells;
      if (d.colourBy) uiStore.elementColorMode = d.colourBy as never;
    }
    // After the projection has switched, so the camera it moves is the one on screen.
    queueMicrotask(() => window.dispatchEvent(new CustomEvent('stabileo-camera-set', { detail: { position: v.position, target: v.target, orthoZoom: d?.orthoZoom } })));
  }

  function toggleInset(id: number) {
    viewState.insetViewId = viewState.insetViewId === id ? null : id;
  }

  function remove(id: number) {
    if (viewState.insetViewId === id) viewState.insetViewId = null;
    modelStore.removeView(id);
  }
</script>

<div class="pk vp" data-testid="view-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('view.presets')}</h4>
    <div class="vp-cubes" data-testid="view-presets">
      {#each PRESETS as f (f)}
        <button class="pk-btn vp-cube" title={t(`view.preset.${f}`)} aria-label={t(`view.preset.${f}`)}
          onclick={() => window.dispatchEvent(new CustomEvent('stabileo-camera-view', { detail: f }))} data-testid="view-preset-{f}">
          <ViewCubeIcon face={f} />
          <span>{t(`view.preset.${f}`)}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.visibility')}</h4>
    <p class="pk-hint">{t('view.visibilityHint')}</p>
    <div class="pk-row">
      <button class="pk-btn" disabled={selectionCount === 0} onclick={() => viewVisibility.isolate(selection())} data-testid="view-isolate">{t('view.isolate')}</button>
      <button class="pk-btn" disabled={selectionCount === 0} onclick={() => viewVisibility.hide(selection())} data-testid="view-hide">{t('view.hide')}</button>
      <button class="pk-btn" disabled={!viewVisibility.active} onclick={() => viewVisibility.showAll()} data-testid="view-show-all">{t('view.showAll')}</button>
    </div>
    {#if viewVisibility.active}<p class="pk-warn" data-testid="view-hidden-note">{tp('view.hiddenNote', { n: hiddenCount })}</p>{/if}
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.saved')}</h4>
    <div class="pk-row">
      <input class="pk-grow" placeholder={t('view.namePlaceholder')} bind:value={name} onkeydown={(e) => { if (e.key === 'Enter') save(); }} data-testid="view-name" />
      <button class="pk-btn" onclick={save} data-testid="view-save">{t('view.saveCurrent')}</button>
    </div>
    {#if views.length === 0}
      <p class="pk-hint">{t('view.none')}</p>
    {:else}
      <ul class="vp-list" data-testid="view-list">
        {#each views as v (v.id)}
          <li>
            <input class="pk-grow" value={v.name} onchange={(e) => { const s = (e.target as HTMLInputElement).value.trim(); if (s && s !== v.name) modelStore.renameView(v.id, s); }} aria-label={t('view.rename')} />
            <button class="pk-btn" onclick={() => show(v.id)} data-testid="view-go">{t('view.go')}</button>
            <button class="pk-btn" class:on={viewState.insetViewId === v.id} onclick={() => toggleInset(v.id)} title={t('view.insetHint')} data-testid="view-inset-toggle">{t('view.inset')}</button>
            <button class="pk-btn pk-btn-icon" onclick={() => remove(v.id)} aria-label={t('view.remove')}>×</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="pk-card" data-testid="view-units">
    <h4 class="pk-heading">{t('view.units')}</h4>
    <div class="pk-row">
      <select bind:value={uiStore.unitSystem} data-testid="view-unit-system">
        {#each UNIT_SYSTEMS as u (u)}<option value={u}>{t(`config.unit${u}`)}</option>{/each}
      </select>
    </div>
    <div class="vp-dec">
      {#each DECIMAL_QUANTITIES as q (q)}
        <label>{t(`view.qty.${q}`)} <span class="vp-unit">({unitQ(q)})</span>
          <input type="number" min="0" max="8" step="1" placeholder={t('view.decimalsAuto')} value={displayUnits.decimals[q] ?? ''}
            onchange={(e) => displayUnits.setDecimals(q, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} data-testid="view-dec-{q}" />
        </label>
      {/each}
    </div>
    <p class="pk-hint">{t('view.unitsHint')}</p>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.colourBy')}</h4>
    <div class="pk-row">
      <select bind:value={uiStore.elementColorMode} data-testid="view-colour-by">
        <option value="uniform">{t('config.uniform')}</option>
        <option value="bySection">{t('config.bySection')}</option>
        <option value="byMaterial">{t('config.byMaterial')}</option>
        <option value="byGroup">{t('config.byGroup')}</option>
      </select>
    </div>
    {#if colourLegend.length}
      <ul class="vp-legend" data-testid="view-colour-legend">
        {#each colourLegend as c (c.id)}<li><span class="vp-swatch" style="background:{categoryCss(c.id)}"></span>{c.name}</li>{/each}
      </ul>
    {/if}
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.labels')}</h4>
    <label class="pk-check"><input type="checkbox" bind:checked={uiStore.showNodeLabels3D} /> {t('view.labelNodes')} <kbd>Alt+N</kbd></label>
    <label class="pk-check"><input type="checkbox" bind:checked={uiStore.showElementLabels3D} /> {t('view.labelMembers')} <kbd>Alt+B</kbd></label>
    <div class="pk-row vp-indent">
      <span class="pk-label">{t('view.memberLabelShows')}</span>
      <select value={viewState.memberLabel} onchange={(e) => (viewState.memberLabel = (e.target as HTMLSelectElement).value as MemberLabel)} data-testid="view-member-label">
        {#each MEMBER_LABELS as m (m)}<option value={m}>{t(`view.memberLabel.${m}`)}</option>{/each}
      </select>
      <kbd>Alt+M</kbd>
    </div>
    <label class="pk-check"><input type="checkbox" bind:checked={uiStore.showLengths3D} /> {t('view.labelLengths')} <kbd>Alt+L</kbd></label>
    <label class="pk-check"><input type="checkbox" bind:checked={uiStore.showShellLabels3D} /> {t('view.labelShells')} <kbd>Alt+P</kbd></label>
    <label class="pk-check"><input type="checkbox" bind:checked={viewState.labelsOnSelection} data-testid="view-labels-selection" /> {t('view.labelsOnSelection')}</label>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.draw')}</h4>
    <label class="pk-check"><input type="checkbox" bind:checked={viewState.showConstraints} data-testid="view-draw-constraints" /> {t('view.drawConstraints')}</label>
    <label class="pk-check"><input type="checkbox" bind:checked={viewState.showMemberEnds} data-testid="view-draw-ends" /> {t('view.drawEnds')}</label>
  </section>

  <section class="pk-card" data-testid="view-notes">
    <h4 class="pk-heading">{t('view.notes')}</h4>
    <div class="pk-row">
      <input class="pk-grow" placeholder={t('view.noteText')} bind:value={noteText} data-testid="view-note-text" />
    </div>
    <div class="pk-row">
      <input class="pk-grow" placeholder="x; y; z" bind:value={noteAt} data-testid="view-note-at" />
      <button class="pk-btn" onclick={pickNotePoint}>{t('view.notePick')}</button>
      <button class="pk-btn" disabled={!noteText.trim() || !parseAt(noteAt)} onclick={addNoteNow} data-testid="view-note-add">{t('view.noteAdd')}</button>
    </div>
    {#if modelStore.notes.length}
      <ul class="vp-list">
        {#each modelStore.notes as n (n.id)}
          <li>
            <input class="pk-grow" value={n.text} onchange={(e) => modelStore.setNotes(modelStore.notes.map((x) => (x.id === n.id ? { ...x, text: e.currentTarget.value } : x)))} aria-label={t('view.noteText')} />
            <button class="pk-btn pk-btn-icon" onclick={() => modelStore.setNotes(modelStore.notes.filter((x) => x.id !== n.id))} aria-label={t('view.noteRemove')}>×</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.magnifier')}</h4>
    <div class="pk-row">
      <button class="pk-btn" onclick={() => window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection'))} disabled={!hasSelection} data-testid="view-zoom-selection">{t('view.zoomSelection')}</button>
      <kbd>Alt+Z</kbd>
      <button class="pk-btn" onclick={() => window.dispatchEvent(new CustomEvent('stabileo-zoom-to-fit'))}>{t('view.zoomAll')}</button>
      <kbd>F</kbd>
      <button class="pk-btn" class:on={viewState.zoomWindowArmed} onclick={() => (viewState.zoomWindowArmed = !viewState.zoomWindowArmed)} data-testid="view-zoom-window">{t('view.zoomWindow')}</button>
    </div>
    {#if viewState.zoomWindowArmed}<p class="pk-hint" data-testid="view-zoom-window-hint">{t('view.zoomWindowHint')}</p>{/if}
    <p class="pk-hint">{t('view.magnifierHint')}</p>
  </section>
</div>

<style>
  .vp-cubes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .vp-cube { flex-direction: column; gap: 2px; min-height: 48px; padding: 4px 2px; font-size: 0.6rem; }
  .vp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .vp-list li { display: flex; gap: 4px; align-items: center; }
  .vp-indent { padding-left: 1.3rem; }
  .vp-dec { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px 8px; margin: 6px 0; font-size: 0.62rem; color: var(--st-text-2); }
  .vp-dec label { display: flex; flex-direction: column; gap: 2px; }
  .vp-dec input { width: 64px; }
  .vp-unit { color: var(--st-text-3); }
  .vp-legend { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 0.62rem; color: var(--st-text-2); }
  .vp-legend li { display: inline-flex; gap: 4px; align-items: center; }
  .vp-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  kbd { font-size: 0.58rem; color: var(--st-text-3); border: 1px solid var(--st-hair); border-radius: 2px; padding: 0 3px; font-family: var(--st-mono); }
</style>
