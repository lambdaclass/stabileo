<script lang="ts">
  import { untrack } from 'svelte';
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { downloadText } from '../../lib/store/file';
  import { t } from '../../lib/i18n';
  import { runGlobalSolve } from '../../lib/engine/live-calc';
  import {
    componentUnit,
    diagramTypeToComponent,
    buildQueryRows,
    extremeRow,
    filterByAbsThreshold,
    rowsToCsv,
    type ExtremeMode,
    type QueryExportMeta,
    type SourceKind,
  } from '../../lib/engine/result-query';
  import {
    SHELL_CONTOUR_COMPONENTS, SHELL_COMPONENT_GROUP_LABELS, principalStresses,
    shellComponentStats, type ShellComponentGroup,
  } from '../../lib/engine/shell-stress';

  let solveError = $state<string | null>(null);
  let solving = $state(false);

  const results = $derived(resultsStore.results3D);

  // Unified shell rows (plates + quads) with derived principal stresses, for
  // the readable split stress / moment tables.
  const shellRows = $derived.by(() => {
    const r = resultsStore.results3D;
    if (!r) return [] as Array<{ key: string; type: string; id: number; sigmaXx: number; sigmaYy: number; tauXy: number; sigma1: number; sigma2: number; vonMises: number; mx: number; my: number; mxy: number }>;
    const rows = [];
    for (const ps of r.plateStresses ?? []) {
      const pr = principalStresses(ps.sigmaXx, ps.sigmaYy, ps.tauXy);
      rows.push({ key: 'p' + ps.elementId, type: 'Plate', id: ps.elementId, sigmaXx: ps.sigmaXx, sigmaYy: ps.sigmaYy, tauXy: ps.tauXy, sigma1: pr.sigma1, sigma2: pr.sigma2, vonMises: ps.vonMises, mx: ps.mx, my: ps.my, mxy: ps.mxy });
    }
    for (const qs of r.quadStresses ?? []) {
      const pr = principalStresses(qs.sigmaXx, qs.sigmaYy, qs.tauXy);
      rows.push({ key: 'q' + qs.elementId, type: 'Quad', id: qs.elementId, sigmaXx: qs.sigmaXx, sigmaYy: qs.sigmaYy, tauXy: qs.tauXy, sigma1: pr.sigma1, sigma2: pr.sigma2, vonMises: qs.vonMises, mx: qs.mx, my: qs.my, mxy: qs.mxy });
    }
    return rows;
  });

  // Honest per-component status (varying / uniform / negligible) for the
  // current shell results — drives the "≈0" hints in the contour selector
  // and the governing/near-zero markers in the result tables.
  const shellStats = $derived.by(() => {
    const r = resultsStore.results3D;
    const all = [...(r?.plateStresses ?? []), ...(r?.quadStresses ?? [])];
    return all.length ? shellComponentStats(all) : null;
  });
  // Components grouped by family for the selector optgroups.
  const shellGroups = $derived.by(() => {
    const groups = new Map<ShellComponentGroup, typeof SHELL_CONTOUR_COMPONENTS>();
    for (const c of SHELL_CONTOUR_COMPONENTS) {
      const arr = groups.get(c.group) ?? [];
      arr.push(c);
      groups.set(c.group, arr);
    }
    return [...groups.entries()];
  });

  // Governing element per shell column (row key with the largest |value|), so
  // the tables can flag the governing cell instead of reading as a flat block.
  const SHELL_TABLE_KEYS = ['sigmaXx', 'sigmaYy', 'tauXy', 'sigma1', 'sigma2', 'vonMises', 'mx', 'my', 'mxy'] as const;
  const shellGov = $derived.by(() => {
    const gov: Record<string, string> = {};
    for (const k of SHELL_TABLE_KEYS) {
      let best = -Infinity, bestKey = '';
      for (const r of shellRows) {
        const v = Math.abs((r as Record<string, number>)[k]);
        if (v > best) { best = v; bestKey = r.key; }
      }
      gov[k] = bestKey;
    }
    return gov;
  });
  function shellPeak(k: string): number { return shellStats?.[k as keyof typeof shellStats]?.peak ?? 0; }
  function shellNegligible(k: string): boolean { return shellStats?.[k as keyof typeof shellStats]?.status === 'negligible'; }

  const hasModel = $derived(modelStore.nodes.size > 0 && modelStore.elements.size > 0);
  const hasCombinations = $derived(resultsStore.hasCombinations3D);

  // View mode
  type ViewMode = 'single' | 'combo' | 'envelope';
  let viewMode = $state<ViewMode>('single');
  let selectedCaseId = $state<number | null>(null);
  let selectedComboId = $state<number | null>(null);

  function handleSolve() {
    solveError = null;
    solving = true;
    try {
      // First solve single (all loads)
      runGlobalSolve();
      if (!resultsStore.results3D) {
        solveError = t('pro.noResults');
        solving = false;
        return;
      }

      // Now solve combinations if load cases exist
      if (modelStore.loadCases.length > 0 && modelStore.combinations.length > 0) {
        try {
          const comboResult = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
          if (typeof comboResult === 'string') {
            console.warn('Combinations warning:', comboResult);
          } else if (comboResult) {
            resultsStore.setCombinationResults3D(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
            // Sync BOTH the local toggle and the store view: setting only the
            // local viewMode left activeView='single', so the Envelope button
            // rendered active while the query card/CSV honestly said 'Case'.
            switchView('envelope');
          }
        } catch (comboErr: any) {
          console.warn('Combinations 3D failed (results still available):', comboErr);
        }
      }
    } catch (e: any) {
      console.error('PRO solve error:', e);
      solveError = e?.message || String(e) || t('pro.unknownError');
    }
    solving = false;
  }

  function switchView(mode: ViewMode) {
    viewMode = mode;
    if (mode === 'envelope') {
      resultsStore.activeView = 'envelope';
    } else if (mode === 'combo' && selectedComboId !== null) {
      resultsStore.activeComboId = selectedComboId;
      resultsStore.activeView = 'combo';
    } else if (mode === 'single') {
      if (selectedCaseId !== null) {
        resultsStore.activeCaseId = selectedCaseId;
      } else {
        resultsStore.activeView = 'single';
      }
    }
  }

  function onCaseChange(e: Event) {
    const id = Number((e.target as HTMLSelectElement).value);
    selectedCaseId = id;
    resultsStore.activeCaseId = id;
  }

  function onComboChange(e: Event) {
    const id = Number((e.target as HTMLSelectElement).value);
    selectedComboId = id;
    resultsStore.activeComboId = id;
    resultsStore.activeView = 'combo';
  }

  function fmtNum(n: number): string {
    if (n === 0) return '0';
    if (Math.abs(n) < 0.001) return n.toExponential(2);
    if (Math.abs(n) < 1) return n.toFixed(4);
    return n.toFixed(2);
  }

  function onDeformedScaleInput(e: Event) {
    resultsStore.deformedScale = Number((e.target as HTMLInputElement).value);
  }

  const caseKeys = $derived([...resultsStore.perCase3D.keys()]);
  const comboKeys = $derived([...resultsStore.perCombo3D.keys()]);

  // ─── Result query layer ──────────────────────────────────────
  // The query is ALWAYS linked to the active view: its component derives from
  // resultsStore.diagramType, and its source follows whatever data is shown in
  // resultsStore.results3D (driven by the existing Case/Combo/Envelope controls).
  let queryScope = $state<'selected' | 'all' | 'id'>('all');
  let queryIdInput = $state('');
  let queryMode = $state<ExtremeMode>('absmax');
  let queryThreshold = $state(0);

  // Component is derived from the active diagram (null for non-force diagrams).
  const queryComponent = $derived(diagramTypeToComponent(resultsStore.diagramType));
  const isForceDiagram = $derived(queryComponent !== null);

  /** Element id filter from the scope selector, or undefined for "all". */
  const scopeIds = $derived.by<number[] | undefined>(() => {
    if (queryScope === 'selected') {
      // selectedElements is shared between frame elements and plates/quads
      // (colliding id counters); in shells select-mode those ids are SHELL
      // ids — resolving them against elementForces would show forces for
      // frame elements the user never selected.
      if (uiStore.selectMode === 'shells') return [];
      return [...uiStore.selectedElements];
    }
    if (queryScope === 'id') {
      return queryIdInput.split(/[\s,]+/).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
    }
    return undefined;
  });

  // Envelope view holds maxAbsResults3D: per field, the SIGNED value of the
  // combo with the largest magnitude. 'max'/'min' over those rows do NOT give
  // the true envelope extremes (those live in pos/negValues of the envelope
  // diagrams) — only 'absmax' is semantically valid, so coerce.
  const isEnvelopeView = $derived(resultsStore.activeView === 'envelope');
  $effect(() => {
    if (isEnvelopeView && queryMode !== 'absmax') queryMode = 'absmax';
  });

  const activeRows = $derived.by(() => {
    if (!results || !queryComponent) return [];
    return buildQueryRows(results.elementForces, queryComponent, scopeIds ? { elementIds: scopeIds } : {});
  });
  const filteredRows = $derived(filterByAbsThreshold(activeRows, queryThreshold));
  // DOM cap: scope='all' yields 2 rows per element — a 10k-element model would
  // mount 20k <tr> in a 180px scroll box. The CSV export still uses the FULL
  // filteredRows; only rendering is capped.
  const MAX_RENDER_ROWS = 500;
  const renderRows = $derived(filteredRows.length > MAX_RENDER_ROWS ? filteredRows.slice(0, MAX_RENDER_ROWS) : filteredRows);
  const activeExtreme = $derived(extremeRow(filteredRows, queryMode));

  // Single source descriptor derived from resultsStore.activeView (the source
  // of truth for what results3D holds). Both the on-screen label and the CSV
  // metadata read THIS object — two parallel branch chains would drift.
  const activeSource = $derived.by<{ kind: SourceKind; id: number | null; name: string }>(() => {
    const view = resultsStore.activeView;
    if (view === 'envelope') return { kind: 'envelope', id: null, name: t('pro.viewEnvelope') };
    if (view === 'combo' && resultsStore.activeComboId !== null) {
      const id = resultsStore.activeComboId;
      return { kind: 'combo', id, name: modelStore.combinations.find((c) => c.id === id)?.name ?? `${t('pro.comboN')}${id}` };
    }
    if (view === 'single' && resultsStore.activeCaseId !== null) {
      const id = resultsStore.activeCaseId;
      return { kind: 'case', id, name: modelStore.loadCases.find((c) => c.id === id)?.name ?? `${t('pro.caseN')}${id}` };
    }
    // The all-loads single solve (no case selected): label it as such instead
    // of pretending it's a per-case result with a blank id.
    return { kind: 'case', id: null, name: t('pro.queryAllLoads') };
  });
  const activeSourceLabel = $derived(activeSource.name);

  const queryUnit = $derived(queryComponent ? componentUnit(queryComponent) : '');
  const exportCount = $derived(filteredRows.length);

  // Element ids the current query resolves to (for viewport highlight).
  const queryElementIds = $derived(filteredRows.map((r) => r.elementId));

  function sameSet(a: Set<number>, b: Iterable<number>): boolean {
    const bs = b instanceof Set ? b : new Set(b);
    if (a.size !== bs.size) return false;
    for (const x of a) if (!bs.has(x)) return false;
    return true;
  }

  // Always-linked: highlight the queried element set via the existing selection
  // path. Skip when no force diagram is active (don't wipe the user's selection),
  // skip scope='selected' (selection IS the scope → redundant + loop risk), and
  // skip an empty query (a blank By-ID input must not clear the selection).
  // The selection itself is read inside untrack(): the effect pushes the query
  // set when the QUERY changes, but a manual click (viewport, table row, or the
  // governing card) must stick — tracking selectedElements made the effect
  // instantly revert any manual selection, defeating click-to-select.
  $effect(() => {
    if (!isForceDiagram || queryScope === 'selected') return;
    if (queryElementIds.length === 0) return;
    const target = new Set(queryElementIds);
    untrack(() => {
      // Never override a MANUAL selection (click / box-select): the query
      // pushes its set only over result-driven or empty selections, so a
      // user's click survives query re-evaluations too (untrack alone only
      // covers selection-triggered re-runs).
      if (uiStore.elementSelectionManual) return;
      if (sameSet(uiStore.selectedElements, target)) return;
      uiStore.selectMode = 'elements';
      // Result-driven highlight (manual=false) → local-axis "When selected" ignores it.
      uiStore.setSelection(new Set(uiStore.selectedNodes), target);
    });
  });

  function selectQueryElement(id: number) {
    uiStore.selectMode = 'elements';
    uiStore.selectElement(id, false);
  }

  // Manual toggle: turning loads ON while a diagram is active must also clear
  // the "hide loads with diagram" suppression so they actually render.
  function onToggleLoads(e: Event) {
    const on = (e.target as HTMLInputElement).checked;
    uiStore.showLoads3D = on;
    if (on) uiStore.hideLoadsWithDiagram = false;
  }

  /** Source provenance for the CSV export, repeated on every row. Follows the active view. */
  const exportMeta = $derived.by<QueryExportMeta>(() => ({
    sourceKind: activeSource.kind,
    sourceId: activeSource.id,
    sourceName: activeSource.name,
    scopeMode: queryScope,
    scopeIds: scopeIds ?? [],
    threshold: queryThreshold || 0,
    extremeMode: queryMode,
  }));

  function exportQueryCsv() {
    const csv = rowsToCsv(filteredRows, exportMeta);
    downloadText(csv, `stabileo-query-${queryComponent}-${exportMeta.sourceKind}.csv`, 'text/csv;charset=utf-8;');
  }


  /*
   * Which output is being read.
   *
   * Reactions, not the query. The query interrogates the ACTIVE force diagram,
   * so with none chosen — which is how the panel opens — it could only say
   * "select a force diagram", and that was the first thing anyone saw after
   * solving. Reactions exist the moment a solve does. The query keeps its
   * place, last, because it is the specialised one: you go to it with a
   * question.
   */
  let resSection = $state('reactions');

  const RES_SECTIONS = $derived([
    { id: 'reactions', labelKey: 'pro.reactionsTitle', count: () => results?.reactions.length ?? 0 },
    { id: 'forces', labelKey: 'pro.forcesTitle', count: () => results?.elementForces.length ?? 0 },
    { id: 'displacements', labelKey: 'pro.displacementsTitle', count: () => results?.displacements.length ?? 0 },
    { id: 'shells', labelKey: 'pro.shellStresses', count: () => shellRows.length },
    // These two are computed inside the markup as `{@const}`, so the counts are
    // taken from the same source rather than from a binding that is not in
    // scope here.
    { id: 'nodalShells', labelKey: 'pro.nodalShellStresses',
      count: () => results?.quadStresses?.filter(qs => qs.nodalVonMises?.length).length ?? 0 },
    { id: 'constraints', labelKey: 'pro.constraintForces',
      count: () => (results?.constraintForces?.length ?? 0) || resultsStore.constraintForces3D.length },
    { id: 'diagnostics', labelKey: 'pro.diagnosticsTitle', count: () => results?.diagnostics?.length ?? 0 },
    { id: 'query', labelKey: 'pro.queryTitle', count: () => 1 },
  ]);

  /*
   * A section that empties under you is not somewhere to be left standing —
   * and the fallback is the first output that HAS something, not the query.
   * Falling back to the query meant that before the first solve, when every
   * count is zero, the panel landed on the one view that can say nothing
   * without a diagram, and never came back once results arrived.
   */
  $effect(() => {
    const cur = RES_SECTIONS.find(x => x.id === resSection);
    if (!cur || cur.id === 'query' || cur.count() > 0) return;
    const next = RES_SECTIONS.find(x => x.id !== 'query' && x.count() > 0);
    // Nothing anywhere means there is no solve yet, and the selection is still
    // a perfectly good intention — moving it would strand the panel on the
    // query, which is where it used to end up and never come back from.
    if (next) resSection = next.id;
  });

  /*
   * The six plotted along a member, so their ordinate can be scaled.
   *
   * Only the deformed shape had a slider, so the drawings whose height is
   * arbitrary — a moment plotted along a member — could not be made readable
   * on a tall frame or a long span. They use a different store because they
   * scale a different thing: the deformed shape multiplies a displacement, a
   * diagram multiplies an ordinate.
   */
  const DIAGRAM_KINDS = ['axial', 'momentY', 'momentZ', 'shearY', 'shearZ', 'torsion'];
</script>

<div class="pro-res">
  <div class="pro-res-header">
    <!--
      Solve lives in the ribbon, once. It was here too — a filled slab at the
      top of the panel — so the command that runs the analysis existed twice
      on screen with two different appearances, and the panel copy sat above
      the results it would replace.
    -->
    {#if solveError}
      <div class="pro-solve-error">{solveError}</div>
    {/if}
    {#if results}
      <span class="pro-res-status">{t('pro.solvedStatus').replace('{reactions}', String(results.reactions.length)).replace('{elements}', String(results.elementForces.length))}</span>
    {/if}
  </div>

  {#if results}
    <!-- 3D Visualization controls -->
    <div class="pro-viz-section">
      <div class="pro-viz-row">
        <!--
          The diagram moved to the ribbon, where Basic keeps it and where it is
          one click away instead of eleven entries down a dropdown. What stays
          here is the part that is NOT a quantity: how axial gets drawn.
        -->
        {#if resultsStore.diagramType === 'axial' || resultsStore.diagramType === 'axialColor'}
          <label class="pro-viz-label">{t('results.axialShownAs')}</label>
          <div class="pro-seg" role="group" aria-label={t('results.axialShownAs')}>
            <button
              class="pro-seg-btn"
              class:on={resultsStore.diagramType === 'axial'}
              onclick={() => (resultsStore.diagramType = 'axial')}
              data-testid="pro-axial-as-diagram"
            >{t('results.asDiagram')}</button>
            <button
              class="pro-seg-btn"
              class:on={resultsStore.diagramType === 'axialColor'}
              onclick={() => (resultsStore.diagramType = 'axialColor')}
              data-testid="pro-axial-as-colour"
            >{t('results.asMemberColour')}</button>
          </div>
        {:else}
          <span class="pro-viz-hint">{t('proResults.diagramInRibbon')}</span>
        {/if}
      </div>

      {#if resultsStore.diagramType === 'colorMap'}
        <div class="pro-viz-row">
          <label class="pro-viz-label">{t('pro.variableLabel')}</label>
          <select class="pro-viz-sel" bind:value={resultsStore.colorMapKind}>
            <option value="moment">{t('pro.varMoment')}</option>
            <option value="shear">{t('pro.varShear')}</option>
            <option value="axial">{t('pro.varAxial')}</option>
            <option value="stressRatio">{t('pro.varStressRatio')}</option>
            <option value="vonMises">Von Mises (σ)</option>
            <option value="shellVonMises">{t('pro.shellContour')}</option>
          </select>
        </div>
        {#if resultsStore.colorMapKind === 'shellVonMises' || resultsStore.colorMapKind === 'shellBending'}
          <div class="pro-viz-row">
            <label class="pro-viz-label">{t('pro.shellComponent')}</label>
            <select class="pro-viz-sel" bind:value={resultsStore.shellContourComponent}>
              {#each shellGroups as [group, comps]}
                <optgroup label={SHELL_COMPONENT_GROUP_LABELS[group]}>
                  {#each comps as c}
                    {@const st = shellStats?.[c.key]?.status}
                    <option value={c.key}>{c.label} ({c.unit}){st === 'negligible' ? ' — ≈0' : st === 'uniform' ? ' — uniform' : ''}</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
          </div>
        {/if}
      {/if}

      {#if resultsStore.diagramType === 'deformed'}
        <div class="pro-viz-row">
          <label class="pro-viz-label">{t('pro.scaleLabel')}</label>
          <input
            type="range"
            class="pro-viz-range"
            min={1}
            max={1000}
            step={1}
            value={resultsStore.deformedScale}
            oninput={onDeformedScaleInput}
          />
          <span class="pro-viz-val">{Math.round(resultsStore.deformedScale)}×</span>
        </div>
        {:else if DIAGRAM_KINDS.includes(resultsStore.diagramType)}
          <div class="pro-viz-row">
            <label class="pro-viz-label">{t('pro.scaleLabel')}</label>
            <input
              type="range"
              class="pro-viz-range"
              min={0.1}
              max={5}
              step={0.1}
              value={resultsStore.diagramScale}
              oninput={(e) => (resultsStore.diagramScale = Number((e.target as HTMLInputElement).value))}
              data-testid="pro-diagram-scale"
            />
            <span class="pro-viz-val">{resultsStore.diagramScale.toFixed(1)}×</span>
          </div>
        {/if}

      <div class="pro-viz-row">
        <label class="pro-viz-check">
          <input type="checkbox" checked={uiStore.showLoads3D} onchange={onToggleLoads} />
          {t('pro.showLoads')}
        </label>
      </div>
      <div class="pro-viz-row">
        <label class="pro-viz-check">
          <input type="checkbox" bind:checked={resultsStore.showReactions} />
          {t('pro.showReactions3D')}
        </label>
      </div>
      <div class="pro-viz-row">
        <label class="pro-viz-check">
          <input type="checkbox" bind:checked={resultsStore.showConstraintForces} />
          {t('config.showConstraintForces')}
        </label>
      </div>
    </div>

    <!-- View mode selector -->
    {#if hasCombinations}
      <div class="pro-view-selector">
        <button class="pro-view-btn" class:active={viewMode === 'single'} onclick={() => switchView('single')}>{t('pro.viewCase')}</button>
        <button class="pro-view-btn" class:active={viewMode === 'combo'} onclick={() => switchView('combo')}>{t('pro.viewCombo')}</button>
        <button class="pro-view-btn" class:active={viewMode === 'envelope'} onclick={() => switchView('envelope')}>{t('pro.viewEnvelope')}</button>

        {#if viewMode === 'single' && caseKeys.length > 0}
          <select class="pro-view-sel" onchange={onCaseChange}>
            {#each caseKeys as cid}
              {@const lc = modelStore.loadCases.find(c => c.id === cid)}
              <option value={cid}>{lc ? lc.name : `${t('pro.caseN')}${cid}`}</option>
            {/each}
          </select>
        {/if}

        {#if viewMode === 'combo' && comboKeys.length > 0}
          <select class="pro-view-sel" onchange={onComboChange}>
            {#each comboKeys as cid}
              {@const cb = modelStore.combinations.find(c => c.id === cid)}
              <option value={cid}>{cb ? cb.name : `${t('pro.comboN')}${cid}`}</option>
            {/each}
          </select>
        {/if}
      </div>
    {/if}

    <!-- Results tables — each collapsible -->
    <div class="pro-res-scroll">

      <!-- Result query / extraction -->
      <!--
        One result table at a time, chosen from a strip that shows the counts.
        ─────────────────────────────────────────────────────────────────────
        These were eight collapsible sections, all open by default, stacked in
        one column: reactions, forces, displacements, shell stresses, nodal
        shell stresses, constraint forces, diagnostics and the query. On a real
        model that is thousands of rows in a single scroll, so reading the
        reactions meant scrolling past the query and reading the forces meant
        scrolling past the reactions — and every table got a sliver of the
        panel's height because it was sharing with seven others.

        They are not eight things to see at once; they are eight answers to
        "which output am I reading", which is one question. The strip asks it
        once, carries each answer's row count so the shape of the results is
        visible without opening anything, and disables what this model has none
        of rather than hiding it — a model with no shells should still say that
        shell stresses exist.

        The chosen table then gets the whole panel, which is more rows than any
        of them had before.
      -->
      <h4 class="res-heading">{t('proResults.outputs')}</h4>
      <div class="res-tabs" role="tablist">
        {#each RES_SECTIONS as sec (sec.id)}
          {@const n = sec.count()}
          <button
            class="res-tab"
            class:on={resSection === sec.id}
            role="tab"
            aria-selected={resSection === sec.id}
            disabled={n === 0 && sec.id !== 'query'}
            onclick={() => (resSection = sec.id)}
            data-testid="res-tab-{sec.id}"
          >
            {t(sec.labelKey)}
            {#if sec.id !== 'query'}<span class="res-tab-n">{n}</span>{/if}
          </button>
        {/each}
      </div>

      {#if resSection === 'query'}
        <div class="pro-query">
          {#if !isForceDiagram}
            <div class="pro-query-empty">{t('pro.querySelectForceDiagram')}</div>
          {:else}
            <div class="pro-viz-row">
              <label class="pro-viz-label">{t('pro.queryScope')}</label>
              <select class="pro-viz-sel" bind:value={queryScope} onchange={() => uiStore.releaseManualSelection()}>
                <option value="all">{t('pro.queryScopeAll')}</option>
                <option value="selected">{t('pro.queryScopeSelected')} ({uiStore.selectedElements.size})</option>
                <option value="id">{t('pro.queryScopeId')}</option>
              </select>
            </div>
            {#if queryScope === 'id'}
              <div class="pro-viz-row">
                <label class="pro-viz-label"></label>
                <input class="pro-viz-sel" type="text" bind:value={queryIdInput} oninput={() => uiStore.releaseManualSelection()} placeholder={t('pro.queryIdPlaceholder')} />
              </div>
            {/if}
            <div class="pro-viz-row">
              <label class="pro-viz-label">{t('pro.queryMode')}</label>
              <select class="pro-viz-sel" bind:value={queryMode}>
                <option value="absmax">{t('pro.queryModeAbsmax')}</option>
                <!-- Envelope data is abs-max winners: signed max/min over it is
                     not the true envelope extreme, so those modes are disabled. -->
                <option value="max" disabled={isEnvelopeView}>{t('pro.queryModeMax')}</option>
                <option value="min" disabled={isEnvelopeView}>{t('pro.queryModeMin')}</option>
              </select>
            </div>
            <div class="pro-viz-row">
              <label class="pro-viz-label">{t('pro.queryThreshold')}</label>
              <input class="pro-viz-sel" type="number" min="0" step="any" bind:value={queryThreshold} />
              <span class="pro-viz-val">{queryUnit}</span>
            </div>

            <!-- Extreme value card (follows active component + view) -->
            {#if activeExtreme}
              <div class="pro-query-card" onclick={() => selectQueryElement(activeExtreme.elementId)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && selectQueryElement(activeExtreme.elementId)}>
                <span class="pqc-label">{t('pro.queryGoverningValue')}</span>
                <span class="pqc-val">{queryComponent} = {fmtNum(activeExtreme.value)} {queryUnit}</span>
                <span class="pqc-meta">{t('pro.elemLabel')} {activeExtreme.elementId} · {t('pro.queryEnd')} {activeExtreme.end} · {activeSourceLabel}</span>
              </div>
            {:else}
              <div class="pro-query-empty">{t('pro.queryNoRows')}</div>
            {/if}

            <!-- Rows table -->
            {#if filteredRows.length}
              <div class="pro-query-rowcount">{t('pro.queryRowCount').replace('{n}', String(filteredRows.length))}</div>
              <div class="pro-res-table-wrap pro-query-tablewrap">
                <table class="pro-res-table">
                  <thead><tr>
                    <th>{t('pro.elemLabel')}</th><th>{t('pro.queryEnd')}</th><th>{t('pro.queryValue')} ({queryUnit})</th>
                  </tr></thead>
                  <tbody>
                    {#each renderRows as r (r.elementId + '-' + r.end)}
                      <tr onclick={() => selectQueryElement(r.elementId)} style="cursor:pointer" class:pq-extreme={activeExtreme && r.elementId === activeExtreme.elementId && r.end === activeExtreme.end}>
                        <td class="col-id">{r.elementId}</td>
                        <td class="col-end">{r.end}</td>
                        <td class="col-num">{fmtNum(r.value)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
              {#if filteredRows.length > MAX_RENDER_ROWS}
                <div class="pro-query-rowcount">{t('pro.queryRowsShown').replace('{shown}', String(MAX_RENDER_ROWS)).replace('{total}', String(filteredRows.length))}</div>
              {/if}
            {/if}

            <button class="pro-query-export" onclick={exportQueryCsv} disabled={!exportCount}>
              {t('pro.queryExportCsv')}
            </button>
            {#if exportCount}
              <div class="pro-query-export-cap">
                {t('pro.queryExportCaption')
                  .replace('{kind}', exportMeta.sourceKind)
                  .replace('{source}', exportMeta.sourceName)
                  .replace('{component}', queryComponent ?? '')
                  .replace('{n}', String(exportCount))}
              </div>
            {/if}
          {/if}
        </div>
      {/if}

      {#if resSection === 'reactions'}
        <div class="pro-res-table-wrap">
          <table class="pro-res-table">
            <thead>
              <tr>
                <th>{t('pro.nodeLabel')}</th>
                <th>Fx (kN)</th>
                <th>Fy (kN)</th>
                <th>Fz (kN)</th>
                <th>Mx (kN·m)</th>
                <th>My (kN·m)</th>
                <th>Mz (kN·m)</th>
              </tr>
            </thead>
            <tbody>
              {#each results.reactions as r}
                <tr onclick={() => { uiStore.selectMode = 'nodes'; uiStore.selectNode(r.nodeId, false); }} style="cursor:pointer">
                  <td class="col-id">{r.nodeId}</td>
                  <td class="col-num">{fmtNum(r.fx)}</td>
                  <td class="col-num">{fmtNum(r.fy)}</td>
                  <td class="col-num">{fmtNum(r.fz)}</td>
                  <td class="col-num">{fmtNum(r.mx)}</td>
                  <td class="col-num">{fmtNum(r.my)}</td>
                  <td class="col-num">{fmtNum(r.mz)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if resSection === 'forces'}
        <div class="pro-res-table-wrap">
          <table class="pro-res-table">
            <thead>
              <tr>
                <th>{t('pro.elemLabel')}</th>
                <th>Ext.</th>
                <th>N</th>
                <th>Vy</th>
                <th>Vz</th>
                <th>T</th>
                <th>My</th>
                <th>Mz</th>
              </tr>
            </thead>
            <tbody>
              {#each results.elementForces as ef}
                <tr onclick={() => { uiStore.selectMode = 'elements'; uiStore.selectElement(ef.elementId, false); }} style="cursor:pointer">
                  <td class="col-id" rowspan="2">{ef.elementId}</td>
                  <td class="col-end">i</td>
                  <td class="col-num">{fmtNum(ef.nStart)}</td>
                  <td class="col-num">{fmtNum(ef.vyStart)}</td>
                  <td class="col-num">{fmtNum(ef.vzStart)}</td>
                  <td class="col-num">{fmtNum(ef.mxStart)}</td>
                  <td class="col-num">{fmtNum(ef.myStart)}</td>
                  <td class="col-num">{fmtNum(ef.mzStart)}</td>
                </tr>
                <tr>
                  <td class="col-end">j</td>
                  <td class="col-num">{fmtNum(ef.nEnd)}</td>
                  <td class="col-num">{fmtNum(ef.vyEnd)}</td>
                  <td class="col-num">{fmtNum(ef.vzEnd)}</td>
                  <td class="col-num">{fmtNum(ef.mxEnd)}</td>
                  <td class="col-num">{fmtNum(ef.myEnd)}</td>
                  <td class="col-num">{fmtNum(ef.mzEnd)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if resSection === 'displacements'}
        <div class="pro-res-table-wrap">
          <table class="pro-res-table">
            <thead>
              <tr>
                <th>{t('pro.nodeLabel')}</th>
                <th>ux (m)</th>
                <th>uy (m)</th>
                <th>uz (m)</th>
                <th>&#x03B8;x</th>
                <th>&#x03B8;y</th>
                <th>&#x03B8;z</th>
              </tr>
            </thead>
            <tbody>
              {#each results.displacements as d}
                <tr onclick={() => { uiStore.selectMode = 'nodes'; uiStore.selectNode(d.nodeId, false); }} style="cursor:pointer">
                  <td class="col-id">{d.nodeId}</td>
                  <td class="col-num">{fmtNum(d.ux)}</td>
                  <td class="col-num">{fmtNum(d.uy)}</td>
                  <td class="col-num">{fmtNum(d.uz)}</td>
                  <td class="col-num">{fmtNum(d.rx)}</td>
                  <td class="col-num">{fmtNum(d.ry)}</td>
                  <td class="col-num">{fmtNum(d.rz)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      
      {#if shellRows.length}
      {#if resSection === 'shells'}
          <div class="shell-table-legend">{t('pro.shellTableLegend')}</div>
          <div class="pro-res-table-wrap">
            <!-- Membrane + principal stresses -->
            <div class="shell-table-label">{t('pro.shellMembraneStresses')} <span class="shell-unit">[kN/m²]</span></div>
            <table class="pro-res-table">
              <thead><tr>
                <th>{t('pro.elemLabel')}</th><th>{t('pro.typeLabel')}</th>
                {#each [['sigmaXx','σxx'],['sigmaYy','σyy'],['tauXy','τxy'],['sigma1','σ1'],['sigma2','σ2'],['vonMises',t('pro.vonMisesShort')]] as [k, lbl]}
                  <th class="col-num" class:th-zero={shellNegligible(k)}>{@html lbl}{#if shellNegligible(k)}<span class="zero-badge" title={t('pro.shellNearZero')}>≈0</span>{/if}</th>
                {/each}
              </tr></thead>
              <tbody>
                {#each shellRows as r}
                  <tr class:selected={uiStore.selectedShells.has(r.key)} onclick={() => { uiStore.selectMode = 'shells'; uiStore.selectShell(r.key, false); }} style="cursor:pointer">
                    <td class="col-id">{r.id}</td>
                    <td class="col-type">{r.type}</td>
                    <td class="col-num" class:gov={shellGov.sigmaXx === r.key}>{fmtNum(r.sigmaXx)}</td>
                    <td class="col-num" class:gov={shellGov.sigmaYy === r.key}>{fmtNum(r.sigmaYy)}</td>
                    <td class="col-num" class:gov={shellGov.tauXy === r.key}>{fmtNum(r.tauXy)}</td>
                    <td class="col-num" class:gov={shellGov.sigma1 === r.key}>{fmtNum(r.sigma1)}</td>
                    <td class="col-num" class:gov={shellGov.sigma2 === r.key}>{fmtNum(r.sigma2)}</td>
                    <td class="col-num col-max" class:gov={shellGov.vonMises === r.key}>{fmtNum(r.vonMises)}</td>
                  </tr>
                {/each}
              </tbody>
              <tfoot><tr class="shell-peak-row">
                <td colspan="2">{t('pro.shellPeakAbs')}</td>
                {#each ['sigmaXx','sigmaYy','tauXy','sigma1','sigma2','vonMises'] as k}
                  <td class="col-num">{fmtNum(shellPeak(k))}</td>
                {/each}
              </tr></tfoot>
            </table>
            <!-- Bending moments per unit width -->
            <div class="shell-table-label">{t('pro.shellBendingMoments')} <span class="shell-unit">[kN·m/m]</span></div>
            <table class="pro-res-table">
              <thead><tr>
                <th>{t('pro.elemLabel')}</th><th>{t('pro.typeLabel')}</th>
                {#each [['mx','m<sub>x</sub>'],['my','m<sub>y</sub>'],['mxy','m<sub>xy</sub>']] as [k, lbl]}
                  <th class="col-num" class:th-zero={shellNegligible(k)}>{@html lbl}{#if shellNegligible(k)}<span class="zero-badge" title={t('pro.shellNearZero')}>≈0</span>{/if}</th>
                {/each}
              </tr></thead>
              <tbody>
                {#each shellRows as r}
                  <tr class:selected={uiStore.selectedShells.has(r.key)} onclick={() => { uiStore.selectMode = 'shells'; uiStore.selectShell(r.key, false); }} style="cursor:pointer">
                    <td class="col-id">{r.id}</td>
                    <td class="col-type">{r.type}</td>
                    <td class="col-num" class:gov={shellGov.mx === r.key}>{fmtNum(r.mx)}</td>
                    <td class="col-num" class:gov={shellGov.my === r.key}>{fmtNum(r.my)}</td>
                    <td class="col-num" class:gov={shellGov.mxy === r.key}>{fmtNum(r.mxy)}</td>
                  </tr>
                {/each}
              </tbody>
              <tfoot><tr class="shell-peak-row">
                <td colspan="2">{t('pro.shellPeakAbs')}</td>
                {#each ['mx','my','mxy'] as k}
                  <td class="col-num">{fmtNum(shellPeak(k))}</td>
                {/each}
              </tr></tfoot>
            </table>
          </div>
      {/if}
      {/if}

      {#if results.quadStresses?.some(qs => qs.nodalVonMises?.length)}
        {@const nodalQuads = results.quadStresses!.filter(qs => qs.nodalVonMises?.length)}
      {#if resSection === 'nodalShells'}
          <div class="pro-res-table-wrap">
            <table class="pro-res-table">
              <thead><tr>
                <th>{t('pro.elemLabel')}</th>
                <th>{t('pro.nodalVmNode')} 1</th>
                <th>{t('pro.nodalVmNode')} 2</th>
                <th>{t('pro.nodalVmNode')} 3</th>
                <th>{t('pro.nodalVmNode')} 4</th>
                <th>Min</th>
                <th>Max</th>
              </tr></thead>
              <tbody>
                {#each nodalQuads as qs}
                  {@const nvm = qs.nodalVonMises!}
                  {@const quadDef = modelStore.quads.get(qs.elementId)}
                  {@const vmMin = Math.min(...nvm)}
                  {@const vmMax = Math.max(...nvm)}
                  <tr onclick={() => { uiStore.selectMode = 'shells'; uiStore.selectShell('q' + qs.elementId, false); }} style="cursor:pointer">
                    <td class="col-id">{qs.elementId}</td>
                    {#each nvm as vm, i}
                      <td class="col-num" title="{quadDef ? t('pro.nodeLabel') + ' ' + quadDef.nodes[i] : ''}">
                        {fmtNum(vm)}
                      </td>
                    {/each}
                    {#if nvm.length < 4}
                      {#each { length: 4 - nvm.length } as _}
                        <td class="col-num">—</td>
                      {/each}
                    {/if}
                    <td class="col-num col-min">{fmtNum(vmMin)}</td>
                    <td class="col-num col-max">{fmtNum(vmMax)}</td>
                  </tr>
                  {#if quadDef}
                    <tr class="nodal-ids-row">
                      <td></td>
                      {#each quadDef.nodes as nid}
                        <td class="col-node-id">N{nid}</td>
                      {/each}
                      <td></td><td></td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
      {/if}
      {/if}

      {#if (results.constraintForces?.length ?? 0) > 0 || resultsStore.constraintForces3D.length > 0}
        {@const cForces = results.constraintForces?.length ? results.constraintForces : resultsStore.constraintForces3D}
      {#if resSection === 'constraints'}
          <div class="pro-res-table-wrap">
            <table class="pro-res-table">
              <thead><tr>
                <th>{t('pro.nodeLabel')}</th><th>DOF</th><th>{t('pro.forceLabel')}</th>
              </tr></thead>
              <tbody>
                {#each cForces as cf}
                  <tr onclick={() => { uiStore.selectMode = 'nodes'; uiStore.selectNode(cf.nodeId, false); }} style="cursor:pointer">
                    <td class="col-id">{cf.nodeId}</td>
                    <td>{cf.dof}</td>
                    <td class="col-num">{fmtNum(cf.force)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
      {/if}
      {/if}

      
      {#if results.diagnostics?.length}
      {#if resSection === 'diagnostics'}
          <div class="pro-res-table-wrap">
            <table class="pro-res-table">
              <thead><tr>
                <th>{t('pro.elemLabel')}</th><th>{t('pro.metricLabel')}</th><th>{t('pro.valueLabel')}</th><th>{t('pro.thresholdLabel')}</th><th>{t('pro.messageLabel')}</th>
              </tr></thead>
              <tbody>
                {#each results.diagnostics as diag}
                  <tr onclick={() => { uiStore.selectMode = 'elements'; uiStore.selectElement(diag.elementId, false); }} style="cursor:pointer">
                    <td class="col-id">{diag.elementId}</td>
                    <td>{diag.metric}</td>
                    <td class="col-num">{fmtNum(diag.value)}</td>
                    <td class="col-num">{fmtNum(diag.threshold)}</td>
                    <td style="font-size:0.6rem">{diag.message}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
      {/if}
      {/if}

    </div>
  {:else}
    <div class="pro-empty">
      {#if hasModel}
        {t('pro.pressCalculate')}
      {:else}
        {t('pro.defineModelFirst')}
      {/if}
    </div>
  {/if}


</div>

<style>
  /* ── The output selector ───────────────────────────────────────────── */

  .res-heading {
    font-family: var(--st-mono);
    font-size: 0.64rem;
    font-weight: 400;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-3);
    margin: 0.5rem 0 0.1rem;
  }

  .res-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    padding: 0.35rem 0 0.4rem;
    border-bottom: 1px solid var(--st-hair);
    margin-bottom: 0.4rem;
  }

  .res-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-3);
    font-family: var(--st-sans);
    font-size: 0.72rem;
    padding: 0.18rem 0.45rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .res-tab:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .res-tab:disabled { opacity: 0.35; cursor: not-allowed; }
  .res-tab.on { color: var(--st-accent); border-color: var(--st-accent); }

  /* The count is a value, so it takes the value colour and the mono face. */
  .res-tab-n {
    font-family: var(--st-mono);
    font-size: 0.62rem;
    color: var(--st-value);
  }

  .res-tab.on .res-tab-n { color: var(--st-accent); }
  .res-tab:disabled .res-tab-n { color: var(--st-text-3); }

  /* A two-state choice reads as one control, not two buttons. */
  .pro-viz-hint {
    font-size: 0.7rem;
    color: var(--st-text-3);
    font-style: italic;
  }

  .pro-seg {
    display: inline-flex;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    overflow: hidden;
  }

  .pro-seg-btn {
    background: none;
    border: none;
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.72rem;
    padding: 0.22rem 0.5rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .pro-seg-btn + .pro-seg-btn { border-left: 1px solid var(--st-hair); }
  .pro-seg-btn:hover { background: var(--st-surface-3); color: var(--st-text); }
  .pro-seg-btn.on { background: var(--st-selected-bg); color: var(--st-accent); }

  .pro-res { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  .pro-res-header {
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
  }

  .pro-res-solve-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .pro-solve-btn {
    padding: 6px 20px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--st-text);
    background: linear-gradient(135deg, var(--st-accent), var(--st-accent));
    border: 1px solid var(--st-accent);
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-solve-btn:hover { background: linear-gradient(135deg, var(--st-danger), var(--st-accent)); }
  .pro-solve-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .pro-sw-label {
    font-size: 0.65rem;
    color: var(--st-text-3);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .pro-sw-label input { cursor: pointer; }

  .pro-solve-error {
    margin-top: 6px;
    padding: 4px 8px;
    font-size: 0.7rem;
    color: var(--st-danger);
    background: rgba(229, 72, 42, 0.1);
    border-radius: 3px;
  }

  .pro-res-status {
    display: block;
    margin-top: 6px;
    font-size: 0.72rem;
    color: var(--st-value);
    font-weight: 500;
  }

  /* Visualization controls */
  .pro-viz-section {
    padding: 6px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    display: flex;
    flex-direction: column;
    gap: 5px;
    background: var(--st-surface);
    flex-shrink: 0;
  }

  .pro-viz-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pro-viz-label {
    font-size: 0.62rem;
    font-weight: 600;
    color: var(--st-text-3);
    min-width: 55px;
  }

  .pro-viz-sel {
    padding: 2px 4px;
    font-size: 0.64rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
    cursor: pointer;
    flex: 1;
  }

  .pro-viz-range {
    flex: 1;
    height: 14px;
    accent-color: var(--st-accent);
  }

  .pro-viz-val {
    font-size: 0.6rem;
    font-family: monospace;
    color: var(--st-value);
    min-width: 36px;
    text-align: right;
  }

  .pro-viz-check {
    font-size: 0.64rem;
    color: var(--st-text-2);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .pro-viz-check input { cursor: pointer; }

  /* View mode selector */
  .pro-view-selector {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .pro-view-btn {
    padding: 3px 10px;
    font-size: 0.64rem;
    font-weight: 600;
    color: var(--st-text-3);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    cursor: pointer;
  }

  .pro-view-btn:hover { color: var(--st-text-2); background: var(--st-hair-strong); }
  .pro-view-btn.active { color: var(--st-text); background: var(--st-surface-3); border-color: var(--st-value); }

  .pro-view-sel {
    padding: 3px 6px;
    font-size: 0.64rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
    cursor: pointer;
    margin-left: 4px;
  }

  /* Scrollable results area */
  .pro-res-scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  /* Collapsible result sections */
  .res-detail {
    border-bottom: 1px solid var(--st-surface-3);
  }

  .res-detail > summary {
    cursor: pointer;
    user-select: none;
    list-style: none;
  }

  .res-detail > summary::-webkit-details-marker { display: none; }

  .res-detail > summary::before {
    content: '▸ ';
    font-size: 0.55rem;
    color: var(--st-text-3);
  }

  .res-detail[open] > summary::before {
    content: '▾ ';
  }

  .pro-res-section-title {
    padding: 5px 10px;
    font-size: 0.62rem;
    font-weight: 600;
    color: var(--st-text-2);
    text-transform: uppercase;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
  }

  .res-count {
    font-weight: 400;
    color: var(--st-text-3);
    font-size: 0.58rem;
  }

  .pro-res-table-wrap { overflow-x: auto; }

  .pro-res-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
  .pro-res-table thead { position: sticky; top: 0; z-index: 1; }
  .pro-res-table th {
    padding: 4px 5px; text-align: left; font-size: 0.56rem; font-weight: 600;
    color: var(--st-text-3); text-transform: uppercase; background: var(--st-surface); border-bottom: 1px solid var(--st-surface-3);
  }
  .pro-res-table td { padding: 3px 5px; border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .col-id { width: 30px; color: var(--st-text-3); font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.66rem; }
  .col-end { font-size: 0.6rem; color: var(--st-text-3); font-weight: 600; text-align: center; width: 20px; }
  .col-type { font-size: 0.62rem; color: var(--st-info); text-align: center; width: 40px; }

  .shell-table-label {
    font-size: 0.66rem; font-weight: 600; color: var(--st-text-2);
    margin: 8px 0 3px; display: flex; gap: 6px; align-items: baseline;
  }
  .shell-table-label:first-child { margin-top: 0; }
  .shell-unit { color: var(--st-text-3); font-weight: 400; font-family: monospace; }
  .pro-res-table tr.selected td { background: rgba(0, 255, 255, 0.12); }

  .shell-table-legend {
    font-size: 0.6rem; color: var(--st-text-2); line-height: 1.4; margin: 2px 0 6px;
    padding: 4px 6px; border-left: 2px solid var(--st-hair-strong); background: rgba(40, 70, 90, 0.25);
  }
  /* Governing cell (largest |value|) in a shell column */
  .pro-res-table td.gov {
    color: var(--st-warn); font-weight: 700;
    background: rgba(255, 209, 102, 0.10);
  }
  /* Negligible-column header marker */
  .pro-res-table th.th-zero { color: var(--st-text-3); }
  .zero-badge {
    font-size: 0.5rem; font-weight: 700; color: var(--st-surface); background: var(--st-text-3);
    border-radius: 3px; padding: 0 3px; margin-left: 3px; vertical-align: middle;
  }
  /* Peak |value| summary footer row */
  .pro-res-table tfoot .shell-peak-row td {
    border-top: 1px solid var(--st-surface-3); font-size: 0.6rem; color: var(--st-value);
    font-weight: 600; background: rgba(20, 40, 60, 0.4);
  }
  .pro-res-table tfoot .shell-peak-row td:first-child { text-align: left; font-family: inherit; }

  .nodal-ids-row td {
    padding: 1px 5px;
    border-bottom: 1px solid var(--st-surface-2);
  }

  .col-node-id {
    font-size: 0.54rem;
    font-family: monospace;
    color: var(--st-text-3);
    text-align: right;
  }

  .col-min { color: var(--st-value); }
  .col-max { color: var(--st-accent); }

  .pro-empty {
    text-align: center;
    color: var(--st-text-3);
    font-style: italic;
    padding: 40px 10px;
  }

  /* Result query */
  .pro-query {
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    background: var(--st-surface);
  }

  .pro-query .pro-viz-sel[type="text"],
  .pro-query .pro-viz-sel[type="number"] {
    font-family: monospace;
  }

  .pro-query-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    margin-top: 3px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    cursor: pointer;
  }
  .pro-query-card:hover { border-color: var(--st-value); }
  .pqc-label { font-size: 0.55rem; color: var(--st-text-3); text-transform: uppercase; font-weight: 600; }
  .pqc-val { font-size: 0.9rem; font-family: monospace; color: var(--st-value); font-weight: 600; }
  .pqc-meta { font-size: 0.6rem; color: var(--st-text-3); font-family: monospace; }

  .pro-query-empty {
    padding: 6px 8px;
    margin-top: 3px;
    font-size: 0.66rem;
    font-style: italic;
    color: var(--st-text-3);
    text-align: center;
  }

  .pro-query-rowcount {
    font-size: 0.58rem;
    color: var(--st-text-3);
    margin-top: 4px;
  }

  .pro-query-tablewrap {
    max-height: 180px;
    overflow-y: auto;
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
  }

  .pq-extreme { background: rgba(127, 212, 204, 0.12); }
  .pq-extreme .col-num { color: var(--st-value); font-weight: 600; }

  .pro-query-export {
    align-self: flex-start;
    margin-top: 6px;
    padding: 4px 12px;
    font-size: 0.64rem;
    font-weight: 600;
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    cursor: pointer;
  }
  .pro-query-export:hover { color: var(--st-text); background: var(--st-surface-3); }
  .pro-query-export:disabled { opacity: 0.4; cursor: not-allowed; }

  .pro-query-export-cap {
    margin-top: 4px;
    font-size: 0.58rem;
    color: var(--st-text-3);
    font-style: italic;
  }

</style>
