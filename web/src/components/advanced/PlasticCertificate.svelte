<script lang="ts">
  /**
   * The certified plastic collapse factor (docs/verification/CERTIFY.md): λc ∈ [lower, upper]
   * from the static and kinematic theorems, checked in exact arithmetic, for the rigid–plastic
   * model with bending-only yield. The λc found step by step is read against it, and a value
   * outside the enclosure is said loudly: the step-by-step analysis is then wrong. A collapse in
   * which a bar yielded axially is outside that model and is not read against it.
   */
  import { t } from '../../lib/i18n';
  import { createBackgroundCertificate } from '../../lib/store/analysis-certificate.svelte';
  import type { CertificateAnswer, PlasticCertificate } from '../../lib/engine/certificate-types';
  import { plasticReading } from '../../lib/engine/certificate-read';
  import { formatEnclosure } from '../../lib/utils/certificate-format';
  import CertLine from './CertLine.svelte';

  let { result }: {
    result: { collapseFactor: number; isMechanism: boolean; hinges: Array<{ kind?: string }> } | null | undefined;
  } = $props();

  const axial = $derived(!!result?.hinges.some((h) => h.kind === 'axial'));
  const cert = createBackgroundCertificate<CertificateAnswer<PlasticCertificate>>();
  $effect(() => cert.track(axial ? null : result));
  const c = $derived(cert.state.status === 'done' ? cert.state.answer.certificate : null);
  const reading = $derived(c && result?.isMechanism ? plasticReading(c, result.collapseFactor) : null);
  const range = $derived(c ? formatEnclosure(c.lambdaLower, c.lambdaUpper, 6) : '');
</script>

{#if result && axial}
  <CertLine kind="no" text={t('certificate.plasticAxial')} tooltip={t('certificate.plasticTooltip')} testid="plastic-certificate" />
{:else if cert.state.status === 'pending'}
  <CertLine kind="pending" text={t('certificate.pending')} testid="plastic-certificate" />
{:else if cert.state.status === 'failed'}
  <CertLine kind="no" text={t('certificate.notCertified').replace('{reason}', cert.state.reason)} tooltip={t('certificate.plasticTooltip')} testid="plastic-certificate" />
{:else if c && c.lambdaLower === null && c.lambdaUpper === null}
  <CertLine kind="no" text={t('certificate.notCertified').replace('{reason}', c.reason ?? '—')} tooltip={t('certificate.plasticTooltip')} testid="plastic-certificate" />
{:else if c && result}
  {#if reading && reading.within === false}
    <CertLine
      kind="alarm"
      text={t('certificate.plasticOutside').replace('{lambda}', result.collapseFactor.toFixed(4)).replace('{range}', range).replace('{pct}', (reading.deviation * 100).toPrecision(2))}
      tooltip={t('certificate.plasticTooltip')}
      testid="plastic-certificate"
    />
  {:else}
    <CertLine
      kind={c.certified ? 'ok' : 'no'}
      text={`${t('certificate.plastic').replace('{range}', range)}${c.certified ? '' : ` · ${t('certificate.notCertified').replace('{reason}', c.reason ?? '—')}`}`}
      tooltip={t('certificate.plasticTooltip')}
      testid="plastic-certificate"
    />
  {/if}
{/if}
