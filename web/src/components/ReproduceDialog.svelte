<script lang="ts">
  /**
   * Reproduce a report from its provenance block (`lib/actions/reproduce.ts`).
   *
   * Opened by the `stabileo-reproduce` window event, so any surface (the Básico project toolbar,
   * PRO's file actions) can offer it without owning the dialog.
   */
  import { onMount } from 'svelte';
  import { parseProvenance } from '../lib/provenance/result-provenance';
  import { reproduceFrom, type ReproduceOutcome } from '../lib/actions/reproduce';
  import { captureFocus, cycleTabWithin } from '../lib/utils/dialog-focus';
  import { t, tp } from '../lib/i18n';
  import { baseSolverInputJson } from '../lib/store/result-provenance';
  import { downloadText } from '../lib/store/file';
  import { accountGate } from '../lib/store/account-gate.svelte';

  /** The base solve's engine input, for `cargo run --release --example reproduce`. */
  function downloadInput() {
    const b = baseSolverInputJson();
    if (b) downloadText(b.json, `solver-input-${b.dim}.json`, 'application/json');
  }

  let open = $state(false);
  let text = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let outcome = $state<ReproduceOutcome | null>(null);
  let dialog = $state<HTMLDivElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  onMount(() => {
    const show = () => { open = true; outcome = null; error = null; };
    window.addEventListener('stabileo-reproduce', show);
    return () => window.removeEventListener('stabileo-reproduce', show);
  });

  $effect(() => {
    if (!open || !dialog) return;
    return captureFocus(dialog);
  });

  function close() { open = false; }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (cycleTabWithin(dialog, e)) e.preventDefault();
  }

  async function loadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) text = await f.text();
    input.value = '';
  }

  async function run() {
    error = null;
    outcome = null;
    const claimed = parseProvenance(text);
    if (!claimed) { error = t('provenance.reproduce.invalid'); return; }
    busy = true;
    try { outcome = await reproduceFrom(claimed); } finally { busy = false; }
  }

  const field = (v: string) => t(`provenance.reproduce.field.${v}`);
  const FIELD_LABEL: Record<string, string> = {
    modelHash: t('provenance.model'), settingsHash: t('provenance.settings'),
    baseResultsHash: t('provenance.results'), resultsHash: t('provenance.scope'),
    engineInputSha256: t('provenance.engineSolve'), engineResultsSha256: t('provenance.engineSolve'),
  };
</script>

{#if open}
  <div class="rp-overlay">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="rp" role="dialog" aria-modal="true" aria-labelledby="rp-title" tabindex="-1" bind:this={dialog} onkeydown={onKey} data-testid="reproduce-dialog">
      <h3 class="rp-title" id="rp-title">{t('provenance.reproduce.title')}</h3>
      <p class="rp-intro">{t('provenance.reproduce.intro')}</p>
      <textarea class="rp-text" bind:value={text} rows="6" spellcheck="false" data-testid="reproduce-input"></textarea>
      <input bind:this={fileInput} type="file" accept=".html,.htm,.json,.txt" style="display:none" onchange={loadFile} />
      {#if error}<p class="rp-error" data-testid="reproduce-error">{error}</p>{/if}
      {#if outcome}
        {#if outcome.ok}
          {@const v = outcome.verdict}
          <div class="rp-verdict" class:ok={v.reproduced} data-testid="reproduce-verdict" data-reproduced={v.reproduced} data-status={v.status}>
            <strong>{v.status === 'reproduced' ? t('provenance.reproduce.match') : v.status === 'incomplete' ? t('provenance.reproduce.incomplete') : t('provenance.reproduce.mismatch')}</strong>
            <ul data-testid="reproduce-hashes">
              {#each v.hashes as h (h.field)}
                <li data-field={h.field} data-verdict={h.verdict}>{FIELD_LABEL[h.field] ?? h.field}: {field(h.verdict)}</li>
              {/each}
            </ul>
            {#if v.model === 'differs'}<p>{t('provenance.reproduce.modelDiffers')}</p>{/if}
            {#if !v.sameBuild}<p>{tp('provenance.reproduce.buildDiffers', { fields: v.buildDifferences.join(', ') })}</p>{/if}
          </div>
        {:else}
          <p class="rp-error" data-testid="reproduce-error">{tp('provenance.reproduce.solveFailed', { error: outcome.error })}</p>
        {/if}
      {/if}
      <div class="rp-actions">
        <button class="rp-btn" onclick={() => fileInput?.click()}>{t('provenance.reproduce.load')}</button>
        <button class="rp-btn" onclick={() => accountGate.guard('export', downloadInput)} disabled={!outcome?.ok} data-testid="reproduce-download-input">{t('provenance.reproduce.download')}</button>
        <button class="rp-btn" onclick={close} data-testid="reproduce-close">{t('provenance.reproduce.close')}</button>
        <button class="rp-btn rp-primary" disabled={busy || !text.trim()} onclick={run} data-testid="reproduce-run">{t('provenance.reproduce.run')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .rp-overlay { position: fixed; inset: 0; background: color-mix(in srgb, var(--st-bg) 72%, transparent); display: flex; align-items: center; justify-content: center; z-index: 220; }
  .rp { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow-y: auto; padding: 18px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); box-shadow: 0 8px 32px rgb(0 0 0 / 0.35); outline: none; }
  .rp-title { margin: 0 0 6px; font-size: 0.95rem; font-weight: 600; color: var(--st-text); }
  .rp-intro { margin: 0 0 10px; font-size: 0.72rem; line-height: 1.5; color: var(--st-text-3); }
  .rp-text { width: 100%; box-sizing: border-box; font-family: monospace; font-size: 0.7rem; background: var(--st-bg); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); }
  .rp-error { color: var(--st-danger, #c0392b); font-size: 0.72rem; }
  .rp-verdict { margin: 10px 0; padding: 8px 10px; font-size: 0.72rem; border: 1px solid var(--st-danger, #c0392b); border-radius: var(--st-radius); color: var(--st-text); }
  .rp-verdict.ok { border-color: var(--st-ok, #2e8b57); }
  .rp-verdict ul { margin: 6px 0 0; padding-left: 18px; }
  .rp-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; flex-wrap: wrap; }
  .rp-btn { padding: 6px 12px; font-size: 0.75rem; border-radius: var(--st-radius); border: 1px solid var(--st-hair-strong); background: var(--st-surface-2, var(--st-surface)); color: var(--st-text); cursor: pointer; }
  .rp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .rp-primary { background: var(--st-accent, #4a90d9); border-color: var(--st-accent, #4a90d9); color: #fff; }
</style>
