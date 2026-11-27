<script lang="ts">
  /**
   * Whether the linear static result on screen is certified (`store/certificate.svelte.ts`):
   * a rigorous bound on how far the computed displacements are from the exact solution, for the
   * base solve, a load case, a combination or the envelope. Nothing for any other analysis.
   *
   * A certified base solve can be downloaded as a certificate bundle, which the Lean checker
   * (`lake exe certcheck`) re-checks without trusting the engine.
   */
  import { t } from '../lib/i18n';
  import { uiStore } from '../lib/store';
  import { certificateStore, formatBound } from '../lib/store/certificate.svelte';
  import { downloadText } from '../lib/store/file';
  import { errorText } from '../lib/utils/error-text';

  const is3D = $derived(uiStore.is3DWorkspace);
  const shown = $derived(certificateStore.shown(is3D));
  const tooltip = $derived(t(shown.status !== 'idle' && shown.scope && shown.scope !== 'single' ? 'certificate.comboTooltip' : 'certificate.tooltip'));
  let exporting = $state(false);

  function text(c: { absBound: number; relBound: number | null }): string {
    const scope = shown.status === 'done' ? shown.scope : undefined;
    if (scope === 'envelope') return t('certificate.envelopeCertified').replace('{abs}', formatBound(c.absBound));
    if (c.relBound === null) return t('certificate.certifiedAbs').replace('{abs}', formatBound(c.absBound));
    return t('certificate.certified').replace('{abs}', formatBound(c.absBound)).replace('{rel}', formatBound(c.relBound));
  }

  /** The end-to-end line under a certified base solve (none for combinations or older builds). */
  const e2e = $derived(shown.status === 'done' && shown.certificate.status === 'certified' ? shown.endToEnd : undefined);
  function e2eText(e: NonNullable<typeof e2e>): string {
    if (e.status === 'certified') return t('certificate.e2eCertified').replace('{abs}', formatBound(e.absBound));
    if (e.status === 'failed') return t('certificate.e2eFailed').replace('{reason}', e.reason);
    if (e.status === 'notChecked') return '';
    return t('certificate.e2eNotChecked').replace('{reason}', e.reason);
  }

  async function download() {
    exporting = true;
    try {
      const bundle = await certificateStore.exportBundle(is3D);
      if (bundle) downloadText(bundle, 'stabileo-certificate.json', 'application/json');
    } catch (e) {
      uiStore.toast(t('certificate.bundleFailed').replace('{reason}', errorText(e, 'error')), 'error');
    } finally {
      exporting = false;
    }
  }
</script>

{#if shown.status === 'pending'}
  <div class="cert pending" data-testid="certificate-status">{t('certificate.pending')}</div>
{:else if shown.status === 'done'}
  {#if shown.certificate.status === 'certified'}
    <div class="cert ok" title={tooltip} data-testid="certificate-status">
      {text(shown.certificate)}
      {#if certificateStore.canExportBundle(is3D)}
        <button class="cert-dl" title={t('certificate.bundleTooltip')} disabled={exporting} onclick={download} data-testid="certificate-download">{t('certificate.download')}</button>
      {/if}
    </div>
    {#if e2e && e2eText(e2e)}
      <div class="cert" class:ok={e2e.status === 'certified'} class:no={e2e.status === 'failed'} title={t('certificate.e2eTooltip')} data-testid="certificate-e2e">
        {e2eText(e2e)}
      </div>
    {/if}
  {:else}
    <div class="cert no" title={tooltip} data-testid="certificate-status">
      {t('certificate.notCertified').replace('{reason}', shown.certificate.reason)}
    </div>
  {/if}
{/if}

<style>
  .cert { margin: 4px 0; padding: 3px 7px; border: 1px solid var(--st-hair); border-radius: 4px; font-size: 0.66rem; line-height: 1.35; color: var(--st-text-2); cursor: help; }
  .cert.ok { border-color: var(--st-ok); }
  .cert.no { border-color: var(--st-warn); }
  .cert.pending { opacity: 0.7; cursor: default; }
  .cert-dl { margin-left: 6px; padding: 0; border: none; background: none; color: var(--st-accent); font: inherit; text-decoration: underline; cursor: pointer; }
  .cert-dl:disabled { opacity: 0.5; cursor: progress; }
</style>
