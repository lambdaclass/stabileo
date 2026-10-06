<script lang="ts">
  import { modelStore, resultsStore, uiStore, verificationStore } from '../lib/store';
  import { openCalcReport, type CalcReportData, type CalcReportConfig, type ResultProvenance, type AnalysisModeLabel } from '../lib/engine/calc-report';
  import { loadComponentsText, distributedText, pointOnElementText } from '../lib/engine/calc-report-loads';
  import { t, tp, i18n } from '../lib/i18n';

  let { open = $bindable(false) }: { open: boolean } = $props();

  let projectName = $state(modelStore.model.name || t('calcReport.defaultProject'));
  let engineerName = $state('');
  let companyName = $state('');
  let notes = $state('');

  // The dialog component stays mounted for the app's lifetime, so the $state
  // initializer above only sees the startup model. Re-seed the project name
  // from the current model each time the dialog opens (it remains editable).
  $effect(() => {
    if (open) projectName = modelStore.model.name || t('calcReport.defaultProject');
  });

  const is3D = $derived(uiStore.is3DWorkspace);
  const hasResults = $derived(is3D ? resultsStore.results3D !== null : resultsStore.results !== null);
  const modeLabel = $derived<AnalysisModeLabel>(uiStore.analysisMode === 'pro' ? 'PRO' : uiStore.is3DWorkspace ? '3D' : '2D');

  function deriveProvenance(): ResultProvenance {
    const view = resultsStore.activeView;
    if (view === 'envelope') {
      return { kind: 'envelope' };
    }
    if (view === 'combo') {
      const comboId = resultsStore.activeComboId;
      const combo = comboId !== null
        ? modelStore.model.combinations.find(c => c.id === comboId)
        : undefined;
      return { kind: 'combo', comboName: combo?.name ?? `${t('results.comboFallback')} ${comboId}` };
    }
    const caseId = resultsStore.activeCaseId;
    const caseName = caseId !== null ? modelStore.getLoadCaseName(caseId) : undefined;
    return { kind: 'single', caseName: caseName || undefined };
  }

  function generateReport() {
    if (!hasResults) return;
    const config: CalcReportConfig = {
      projectName,
      engineerName,
      companyName,
      date: new Date().toLocaleDateString(i18n.locale, { year: 'numeric', month: 'long', day: 'numeric' }),
      notes,
    };

    // Extract load descriptions from model
    const loadWords = { global: t('report.loadGlobal') };
    const loads = modelStore.loads.map((l) => {
      const d = l.data as any;
      let description = '';
      let caseLabel = modelStore.getLoadCaseName(d.caseId ?? 1) || undefined;
      // Every non-zero component, named by its axis, to four significant figures
      // (`calc-report-loads.ts`, which reads each load type by the store's own field names).
      if (l.type === 'nodal' || l.type === 'nodal3d') {
        description = `${t('table.nodeLabel')} ${d.nodeId}: ${loadComponentsText(l.type, d) || t('calcReport.loadZero')}`;
      } else if (l.type === 'distributed') {
        description = `${t('table.elemLabel')} ${d.elementId}: ${distributedText(d, loadWords)}`;
      } else if (l.type === 'distributed3d') {
        description = `${t('table.elemLabel')} ${d.elementId}: ${loadComponentsText(l.type, d) || t('calcReport.loadZero')}`;
      } else if (l.type === 'pointOnElement') {
        description = `${t('table.elemLabel')} ${d.elementId}: ${pointOnElementText(d, loadWords) || t('calcReport.loadZero')}`;
      } else if (l.type === 'thermal') {
        description = `${t('table.elemLabel')} ${d.elementId}: ΔT=${d.dtUniform}°C, ΔTg=${d.dtGradient}°C`;
      } else {
        description = tp('calcReport.loadOn', { type: l.type, target: d.elementId ?? d.nodeId ?? '?' });
      }
      return { type: l.type, description, caseLabel };
    });

    // Build combination info
    const combinations = modelStore.model.combinations.map(c => ({
      id: c.id,
      name: c.name,
      factors: c.factors.map(f => ({
        caseName: modelStore.getLoadCaseName(f.caseId) || `${t('results.caseFallback')} ${f.caseId}`,
        factor: f.factor,
      })),
    }));

    const data: CalcReportData = {
      config,
      is3D,
      analysisMode: modeLabel,
      provenance: deriveProvenance(),
      hasDesignChecks: verificationStore.hasResults,
      nodes: [...modelStore.nodes.values()],
      elements: [...modelStore.elements.values()],
      materials: [...modelStore.materials.values()],
      sections: [...modelStore.sections.values()],
      supports: [...modelStore.supports.values()],
      loads,
      loadCases: modelStore.model.loadCases ?? [],
      combinations,
      results2D: !is3D ? (resultsStore.results ?? undefined) : undefined,
      results3D: is3D ? (resultsStore.results3D ?? undefined) : undefined,
    };

    openCalcReport(data);
    open = false;
  }
</script>

{#if open}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog-overlay" onclick={() => open = false}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3>{t('calcReport.title')}</h3>
    <div class="form">
      <label>
        <span>{t('calcReport.projectName')}</span>
        <input type="text" bind:value={projectName} />
      </label>
      <label>
        <span>{t('calcReport.engineerName')}</span>
        <input type="text" bind:value={engineerName} placeholder={t('calcReport.optional')} />
      </label>
      <label>
        <span>{t('calcReport.companyName')}</span>
        <input type="text" bind:value={companyName} placeholder={t('calcReport.optional')} />
      </label>
      <label>
        <span>{t('calcReport.notes')}</span>
        <textarea bind:value={notes} rows="2" placeholder={t('calcReport.optional')}></textarea>
      </label>
    </div>
    {#if !hasResults}
      <div class="no-results-warning">{t('calcReport.noResults')}</div>
    {/if}
    <div class="actions">
      <button class="btn-secondary" onclick={() => open = false}>{t('calcReport.cancel')}</button>
      <button class="btn-primary" onclick={generateReport} disabled={!hasResults}>{t('calcReport.generate')}</button>
    </div>
  </div>
</div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dialog {
    background: #0d1b2e;
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    padding: 1.5rem;
    width: 380px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .dialog h3 {
    margin: 0;
    font-size: 1rem;
    color: #eee;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .form label span {
    font-size: 0.75rem;
    color: #888;
  }
  .form input, .form textarea {
    padding: 0.4rem 0.6rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-size: 0.85rem;
  }
  .form textarea {
    resize: vertical;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .btn-secondary {
    padding: 0.4rem 1rem;
    background: #12192e;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .btn-secondary:hover { background: #1a1a2e; color: #ccc; }
  .btn-primary {
    padding: 0.4rem 1rem;
    background: #1a4a7a;
    border: 1px solid #2a6ab0;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .btn-primary:hover:not(:disabled) { background: #2a6ab0; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .no-results-warning {
    font-size: 0.8rem;
    color: #e8a040;
    background: rgba(232, 160, 64, 0.1);
    border: 1px solid rgba(232, 160, 64, 0.3);
    border-radius: 4px;
    padding: 0.5rem 0.7rem;
    text-align: center;
  }
</style>
