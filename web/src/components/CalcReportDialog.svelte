<script lang="ts">
  import { modelStore, resultsStore, uiStore } from '../lib/store';
  import { openCalcReport, type CalcReportData, type CalcReportConfig } from '../lib/engine/calc-report';
  import { t } from '../lib/i18n';

  let { open = $bindable(false) }: { open: boolean } = $props();

  let projectName = $state(modelStore.model.name || 'Structural Analysis');
  let engineerName = $state('');
  let companyName = $state('');
  let notes = $state('');

  function generateReport() {
    const is3D = uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro';
    const config: CalcReportConfig = {
      projectName,
      engineerName,
      companyName,
      date: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
      notes,
    };

    // Extract load descriptions from model
    const loads = modelStore.loads.map((l, i) => {
      const d = l.data as any;
      let description = '';
      let caseLabel = modelStore.getLoadCaseName(d.caseId ?? 1) || undefined;
      if (l.type === 'nodal' || l.type === 'nodal3d') {
        const parts: string[] = [];
        if (d.fx) parts.push(`Fx=${d.fx} kN`);
        if (d.fy) parts.push(`Fy=${d.fy} kN`);
        if (d.fz) parts.push(`Fz=${d.fz} kN`);
        if (d.my || d.mz) parts.push(`M=${d.my ?? d.mz} kN·m`);
        description = `Node ${d.nodeId}: ${parts.join(', ') || 'zero'}`;
      } else if (l.type === 'distributed' || l.type === 'distributed3d') {
        const qI = d.qI ?? d.qZI ?? d.qYI ?? 0;
        const qJ = d.qJ ?? d.qZJ ?? d.qYJ ?? 0;
        description = `Elem ${d.elementId}: q=${qI}→${qJ} kN/m`;
      } else if (l.type === 'pointOnElement') {
        description = `Elem ${d.elementId}: P=${d.p} kN at ${d.a} m`;
      } else if (l.type === 'thermal') {
        description = `Elem ${d.elementId}: ΔT=${d.dtUniform}°C, ΔTg=${d.dtGradient}°C`;
      } else {
        description = `${l.type} on ${d.elementId ?? d.nodeId ?? '?'}`;
      }
      return { type: l.type, description, caseLabel };
    });

    // Build combination info
    const combinations = modelStore.model.combinations.map(c => ({
      id: c.id,
      name: c.name,
      factors: c.factors.map(f => ({
        caseName: modelStore.getLoadCaseName(f.caseId) || `Case ${f.caseId}`,
        factor: f.factor,
      })),
    }));

    const data: CalcReportData = {
      config,
      is3D,
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
    <div class="actions">
      <button class="btn-secondary" onclick={() => open = false}>{t('calcReport.cancel')}</button>
      <button class="btn-primary" onclick={generateReport}>{t('calcReport.generate')}</button>
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
  .btn-primary:hover { background: #2a6ab0; }
</style>
