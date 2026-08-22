<script lang="ts">
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import {
    detectJoints, getJointForces, checkBoltGroup, checkFilletWeld,
    type BoltGrade, type BoltResult, type WeldResult,
    type JointInfo, type JointForces,
  } from '../../lib/engine/connection-design';

  // ─── Joint detection (reactive) ──────────────
  const joints = $derived.by(() => {
    void(modelStore.nodes.size + modelStore.elements.size + modelStore.supports.size);
    return detectJoints(modelStore.nodes, modelStore.elements as any, modelStore.supports as any);
  });

  let selectedJointId = $state<number | null>(null);

  const selectedJoint = $derived(joints.find(j => j.nodeId === selectedJointId) ?? null);

  // ─── Forces at selected joint ────────────────
  const jointForces = $derived.by((): JointForces | null => {
    if (!selectedJoint) return null;
    const r3d = resultsStore.results3D;
    if (!r3d?.elementForces) return null;
    return getJointForces(
      selectedJoint.nodeId,
      selectedJoint.elementIds,
      modelStore.elements as any,
      r3d.elementForces,
    );
  });

  // ─── Bolt config ─────────────────────────────
  let boltDia = $state(20);
  let boltGrade = $state<BoltGrade>('8.8');
  let boltCount = $state(4);
  let boltShearPlanes = $state(1);
  let boltThreadsInShear = $state(true);
  let boltPlateThickness = $state(10);
  let boltPlateFu = $state(440);
  let boltEdgeDist = $state(35);
  let boltVu = $state(0);
  let boltTu = $state(0);
  let boltResult = $state<BoltResult | null>(null);

  // ─── Weld config ─────────────────────────────
  let weldLeg = $state(6);
  let weldLength = $state(200);
  let weldFexx = $state(490);
  let weldPlateThickness = $state(10);
  let weldVu = $state(0);
  let weldResult = $state<WeldResult | null>(null);

  function selectJoint(nodeId: number) {
    selectedJointId = selectedJointId === nodeId ? null : nodeId;
    boltResult = null;
    weldResult = null;
  }

  function highlightJoint(j: JointInfo) {
    uiStore.setSelection(new Set([j.nodeId]), new Set(j.elementIds));
  }

  /** Auto-fill bolt forces from joint max shear */
  function autoFillBoltForces() {
    if (!jointForces) return;
    boltVu = Math.round(jointForces.maxV * 10) / 10;
    boltTu = 0;
  }

  /** Auto-fill weld forces from joint max shear */
  function autoFillWeldForces() {
    if (!jointForces) return;
    weldVu = Math.round(jointForces.maxV * 10) / 10;
  }

  function runBoltCheck() {
    boltResult = checkBoltGroup({
      diameter: boltDia,
      grade: boltGrade,
      count: boltCount,
      shearPlanes: boltShearPlanes,
      threadsInShear: boltThreadsInShear,
      plateThickness: boltPlateThickness,
      plateFu: boltPlateFu,
      edgeDistance: boltEdgeDist,
      Vu: boltVu,
      Tu: boltTu,
    });
  }

  function runWeldCheck() {
    weldResult = checkFilletWeld({
      legSize: weldLeg,
      length: weldLength,
      Fexx: weldFexx,
      Vu: weldVu,
      plateThickness: weldPlateThickness,
    });
  }

  function fmtN(n: number): string {
    if (Math.abs(n) < 0.01) return '0';
    return n.toFixed(1);
  }

  function statusClass(s: 'ok' | 'warn' | 'fail'): string {
    return `st-${s}`;
  }
</script>

<div class="conn-tab">
  <!-- Joint list -->
  <div class="conn-section">
    <div class="conn-section-header">
      <span class="conn-label-title">{t('conn.joints')} ({joints.length})</span>
    </div>
    {#if joints.length === 0}
      <div class="conn-empty">{t('conn.noJoints')}</div>
    {:else}
      <div class="conn-joint-list">
        {#each joints as j}
          <button
            class="conn-joint-row"
            class:active={selectedJointId === j.nodeId}
            onclick={() => { selectJoint(j.nodeId); highlightJoint(j); }}
          >
            <span class="conn-node-id">N{j.nodeId}</span>
            <span class="conn-elem-count">{j.elementCount} {t('conn.elementsShort')}</span>
            {#if j.hasSupport}<span class="conn-support-badge">{t('conn.support')}</span>{/if}
            <span class="conn-coords">({fmtN(j.x)}, {fmtN(j.y)}, {fmtN(j.z)})</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if selectedJoint}
    <!-- Forces at joint -->
    <div class="conn-section">
      <div class="conn-section-header">
        <span class="conn-label-title">{t('conn.forcesAt')} N{selectedJoint.nodeId}</span>
      </div>
      {#if jointForces}
        <div class="conn-forces-table">
          <table>
            <thead><tr><th>Elem</th><th>End</th><th>N</th><th>Vy</th><th>Vz</th><th>My</th><th>Mz</th></tr></thead>
            <tbody>
              {#each jointForces.elements as ef}
                <tr>
                  <td class="mono">E{ef.elementId}</td>
                  <td class="mono">{ef.end}</td>
                  <td class="mono">{fmtN(ef.N)}</td>
                  <td class="mono">{fmtN(ef.Vy)}</td>
                  <td class="mono">{fmtN(ef.Vz)}</td>
                  <td class="mono">{fmtN(ef.My)}</td>
                  <td class="mono">{fmtN(ef.Mz)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="conn-force-summary">
            V<sub>max</sub>={fmtN(jointForces.maxV)} kN &nbsp;|&nbsp;
            N<sub>max</sub>={fmtN(jointForces.maxN)} kN &nbsp;|&nbsp;
            M<sub>max</sub>={fmtN(jointForces.maxM)} kN·m
          </div>
        </div>
      {:else}
        <div class="conn-no-results">{t('conn.noResults')}</div>
      {/if}
    </div>

    <!-- Bolt check -->
    <details class="conn-check-details">
      <summary class="conn-check-summary">
        {t('conn.boltCheck')}
        {#if boltResult}
          <span class="conn-ratio-badge {statusClass(boltResult.status)}">{(boltResult.governingRatio * 100).toFixed(0)}%</span>
        {/if}
      </summary>
      <div class="conn-check-body">
        <div class="conn-form-grid">
          <label>∅ (mm) <input type="number" class="conn-inp" bind:value={boltDia} min={6} max={36} step={2} /></label>
          <label>{t('conn.grade')} <select class="conn-sel" bind:value={boltGrade}><option value="4.6">4.6</option><option value="5.6">5.6</option><option value="8.8">8.8</option><option value="10.9">10.9</option></select></label>
          <label>n <input type="number" class="conn-inp" bind:value={boltCount} min={1} max={50} /></label>
          <label>{t('conn.shearPlanes')} <input type="number" class="conn-inp" bind:value={boltShearPlanes} min={1} max={2} /></label>
          <label>t (mm) <input type="number" class="conn-inp" bind:value={boltPlateThickness} min={3} max={50} /></label>
          <label>Fu (MPa) <input type="number" class="conn-inp" bind:value={boltPlateFu} min={300} max={700} step={10} /></label>
          <label>Le (mm) <input type="number" class="conn-inp" bind:value={boltEdgeDist} min={15} max={100} /></label>
          <label class="conn-check-label"><input type="checkbox" bind:checked={boltThreadsInShear} /> {t('conn.threadsInShear')}</label>
        </div>
        <div class="conn-force-inputs">
          <label>Vu (kN) <input type="number" class="conn-inp" bind:value={boltVu} step={1} /></label>
          <label>Tu (kN) <input type="number" class="conn-inp" bind:value={boltTu} min={0} step={1} /></label>
          {#if jointForces}
            <button class="conn-btn-auto" onclick={autoFillBoltForces}>{t('conn.autoFill')}</button>
          {/if}
          <button class="conn-btn-verify" onclick={runBoltCheck}>{t('conn.verify')}</button>
        </div>
        {#if boltResult}
          <div class="conn-result-card {statusClass(boltResult.status)}">
            <div class="conn-result-row"><span>{t('conn.shear')}</span><span>φRn={fmtN(boltResult.phiRnShear)} kN — {(boltResult.ratioShear * 100).toFixed(0)}%</span></div>
            <div class="conn-result-row"><span>{t('conn.tension')}</span><span>φRn={fmtN(boltResult.phiRnTension)} kN — {(boltResult.ratioTension * 100).toFixed(0)}%</span></div>
            <div class="conn-result-row"><span>{t('conn.bearing')}</span><span>φRn={fmtN(boltResult.phiRnBearing)} kN — {(boltResult.ratioBearing * 100).toFixed(0)}%</span></div>
            <div class="conn-result-row"><span>{t('conn.interaction')}</span><span>{(boltResult.ratioInteraction * 100).toFixed(0)}%</span></div>
            <div class="conn-result-governing">
              {t('conn.governing')}: {(boltResult.governingRatio * 100).toFixed(0)}%
              <span class="conn-status-icon {statusClass(boltResult.status)}">
                {boltResult.status === 'ok' ? '✓' : boltResult.status === 'warn' ? '⚠' : '✗'}
              </span>
            </div>
          </div>
        {/if}
      </div>
    </details>

    <!-- Weld check -->
    <details class="conn-check-details">
      <summary class="conn-check-summary">
        {t('conn.weldCheck')}
        {#if weldResult}
          <span class="conn-ratio-badge {statusClass(weldResult.status)}">{(weldResult.ratio * 100).toFixed(0)}%</span>
        {/if}
      </summary>
      <div class="conn-check-body">
        <div class="conn-form-grid">
          <label>a (mm) <input type="number" class="conn-inp" bind:value={weldLeg} min={3} max={25} /></label>
          <label>L (mm) <input type="number" class="conn-inp" bind:value={weldLength} min={20} max={3000} /></label>
          <label>Fexx (MPa) <input type="number" class="conn-inp" bind:value={weldFexx} min={350} max={700} step={10} /></label>
          <label>t (mm) <input type="number" class="conn-inp" bind:value={weldPlateThickness} min={3} max={50} /></label>
        </div>
        <div class="conn-force-inputs">
          <label>Vu (kN) <input type="number" class="conn-inp" bind:value={weldVu} step={1} /></label>
          {#if jointForces}
            <button class="conn-btn-auto" onclick={autoFillWeldForces}>{t('conn.autoFill')}</button>
          {/if}
          <button class="conn-btn-verify" onclick={runWeldCheck}>{t('conn.verify')}</button>
        </div>
        {#if weldResult}
          <div class="conn-result-card {statusClass(weldResult.status)}">
            <div class="conn-result-row"><span>{t('conn.throat')}</span><span>te={weldResult.throatEff.toFixed(1)} mm</span></div>
            <div class="conn-result-row"><span>{t('conn.capacity')}</span><span>φRn={fmtN(weldResult.phiRn)} kN</span></div>
            <div class="conn-result-row"><span>{t('conn.sizeRange')}</span><span>{weldResult.minSize}–{weldResult.maxSize} mm {weldResult.sizeOk ? '✓' : '✗'}</span></div>
            <div class="conn-result-row"><span>L ≥ 4a</span><span>{weldResult.lengthOk ? '✓' : '✗'}</span></div>
            <div class="conn-result-governing">
              {t('conn.utilization')}: {(weldResult.ratio * 100).toFixed(0)}%
              <span class="conn-status-icon {statusClass(weldResult.status)}">
                {weldResult.status === 'ok' ? '✓' : weldResult.status === 'warn' ? '⚠' : '✗'}
              </span>
            </div>
          </div>
        {/if}
      </div>
    </details>
  {/if}
</div>

<style>
  .conn-tab { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
  .conn-section { border-bottom: 1px solid var(--st-surface-3); }
  .conn-section-header { padding: 8px 10px; }
  .conn-label-title { font-size: 0.78rem; color: var(--st-text-2); font-weight: 600; }
  .conn-empty { text-align: center; color: var(--st-text-3); font-style: italic; padding: 20px 10px; font-size: 0.78rem; }

  .conn-joint-list { max-height: 180px; overflow-y: auto; }
  .conn-joint-row {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 5px 10px; font-size: 0.72rem; color: var(--st-text-2); background: transparent;
    border: none; border-bottom: 1px solid var(--st-surface-2); cursor: pointer; text-align: left;
  }
  .conn-joint-row:hover { background: rgba(127, 212, 204, 0.05); }
  .conn-joint-row.active { background: rgba(127, 212, 204, 0.1); color: var(--st-text); }
  .conn-node-id { font-weight: 600; color: var(--st-value); min-width: 35px; }
  .conn-elem-count { color: var(--st-text-3); }
  .conn-support-badge { font-size: 0.6rem; padding: 1px 5px; background: rgba(217, 164, 65, 0.2); color: var(--st-warn); border-radius: 3px; }
  .conn-coords { color: var(--st-text-3); font-family: monospace; font-size: 0.65rem; margin-left: auto; }

  .conn-forces-table { padding: 6px 10px; }
  .conn-forces-table table { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
  .conn-forces-table th { font-size: 0.62rem; color: var(--st-text-3); text-transform: uppercase; font-weight: 600; text-align: right; padding: 3px 4px; border-bottom: 1px solid var(--st-surface-3); }
  .conn-forces-table td { padding: 3px 4px; border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .mono { font-family: monospace; text-align: right; font-size: 0.7rem; }
  .conn-force-summary { font-size: 0.68rem; color: var(--st-text-3); padding: 4px 0; font-family: monospace; }
  .conn-no-results { font-size: 0.72rem; color: var(--st-text-3); font-style: italic; padding: 10px; }

  .conn-check-details { border-bottom: 1px solid var(--st-surface-3); }
  .conn-check-summary {
    padding: 8px 10px; font-size: 0.75rem; color: var(--st-text-2); cursor: pointer;
    display: flex; align-items: center; gap: 8px;
  }
  .conn-check-summary:hover { color: var(--st-text); }
  .conn-check-body { padding: 6px 10px 10px; }

  .conn-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 6px; }
  .conn-form-grid label { font-size: 0.68rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; }
  .conn-inp {
    width: 60px; padding: 3px 5px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3);
    border-radius: 3px; color: var(--st-text); font-size: 0.72rem; font-family: monospace; text-align: right;
  }
  .conn-inp:focus { border-color: var(--st-value); outline: none; }
  .conn-sel {
    padding: 3px 5px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3);
    border-radius: 3px; color: var(--st-text); font-size: 0.72rem;
  }
  .conn-sel:focus { border-color: var(--st-text-2); outline: none; }
  .conn-check-label { font-size: 0.68rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .conn-check-label input { accent-color: var(--st-text-2); }

  .conn-force-inputs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .conn-force-inputs label { font-size: 0.68rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; }
  .conn-btn-auto {
    padding: 3px 8px; font-size: 0.65rem; color: var(--st-text-2); background: transparent;
    border: 1px solid var(--st-value); border-radius: 3px; cursor: pointer;
  }
  .conn-btn-auto:hover { background: rgba(127, 212, 204, 0.1); }
  .conn-btn-verify {
    padding: 4px 12px; font-size: 0.72rem; font-weight: 600; color: var(--st-text);
    background: var(--st-surface-3); border:  1px solid var(--st-info); border-radius: 4px; cursor: pointer;
  }
  .conn-btn-verify:hover { background: var(--st-hair-strong); }

  .conn-ratio-badge {
    font-size: 0.62rem; font-weight: 700; padding: 1px 6px; border-radius: 8px; margin-left: auto;
  }
  .conn-ratio-badge.st-ok { background: rgba(34, 204, 102, 0.2); color: var(--st-ok); }
  .conn-ratio-badge.st-warn { background: rgba(217, 164, 65, 0.2); color: var(--st-warn); }
  .conn-ratio-badge.st-fail { background: rgba(229, 72, 42, 0.2); color: var(--st-accent); }

  .conn-result-card {
    padding: 6px 8px; border-radius: 4px; font-size: 0.7rem;
    background: rgba(127, 212, 204, 0.05); border: 1px solid var(--st-surface-3);
  }
  .conn-result-card.st-fail { border-color: rgba(229, 72, 42, 0.3); background: rgba(229, 72, 42, 0.05); }
  .conn-result-card.st-warn { border-color: rgba(217, 164, 65, 0.3); background: rgba(217, 164, 65, 0.05); }
  .conn-result-row { display: flex; justify-content: space-between; padding: 2px 0; color: var(--st-text-2); }
  .conn-result-governing { display: flex; justify-content: space-between; padding: 4px 0 0; font-weight: 600; color: var(--st-text); border-top: 1px solid var(--st-surface-3); margin-top: 4px; }
  .conn-status-icon { font-size: 0.85rem; }
  .conn-status-icon.st-ok { color: var(--st-ok); }
  .conn-status-icon.st-warn { color: var(--st-warn); }
  .conn-status-icon.st-fail { color: var(--st-accent); }
</style>
