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
  import { selectAll, invertSelection, selectByIds, loadedInCase, parallelToGlobal, seedMembersOf, membersAsKinds, type GlobalDirection } from '../lib/model/select-ops';
  import { likeSelection, likeSeedCount, likeMembers, shellsParallelToGlobal, LIKE_OPS, ALL_LIKE_OPS, type LikeOp, type SelKind } from '../lib/model/select-like';
  import { selectionHistory, trackSelectionHistory } from '../lib/store/selection-history.svelte';
  import { viewState, visibleModel } from '../lib/store/view-state.svelte';
  import { selectWalkItem, type WalkKind } from '../lib/actions/selection-walk';
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

  const KIND_LABEL = Object.fromEntries(ALL_MODES.map((m) => [m.id, m.key])) as Record<string, string>;

  // ── Operating on the selection as a set ──────────────────────────
  /*
   * PRO's by id names one kind at a time, and follows the kind armed above: arm supports and the
   * list reads support ids. Naming another kind arms it, so what is selected is always what the
   * panel says is being selected. (Basic looks a number up in every armed kind, below.)
   */
  let byIdKind = $state<SelKind>('elements');
  $effect(() => {
    const m = uiStore.selectMode;
    if (MODES.some((x) => x.id === m)) byIdKind = m as SelKind;
  });
  let byIdText = $state('');
  let byIdNote = $state('');

  /** The kinds currently being selected, as the set the operations take. */
  const armedKinds = $derived(new Set<SelKind>(MODES.filter((m) => uiStore.selectsKind(m.id)).map((m) => m.id)));

  /*
   * Basic keeps the operations it can explain: the whole set (all, none, invert), "like the
   * selection" by direction, connection, section and material, the previous selection, the walk,
   * and by number. Each works on the kinds armed above, one or several. PRO keeps its own
   * longer list (levels, planes, frame lines, loaded in a case, parallel to an axis).
   */
  const basic = $derived(uiStore.appMode !== 'pro');
  /** The selection as it stands, every channel. */
  const current = () => ({
    nodes: uiStore.selectedNodes, elements: uiStore.selectedElements,
    supports: uiStore.selectedSupports, loads: uiStore.selectedLoads,
  });

  function apply(sel: { nodes: Set<number>; elements: Set<number>; shells: Set<string>; supports?: Set<number>; loads?: Set<number> }) {
    uiStore.setSelection(sel.nodes, sel.elements, true, sel.shells);
    // Supports and loads are their own channels; an operation that does not reach them clears them,
    // as a click on a member does, so what stays lit is what the operation took.
    uiStore.selectedSupports = sel.supports ?? new Set();
    uiStore.selectedLoads = sel.loads ?? new Set();
  }

  /**
   * A whole selection, kind by kind: the armed kinds take what `pick` gives them (their current
   * selection when it gives nothing), the others are emptied. PRO's operations end here, so none
   * of them can leave lit a kind the panel is not selecting.
   */
  function applyArmed(pick: Partial<{ nodes: Set<number>; elements: Set<number>; shells: Set<string>; supports: Set<number>; loads: Set<number> }>) {
    const take = <T,>(k: SelKind, cur: Set<T>, v: Set<T> | undefined): Set<T> => (armedKinds.has(k) ? (v ?? new Set(cur)) : new Set());
    apply({
      nodes: take('nodes', uiStore.selectedNodes, pick.nodes),
      elements: take('elements', uiStore.selectedElements, pick.elements),
      shells: take('shells', uiStore.selectedShells, pick.shells),
      supports: take('supports', uiStore.selectedSupports, pick.supports),
      loads: take('loads', uiStore.selectedLoads, pick.loads),
    });
  }

  trackSelectionHistory();

  /*
   * In PRO, changing what is selected drops what was selected of the kinds no longer armed. Left
   * lit, a member picked before arming supports stayed selected, out of the panel's sight, and the
   * next Delete removed it with the supports.
   */
  function dropUnarmed() {
    if (basic) return;
    const stale = (!armedKinds.has('nodes') && uiStore.selectedNodes.size > 0)
      || (!armedKinds.has('elements') && uiStore.selectedElements.size > 0)
      || (!armedKinds.has('shells') && uiStore.selectedShells.size > 0)
      || (!armedKinds.has('supports') && uiStore.selectedSupports.size > 0)
      || (!armedKinds.has('loads') && uiStore.selectedLoads.size > 0);
    if (stale) applyArmed({});
  }

  // ── More ways to select (PRO) ────────────────────────────────────
  let loadCase = $state<number | null>(null);
  const cases = $derived(modelStore.loadCases);
  function selectLoaded() {
    const id = loadCase ?? cases[0]?.id;
    if (id === undefined) return;
    const sel = loadedInCase(modelStore.loads as never, id);
    // Each armed kind takes its part: the loads themselves, or the nodes, members and plates they sit on.
    applyArmed({ nodes: sel.nodes, elements: sel.elements, shells: sel.shells, loads: sel.loads, supports: new Set() });
  }
  /** Loads sit on nodes, members and plates; a support is not loaded. */
  const loadedApplies = $derived(['nodes', 'elements', 'shells', 'loads'].some((k) => armedKinds.has(k as SelKind)));
  let globalDir = $state<GlobalDirection>('Z');
  /** Members along the axis or in the plane; plates whose plane holds the axis or lies in the plane. */
  const parallelApplies = $derived(armedKinds.has('elements') || armedKinds.has('shells'));
  function selectParallel() {
    applyArmed({
      elements: parallelToGlobal(modelStore.nodes, modelStore.elements, globalDir),
      shells: shellsParallelToGlobal(modelStore.model as never, globalDir),
    });
  }

  // ── Walking through a set, one at a time, framed ─────────────────
  /*
   * The walk goes through what is selected, in the kinds armed above, one at a time, framing
   * each: members, nodes, plates, supports or loads. With nothing selected, through all of the
   * first armed kind. Each step selects that item alone (`selectWalkItem`); the armed kinds stay.
   */
  type WalkId = number | string;
  let walk = $state<{ items: { kind: WalkKind; id: WalkId }[] } | null>(null);
  let walkAt = $state(0);
  const WALK_ORDER: WalkKind[] = ['elements', 'nodes', 'shells', 'supports', 'loads'];
  /** A plate's key in its numbering: q3 after p3. */
  const order = (v: WalkId) => (typeof v === 'number' ? v : Number(v.slice(1)) + (v[0] === 'q' ? 0.5 : 0));
  function startWalk() {
    const sel: Record<WalkKind, Iterable<WalkId>> = {
      elements: uiStore.selectedElements, nodes: uiStore.selectedNodes, shells: uiStore.selectedShells,
      supports: uiStore.selectedSupports, loads: uiStore.selectedLoads,
    };
    const kinds = WALK_ORDER.filter((k) => armedKinds.has(k as SelKind));
    let items = kinds.flatMap((k) => [...sel[k]].sort((a, b) => order(a) - order(b)).map((id) => ({ kind: k, id })));
    if (!items.length) {
      const k = kinds[0] ?? 'elements';
      const all: Record<WalkKind, () => WalkId[]> = {
        elements: () => [...modelStore.elements.keys()], nodes: () => [...modelStore.nodes.keys()],
        shells: () => [...[...modelStore.plates.keys()].map((id) => `p${id}`), ...[...modelStore.quads.keys()].map((id) => `q${id}`)],
        supports: () => [...modelStore.supports.keys()], loads: () => modelStore.loads.map((l) => l.data.id),
      };
      items = all[k]().sort((a, b) => order(a) - order(b)).map((id) => ({ kind: k, id }));
    }
    walk = { items };
    walkAt = -1;
    step(1);
  }
  function step(by: 1 | -1) {
    if (!walk || walk.items.length === 0) return;
    walkAt = (walkAt + by + walk.items.length) % walk.items.length;
    const { kind, id } = walk.items[walkAt]!;
    selectWalkItem(kind, id);
    window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection'));
  }

  /*
   * All and Invert take what the view shows: a hidden member, a support on a
   * hidden node, a load on a hidden member are not taken, as a click or a
   * marquee does not take them, so the Delete that follows cannot reach
   * what the reader cannot see. PRO as well: it hides and isolates the same way.
   */
  function doSelectAll() {
    apply(selectAll(visibleModel() as never, armedKinds as never));
  }

  function doInvert() {
    apply(invertSelection(visibleModel() as never, armedKinds as never, {
      nodes: new Set(uiStore.selectedNodes),
      elements: new Set(uiStore.selectedElements),
      shells: new Set(uiStore.selectedShells),
      supports: new Set(uiStore.selectedSupports),
      loads: new Set(uiStore.selectedLoads),
    }));
  }

  /*
   * ── Like what is selected ─────────────────────────────────────────
   * Basic: the members the selection stands for (`seedMembersOf`), grouped by direction,
   * connection, section or material, and given back as the kinds armed above (`membersAsKinds`).
   * PRO: each armed kind seeded by its own selection and answered in that kind (`select-like.ts`):
   * every beam running this way, every plate in this plane, every support of this type, every load
   * of this case. The buttons are the operations the armed kinds have.
   */
  const BASIC_LIKE: readonly LikeOp[] = ['parallel', 'connected', 'section', 'material'];
  const seedMembers = $derived(basic ? seedMembersOf(modelStore.model as never, current()) : []);
  const seeds = $derived({
    nodes: [...uiStore.selectedNodes].filter((id) => modelStore.nodes.has(id)),
    elements: [...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)),
    shells: [...uiStore.selectedShells],
    supports: [...uiStore.selectedSupports],
    loads: [...uiStore.selectedLoads],
  });
  const likeOps = $derived(basic ? BASIC_LIKE : ALL_LIKE_OPS.filter((op) => [...armedKinds].some((k) => LIKE_OPS[k].includes(op))));
  const onlyMembers = $derived(armedKinds.size === 1 && armedKinds.has('elements'));
  const seedCount = $derived(basic ? seedMembers.length : likeSeedCount(armedKinds, seeds));
  const likeEnabled = (op: LikeOp) => (basic ? seedMembers.length > 0 : likeSeedCount(armedKinds, seeds, op) > 0);
  const LIKE_LABEL: Record<LikeOp, string> = {
    parallel: 'selection.likeParallel', connected: 'selection.likeConnected', section: 'selection.likeSection',
    material: 'selection.likeMaterial', kind: 'selection.likeKind', level: 'selection.likeLevel',
    plane: 'selection.likePlane', frame: 'selection.likeFrame', case: 'selection.likeCase',
  };
  function likeLabel(op: LikeOp): string {
    // Plates have a thickness where members have a section; nodes are "connected" in the masculine.
    if (!basic && op === 'section' && armedKinds.has('shells') && !armedKinds.has('elements')) return t('selection.likeThickness');
    if (!basic && op === 'connected' && !armedKinds.has('elements') && !armedKinds.has('shells')) return t('selection.likeConnectedNodes');
    return t(LIKE_LABEL[op]);
  }
  function like(op: LikeOp) {
    if (basic) {
      const r = likeMembers(modelStore.model as never, seedMembers, op);
      if (r.refusedKey && r.ids.length === 0) { byIdNote = t(r.refusedKey); return; }
      // As the kinds armed above: the members, their nodes, the supports and loads on them.
      const sel = membersAsKinds(modelStore.model as never, r.ids, armedKinds);
      apply(sel);
      const n = sel.nodes.size + sel.elements.size + (sel.supports?.size ?? 0) + (sel.loads?.size ?? 0);
      byIdNote = tp('selection.likeCount', { n });
      return;
    }
    const answers = likeSelection(modelStore.model as never, armedKinds, seeds, op, uiStore.is3DWorkspace);
    const refused = answers.find((a) => a.refusedKey && a.ids.size === 0);
    if (refused && answers.every((a) => a.ids.size === 0)) { byIdNote = t(refused.refusedKey ?? 'selection.likeNone'); return; }
    const pick: Parameters<typeof applyArmed>[0] = {};
    for (const a of answers) (pick as Record<string, unknown>)[a.kind] = a.ids;
    applyArmed(pick);
    const n = answers.reduce((s, a) => s + a.ids.size, 0);
    byIdNote = onlyMembers ? tp('selection.likeCount', { n }) : tp('selection.likeCountAny', { n });
  }

  /** The kinds a number is looked up in, in Basic: the ones armed above. */
  const BYID_KINDS = ['elements', 'nodes', 'supports', 'loads'] as const;
  const byIdKinds = $derived(BYID_KINDS.filter((k) => armedKinds.has(k)));

  function doSelectByIds() {
    if (basic) {
      // Each armed kind is its own numbering (node 7 and member 7 are different things): a
      // number is looked up in each, and missing ones are said per kind.
      const sel = { nodes: new Set<number>(), elements: new Set<number>(), shells: new Set<string>(), supports: new Set<number>(), loads: new Set<number>() };
      const notes: string[] = [];
      const missing: string[] = [];
      let bad: string[] = [];
      for (const k of byIdKinds) {
        const r = selectByIds(modelStore.model as never, k, byIdText);
        for (const ch of ['nodes', 'elements', 'supports', 'loads'] as const) for (const id of r.selection[ch] ?? []) sel[ch].add(id);
        if (r.missing.length) missing.push(`${t(KIND_LABEL[k]).toLowerCase()} ${r.missing.join(', ')}`);
        bad = r.bad;
      }
      apply(sel);
      if (missing.length) notes.push(tp('selection.missingIds', { ids: missing.join('; ') }));
      if (bad.length) notes.push(tp('selection.badIds', { text: bad.join(', ') }));
      byIdNote = notes.join(' ');
      return;
    }
    const r = selectByIds(modelStore.model as never, byIdKind, byIdText);
    if (!uiStore.selectsKind(byIdKind)) uiStore.toggleSelectKind(byIdKind);
    apply(r.selection);
    /* Reported, not dropped: "select 1, 2, 9" quietly giving two of three is
       the kind of quiet wrongness that ends with a member missing from a
       design run. */
    const parts: string[] = [];
    if (r.missing.length) parts.push(tp('selection.missingIds', { ids: r.missing.join(', ') }));
    if (r.bad.length) parts.push(tp('selection.badIds', { text: r.bad.join(', ') }));
    if (r.both.length) parts.push(tp('selection.bothShells', { ids: r.both.join(', ') }));
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
        onclick={() => { uiStore.toggleSelectKind(m.id); dropUnarmed(); }}
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
    <span class="sel-like-label">{basic ? tp('selection.likeBasic', { n: seedCount }) : onlyMembers ? tp('selection.like', { n: seedCount }) : tp('selection.likeAny', { n: seedCount })}</span>
    <div class="sel-ops">
      {#each likeOps as op (op)}
        <button class="sel-op" disabled={!likeEnabled(op)} onclick={() => like(op)} data-testid="sel-like-{op}">{likeLabel(op)}</button>
      {/each}
    </div>
  </div>

  <div class="sel-more" data-testid="sel-more">
    {#if uiStore.appMode === 'pro'}
      <label class="sel-like-label"><input type="checkbox" bind:checked={viewState.lasso} data-testid="sel-lasso" /> {t('selection.lasso')}</label>
    {/if}
    {#if !basic}
    <div class="sel-byid-row">
      <span class="sel-like-label">{t('selection.loadedIn')}</span>
      <select value={loadCase ?? cases[0]?.id} onchange={(e) => (loadCase = Number(e.currentTarget.value))} data-testid="sel-loaded-case" aria-label={t('selection.loadedIn')}>
        {#each cases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
      <button class="sel-op" disabled={cases.length === 0 || !loadedApplies} onclick={selectLoaded} data-testid="sel-loaded-go">{t('selection.go')}</button>
    </div>
    <div class="sel-byid-row">
      <span class="sel-like-label">{t('selection.parallelTo')}</span>
      <select bind:value={globalDir} data-testid="sel-parallel-dir" aria-label={t('selection.parallelTo')}>
        {#each ['X', 'Y', 'Z', 'XY', 'XZ', 'YZ'] as d (d)}<option value={d}>{d.length === 1 ? tp('selection.axis', { d }) : tp('selection.plane', { d })}</option>{/each}
      </select>
      <button class="sel-op" disabled={!parallelApplies} onclick={selectParallel} data-testid="sel-parallel-go">{t('selection.go')}</button>
    </div>
    {/if}
    <div class="sel-ops" class:sel-ops-walk={!!walk}>
      <!-- PRO gives back the last selection of the armed kinds; Basic the last one. -->
      <button class="sel-op" disabled={!selectionHistory.canGoBack(basic ? undefined : armedKinds)} onclick={() => selectionHistory.back(basic ? undefined : armedKinds)} data-testid="sel-previous">{t('selection.previous')}</button>
      {#if walk}
        <button class="sel-op" onclick={() => step(-1)} aria-label={t('selection.walkPrev')} data-testid="sel-walk-prev">◀</button>
        <span class="sel-like-label" data-testid="sel-walk-at">{walkAt + 1} / {walk.items.length}</span>
        <button class="sel-op" onclick={() => step(1)} aria-label={t('selection.walkNext')} data-testid="sel-walk-next">▶</button>
        <button class="sel-op" onclick={() => (walk = null)}>{t('selection.walkStop')}</button>
      {:else}
        <button class="sel-op" onclick={startWalk} data-testid="sel-walk">{t('selection.walk')}</button>
      {/if}
    </div>
  </div>

  <div class="sel-byid">
    <label for="sel-id-list">{basic ? tp('selection.byIdKinds', { kinds: byIdKinds.map((k) => t(KIND_LABEL[k]).toLowerCase()).join(', ') }) : t('selection.byId')}</label>
    <div class="sel-byid-row">
      {#if !basic}
        <select class="sel-field" bind:value={byIdKind} data-testid="sel-id-kind" aria-label={t('selection.byId')}>
          {#each MODES as m (m.id)}<option value={m.id}>{t(m.key)}</option>{/each}
        </select>
      {/if}
      <input
        id="sel-id-list" class="sel-field" type="text" bind:value={byIdText}
        placeholder={t('selection.byIdPh')}
        data-testid="sel-id-text"
        onkeydown={(e) => { if (e.key === 'Enter') doSelectByIds(); }}
      />
      <button class="sel-op sel-go" onclick={doSelectByIds} disabled={basic && byIdKinds.length === 0} data-testid="sel-id-go">{t('selection.go')}</button>
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

  /* While walking, the counter sits between its arrows and "Previous selection" takes its own row. */
  .sel-ops-walk { align-items: center; }
  .sel-ops-walk > :first-child { flex-basis: 100%; }
  .sel-ops-walk .sel-like-label { flex: none; padding: 0 4px; }

  .sel-byid { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .sel-byid label { font-size: 0.7rem; color: var(--st-text-3); }
  .sel-byid-row { display: flex; gap: 6px; align-items: stretch; }
  /* The panel's own fields, not the browser's: the same surface, border and type as its buttons. */
  .sel-field {
    min-width: 0;
    padding: 0.32rem 0.45rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.74rem;
  }
  input.sel-field { flex: 1; }
  .sel-field:focus { outline: none; border-color: var(--st-accent); }
  .sel-go { flex: none; padding-inline: 0.8rem; }
  .sel-op:disabled { opacity: 0.45; cursor: default; }
  .sel-op:disabled:hover { color: var(--st-text-2); border-color: var(--st-hair-strong); }
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
