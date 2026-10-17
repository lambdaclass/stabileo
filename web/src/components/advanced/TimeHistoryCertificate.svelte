<script lang="ts">
  /**
   * The certified time-history integration (docs/verification/CERTIFY.md): whether the scheme is
   * certified stable for this model and step, and the largest residual of the discrete equations
   * along the computed trajectory. Not a bound on the error against the continuous motion. In
   * the background, once the result is shown.
   */
  import { t } from '../../lib/i18n';
  import { createBackgroundCertificate } from '../../lib/store/analysis-certificate.svelte';
  import type { CertificateAnswer, DynamicsCertificate } from '../../lib/engine/certificate-types';
  import { formatBound, formatDirected } from '../../lib/utils/certificate-format';
  import CertLine from './CertLine.svelte';

  let { result }: { result: object | null | undefined } = $props();

  const cert = createBackgroundCertificate<CertificateAnswer<DynamicsCertificate>>();
  $effect(() => cert.track(result));
  const c = $derived(cert.state.status === 'done' ? cert.state.answer.certificate : null);
  const text = $derived.by(() => {
    if (!c) return '';
    const stability = c.stabilityCertified
      ? (c.dtCriticalLower !== null
        ? t('certificate.thStableUpTo').replace('{dt}', formatDirected(c.dtCriticalLower, 'down', 4))
        : t('certificate.thStable'))
      : t('certificate.thNotStable').replace('{reason}', c.stabilityReason ?? '—');
    const residual = c.residual
      ? t('certificate.thResidual').replace('{r}', formatBound(c.residual.maxRelEquation))
      : t('certificate.thNoResidual').replace('{reason}', c.residualReason ?? '—');
    return `${stability} · ${residual}`;
  });
</script>

{#if cert.state.status === 'pending'}
  <CertLine kind="pending" text={t('certificate.pending')} testid="th-certificate" />
{:else if cert.state.status === 'failed'}
  <CertLine kind="no" text={t('certificate.notCertified').replace('{reason}', cert.state.reason)} tooltip={t('certificate.thTooltip')} testid="th-certificate" />
{:else if c}
  <CertLine kind={c.stabilityCertified && c.residual ? 'ok' : 'no'} {text} tooltip={t('certificate.thTooltip')} testid="th-certificate" />
{/if}
