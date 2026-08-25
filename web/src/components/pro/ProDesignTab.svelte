<script lang="ts">
  /**
   * RC Design tab — orchestrator.
   *
   * PR15 rewrite. What changed and why:
   *
   *  - The table NEVER unmounts on a reinforcement edit. The previous code called
   *    `verificationStore.clear()` after every committed rebar edit, which destroyed
   *    the design results AND `concreteMap` — the very data the live provided-rebar
   *    verification needs as input. That was the reported regression.
   *  - Status everywhere (table, summary, viewport) now comes from the PROVIDED
   *    reinforcement, not the auto-design baseline. Reading the baseline was the real
   *    trust bug: the viewport stayed green after a user weakened rebar.
   *  - Every rebar write goes through `modelStore.reinforcementTransaction`: one undo
   *    step, one reactive commit, no modelVersion bump, no structural solve.
   *  - Verification is memoised per element on (rebarHash, demandRevision), so an
   *    edit costs one cache miss instead of re-verifying every row (the old derived
   *    was O(N·E) per keystroke).
   *  - One "Run Design" button became three explicit commands plus Design all.
   *
   * This file is layout + state orchestration only; the table, filters, editors,
   * schematics, verification detail, batch dialog and review panel are components.
   */
  import { modelStore, resultsStore, uiStore, verificationStore } from '../../lib/store';
  import { designRunStore } from '../../lib/store/design-run.svelte';
  import { diagnosticsWarning } from '../../lib/store/diagnostics-warning.svelte';
  import { t, tp } from '../../lib/i18n';
  import { clearReinforcement, revertReinforcement } from '../../lib/store/rebar-edit';
  import {
    groupByElevation, groupByPlane, groupByFrameLine, groupByConnectivity,
    groupBySection, groupByMaterial, groupByKind, sectionOptions, materialOptions,
    elevationLabel, memberKindOf,
  } from '../../lib/engine/design/member-grouping';
  import type { ContextModelData } from '../../lib/engine/design/member-context';
  import type { IterationGuardState } from '../../lib/engine/design/section-advice';
  import type { MemberDesignOutcome } from '../../lib/engine/design/outcome';
  import {
    matchesFilter, matchesSearch, sortRows, filterCounts, nextFailingId,
    type DesignRow, type RowFilter, type SortKey,
  } from './design/design-view';
  import DesignToolbar from './design/DesignToolbar.svelte';
  import DesignFamilyPanel from './design/DesignFamilyPanel.svelte';
  import { detailingStore } from '../../lib/store/detailing.svelte';
  import DesignFilterBar from './design/DesignFilterBar.svelte';
  import DesignTable from './design/DesignTable.svelte';
  import RebarEditorBeam from './design/RebarEditorBeam.svelte';
  import RebarEditorColumn from './design/RebarEditorColumn.svelte';
  import RebarSchematics from './design/RebarSchematics.svelte';
  import VerificationDetail from './design/VerificationDetail.svelte';
  import BatchEditDialog from './design/BatchEditDialog.svelte';
  import ChangedMembersPanel from './design/ChangedMembersPanel.svelte';
  import SectionAdviceDialog from './design/SectionAdviceDialog.svelte';

  // ─── View state (survives edits — nothing here is reset by a rebar write) ──
  let filter = $state<RowFilter>('all');
  let search = $state('');
  let sortKey = $state<SortKey>('element');
  let sortAsc = $state(true);
  let expandedId = $state<number | null>(null);
  let focusedId = $state<number | null>(null);
  let checked = $state<Set<number>>(new Set());
  let lastCheckedId: number | null = null;
  let groupLabel = $state('');
  let showBatch = $state(false);
  let showChanged = $state(false);
  let adviceFor = $state<MemberDesignOutcome | null>(null);
  const guards = new Map<number, IterationGuardState>();

  const md = $derived<ContextModelData>({
    nodes: modelStore.nodes as never,
    elements: modelStore.elements as never,
    sections: modelStore.sections as never,
    materials: modelStore.materials as never,
    supports: modelStore.supports as never,
  });

  const hasResults = $derived(resultsStore.results3D !== null);
  const hasCombinations = $derived(modelStore.model.combinations.length > 0);
  const hasDemands = $derived(verificationStore.hasDemandData);

  /** Elevation bands, computed once per model version (not per keystroke). */
  const elevation = $derived.by(() => { void modelStore.modelVersion; return groupByElevation(md); });
  const planes = $derived.by(() => { void modelStore.modelVersion; return groupByPlane(md); });
  const frameLines = $derived.by(() => { void modelStore.modelVersion; return groupByFrameLine(md); });
  const sections = $derived.by(() => { void modelStore.modelVersion; return sectionOptions(md); });
  const materials = $derived.by(() => { void modelStore.modelVersion; return materialOptions(md); });

  /** elementId → derived elevation label, for the table column. */
  const elevationOf = $derived.by(() => {
    const map = new Map<number, { z: number; label: string }>();
    if (elevation.available) {
      for (const band of elevation.bands) {
        for (const id of [...band.beamIds, ...band.columnsRisingIds]) {
          if (!map.has(id)) map.set(id, { z: band.elevation, label: band.label });
        }
      }
    }
    for (const [id, el] of modelStore.elements) {
      if (map.has(id)) continue;
      const a = modelStore.nodes.get(el.nodeI);
      const b = modelStore.nodes.get(el.nodeJ);
      const z = Math.min(a?.z ?? 0, b?.z ?? 0);
      map.set(id, { z, label: elevationLabel(0, z).replace(/^L0 /, '') });
    }
    return map;
  });

  const slopedIds = $derived.by(() => {
    const s = new Set<number>();
    if (elevation.available) for (const b of elevation.bands) for (const id of b.slopedBeamIds) s.add(id);
    return s;
  });

  /**
   * Rows. Depends on `providedRevision` so a rebar edit refreshes exactly the
   * affected member's verification (cache hit for everything else).
   */
  const allRows = $derived.by((): DesignRow[] => {
    void verificationStore.providedRevision;
    void verificationStore.demandRevision;
    void verificationStore.analysisRevision;
    const out: DesignRow[] = [];
    for (const [id, ctx] of verificationStore.contexts) {
      const pv = verificationStore.providedFor(id);
      const outcome = verificationStore.outcomeFor(id);
      const status = verificationStore.getDisplayStatus(id);
      const util = verificationStore.getDisplayRatio(id);
      const worst = pv?.checks
        .filter(c => c.status !== 'ok')
        .sort((a, b) => (Number.isFinite(b.ratio) ? b.ratio : 1e9) - (Number.isFinite(a.ratio) ? a.ratio : 1e9))[0]
        ?? pv?.checks.slice().sort((a, b) => b.ratio - a.ratio)[0];
      const ev = elevationOf.get(id);
      out.push({
        elementId: id,
        elementType: ctx.elementType,
        sectionName: ctx.section.name,
        sectionId: ctx.section.id,
        elevation: ev?.z ?? 0,
        elevationLabel: ev?.label ?? '—',
        utilization: util,
        status,
        governingCheck: worst?.category ?? (outcome?.limiting[0] ?? '—'),
        comboName: worst?.comboName ?? '',
        outcome: outcome?.outcome,
        hasReinforcement: !!modelStore.elements.get(id)?.reinforcement,
        edited: designRunStore.manualOverrides.has(id),
        auto: designRunStore.autoDesigned.has(id),
        provisional: designRunStore.provisionalIds.has(id),
        certified: outcome?.outcome === 'VERIFIED' && !!outcome.certificate
          && !designRunStore.manualOverrides.has(id),
        sloped: slopedIds.has(id),
        provided: pv,
      });
    }
    return out;
  });

  const counts = $derived(filterCounts(allRows, uiStore.selectedElements));
  const rows = $derived(sortRows(
    allRows.filter(r => matchesFilter(r, filter, uiStore.selectedElements) && matchesSearch(r, search)),
    sortKey, sortAsc,
  ));

  /** Batch acts on checked rows when present, otherwise on the viewport selection. */
  const batchSelection = $derived(
    checked.size > 0 ? [...checked].sort((a, b) => a - b) : [...uiStore.selectedElements].sort((a, b) => a - b),
  );

  // ─── Selection sync: table ⇄ viewport, both directions ───
  function toggleCheck(id: number, shiftKey: boolean) {
    const next = new Set(checked);
    if (shiftKey && lastCheckedId !== null) {
      const ids = rows.map(r => r.elementId);
      const a = ids.indexOf(lastCheckedId);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(ids[i]);
      }
    } else if (next.has(id)) next.delete(id);
    else next.add(id);
    checked = next;
    lastCheckedId = id;
    syncViewport(next);
  }

  function toggleAll() {
    const next = rows.length > 0 && rows.every(r => checked.has(r.elementId))
      ? new Set<number>()
      : new Set(rows.map(r => r.elementId));
    checked = next;
    syncViewport(next);
  }

  /** True while the table itself is driving the viewport selection, so the
   *  viewport→table mirror does not read its own write back. */
  let tableDrivenSelection = false;

  function syncViewport(ids: Set<number>) {
    tableDrivenSelection = true;
    uiStore.selectMode = 'elements';
    uiStore.setSelection(new Set(), new Set(ids), true);
  }

  // Viewport → table: mirror the element selection into the checkbox set.
  //
  // An EMPTY incoming selection is deliberately ignored. Reassigning
  // `model.elements` (which a reinforcement transaction does) makes the viewport
  // rebuild its element groups and drop its own selection, and adopting that empty
  // set would silently clear the user's checked rows mid-edit — exactly the
  // context-loss the redesign exists to prevent. Clearing the checkbox set stays an
  // explicit action (header checkbox / group picker).
  $effect(() => {
    const sel = uiStore.selectedElements;
    if (tableDrivenSelection) { tableDrivenSelection = false; return; }
    if (sel.size === 0) return;
    const same = sel.size === checked.size && [...sel].every(id => checked.has(id));
    if (!same) checked = new Set(sel);
  });

  /**
   * Focus (inspect) one row. The FOCUSED member and the CHECKED batch selection are
   * different concepts: focusing must never clobber a multi-row selection the user
   * built for a batch edit, so the viewport is only re-pointed when nothing is
   * checked.
   */
  function focusRow(id: number) {
    focusedId = id;
    if (checked.size > 0) return;
    tableDrivenSelection = true;
    uiStore.selectMode = 'elements';
    uiStore.selectElement(id, false);
  }

  function expandRow(id: number) {
    expandedId = expandedId === id ? null : id;
  }

  function selectIds(ids: number[], label: string) {
    // Attribute groups are encoded as [-1, sectionId] / [-2, materialId] markers.
    let resolved = ids;
    if (ids.length === 2 && ids[0] === -1) resolved = groupBySection(md, ids[1]);
    else if (ids.length === 2 && ids[0] === -2) resolved = groupByMaterial(md, ids[1]);
    if (resolved.length === 0) return;
    const next = new Set(resolved);
    checked = next;
    groupLabel = label.startsWith('sec:') || label.startsWith('mat:') ? '' : label;
    syncViewport(next);
    filter = 'selected';
  }

  function selectConnected() {
    if (batchSelection.length === 0) return;
    selectIds(groupByConnectivity(md, batchSelection, 1, true), t('design.group.connected'));
  }
  function selectKind(kind: 'beam' | 'column') {
    selectIds(groupByKind(md, kind), t(kind === 'beam' ? 'design.group.kindBeam' : 'design.group.kindColumn'));
  }

  function gotoNextFailing() {
    const id = nextFailingId(rows, focusedId);
    if (id === null) return;
    focusRow(id);
    expandedId = id;
    document.querySelector(`[data-testid="design-row-${id}"]`)?.scrollIntoView({ block: 'center' });
  }

  function onSort(k: SortKey) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = k !== 'utilization'; }
  }

  function applyAdvice(o: MemberDesignOutcome) { adviceFor = o; }

  function onAdviceApplied(elementId: number) {
    const g = guards.get(elementId) ?? { iterations: 0, lastArea: 0, lastGoverningDemand: 0 };
    const a = adviceFor?.sectionAdvice;
    guards.set(elementId, {
      iterations: g.iterations + 1,
      lastArea: a ? a.proposedB * a.proposedH : g.lastArea,
      lastGoverningDemand: adviceFor?.provisional?.worstUtilization ?? g.lastGoverningDemand,
    });
    // The section change bumped modelVersion → results cleared → the user must
    // re-solve. The toast states that explicitly rather than implying success.
    uiStore.toast(t('design.advice.preliminary'), 'info');
  }

  function revertAllEdits() {
    revertReinforcement([...designRunStore.manualOverrides]);
  }
</script>

<div class="design-tab" data-testid="pro-design-tab">
  <!--
    Every design command arms the diagnostics warning. "I tried to design and it did not work"
    is precisely the moment a blocking diagnostic earns the right to interrupt — and until one
    of these is pressed, or a project is loaded, an untouched PRO says nothing.
    See `lib/store/diagnostics-warning.svelte.ts`.
  -->
  <DesignToolbar
    selectedCount={batchSelection.length}
    {hasResults} {hasCombinations}
    editedCount={designRunStore.manualOverrides.size}
    onComputeDemands={() => { diagnosticsWarning.arm(); designRunStore.computeDemands(); }}
    onCodeCheck={() => { diagnosticsWarning.arm(); designRunStore.runCodeCheck(); }}
    onAutoDesignSelected={() => { diagnosticsWarning.arm(); designRunStore.autoDesign(batchSelection); }}
    onAutoDesignUndesigned={() => {
      diagnosticsWarning.arm();
      const ids = [...verificationStore.contexts.keys()].filter(id => !modelStore.elements.get(id)?.reinforcement);
      designRunStore.autoDesign(ids.length > 0 ? ids : [...verificationStore.contexts.keys()]);
    }}
    onDesignAll={() => {
      diagnosticsWarning.arm();
      /*
       * ONE command, and it runs the scope the selector below shows.
       *
       * It used to call `designAll()`, whose scope was the default and could not be narrowed
       * from here — so a second button had to exist beside the boxes to run anything else. The
       * scope is in the store now and this is the only thing that starts a design run.
       */
      designRunStore.designFamilies(designRunStore.familySelection,
        { verifierId: 'cirsoc201.provided.v2.2025' });
    }}
    onOpenDiagnostics={() => (uiStore.proActiveTab = 'diagnostics')}
    onReviewChanges={() => (showChanged = true)}
    onRevertEdits={revertAllEdits}
    onShowOrientation={() => (showChanged = true)}
  />

  <!--
    One selection, one run.

    The toolbar's own `Diseñar todo` stays as the quick path for the frame. This is the whole
    building: pick the families, run once, and the result names what each one did with the
    3-D view beside it — instead of sending the user to a second command in another disclosure
    to discover their floors were never designed.
  -->
  <DesignFamilyPanel
    canDesign={hasResults && hasCombinations}
    onView3d={() => detailingStore.buildDocument({
      author: t('detailing.doc.unnamedAuthor'),
      at: new Date().toISOString(),
    })}
  />

  {#if !hasResults}
    <div class="placeholder" data-testid="design-placeholder-solve">{t('design.error.solveFirst')}</div>
  {:else if !hasDemands}
    <div class="placeholder" data-testid="design-placeholder-demands">{t('design.table.needDemands')}</div>
  {:else}
    <DesignFilterBar
      {filter} {search} {sortKey} {sortAsc} {counts}
      {elevation} {planes} {frameLines} {sections} {materials}
      hasSelection={batchSelection.length > 0}
      onFilter={(f) => (filter = f)}
      onSearch={(s) => (search = s)}
      onSort={onSort}
      onSelectIds={selectIds}
      onSelectConnected={selectConnected}
      onSelectKind={selectKind}
    />

    <div class="action-row">
      <span class="sel-count" data-testid="selection-count">
        ▸ {tp('design.batch.selectedCount', {
          n: batchSelection.length,
          beams: batchSelection.filter(id => memberKindOf(md, id) === 'beam').length,
          columns: batchSelection.filter(id => memberKindOf(md, id) === 'column').length,
        })}
        {#if groupLabel}<span class="muted">· {groupLabel}</span>{/if}
      </span>
      <button class="act" data-testid="batch-open" disabled={batchSelection.length === 0}
              onclick={() => (showBatch = true)}>{t('design.batch.open')}</button>
      <button class="act" data-testid="next-failing" onclick={gotoNextFailing}>
        ⤢ {t('design.nav.nextFailing')}
      </button>
      <button class="act" data-testid="review-changes" onclick={() => (showChanged = !showChanged)}>
        {t('design.changed.title')} ({designRunStore.manualOverrides.size})
      </button>
      <span class="hint">{t('design.nav.keyboardHint')}</span>
    </div>

    <DesignTable
      {rows} {checked} {expandedId} {focusedId} {sortKey} {sortAsc}
      onToggleCheck={toggleCheck}
      onToggleAll={toggleAll}
      onExpand={expandRow}
      onSort={onSort}
      onFocus={focusRow}
    >
      {#snippet detail(row)}
        {@const ctx = verificationStore.contextFor(row.elementId)}
        {#if ctx}
          <div class="detail-wrap">
            <div class="detail-head">
              {#if row.hasReinforcement}
                <button class="act act-sm" data-testid={`clear-rebar-${row.elementId}`}
                        onclick={() => clearReinforcement(row.elementId)}>{t('design.changed.revertOne')}</button>
              {:else}
                <button class="act act-sm" data-testid={`design-one-${row.elementId}`}
                        onclick={() => designRunStore.designOne(row.elementId)}>{t('design.cmd.autoDesign')}</button>
              {/if}
            </div>
            {#if ctx.elementType === 'column'}
              <RebarEditorColumn elementId={row.elementId} {ctx} version={verificationStore.providedRevision} />
            {:else}
              <RebarEditorBeam elementId={row.elementId} {ctx} version={verificationStore.providedRevision} />
            {/if}
            <RebarSchematics elementId={row.elementId} {ctx} version={verificationStore.providedRevision} />
            <VerificationDetail
              elementId={row.elementId} {ctx}
              provided={row.provided}
              outcome={verificationStore.outcomeFor(row.elementId)}
              onApplyAdvice={applyAdvice}
            />
          </div>
        {/if}
      {/snippet}
    </DesignTable>

    {#if showChanged}
      <ChangedMembersPanel onClose={() => (showChanged = false)} onFocusElement={(id) => { focusRow(id); expandedId = id; }} />
    {/if}
  {/if}
</div>

{#if showBatch}
  <BatchEditDialog
    selection={batchSelection}
    sourceLabel={groupLabel}
    onClose={() => (showBatch = false)}
    onApplied={(n) => uiStore.toast(tp('design.batch.apply', { n }), 'success')}
  />
{/if}

{#if adviceFor?.sectionAdvice}
  <SectionAdviceDialog
    outcome={adviceFor}
    guard={guards.get(adviceFor.elementId) ?? { iterations: 0, lastArea: 0, lastGoverningDemand: 0 }}
    onClose={() => (adviceFor = null)}
    onApplied={onAdviceApplied}
  />
{/if}

<style>
  /**
   * The tab scrolls when its controls do not fit, rather than crushing the table to nothing.
   *
   * ── The screen this makes usable again ─────────────────────────────
   *
   * At 1280×720 — Chromium's own `Desktop Chrome` size, which is what this suite actually runs
   * at — the tab has 504 px to work with and its fixed controls want 550: toolbar 147,
   * families 146, filter bar 204 (it wraps to three lines at this width), action row 53. All
   * four carry `flex-shrink: 0`, so the only child that could give was `.table-scroll`, and it
   * gave everything: measured height 0, with its rows laid out BELOW the fold at y≈778 in a
   * 720 px window.
   *
   * That is not a test artefact. The design table — the entire point of this tab — was
   * unreachable on a laptop screen, and the rows were not merely off-screen but underneath the
   * action row, which is why every click on one was intercepted. It looked like a stacking
   * problem and was a sizing one.
   *
   * `overflow: auto` plus a floor on the table is the whole fix: where the controls fit,
   * nothing changes and no scrollbar appears; where they do not, the tab scrolls and every row
   * is reachable by scrolling the thing the user is already looking at. The alternative —
   * making the control blocks shrink and scroll internally — would have put a second scroller
   * inside the first, which this codebase has already paid for once (see RebarStatusPanel).
   *
   * The PRO shell makes this MORE necessary, not less: a two-row ribbon and a panel heading
   * take further height off the same 504 px. `DesignTable` grew its own 9rem floor for the
   * related defect — a box shorter than its sticky header, so a click on row 1 lands on
   * "select all". Both floors stand; this selector is the more specific one and wins inside
   * the tab, and the 9rem still guards the table wherever else it is mounted.
   */
  .design-tab { display: flex; flex-direction: column; height: 100%; overflow: auto; }
  /* A table shorter than this is not a table you can work in; below it, the tab scrolls. */
  .design-tab :global(.table-scroll) { min-height: 14rem; }
  .placeholder { padding: 20px; text-align: center; color: var(--st-text-2); font-size: 0.78rem; font-style: italic; }
  .action-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 4px 12px; background: var(--st-bg); border-bottom: 1px solid var(--st-surface-3); flex-shrink: 0; }
  .sel-count { font-size: 0.7rem; color: var(--st-text-2); }
  .muted { color: var(--st-text-2); }
  .act { padding: 2px 9px; background: var(--st-surface-3); border: 1px solid var(--st-info);
    border-radius: 3px; color: var(--st-text); font-size: 0.7rem; font-weight: 600; cursor: pointer; }
  .act:hover:not(:disabled) { background: var(--st-hair-strong); }
  .act:disabled { opacity: 0.4; cursor: not-allowed; }
  .act:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .act-sm { font-size: 0.66rem; padding: 1px 7px; }
  /* `--st-text-2`: this is copy, and `--st-text-3` measured 4.03 on `--st-bg` — the ground the
     tab header sits on, which is darker than a panel and still not enough. */
  .hint { margin-left: auto; font-size: 0.64rem; color: var(--st-text-2); font-family: monospace; }
  .detail-wrap { display: flex; flex-direction: column; gap: 6px; }
  .detail-head { display: flex; gap: 6px; }
</style>
