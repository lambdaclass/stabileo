<script lang="ts">
  /**
   * How the harmonic response was computed (method, modes used, the share of the static response
   * the omitted modes carry, the solver's warnings) and its certificate (docs/verification/
   * CERTIFY.md): the exact peak amplitude enclosed and a bound on every reported value's error,
   * modal truncation included. The certificate in the background, once the result is shown.
   */
  import { t } from '../../lib/i18n';
  import { createBackgroundCertificate } from '../../lib/store/analysis-certificate.svelte';
  import type { CertificateAnswer, HarmonicCertificate } from '../../lib/engine/certificate-types';
  import { formatBound, formatEnclosure } from '../../lib/utils/certificate-format';
  import CertLine from './CertLine.svelte';

  let { result }: {
    result: { method?: string; modesUsed?: number; nDof?: number; truncationRatio?: number | null; warnings?: string[] } | null | undefined;
  } = $props();

  const cert = createBackgroundCertificate<CertificateAnswer<HarmonicCertificate>>();
  $effect(() => cert.track(result));
  const c = $derived(cert.state.status === 'done' ? cert.state.answer.certificate : null);
  /** Above this share of the static response in the omitted modes, truncation is worth a word. */
  const TRUNCATION_NOTE = 0.01;
  const method = $derived.by(() => {
    if (!result?.method) return '';
    const parts = [t('certificate.harmonicMethod').replace('{method}', result.method)];
    if (result.modesUsed) parts.push(t('certificate.harmonicModes').replace('{n}', String(result.modesUsed)).replace('{dof}', String(result.nDof ?? '—')));
    if (result.truncationRatio != null) parts.push(t('certificate.harmonicTruncation').replace('{pct}', (result.truncationRatio * 100).toPrecision(2)));
    return parts.join(' · ');
  });
  const truncated = $derived((result?.truncationRatio ?? 0) > TRUNCATION_NOTE);
</script>

{#if method}
  <div class="harm-method" class:warn={truncated} data-testid="harmonic-method">{method}</div>
{/if}
{#each result?.warnings ?? [] as w (w)}
  <div class="harm-method warn" role="alert">{w}</div>
{/each}
{#if cert.state.status === 'pending'}
  <CertLine kind="pending" text={t('certificate.pending')} testid="harmonic-certificate" />
{:else if cert.state.status === 'failed'}
  <CertLine kind="no" text={t('certificate.notCertified').replace('{reason}', cert.state.reason)} tooltip={t('certificate.harmonicTooltip')} testid="harmonic-certificate" />
{:else if c && c.status !== 'certified'}
  <CertLine kind="no" text={t('certificate.notCertified').replace('{reason}', c.reason)} tooltip={t('certificate.harmonicTooltip')} testid="harmonic-certificate" />
{:else if c}
  <CertLine
    kind="ok"
    text={t('certificate.harmonic').replace('{peak}', formatEnclosure(c.peakAmplitude.lo, c.peakAmplitude.hi, 5)).replace('{err}', formatBound(c.maxReportedError))}
    tooltip={t('certificate.harmonicTooltip')}
    testid="harmonic-certificate"
  />
{/if}

<style>
  .harm-method { font-size: 0.62rem; color: var(--st-text-3); margin: 2px 0; }
  .harm-method.warn { color: var(--st-warn); }
</style>
