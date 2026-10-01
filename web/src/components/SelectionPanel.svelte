<script lang="ts">
  /**
   * What a selection picks up.
   *
   * The pointer mode — select or pan — lives on the model, where the pointer
   * is. What needs a panel is the other half of the question: which KINDS of
   * thing a click or a drag takes. A frame with members, supports and loads
   * stacked on the same nodes cannot be selected usefully without saying which
   * of them you mean, and that choice persists across dozens of gestures.
   *
   * One place, not two: this used to sit in the tool-options strip under the
   * ribbon, shown while the select tool was armed. With the pointer mode no
   * longer a ribbon command there is no "select tool armed" state for that
   * strip to key off, and two controls for one setting is how they end up
   * disagreeing.
   */
  import { uiStore, modelStore } from '../lib/store';
  import { selectAll, invertSelection, selectByIds, loadedInCase, parallelToGlobal, type GlobalDirection } from '../lib/model/select-ops';
  import { selectionHistory, trackSelectionHistory } from '../lib/store/selection-history.svelte';
  import { viewState } from '../lib/store/view-state.svelte';
  import { groupByParallel, groupByConnectivity, groupBySection, groupByMaterial, groupByElevation, groupByPlane, groupByFrameLine, groupByKind, memberKindOf } from '../lib/engine/design/member-grouping';
  import { t, tp } from '../lib/i18n';

  /**
   * Section stress is deliberately absent: it is not a kind of thing to
   * select, it is an analysis, reached from Advanced where it belongs.
   */
  const ALL_MODES = [
    { id: 'elements', key: 'float.selectElements', hint: 'float.selectElementsHint' },
    { id: 'nodes', key: 'float.selectNodes', hint: 'float.selectNodesHint' },
    { id: 'shells', key: 'float.selectShells', hint: 'float.selectShellsHint' },
    { id: 'supports', key: 'float.selectSupports', hint: 'float.selectSupportsHint' },
    { id: 'loads', key: 'float.selectLoads', hint: 'float.selectLoadsHint' },
  ] as const;

  /*
   * Shells only where shells exist.
   *
   * Basic has no plates, so offering "select plates" there is a control for
   * something the mode cannot contain. Driven by the MODE rather than by
   * whether the model happens to have one yet: a kind you cannot select until
   * you have drawn one is a chicken-and-egg, and PRO is where plates live.
   */
  const MODES = $derived(
    uiStore.appMode === 'pro' ? ALL_MODES : ALL_MODES.filter((m) => m.id !== 'shells'),
  );

  // ── Operating on the selection as a set ──────────────────────────
  let byIdKind = $state<'nodes' | 'elements' | 'plates' | 'quads'>('elements');
  let byIdText = $state('');
  let byIdNote = $state('');

  /** The kinds currently being selected, as the set the operations take. */
  const armedKinds = $derived(new Set(MODES.filter((m) => uiStore.selectsKind(m.id)).map((m) => m.id)));

  function apply(sel: { nodes: Set<number>; elements: Set<number>; shells: Set<string>; supports?: Set<number>; loads?: Set<number> }) {
    uiStore.setSelection(sel.nodes, sel.elements, true, sel.shells);
    // Supports and loads are their own channels; an operation that does not reach them clears them,
    // as a click on a member does, so what stays lit is what the operation took.
    uiStore.selectedSupports = sel.supports ?? new Set();
    uiStore.selectedLoads = sel.loads ?? new Set();
  }

  trackSelectionHistory();

  // ── More ways to select ──────────────────────────────────────────
  let loadCase = $state<number | null>(null);
  const cases = $derived(modelStore.loadCases);
  function selectLoaded() {
    const id = loadCase ?? cases[0]?.id;
    if (id === undefined) return;
    const sel = loadedInCase(modelStore.loads as never, id);
    // With loads armed it takes the loads themselves; otherwise what they sit on.
    if (uiStore.selectsKind('loads')) apply({ nodes: new Set(), elements: new Set(), shells: new Set(), loads: sel.loads });
    else apply({ ...sel, loads: undefined });
  }
  let globalDir = $state<GlobalDirection>('Z');
  function selectParallel() {
    apply({ nodes: new Set(), elements: parallelToGlobal(modelStore.nodes, modelStore.elements, globalDir), shells: new Set() });
  }

  // ── Walking through a set, one at a time, framed ─────────────────
  let walk = $state<{ kind: 'elements' | 'nodes'; ids: number[] } | null>(null);
  let walkAt = $state(0);
  function startWalk() {
    const els = [...uiStore.selectedElements], ns = [...uiStore.selectedNodes];
    const ids = els.length ? els : ns.length ? ns : [...modelStore.elements.keys()];
    walk = { kind: els.length || !ns.length ? 'elements' : 'nodes', ids: ids.sort((a, b) => a - b) };
    walkAt = -1;
    step(1);
  }
  function step(by: 1 | -1) {
    if (!walk || walk.ids.length === 0) return;
    walkAt = (walkAt + by + walk.ids.length) % walk.ids.length;
    const id = walk.ids[walkAt]!;
    if (walk.kind === 'elements') { uiStore.selectMode = 'elements'; uiStore.setSelection(new Set(), new Set([id]), true); }
    else { uiStore.selectMode = 'nodes'; uiStore.setSelection(new Set([id]), new Set(), true); }
    window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection'));
  }

  function doSelectAll() {
    apply(selectAll(modelStore.model as never, armedKinds as never));
  }

  function doInvert() {
    apply(invertSelection(modelStore.model as never, armedKinds as never, {
      nodes: new Set(uiStore.selectedNodes),
      elements: new Set(uiStore.selectedElements),
      shells: new Set(uiStore.selectedShells),
      supports: new Set(uiStore.selectedSupports),
      loads: new Set(uiStore.selectedLoads),
    }));
  }

  /*
   * ── Like what is selected ─────────────────────────────────────────
   * The member groupings design already has (`member-grouping.ts`), offered where selection
   * lives: members parallel to, connected to, or sharing the section or material of the
   * selected ones. Seeded by the selection, so "every beam running this way" is two clicks.
   */
  const seedMembers = $derived([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)));
  function like(kind: 'parallel' | 'connected' | 'section' | 'material' | 'level' | 'plane' | 'frame' | 'kind') {
    const model = modelStore.model as never;
    let ids: number[] = [];
    const seeds = new Set(seedMembers);
    const refuse = (key?: string) => { byIdNote = t(key ?? 'selection.likeNone'); };
    if (kind === 'parallel') ids = groupByParallel(model, seedMembers);
    else if (kind === 'connected') ids = groupByConnectivity(model, seedMembers, 1, false);
    else if (kind === 'level') {
      // The storey the selected members sit on: its beams, and the columns rising from it.
      const g = groupByElevation(model);
      if (!g.available) return refuse(g.refusedKey);
      const bands = g.bands.filter((b) => [...b.beamIds, ...b.columnsRisingIds].some((id) => seeds.has(id)));
      ids = [...new Set(bands.flatMap((b) => [...b.beamIds, ...b.columnsRisingIds, ...b.slopedBeamIds]))];
    } else if (kind === 'plane') {
      const g = groupByPlane(model);
      if (!g.available) return refuse(g.refusedKey);
      ids = [...new Set(g.planes.filter((p) => p.elementIds.some((id) => seeds.has(id))).flatMap((p) => p.elementIds))];
    } else if (kind === 'frame') {
      const g = groupByFrameLine(model);
      if (!g.available) return refuse(g.refusedKey);
      ids = [...new Set(g.lines.filter((l) => l.elementIds.some((id) => seeds.has(id))).flatMap((l) => l.elementIds))];
    } else if (kind === 'kind') {
      const kinds = new Set(seedMembers.map((id) => memberKindOf(model, id)).filter((k) => k !== null));
      ids = [...new Set([...kinds].flatMap((k) => groupByKind(model, k!)))];
    } else {
      const set = new Set<number>();
      for (const id of seedMembers) {
        const e = modelStore.elements.get(id)!;
        for (const x of kind === 'section' ? groupBySection(model, e.sectionId) : groupByMaterial(model, e.materialId)) set.add(x);
      }
      ids = [...set];
    }
    uiStore.setSelection(new Set(), new Set(ids), true);
    byIdNote = tp('selection.likeCount', { n: ids.length });
  }

  function doSelectByIds() {
    const r = selectByIds(modelStore.model as never, byIdKind, byIdText);
    apply(r.selection);
    /* Reported, not dropped: "select 1, 2, 9" quietly giving two of three is
       the kind of quiet wrongness that ends with a member missing from a
       design run. */
    const parts: string[] = [];
    if (r.missing.length) parts.push(tp('selection.missingIds', { ids: r.missing.join(', ') }));
    if (r.bad.length) parts.push(tp('selection.badIds', { text: r.bad.join(', ') }));
    byIdNote = parts.join(' ');
  }
</script>

<div class="sel-panel">
  <!--
    Off by default, and the default is the point: with one kind active a click
    on a node that carries a support and a load has exactly one meaning. Multi
    trades that certainty for reach, which is worth it for a drag and confusing
    as a permanent setting.
  -->
  <label class="sel-multi">
    <input
      type="checkbox"
      bind:checked={uiStore.multiKindSelect}
      data-testid="multi-kind"
    />
    <span>{t('selection.multi')}</span>
  </label>
  <p class="sel-intro">{uiStore.multiKindSelect ? t('selection.multiHelp') : t('selection.intro')}</p>

  <!--
    Plain toggle buttons, not radios-that-become-checkboxes. A radiogroup
    owes the keyboard roving tabindex and arrow-key movement, which this list
    never implemented — and a role that promises behaviour it does not have
    is worse than a plainer one that tells the truth. `aria-pressed` still
    says which kinds are on; that exactly one is on in single-kind mode is
    the store's invariant (applySelectMode / toggleSelectKind), not the
    markup's.
  -->
  <div
    class="sel-list"
    role="group"
    aria-label={t('ribbon.selection')}
  >
    {#each MODES as m}
      {@const on = uiStore.selectsKind(m.id)}
      <button
        class="sel-item"
        class:on
        aria-pressed={on}
        onclick={() => uiStore.toggleSelectKind(m.id)}
        data-testid={`select-mode-${m.id}`}
      >
        <span class="sel-name">
          {#if uiStore.multiKindSelect}<span class="sel-tick" aria-hidden="true">{on ? '☑' : '☐'}</span>{/if}
          {t(m.key)}
        </span>
        <span class="sel-hint">{t(m.hint)}</span>
      </button>
    {/each}
  </div>
  <p class="sel-note">{t('selection.dragNote')}</p>

  <!--
    ── Operations on the selection AS A SET ──────────────────────────
    Picking one thing, dragging a Window or Crossing box, filtering by kind:
    all present. What was missing is everything that treats the selection as
    a set — take all of it, take none, take the other half, or name what you
    want by id because you are reading it out of a table.

    "All" is restricted to the kinds above, deliberately. Selecting every node
    and plate while a reader is working on members means the next thing they
    do — delete, assign a section — reaches things they cannot see they took.
  -->
  <div class="sel-ops">
    <button class="sel-op" onclick={doSelectAll} data-testid="sel-all">{t('selection.all')}</button>
    <button class="sel-op" onclick={() => uiStore.clearSelection()} data-testid="sel-none">{t('selection.none')}</button>
    <button class="sel-op" onclick={doInvert} data-testid="sel-invert">{t('selection.invert')}</button>
  </div>
  <div class="sel-like" data-testid="sel-like">
    <span class="sel-like-label">{tp('selection.like', { n: seedMembers.length })}</span>
    <div class="sel-ops">
      <button class="sel-op" disabled={seedMembers.length === 0} onclick={() => like('parallel')} data-testid="sel-like-parallel">{t('selection.likeParallel')}</button>
      <button class="sel-op" disabled={seedMembers.length === 0} onclick={() => like('connected')} data-testid="sel-like-connected">{t('selection.likeConnected')}</button>
      <button class="sel-op" disabled={seedMembers.length === 0} onclick={() => like('section')} data-testid="sel-like-section">{t('selection.likeSection')}</button>
      <button class="sel-op" disabled={seedMembers.length === 0} onclick={() => like('material')} data-testid="sel-like-material">{t('selection.likeMaterial')}</button>
      <button class="sel-op" disabled={seedMembers.length === 0} onclick={() => like('kind')} data-testid="sel-like-kind">{t('selection.likeKind')}</button>
      <button class="sel-op" disabled={seedMembers.length === 0} onclick={() => like('level')} data-testid="sel-like-level">{t('selection.likeLevel')}</button>
      <button class="sel-op" disabled={seedMembers.length === 0} onclick={() => like('plane')} data-testid="sel-like-plane">{t('selection.likePlane')}</button>
      <button class="sel-op" disabled={seedMembers.length === 0} onclick={() => like('frame')} data-testid="sel-like-frame">{t('selection.likeFrame')}</button>
    </div>
  </div>

  <div class="sel-more" data-testid="sel-more">
    {#if uiStore.appMode === 'pro'}
      <label class="sel-like-label"><input type="checkbox" bind:checked={viewState.lasso} data-testid="sel-lasso" /> {t('selection.lasso')}</label>
    {/if}
    <div class="sel-byid-row">
      <span class="sel-like-label">{t('selection.loadedIn')}</span>
      <select value={loadCase ?? cases[0]?.id} onchange={(e) => (loadCase = Number(e.currentTarget.value))} data-testid="sel-loaded-case" aria-label={t('selection.loadedIn')}>
        {#each cases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
      <button class="sel-op" disabled={cases.length === 0} onclick={selectLoaded} data-testid="sel-loaded-go">{t('selection.go')}</button>
    </div>
    <div class="sel-byid-row">
      <span class="sel-like-label">{t('selection.parallelTo')}</span>
      <select bind:value={globalDir} data-testid="sel-parallel-dir" aria-label={t('selection.parallelTo')}>
        {#each ['X', 'Y', 'Z', 'XY', 'XZ', 'YZ'] as d (d)}<option value={d}>{d.length === 1 ? tp('selection.axis', { d }) : tp('selection.plane', { d })}</option>{/each}
      </select>
      <button class="sel-op" onclick={selectParallel} data-testid="sel-parallel-go">{t('selection.go')}</button>
    </div>
    <div class="sel-ops">
      <button class="sel-op" disabled={selectionHistory.previous.length === 0} onclick={() => selectionHistory.back()} data-testid="sel-previous">{t('selection.previous')}</button>
      {#if walk}
        <button class="sel-op" onclick={() => step(-1)} aria-label={t('selection.walkPrev')} data-testid="sel-walk-prev">◀</button>
        <span class="sel-like-label" data-testid="sel-walk-at">{walkAt + 1} / {walk.ids.length}</span>
        <button class="sel-op" onclick={() => step(1)} aria-label={t('selection.walkNext')} data-testid="sel-walk-next">▶</button>
        <button class="sel-op" onclick={() => (walk = null)}>{t('selection.walkStop')}</button>
      {:else}
        <button class="sel-op" onclick={startWalk} data-testid="sel-walk">{t('selection.walk')}</button>
      {/if}
    </div>
  </div>

  <div class="sel-byid">
    <label for="sel-id-list">{t('selection.byId')}</label>
    <div class="sel-byid-row">
      <select bind:value={byIdKind} data-testid="sel-id-kind" aria-label={t('selection.byId')}>
        <option value="nodes">{t('float.selectNodes')}</option>
        <option value="elements">{t('float.selectElements')}</option>
        {#if uiStore.appMode === 'pro'}
          <option value="plates">{t('pro.plates')}</option>
          <option value="quads">{t('pro.quads')}</option>
        {/if}
      </select>
      <input
        id="sel-id-list" type="text" bind:value={byIdText}
        placeholder={t('selection.byIdPh')}
        data-testid="sel-id-text"
        onkeydown={(e) => { if (e.key === 'Enter') doSelectByIds(); }}
      />
      <button class="sel-op" onclick={doSelectByIds} data-testid="sel-id-go">{t('selection.go')}</button>
    </div>
    {#if byIdNote}<p class="sel-byid-note" data-testid="sel-id-note">{byIdNote}</p>{/if}
  </div>
</div>

<style>
  .sel-panel { padding: 4px 2px; }

  .sel-ops { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .sel-like { margin-top: 10px; }
  .sel-more { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .sel-like-label { font-size: 0.7rem; color: var(--st-text-3); }
  .sel-op {
    flex: 1;
    padding: 0.32rem 0.4rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .sel-op:hover { color: var(--st-text); border-color: var(--st-accent); }
  .sel-op:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }

  .sel-byid { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .sel-byid label { font-size: 0.7rem; color: var(--st-text-3); }
  .sel-byid-row { display: flex; gap: 6px; }
  .sel-byid-row input { flex: 1; min-width: 0; }
  .sel-byid-note { font-size: 0.68rem; color: var(--st-warn); margin: 0; }


  .sel-multi {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 0.74rem;
    color: var(--st-text);
    cursor: pointer;
  }

  .sel-tick { color: var(--st-accent); margin-right: 2px; }

  .sel-intro,
  .sel-note {
    margin: 0 0 8px;
    font-size: 0.7rem;
    line-height: 1.45;
    color: var(--st-text-3);
  }

  .sel-note { margin: 10px 0 0; }

  .sel-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sel-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 6px 8px;
    text-align: left;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-left: 2px solid transparent;
    border-radius: var(--st-radius, 3px);
    color: var(--st-text-2);
    cursor: pointer;
  }

  .sel-item:hover { background: var(--st-surface-3); color: var(--st-text); }

  .sel-item.on {
    border-left-color: var(--st-accent);
    color: var(--st-text);
  }

  .sel-name { font-size: 0.78rem; }
  .sel-hint { font-size: 0.66rem; color: var(--st-text-3); }
</style>
