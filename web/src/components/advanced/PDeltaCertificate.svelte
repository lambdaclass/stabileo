<script lang="ts">
  /**
   * The certified P-Delta result (docs/verification/CERTIFY.md): a Newton–Kantorovich bound on
   * the distance from the computed displacements to the exact second-order equilibrium, and
   * whether that equilibrium is certified stable. In the background, once the result is shown.
   */
  import { t } from '../../lib/i18n';
  import { createBackgroundCertificate } from '../../lib/store/analysis-certificate.svelte';
  import type { CertificateAnswer, PDeltaCertificate } from '../../lib/engine/certificate-types';
  import { formatBound } from '../../lib/utils/certificate-format';
  import CertLine from './CertLine.svelte';

  let { result }: { result: object | null | undefined } = $props();

  const cert = createBackgroundCertificate<CertificateAnswer<PDeltaCertificate>>();
  $effect(() => cert.track(result));
  const c = $derived(cert.state.status === 'done' ? cert.state.answer.certificate : null);
</script>

{#if cert.state.status === 'pending'}
  <CertLine kind="pending" text={t('certificate.pending')} testid="pdelta-certificate" />
{:else if cert.state.status === 'failed'}
  <CertLine kind="no" text={t('certificate.notCertified').replace('{reason}', cert.state.reason)} tooltip={t('certificate.pdeltaTooltip')} testid="pdelta-certificate" />
{:else if c && c.status !== 'certified'}
  <CertLine kind="no" text={t('certificate.notCertified').replace('{reason}', c.reason)} tooltip={t('certificate.pdeltaTooltip')} testid="pdelta-certificate" />
{:else if c}
  <CertLine
    kind={c.stabilityMargin !== null ? 'ok' : 'no'}
    text={`${t('certificate.certified').replace('{abs}', formatBound(c.absBound)).replace('{rel}', formatBound(c.relBound))} · ${c.stabilityMargin !== null ? t('certificate.pdeltaStable') : t('certificate.pdeltaStabilityUnknown')}`}
    tooltip={t('certificate.pdeltaTooltip')}
    testid="pdelta-certificate"
  />
{/if}
