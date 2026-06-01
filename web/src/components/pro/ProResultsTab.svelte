<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { runGlobalSolve } from '../../lib/engine/live-calc';
  import {
    FORCE_COMPONENTS,
    componentUnit,
    buildQueryRows,
    extremeRow,
    filterByAbsThreshold,
    governingForComponent,
    topGoverning,
    rowsToCsv,
    governingToCsv,
    type ForceComponent,
    type ExtremeMode,
  } from '../../lib/engine/result-query';

  let solveError = $state<string | null>(null);
  let solving = $state(false);

  const results = $derived(resultsStore.results3D);
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
            viewMode = 'envelope';
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
  let queryComponent = $state<ForceComponent>('Mz');
  let queryScope = $state<'selected' | 'all' | 'id'>('all');
  let queryIdInput = $state('');
  let querySource = $state<'active' | 'governing'>('active');
  let queryMode = $state<ExtremeMode>('absmax');
  let queryThreshold = $state(0);

  const hasGoverning = $derived(resultsStore.governing3D.size > 0);
  // Governing source only makes sense when combos were solved.
  const effectiveSource = $derived(querySource === 'governing' && hasGoverning ? 'governing' : 'active');

  /** Element id filter from the scope selector, or undefined for "all". */
  const scopeIds = $derived.by<number[] | undefined>(() => {
    if (queryScope === 'selected') return [...uiStore.selectedElements];
    if (queryScope === 'id') {
      return queryIdInput.split(/[\s,]+/).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
    }
    return undefined;
  });

  const activeRows = $derived.by(() => {
    if (!results) return [];
    return buildQueryRows(results.elementForces, queryComponent, scopeIds ? { elementIds: scopeIds } : {});
  });
  const filteredRows = $derived(filterByAbsThreshold(activeRows, queryThreshold));
  const activeExtreme = $derived(extremeRow(filteredRows, queryMode));

  const governingList = $derived(
    governingForComponent(resultsStore.governing3D, queryComponent, scopeIds ? { elementIds: scopeIds } : {}),
  );
  const governingTop = $derived(topGoverning(governingList));

  // Derive the label from resultsStore.activeView (the source of truth for
  // what results3D currently holds), NOT the local viewMode — they can diverge
  // right after Solve (the selector highlights a view before the store switches),
  // and the label must never claim "Envolvente" while single/all-loads data is shown.
  const activeSourceLabel = $derived.by(() => {
    const view = resultsStore.activeView;
    if (view === 'envelope') return t('pro.viewEnvelope');
    if (view === 'combo' && resultsStore.activeComboId !== null) {
      return modelStore.combinations.find((c) => c.id === resultsStore.activeComboId)?.name ?? `${t('pro.comboN')}${resultsStore.activeComboId}`;
    }
    if (view === 'single' && resultsStore.activeCaseId !== null) {
      return modelStore.loadCases.find((c) => c.id === resultsStore.activeCaseId)?.name ?? `${t('pro.caseN')}${resultsStore.activeCaseId}`;
    }
    return t('pro.viewCase');
  });

  const queryUnit = $derived(componentUnit(queryComponent));

  function selectQueryElement(id: number) {
    uiStore.selectMode = 'elements';
    uiStore.selectElement(id, false);
  }

  function exportQueryCsv() {
    const csv = effectiveSource === 'governing'
      ? governingToCsv(governingList)
      : rowsToCsv(filteredRows, activeSourceLabel);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stabileo-query-${queryComponent}-${effectiveSource}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

</script>

<div class="pro-res">
  <div class="pro-res-header">
    <div class="pro-res-solve-row">
      <button class="pro-solve-btn" onclick={handleSolve} disabled={!hasModel || solving}>
        {solving ? t('pro.solving') : t('pro.solve')}
      </button>
    </div>
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
        <label class="pro-viz-label">{t('pro.diagramLabel')}</label>
        <select class="pro-viz-sel" bind:value={resultsStore.diagramType}>
          <option value="none">{t('pro.diagNone')}</option>
          <option value="deformed">{t('pro.diagDeformed')}</option>
          <option value="momentY">My</option>
          <option value="momentZ">Mz</option>
          <option value="shearY">Vy</option>
          <option value="shearZ">Vz</option>
          <option value="axial">N</option>
          <option value="torsion">T</option>
          <option value="axialColor">{t('pro.diagAxialColor')}</option>
          <option value="colorMap">{t('pro.diagColorMap')}</option>
          <option value="verification">{t('pro.diagVerification')}</option>
        </select>
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
            <option value="shellVonMises">Shell σ Von Mises</option>
          </select>
        </div>
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
      {/if}

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
      <details class="res-detail" open>
        <summary class="pro-res-section-title">{t('pro.queryTitle')}</summary>
        <div class="pro-query">
          <div class="pro-viz-row">
            <label class="pro-viz-label">{t('pro.queryScope')}</label>
            <select class="pro-viz-sel" bind:value={queryScope}>
              <option value="all">{t('pro.queryScopeAll')}</option>
              <option value="selected">{t('pro.queryScopeSelected')} ({uiStore.selectedElements.size})</option>
              <option value="id">{t('pro.queryScopeId')}</option>
            </select>
          </div>
          {#if queryScope === 'id'}
            <div class="pro-viz-row">
              <label class="pro-viz-label"></label>
              <input class="pro-viz-sel" type="text" bind:value={queryIdInput} placeholder={t('pro.queryIdPlaceholder')} />
            </div>
          {/if}
          <div class="pro-viz-row">
            <label class="pro-viz-label">{t('pro.queryComponent')}</label>
            <select class="pro-viz-sel" bind:value={queryComponent}>
              {#each FORCE_COMPONENTS as c}
                <option value={c}>{c}</option>
              {/each}
            </select>
          </div>
          <div class="pro-viz-row">
            <label class="pro-viz-label">{t('pro.querySource')}</label>
            <select class="pro-viz-sel" bind:value={querySource}>
              <option value="active">{t('pro.querySourceActive')}{effectiveSource === 'active' ? ` — ${activeSourceLabel}` : ''}</option>
              <option value="governing" disabled={!hasGoverning}>{t('pro.querySourceGoverning')}</option>
            </select>
          </div>
          {#if effectiveSource === 'active'}
            <div class="pro-viz-row">
              <label class="pro-viz-label">{t('pro.queryMode')}</label>
              <select class="pro-viz-sel" bind:value={queryMode}>
                <option value="absmax">{t('pro.queryModeAbsmax')}</option>
                <option value="max">{t('pro.queryModeMax')}</option>
                <option value="min">{t('pro.queryModeMin')}</option>
              </select>
            </div>
            <div class="pro-viz-row">
              <label class="pro-viz-label">{t('pro.queryThreshold')}</label>
              <input class="pro-viz-sel" type="number" min="0" step="any" bind:value={queryThreshold} />
              <span class="pro-viz-val">{queryUnit}</span>
            </div>
          {/if}

          <!-- Governing value card -->
          {#if effectiveSource === 'active'}
            {#if activeExtreme}
              <div class="pro-query-card" onclick={() => selectQueryElement(activeExtreme.elementId)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && selectQueryElement(activeExtreme.elementId)}>
                <span class="pqc-label">{t('pro.queryGoverningValue')}</span>
                <span class="pqc-val">{queryComponent} = {fmtNum(activeExtreme.value)} {queryUnit}</span>
                <span class="pqc-meta">{t('pro.elemLabel')} {activeExtreme.elementId} · {t('pro.queryEnd')} {activeExtreme.end} · {activeSourceLabel}</span>
              </div>
            {:else}
              <div class="pro-query-empty">{t('pro.queryNoRows')}</div>
            {/if}
          {:else if governingTop}
            <div class="pro-query-card" onclick={() => selectQueryElement(governingTop.elementId)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && selectQueryElement(governingTop.elementId)}>
              <span class="pqc-label">{t('pro.queryGoverningValue')}</span>
              <span class="pqc-val">{queryComponent} = {fmtNum(governingTop.value)} {queryUnit}</span>
              <span class="pqc-meta">{t('pro.elemLabel')} {governingTop.elementId} · {governingTop.sourceLabel}</span>
            </div>
          {:else}
            <div class="pro-query-empty">{t('pro.queryNoRows')}</div>
          {/if}

          <!-- Rows table -->
          {#if effectiveSource === 'active'}
            {#if filteredRows.length}
              <div class="pro-query-rowcount">{t('pro.queryRowCount').replace('{n}', String(filteredRows.length))}</div>
              <div class="pro-res-table-wrap pro-query-tablewrap">
                <table class="pro-res-table">
                  <thead><tr>
                    <th>{t('pro.elemLabel')}</th><th>{t('pro.queryEnd')}</th><th>{t('pro.queryValue')} ({queryUnit})</th>
                  </tr></thead>
                  <tbody>
                    {#each filteredRows as r}
                      <tr onclick={() => selectQueryElement(r.elementId)} style="cursor:pointer" class:pq-extreme={activeExtreme && r.elementId === activeExtreme.elementId && r.end === activeExtreme.end}>
                        <td class="col-id">{r.elementId}</td>
                        <td class="col-end">{r.end}</td>
                        <td class="col-num">{fmtNum(r.value)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          {:else if governingList.length}
            <div class="pro-query-rowcount">{t('pro.queryRowCount').replace('{n}', String(governingList.length))}</div>
            <div class="pro-res-table-wrap pro-query-tablewrap">
              <table class="pro-res-table">
                <thead><tr>
                  <th>{t('pro.elemLabel')}</th><th>{t('pro.queryValue')} ({queryUnit})</th><th>{t('pro.querySourceCol')}</th>
                </tr></thead>
                <tbody>
                  {#each governingList as g}
                    <tr onclick={() => selectQueryElement(g.elementId)} style="cursor:pointer" class:pq-extreme={governingTop && g.elementId === governingTop.elementId}>
                      <td class="col-id">{g.elementId}</td>
                      <td class="col-num">{fmtNum(g.value)}</td>
                      <td class="col-src">{g.sourceLabel}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          <button class="pro-query-export" onclick={exportQueryCsv} disabled={effectiveSource === 'active' ? !filteredRows.length : !governingList.length}>
            {t('pro.queryExportCsv')}
          </button>
        </div>
      </details>

      <details class="res-detail" open>
        <summary class="pro-res-section-title">{t('pro.reactionsTitle')} <span class="res-count">({results.reactions.length})</span></summary>
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
      </details>

      <details class="res-detail" open>
        <summary class="pro-res-section-title">{t('pro.forcesTitle')} <span class="res-count">({results.elementForces.length})</span></summary>
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
      </details>

      <details class="res-detail">
        <summary class="pro-res-section-title">{t('pro.displacementsTitle')} <span class="res-count">({results.displacements.length})</span></summary>
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
      </details>

      {#if results.plateStresses?.length || results.quadStresses?.length}
        <details class="res-detail" open>
          <summary class="pro-res-section-title">{t('pro.shellStresses')} <span class="res-count">({(results.plateStresses?.length ?? 0) + (results.quadStresses?.length ?? 0)})</span></summary>
          <div class="pro-res-table-wrap">
            {#if results.plateStresses?.length}
              <table class="pro-res-table">
                <thead><tr>
                  <th>Elem</th><th>&sigma;xx</th><th>&sigma;yy</th><th>&tau;xy</th>
                  <th>mx</th><th>my</th><th>mxy</th><th>Von Mises</th>
                </tr></thead>
                <tbody>
                  {#each results.plateStresses as ps}
                    <tr onclick={() => { uiStore.selectMode = 'shells'; uiStore.selectElement(ps.elementId, false); }} style="cursor:pointer">
                      <td class="col-id">{ps.elementId}</td>
                      <td class="col-num">{fmtNum(ps.sigmaXx)}</td>
                      <td class="col-num">{fmtNum(ps.sigmaYy)}</td>
                      <td class="col-num">{fmtNum(ps.tauXy)}</td>
                      <td class="col-num">{fmtNum(ps.mx)}</td>
                      <td class="col-num">{fmtNum(ps.my)}</td>
                      <td class="col-num">{fmtNum(ps.mxy)}</td>
                      <td class="col-num">{fmtNum(ps.vonMises)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
            {#if results.quadStresses?.length}
              <table class="pro-res-table">
                <thead><tr>
                  <th>Elem</th><th>&sigma;xx</th><th>&sigma;yy</th><th>&tau;xy</th>
                  <th>mx</th><th>my</th><th>mxy</th><th>Von Mises</th>
                </tr></thead>
                <tbody>
                  {#each results.quadStresses as qs}
                    <tr onclick={() => { uiStore.selectMode = 'shells'; uiStore.selectElement(qs.elementId, false); }} style="cursor:pointer">
                      <td class="col-id">{qs.elementId}</td>
                      <td class="col-num">{fmtNum(qs.sigmaXx)}</td>
                      <td class="col-num">{fmtNum(qs.sigmaYy)}</td>
                      <td class="col-num">{fmtNum(qs.tauXy)}</td>
                      <td class="col-num">{fmtNum(qs.mx)}</td>
                      <td class="col-num">{fmtNum(qs.my)}</td>
                      <td class="col-num">{fmtNum(qs.mxy)}</td>
                      <td class="col-num">{fmtNum(qs.vonMises)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        </details>
      {/if}

      {#if results.quadStresses?.some(qs => qs.nodalVonMises?.length)}
        {@const nodalQuads = results.quadStresses!.filter(qs => qs.nodalVonMises?.length)}
        <details class="res-detail">
          <summary class="pro-res-section-title">{t('pro.nodalShellStresses')} <span class="res-count">({nodalQuads.length})</span></summary>
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
                  <tr onclick={() => { uiStore.selectMode = 'shells'; uiStore.selectElement(qs.elementId, false); }} style="cursor:pointer">
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
        </details>
      {/if}

      {#if (results.constraintForces?.length ?? 0) > 0 || resultsStore.constraintForces3D.length > 0}
        {@const cForces = results.constraintForces?.length ? results.constraintForces : resultsStore.constraintForces3D}
        <details class="res-detail">
          <summary class="pro-res-section-title">{t('pro.constraintForces')} <span class="res-count">({cForces.length})</span></summary>
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
        </details>
      {/if}

      {#if results.diagnostics?.length}
        <details class="res-detail">
          <summary class="pro-res-section-title">{t('pro.diagnosticsTitle')} <span class="res-count">({results.diagnostics.length})</span></summary>
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
        </details>
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
  .pro-res { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  .pro-res-header {
    padding: 8px 10px;
    border-bottom: 1px solid #1a3050;
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
    color: #fff;
    background: linear-gradient(135deg, #e94560, #c73e54);
    border: 1px solid #e94560;
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-solve-btn:hover { background: linear-gradient(135deg, #ff5a75, #e94560); }
  .pro-solve-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .pro-sw-label {
    font-size: 0.65rem;
    color: #888;
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
    color: #ff8a9e;
    background: rgba(233, 69, 96, 0.1);
    border-radius: 3px;
  }

  .pro-res-status {
    display: block;
    margin-top: 6px;
    font-size: 0.72rem;
    color: #4ecdc4;
    font-weight: 500;
  }

  /* Visualization controls */
  .pro-viz-section {
    padding: 6px 10px;
    border-bottom: 1px solid #1a3050;
    display: flex;
    flex-direction: column;
    gap: 5px;
    background: #0d1b33;
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
    color: #888;
    min-width: 55px;
  }

  .pro-viz-sel {
    padding: 2px 4px;
    font-size: 0.64rem;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
    cursor: pointer;
    flex: 1;
  }

  .pro-viz-range {
    flex: 1;
    height: 14px;
    accent-color: #e94560;
  }

  .pro-viz-val {
    font-size: 0.6rem;
    font-family: monospace;
    color: #4ecdc4;
    min-width: 36px;
    text-align: right;
  }

  .pro-viz-check {
    font-size: 0.64rem;
    color: #aaa;
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
    border-bottom: 1px solid #1a3050;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .pro-view-btn {
    padding: 3px 10px;
    font-size: 0.64rem;
    font-weight: 600;
    color: #888;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 3px;
    cursor: pointer;
  }

  .pro-view-btn:hover { color: #ccc; background: #1a3860; }
  .pro-view-btn.active { color: #fff; background: #1a4a7a; border-color: #4ecdc4; }

  .pro-view-sel {
    padding: 3px 6px;
    font-size: 0.64rem;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
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
    border-bottom: 1px solid #1a3050;
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
    color: #666;
  }

  .res-detail[open] > summary::before {
    content: '▾ ';
  }

  .pro-res-section-title {
    padding: 5px 10px;
    font-size: 0.62rem;
    font-weight: 600;
    color: #4ecdc4;
    text-transform: uppercase;
    background: #0a1a30;
    border-bottom: 1px solid #1a3050;
  }

  .res-count {
    font-weight: 400;
    color: #666;
    font-size: 0.58rem;
  }

  .pro-res-table-wrap { overflow-x: auto; }

  .pro-res-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
  .pro-res-table thead { position: sticky; top: 0; z-index: 1; }
  .pro-res-table th {
    padding: 4px 5px; text-align: left; font-size: 0.56rem; font-weight: 600;
    color: #888; text-transform: uppercase; background: #0a1a30; border-bottom: 1px solid #1a4a7a;
  }
  .pro-res-table td { padding: 3px 5px; border-bottom: 1px solid #0f2030; color: #ccc; }
  .col-id { width: 30px; color: #666; font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.66rem; }
  .col-end { font-size: 0.6rem; color: #888; font-weight: 600; text-align: center; width: 20px; }

  .nodal-ids-row td {
    padding: 1px 5px;
    border-bottom: 1px solid #0f2030;
  }

  .col-node-id {
    font-size: 0.54rem;
    font-family: monospace;
    color: #556;
    text-align: right;
  }

  .col-min { color: #4ecdc4; }
  .col-max { color: #e94560; }

  .pro-empty {
    text-align: center;
    color: #555;
    font-style: italic;
    padding: 40px 10px;
  }

  /* Result query */
  .pro-query {
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    background: #0d1b33;
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
    background: #0f2840;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    cursor: pointer;
  }
  .pro-query-card:hover { border-color: #4ecdc4; }
  .pqc-label { font-size: 0.55rem; color: #888; text-transform: uppercase; font-weight: 600; }
  .pqc-val { font-size: 0.9rem; font-family: monospace; color: #4ecdc4; font-weight: 600; }
  .pqc-meta { font-size: 0.6rem; color: #888; font-family: monospace; }

  .pro-query-empty {
    padding: 6px 8px;
    margin-top: 3px;
    font-size: 0.66rem;
    font-style: italic;
    color: #555;
    text-align: center;
  }

  .pro-query-rowcount {
    font-size: 0.58rem;
    color: #666;
    margin-top: 4px;
  }

  .pro-query-tablewrap {
    max-height: 180px;
    overflow-y: auto;
    border: 1px solid #1a3050;
    border-radius: 3px;
  }

  .pq-extreme { background: rgba(78, 205, 196, 0.12); }
  .pq-extreme .col-num { color: #4ecdc4; font-weight: 600; }
  .col-src { font-size: 0.6rem; color: #aaa; font-family: monospace; }

  .pro-query-export {
    align-self: flex-start;
    margin-top: 6px;
    padding: 4px 12px;
    font-size: 0.64rem;
    font-weight: 600;
    color: #ccc;
    background: #0f2840;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    cursor: pointer;
  }
  .pro-query-export:hover { color: #fff; background: #1a4a7a; }
  .pro-query-export:disabled { opacity: 0.4; cursor: not-allowed; }

</style>
