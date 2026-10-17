<script lang="ts">
  /**
   * The certified response-spectrum result (docs/verification/CERTIFY.md): the base shear of the
   * exact lowest modes enclosed, and bounds on the error of every reported displacement and
   * member force. One per direction run. In the background, once the result is shown.
   */
  import { t } from '../../lib/i18n';
  import { createBackgroundCertificate } from '../../lib/store/analysis-certificate.svelte';
  import type { CertificateAnswer, SpectralCertificate } from '../../lib/engine/certificate-types';
  import { formatBound, formatEnclosure } from '../../lib/utils/certificate-format';
  import CertLine from './CertLine.svelte';

  let { result, label = '' }: { result: object | null | undefined; label?: string } = $props();

  const cert = createBackgroundCertificate<CertificateAnswer<SpectralCertificate>>();
  $effect(() => cert.track(result));
  const c = $derived(cert.state.status === 'done' ? cert.state.answer.certificate : null);
  const prefix = $derived(label ? `${label}: ` : '');
</script>

{#if cert.state.status === 'pending'}
  <CertLine kind="pending" text={`${prefix}${t('certificate.pending')}`} testid="spectral-certificate" />
{:else if cert.state.status === 'failed'}
  <CertLine kind="no" text={prefix + t('certificate.notCertified').replace('{reason}', cert.state.reason)} tooltip={t('certificate.spectralTooltip')} testid="spectral-certificate" />
{:else if c && c.status !== 'certified'}
  <CertLine kind="no" text={prefix + t('certificate.notCertified').replace('{reason}', c.reason)} tooltip={t('certificate.spectralTooltip')} testid="spectral-certificate" />
{:else if c}
  <CertLine
    kind="ok"
    text={prefix + t('certificate.spectral')
      .replace('{vb}', formatEnclosure(c.baseShear.lo, c.baseShear.hi, 5))
      .replace('{du}', formatBound(c.maxDisplacementError))
      .replace('{df}', formatBound(c.maxForceError))}
    tooltip={t('certificate.spectralTooltip')}
    testid="spectral-certificate"
  />
{/if}
