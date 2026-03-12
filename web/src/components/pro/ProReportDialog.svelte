<script lang="ts">
  import { t } from '../../lib/i18n';

  /** Report configuration passed to the generator */
  export interface ReportConfig {
    companyName: string;
    companyLogo: string | null; // data URL
    projectAddress: string;
    engineerName: string;
    revision: string;
    sections: {
      modelData: boolean;
      results: boolean;
      verification: boolean;
      advancedAnalysis: boolean;
      storyDrift: boolean;
      diagnostics: boolean;
      quantities: boolean;
      loads: boolean;
    };
  }

  interface Props {
    open: boolean;
    hasResults: boolean;
    hasVerifications: boolean;
    hasAdvanced: boolean;
    hasDrift: boolean;
    hasDiagnostics: boolean;
    hasQuantities: boolean;
    ongenerate: (config: ReportConfig) => void;
    onclose: () => void;
  }

  let { open, hasResults, hasVerifications, hasAdvanced, hasDrift, hasDiagnostics, hasQuantities, ongenerate, onclose }: Props = $props();

  // ─── Persistent state (localStorage) ─────────────────────
  const STORAGE_KEY = 'dedaliano-report-config';

  function loadSaved(): Partial<ReportConfig> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function save(cfg: Partial<ReportConfig>): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
  }

  const saved = loadSaved();

  let companyName = $state(saved.companyName ?? '');
  let companyLogo = $state<string | null>(saved.companyLogo ?? null);
  let projectAddress = $state(saved.projectAddress ?? '');
  let engineerName = $state(saved.engineerName ?? '');
  let revision = $state(saved.revision ?? '1');

  let secModelData = $state(true);
  let secResults = $state(true);
  let secVerification = $state(true);
  let secAdvanced = $state(true);
  let secDrift = $state(true);
  let secDiagnostics = $state(true);
  let secQuantities = $state(true);
  let secLoads = $state(true);

  function handleLogoUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 500_000) { alert(t('report.logoTooLarge')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      companyLogo = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    companyLogo = null;
  }

  function handleGenerate() {
    // Persist company info for next time
    save({ companyName, companyLogo, projectAddress, engineerName, revision });

    ongenerate({
      companyName,
      companyLogo,
      projectAddress,
      engineerName,
      revision,
      sections: {
        modelData: secModelData,
        results: secResults,
        verification: secVerification,
        advancedAnalysis: secAdvanced,
        storyDrift: secDrift,
        diagnostics: secDiagnostics,
        quantities: secQuantities,
        loads: secLoads,
      },
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

{#if open}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="rpt-overlay" onkeydown={handleKeydown} onclick={onclose} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="rpt-dialog" onclick={(e) => e.stopPropagation()}>
    <div class="rpt-header">
      <h2>{t('report.configTitle')}</h2>
      <button class="rpt-close" onclick={onclose}>&times;</button>
    </div>

    <div class="rpt-body">
      <!-- Company & project info -->
      <fieldset class="rpt-fieldset">
        <legend>{t('report.projectInfo')}</legend>

        <div class="rpt-logo-row">
          <label class="rpt-label">{t('report.companyLogo')}</label>
          <div class="rpt-logo-area">
            {#if companyLogo}
              <img src={companyLogo} alt="Logo" class="rpt-logo-preview" />
              <button class="rpt-btn-sm rpt-btn-danger" onclick={removeLogo}>{t('report.removeLogo')}</button>
            {:else}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" onchange={handleLogoUpload} class="rpt-file-input" />
            {/if}
          </div>
        </div>

        <div class="rpt-field">
          <label class="rpt-label">{t('report.companyName')}</label>
          <input type="text" bind:value={companyName} placeholder={t('report.companyNamePh')} class="rpt-input" />
        </div>

        <div class="rpt-field">
          <label class="rpt-label">{t('report.engineerName')}</label>
          <input type="text" bind:value={engineerName} placeholder={t('report.engineerNamePh')} class="rpt-input" />
        </div>

        <div class="rpt-field">
          <label class="rpt-label">{t('report.projectAddress')}</label>
          <input type="text" bind:value={projectAddress} placeholder={t('report.projectAddressPh')} class="rpt-input" />
        </div>

        <div class="rpt-field">
          <label class="rpt-label">{t('report.revision')}</label>
          <input type="text" bind:value={revision} placeholder="1" class="rpt-input rpt-input-sm" />
        </div>
      </fieldset>

      <!-- Sections to include -->
      <fieldset class="rpt-fieldset">
        <legend>{t('report.includeSections')}</legend>
        <div class="rpt-checks">
          <label class="rpt-check"><input type="checkbox" bind:checked={secModelData} /> {t('report.secModelData')}</label>
          <label class="rpt-check"><input type="checkbox" bind:checked={secLoads} /> {t('report.secLoads')}</label>
          <label class="rpt-check"><input type="checkbox" bind:checked={secResults} disabled={!hasResults} /> {t('report.secResults')} {#if !hasResults}<span class="rpt-hint">({t('report.noData')})</span>{/if}</label>
          <label class="rpt-check"><input type="checkbox" bind:checked={secVerification} disabled={!hasVerifications} /> {t('report.secVerification')} {#if !hasVerifications}<span class="rpt-hint">({t('report.noData')})</span>{/if}</label>
          <label class="rpt-check"><input type="checkbox" bind:checked={secAdvanced} disabled={!hasAdvanced} /> {t('report.secAdvanced')} {#if !hasAdvanced}<span class="rpt-hint">({t('report.noData')})</span>{/if}</label>
          <label class="rpt-check"><input type="checkbox" bind:checked={secDrift} disabled={!hasDrift} /> {t('report.secDrift')} {#if !hasDrift}<span class="rpt-hint">({t('report.noData')})</span>{/if}</label>
          <label class="rpt-check"><input type="checkbox" bind:checked={secQuantities} disabled={!hasQuantities} /> {t('report.secQuantities')} {#if !hasQuantities}<span class="rpt-hint">({t('report.noData')})</span>{/if}</label>
          <label class="rpt-check"><input type="checkbox" bind:checked={secDiagnostics} disabled={!hasDiagnostics} /> {t('report.secDiagnostics')} {#if !hasDiagnostics}<span class="rpt-hint">({t('report.noData')})</span>{/if}</label>
        </div>
      </fieldset>
    </div>

    <div class="rpt-footer">
      <button class="rpt-btn rpt-btn-secondary" onclick={onclose}>{t('report.cancel')}</button>
      <button class="rpt-btn rpt-btn-primary" onclick={handleGenerate}>{t('report.generate')}</button>
    </div>
  </div>
</div>
{/if}

<style>
  .rpt-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
  }
  .rpt-dialog {
    background: #1a1a2e; color: #e0e0e0; border-radius: 10px;
    width: 480px; max-height: 85vh; display: flex; flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); border: 1px solid #2a2a4a;
  }
  .rpt-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid #2a2a4a;
  }
  .rpt-header h2 { margin: 0; font-size: 16px; color: #fff; }
  .rpt-close { background: none; border: none; color: #888; font-size: 22px; cursor: pointer; padding: 0 4px; }
  .rpt-close:hover { color: #fff; }
  .rpt-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
  .rpt-fieldset {
    border: 1px solid #2a2a4a; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px;
  }
  .rpt-fieldset legend { color: #4ecdc4; font-size: 12px; font-weight: 600; padding: 0 6px; text-transform: uppercase; }
  .rpt-field { margin-bottom: 10px; }
  .rpt-label { display: block; font-size: 11px; color: #aaa; margin-bottom: 3px; }
  .rpt-input {
    width: 100%; padding: 6px 8px; background: #12122a; border: 1px solid #333; border-radius: 4px;
    color: #e0e0e0; font-size: 12px;
  }
  .rpt-input:focus { border-color: #4ecdc4; outline: none; }
  .rpt-input-sm { width: 80px; }
  .rpt-logo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .rpt-logo-area { display: flex; align-items: center; gap: 8px; }
  .rpt-logo-preview { max-height: 40px; max-width: 120px; border-radius: 4px; border: 1px solid #333; }
  .rpt-file-input { font-size: 11px; color: #aaa; }
  .rpt-checks { display: flex; flex-direction: column; gap: 6px; }
  .rpt-check { font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  .rpt-check input[type="checkbox"] { accent-color: #4ecdc4; }
  .rpt-check input:disabled { opacity: 0.4; }
  .rpt-hint { color: #666; font-size: 10px; }
  .rpt-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 20px; border-top: 1px solid #2a2a4a;
  }
  .rpt-btn {
    padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 600;
    cursor: pointer; border: none; transition: background 0.15s;
  }
  .rpt-btn-primary { background: #4ecdc4; color: #111; }
  .rpt-btn-primary:hover { background: #3dbdb4; }
  .rpt-btn-secondary { background: #2a2a4a; color: #ccc; }
  .rpt-btn-secondary:hover { background: #3a3a5a; }
  .rpt-btn-sm { padding: 3px 8px; font-size: 10px; border-radius: 3px; cursor: pointer; border: none; }
  .rpt-btn-danger { background: #c0392b; color: #fff; }
  .rpt-btn-danger:hover { background: #e74c3c; }
</style>
