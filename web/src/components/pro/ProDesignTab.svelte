<script lang="ts">
  import { modelStore, resultsStore, uiStore, verificationStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { DESIGN_CODES, type DesignCodeId } from '../../lib/engine/codes/index';
  import {
    normalizeCirsoc201, normalizeCirsoc301,
    normalizeWasmSteel, normalizeWasmRC,
    buildDesignSummary,
    type MemberDesignResult, type DesignCheckSummary, type CheckStatus,
  } from '../../lib/engine/design-check-results';
  import { autoVerifyFromResults } from '../../lib/engine/auto-verify';
  import { checkSteelMembers, checkRcMembers, checkEc2Members, checkEc3Members, checkTimberMembers, checkMasonryMembers, checkCfsMembers } from '../../lib/engine/wasm-solver';

  // ─── State ──────────────────────────────────────────────────────
  let selectedCode = $state<DesignCodeId>('cirsoc');
  let running = $state(false);
  let error = $state<string | null>(null);
  let statusFilter = $state<'all' | CheckStatus>('all');

  const results3D = $derived(resultsStore.results3D);
  const hasResults = $derived(results3D !== null);
  const summary = $derived(verificationStore.summary);
  const designResults = $derived(verificationStore.design);

  const filteredResults = $derived.by(() => {
    if (statusFilter === 'all') return designResults;
    return designResults.filter(r => r.status === statusFilter);
  });

  // ─── Section name lookup ────────────────────────────────────────
  function getSectionNames(): Map<number, string> {
    const names = new Map<number, string>();
    for (const elem of modelStore.elements.values()) {
      const sec = modelStore.sections.get(elem.sectionId);
      if (sec) names.set(elem.id, sec.name);
    }
    return names;
  }

  // ─── WASM check payload builder (mirrors ProVerificationTab) ────
  function buildCheckPayload() {
    if (!results3D) return null;
    const members: any[] = [];
    for (const ef of results3D.elementForces) {
      const elem = modelStore.elements.get(ef.elementId);
      if (!elem) continue;
      const sec = modelStore.sections.get(elem.sectionId);
      const mat = modelStore.materials.get(elem.materialId);
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!sec || !mat || !nI || !nJ) continue;
      const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      members.push({
        elementId: ef.elementId, length: L,
        section: { b: sec.b, h: sec.h, a: sec.a, iz: sec.iz, iy: sec.iy, profileName: (sec as any).profileName },
        material: { e: mat.e, fy: mat.fy, fu: (mat as any).fu, rho: mat.rho },
        forces: {
          nStart: ef.nStart, nEnd: ef.nEnd,
          vyStart: ef.vyStart, vyEnd: ef.vyEnd,
          vzStart: ef.vzStart, vzEnd: ef.vzEnd,
          mzStart: ef.mzStart, mzEnd: ef.mzEnd,
          myStart: ef.myStart, myEnd: ef.myEnd,
          mxStart: ef.mxStart, mxEnd: ef.mxEnd,
        },
      });
    }
    return { members };
  }

  // ─── Run design check ──────────────────────────────────────────
  function runDesignCheck() {
    error = null;
    if (!results3D) { error = t('pro.solveFirst'); return; }

    running = true;
    const sectionNames = getSectionNames();
    let normalized: MemberDesignResult[] = [];

    try {
      if (selectedCode === 'cirsoc') {
        // JS CIRSOC path — uses autoVerifyFromResults for RC, then steel
        const { concrete } = autoVerifyFromResults(results3D, {
          elements: modelStore.elements,
          nodes: modelStore.nodes,
          sections: modelStore.sections,
          materials: modelStore.materials,
          supports: modelStore.supports,
        });
        const rcResults = normalizeCirsoc201(concrete, sectionNames);

        // Also try CIRSOC 301 steel if available
        // (Steel verification uses different input assembly — for now, RC is the primary CIRSOC path)
        normalized = rcResults;

        // Also populate legacy store for viewport compatibility
        verificationStore.setConcrete(concrete);
      } else {
        // WASM path for all other codes
        const payload = buildCheckPayload();
        if (!payload) { error = t('pro.solveFirst'); running = false; return; }

        let codeName = '';
        let rawResult: any = null;

        switch (selectedCode) {
          case 'aci-aisc': {
            codeName = 'ACI 318 / AISC 360';
            const rcResult = checkRcMembers(payload);
            const steelResult = checkSteelMembers(payload);
            const rcNorm = rcResult?.members ? normalizeWasmRC(rcResult.members, 'aci-aisc', 'ACI 318', sectionNames) : [];
            const steelNorm = steelResult?.members ? normalizeWasmSteel(steelResult.members, 'aci-aisc', 'AISC 360', sectionNames) : [];
            normalized = [...rcNorm, ...steelNorm];
            break;
          }
          case 'eurocode': {
            codeName = 'Eurocode 2/3';
            const ec2Result = checkEc2Members(payload);
            const ec3Result = checkEc3Members(payload);
            const ec2Norm = ec2Result?.members ? normalizeWasmRC(ec2Result.members, 'eurocode', 'Eurocode 2', sectionNames) : [];
            const ec3Norm = ec3Result?.members ? normalizeWasmSteel(ec3Result.members, 'eurocode', 'Eurocode 3', sectionNames) : [];
            normalized = [...ec2Norm, ...ec3Norm];
            break;
          }
          case 'nds': {
            codeName = 'NDS (Timber)';
            rawResult = checkTimberMembers(payload);
            // Timber normalization not yet implemented — show raw count
            if (rawResult?.members) normalized = normalizeWasmRC(rawResult.members, 'nds', codeName, sectionNames);
            break;
          }
          case 'masonry': {
            codeName = 'TMS 402 (Masonry)';
            rawResult = checkMasonryMembers(payload);
            if (rawResult?.members) normalized = normalizeWasmRC(rawResult.members, 'masonry', codeName, sectionNames);
            break;
          }
          case 'cfs': {
            codeName = 'AISI S100 (CFS)';
            rawResult = checkCfsMembers(payload);
            if (rawResult?.members) normalized = normalizeWasmRC(rawResult.members, 'cfs', codeName, sectionNames);
            break;
          }
        }

        if (normalized.length === 0) {
          error = `No members checked. The ${codeName || selectedCode} check may not be available for this model.`;
          running = false;
          return;
        }
      }

      const codeInfo = DESIGN_CODES.find(c => c.id === selectedCode);
      const summaryData = buildDesignSummary(normalized, selectedCode, codeInfo?.label ?? selectedCode);
      verificationStore.setDesignResults(summaryData.results, summaryData);

      // Activate verification overlay in viewport
      resultsStore.diagramType = 'verification';
    } catch (e: any) {
      error = e.message || 'Design check failed';
    } finally {
      running = false;
    }
  }

  // ─── Formatting helpers ─────────────────────────────────────────
  function fmtRatio(r: number): string {
    if (r < 0.001) return '0.00';
    return r.toFixed(2);
  }

  function statusIcon(s: CheckStatus): string {
    return s === 'ok' ? '✓' : s === 'warn' ? '⚠' : '✗';
  }

  function statusClass(s: CheckStatus): string {
    return s === 'ok' ? 'status-ok' : s === 'warn' ? 'status-warn' : 'status-fail';
  }

  function ratioBarWidth(r: number): string {
    return Math.min(r * 100, 100) + '%';
  }

  function ratioBarColor(r: number): string {
    if (r <= 0.5) return '#22cc66';
    if (r <= 0.9) return '#88cc22';
    if (r <= 1.0) return '#ddaa00';
    if (r <= 1.1) return '#ff6600';
    return '#ee2222';
  }
</script>

<div class="design-tab">
  <!-- Summary bar -->
  <div class="summary-bar">
    <div class="summary-left">
      <select class="code-select" bind:value={selectedCode}>
        {#each DESIGN_CODES as code}
          <option value={code.id}>{code.label}</option>
        {/each}
      </select>
      <button class="run-btn" onclick={runDesignCheck} disabled={!hasResults || running}>
        {running ? 'Checking...' : 'Run Design Check'}
      </button>
    </div>
    {#if summary}
      <div class="summary-counts">
        <span class="count count-total">{summary.totalMembers} members</span>
        <span class="count count-pass">{statusIcon('ok')} {summary.pass}</span>
        <span class="count count-warn">{statusIcon('warn')} {summary.warn}</span>
        <span class="count count-fail">{statusIcon('fail')} {summary.fail}</span>
      </div>
    {/if}
  </div>

  {#if error}
    <div class="error-bar">{error}</div>
  {/if}

  {#if !hasResults}
    <div class="placeholder">Solve the model first to run design checks.</div>
  {:else if designResults.length === 0 && !error}
    <div class="placeholder">Select a design code and click "Run Design Check" to verify members.</div>
  {:else}
    <!-- Filter bar -->
    <div class="filter-bar">
      <button class:active={statusFilter === 'all'} onclick={() => statusFilter = 'all'}>All</button>
      <button class:active={statusFilter === 'fail'} onclick={() => statusFilter = 'fail'}>Fail</button>
      <button class:active={statusFilter === 'warn'} onclick={() => statusFilter = 'warn'}>Warn</button>
      <button class:active={statusFilter === 'ok'} onclick={() => statusFilter = 'ok'}>Pass</button>
    </div>

    <!-- Member table -->
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th class="col-id">Elem</th>
            <th class="col-type">Type</th>
            <th class="col-section">Section</th>
            <th class="col-check">Governing Check</th>
            <th class="col-ratio">Utilization</th>
            <th class="col-status">Status</th>
            <th class="col-combo">Combo</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredResults as r (r.elementId)}
            <tr class={statusClass(r.status)} onclick={() => { uiStore.selectMode = 'elements'; uiStore.selectElement(r.elementId, false); }} style="cursor:pointer">
              <td class="col-id">{r.elementId}</td>
              <td class="col-type">{r.elementType}</td>
              <td class="col-section">{r.sectionName}</td>
              <td class="col-check">{r.governingCheck}</td>
              <td class="col-ratio">
                <div class="ratio-cell">
                  <span class="ratio-value">{fmtRatio(r.utilization)}</span>
                  <div class="ratio-bar">
                    <div class="ratio-fill" style="width:{ratioBarWidth(r.utilization)};background:{ratioBarColor(r.utilization)}"></div>
                  </div>
                </div>
              </td>
              <td class="col-status"><span class="status-badge {statusClass(r.status)}">{statusIcon(r.status)}</span></td>
              <td class="col-combo">{r.comboName ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .design-tab { display: flex; flex-direction: column; gap: 0; height: 100%; overflow: hidden; }

  .summary-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #0a1a30; border-bottom: 1px solid #1a4a7a; flex-shrink: 0; gap: 8px; }
  .summary-left { display: flex; gap: 6px; align-items: center; }
  .code-select { padding: 4px 8px; background: #0f3460; border: 1px solid #1a4a7a; border-radius: 4px; color: #eee; font-size: 0.75rem; }
  .run-btn { padding: 4px 12px; background: #1a4a7a; border: 1px solid #2a6ab0; border-radius: 4px; color: white; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
  .run-btn:hover:not(:disabled) { background: #2a6ab0; }
  .run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .summary-counts { display: flex; gap: 10px; font-size: 0.75rem; }
  .count { font-weight: 600; }
  .count-total { color: #aaa; }
  .count-pass { color: #22cc66; }
  .count-warn { color: #ddaa00; }
  .count-fail { color: #ee2222; }

  .error-bar { padding: 6px 12px; background: #3a1020; color: #ff6666; font-size: 0.75rem; border-bottom: 1px solid #5a2030; }

  .placeholder { padding: 24px; text-align: center; color: #666; font-size: 0.8rem; }

  .filter-bar { display: flex; gap: 4px; padding: 6px 12px; background: #0d1b2e; border-bottom: 1px solid #1a3050; flex-shrink: 0; }
  .filter-bar button { padding: 2px 10px; background: transparent; border: 1px solid #334; border-radius: 3px; color: #888; font-size: 0.7rem; cursor: pointer; }
  .filter-bar button:hover { color: #ccc; border-color: #555; }
  .filter-bar button.active { background: #1a4a7a; color: white; border-color: #2a6ab0; }

  .table-scroll { flex: 1; overflow-y: auto; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
  thead { position: sticky; top: 0; z-index: 1; }
  th { background: #0f2040; color: #999; font-weight: 600; text-align: left; padding: 5px 8px; border-bottom: 2px solid #1a4a7a; white-space: nowrap; }
  td { padding: 4px 8px; border-bottom: 1px solid #1a2a40; color: #ccc; }
  tr:hover { background: rgba(26, 74, 122, 0.15); }

  .col-id { width: 50px; text-align: center; }
  .col-type { width: 60px; }
  .col-section { width: 90px; }
  .col-check { width: 120px; }
  .col-ratio { width: 130px; }
  .col-status { width: 40px; text-align: center; }
  .col-combo { width: 100px; font-size: 0.65rem; color: #888; }

  .ratio-cell { display: flex; align-items: center; gap: 6px; }
  .ratio-value { width: 32px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .ratio-bar { flex: 1; height: 6px; background: #1a2a40; border-radius: 3px; overflow: hidden; }
  .ratio-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }

  .status-badge { font-size: 0.85rem; font-weight: 700; }
  .status-ok { color: #22cc66; }
  .status-warn { color: #ddaa00; }
  .status-fail { color: #ee2222; }

  tr.status-fail { background: rgba(238, 34, 34, 0.05); }
  tr.status-warn { background: rgba(221, 170, 0, 0.03); }
</style>
