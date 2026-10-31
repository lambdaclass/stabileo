<script lang="ts">
  /**
   * The certified enclosure of the critical load factor, beside the computed one: stable for
   * every factor up to the lower value, unstable at the upper (docs/verification/CERTIFY.md).
   */
  import { t } from '../../lib/i18n';
  import type { BucklingCertificate } from '../../lib/engine/wasm-solver';
  import { formatLambda, formatSeparated } from '../../lib/utils/certificate-format';

  let { certificate }: { certificate: BucklingCertificate | undefined } = $props();

  function refusalText(c: Extract<BucklingCertificate, { status: 'uncertified' }>): string {
    if (c.refusal?.code !== 'computedAboveUpperBound') return c.reason;
    const [computed, upper] = formatSeparated(c.refusal.lambdaComputed, c.refusal.lambdaUpper);
    return t('certificate.bucklingRefusal.computedAboveUpperBound').replace('{computed}', computed).replace('{upper}', upper);
  }
</script>

{#if certificate}
  <div class="buckling-cert" class:no={certificate.status !== 'certified'} title={t('certificate.bucklingTooltip')} data-testid="buckling-certificate">
    {#if certificate.status === 'certified'}
      {t('certificate.buckling')
        .replace('{lower}', formatLambda(certificate.lambdaLower, 'down'))
        .replace('{upper}', formatLambda(certificate.lambdaUpper, 'up'))}
    {:else}
      {t('certificate.bucklingNotCertified').replace('{reason}', refusalText(certificate))}
    {/if}
  </div>
{/if}

<style>
  .buckling-cert { font-size: 0.75rem; overflow-wrap: anywhere; min-width: 0; color: var(--st-text-2); cursor: help; margin: 2px 0; }
  .buckling-cert.no { color: var(--st-warn); }
</style>
