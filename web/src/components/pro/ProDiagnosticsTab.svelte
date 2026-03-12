<script lang="ts">
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import type { SolverDiagnostic } from '../../lib/engine/types';
  import { checkModel } from '../../lib/engine/model-diagnostics';

  type SeverityFilter = 'all' | 'error' | 'warning' | 'info';

  let severityFilter = $state<SeverityFilter>('all');
  let modelDiags = $state<SolverDiagnostic[]>([]);

  const is3D = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');

  // Auto-run model check reactively when model changes
  const autoModelDiags = $derived.by(() => {
    // Touch reactive dependencies so this re-runs on model changes
    const _n = modelStore.nodes.size;
    const _e = modelStore.elements.size;
    const _s = modelStore.supports.size;
    const _l = modelStore.loads.length;
    const _m = modelStore.materials.size;
    const _sec = modelStore.sections.size;
    const _lc = modelStore.model.loadCases.length;
    const _p = modelStore.model.plates?.size ?? 0;
    const _q = modelStore.model.quads?.size ?? 0;
    // Avoid unused var warnings
    void(_n + _e + _s + _l + _m + _sec + _lc + _p + _q);

    return checkModel({
      nodes: modelStore.nodes,
      elements: modelStore.elements,
      materials: modelStore.materials,
      sections: modelStore.sections,
      supports: modelStore.supports,
      loads: modelStore.loads as any,
      loadCases: modelStore.model.loadCases,
      plates: modelStore.model.plates,
      quads: modelStore.model.quads,
    });
  });

  // Merge: model checks + general diagnostics + solver diagnostics
  const allDiagnostics = $derived.by(() => {
    const general = is3D ? resultsStore.diagnostics3D : resultsStore.diagnostics;
    const solver = is3D ? resultsStore.solverDiagnostics3D : resultsStore.solverDiagnostics;
    const merged = [...autoModelDiags];
    // Add post-solve diagnostics, deduplicating
    for (const sd of [...general, ...solver]) {
      const isDupe = merged.some(
        d => d.code === sd.code && d.message === sd.message &&
             JSON.stringify(d.elementIds) === JSON.stringify(sd.elementIds) &&
             JSON.stringify(d.nodeIds) === JSON.stringify(sd.nodeIds)
      );
      if (!isDupe) merged.push(sd);
    }
    return merged;
  });

  // Apply severity filter
  const diagnostics = $derived(
    severityFilter === 'all'
      ? allDiagnostics
      : allDiagnostics.filter(d => d.severity === severityFilter)
  );

  const errors = $derived(allDiagnostics.filter(d => d.severity === 'error'));
  const warnings = $derived(allDiagnostics.filter(d => d.severity === 'warning'));
  const infos = $derived(allDiagnostics.filter(d => d.severity === 'info'));
  const hasAny = $derived(allDiagnostics.length > 0);

  const modelCount = $derived(autoModelDiags.length);
  const solverCount = $derived(allDiagnostics.length - autoModelDiags.length);

  function severityIcon(s: SolverDiagnostic['severity']): string {
    if (s === 'error') return '\u2717';
    if (s === 'warning') return '\u26A0';
    return '\u2139';
  }

  function severityClass(s: SolverDiagnostic['severity']): string {
    if (s === 'error') return 'sev-error';
    if (s === 'warning') return 'sev-warning';
    return 'sev-info';
  }

  function sourceLabel(s: SolverDiagnostic['source']): string {
    return t(`diag.source.${s}`);
  }

  function codeTooltip(code: string): string {
    const key = `diag.tooltip.${code}`;
    const translated = t(key);
    return translated !== key ? translated : '';
  }

  function handleClick(diag: SolverDiagnostic) {
    if (diag.elementIds && diag.elementIds.length > 0) {
      uiStore.selectedElements = new Set(diag.elementIds);
      uiStore.selectedNodes = new Set();
      window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
    } else if (diag.nodeIds && diag.nodeIds.length > 0) {
      uiStore.selectedNodes = new Set(diag.nodeIds);
      uiStore.selectedElements = new Set();
      window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
    }
  }

  function formatDetails(details: Record<string, unknown>): string {
    return Object.entries(details)
      .map(([k, v]) => `${k}: ${typeof v === 'number' ? (v as number).toFixed(3) : v}`)
      .join(' | ');
  }
</script>

<div class="diag-panel" data-tour="diagnostics-panel">
  <!-- Action bar -->
  <div class="diag-action-bar">
    <span class="diag-auto-label">
      {t('diag.modelChecks')}: {modelCount}
      {#if solverCount > 0}
        &nbsp;|&nbsp;{t('diag.solverChecks')}: {solverCount}
      {/if}
    </span>
  </div>

  {#if !hasAny}
    <div class="diag-empty">
      <span class="diag-check">&#10003;</span>
      <div>{t('diag.noIssues')}</div>
    </div>
  {:else}
    <!-- Summary bar -->
    <div class="diag-summary">
      {#if errors.length > 0}
        <button
          class="diag-badge sev-error"
          class:active={severityFilter === 'error'}
          onclick={() => severityFilter = severityFilter === 'error' ? 'all' : 'error'}
        >
          {errors.length} {t('diag.errors')}
        </button>
      {/if}
      {#if warnings.length > 0}
        <button
          class="diag-badge sev-warning"
          class:active={severityFilter === 'warning'}
          onclick={() => severityFilter = severityFilter === 'warning' ? 'all' : 'warning'}
        >
          {warnings.length} {t('diag.warnings')}
        </button>
      {/if}
      {#if infos.length > 0}
        <button
          class="diag-badge sev-info"
          class:active={severityFilter === 'info'}
          onclick={() => severityFilter = severityFilter === 'info' ? 'all' : 'info'}
        >
          {infos.length} {t('diag.info')}
        </button>
      {/if}
      {#if severityFilter !== 'all'}
        <button
          class="diag-badge sev-all"
          onclick={() => severityFilter = 'all'}
        >
          {t('diag.showAll')}
        </button>
      {/if}
    </div>

    <!-- Diagnostic list -->
    <div class="diag-list">
      {#each diagnostics as diag}
        {@const tooltip = codeTooltip(diag.code)}
        <button
          class="diag-item {severityClass(diag.severity)}"
          onclick={() => handleClick(diag)}
          title={tooltip || undefined}
          data-tour="diagnostic-item"
        >
          <span class="diag-icon {severityClass(diag.severity)}">{severityIcon(diag.severity)}</span>
          <span class="diag-source">{sourceLabel(diag.source)}</span>
          <div class="diag-content">
            <span class="diag-msg">{t(diag.message) !== diag.message ? t(diag.message) : diag.message}</span>
            {#if tooltip}
              <span class="diag-tooltip-text">{tooltip}</span>
            {/if}
          </div>
          {#if diag.elementIds && diag.elementIds.length > 0}
            <span class="diag-refs">{t('diag.elements')}: {diag.elementIds.join(', ')}</span>
          {/if}
          {#if diag.nodeIds && diag.nodeIds.length > 0}
            <span class="diag-refs">{t('diag.nodes')}: {diag.nodeIds.join(', ')}</span>
          {/if}
          {#if diag.details}
            <span class="diag-details">{formatDetails(diag.details)}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .diag-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }

  .diag-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid #1a3050;
    flex-shrink: 0;
  }

  .diag-auto-label {
    font-size: 0.68rem;
    color: #888;
  }

  .diag-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px 10px;
    color: #4ecdc4;
    font-size: 0.8rem;
  }

  .diag-check {
    font-size: 2rem;
    color: #4ecdc4;
  }

  .diag-summary {
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid #1a3050;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .diag-badge {
    padding: 4px 12px;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid transparent;
    cursor: pointer;
    transition: border-color 0.15s, opacity 0.15s;
  }

  .diag-badge:hover {
    opacity: 0.85;
  }

  .diag-badge.active {
    border-color: currentColor;
  }

  .diag-badge.sev-error { background: rgba(233, 69, 96, 0.2); color: #e94560; }
  .diag-badge.sev-warning { background: rgba(240, 165, 0, 0.2); color: #f0a500; }
  .diag-badge.sev-info { background: rgba(78, 205, 196, 0.2); color: #4ecdc4; }
  .diag-badge.sev-all { background: rgba(255, 255, 255, 0.08); color: #888; }

  .diag-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .diag-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: #ccc;
    font-size: 0.75rem;
    border-bottom: 1px solid #0f2030;
    width: 100%;
  }

  .diag-item:hover {
    background: rgba(78, 205, 196, 0.05);
  }

  .diag-icon {
    font-size: 0.85rem;
    flex-shrink: 0;
    width: 18px;
    text-align: center;
  }

  .diag-icon.sev-error { color: #e94560; }
  .diag-icon.sev-warning { color: #f0a500; }
  .diag-icon.sev-info { color: #4ecdc4; }

  .diag-source {
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.05);
    color: #888;
    flex-shrink: 0;
  }

  .diag-content {
    flex: 1;
    min-width: 100px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .diag-msg {
    /* inherits from parent */
  }

  .diag-tooltip-text {
    font-size: 0.65rem;
    color: #777;
    font-style: italic;
  }

  .diag-refs {
    font-family: monospace;
    font-size: 0.68rem;
    color: #666;
  }

  .diag-details {
    width: 100%;
    font-family: monospace;
    font-size: 0.65rem;
    color: #555;
    padding-left: 26px;
  }
</style>
