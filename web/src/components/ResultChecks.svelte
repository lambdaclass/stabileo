<script lang="ts">
  /**
   * The certificate and the discretization error, folded under the results: closed with a one-line
   * summary, and opened by itself when one of them warns, so a warning is never folded away unseen.
   */
  import { t } from '../lib/i18n';
  import { uiStore, resultsStore, modelStore } from '../lib/store';
  import { certificateStore } from '../lib/store/certificate.svelte';
  import { discretizationStore } from '../lib/store/discretization.svelte';
  import SelfCheckBanner from './advanced/SelfCheckBanner.svelte';
  import CertificateStatus from './CertificateStatus.svelte';
  import DiscretizationStatus from './DiscretizationStatus.svelte';

  const is3D = $derived(uiStore.is3DWorkspace);
  const cert = $derived(certificateStore.shown(is3D));
  const est = $derived(discretizationStore.estimate);
  const study = $derived(discretizationStore.study);
  const discretizationShown = $derived(is3D && est.status !== 'idle' && discretizationStore.applies());
  const discretizationHigh = $derived(discretizationShown && (
    (est.status === 'done' && est.estimate.exceedsThreshold) || (study.status === 'done' && study.study.exceedsThreshold)));
  const notCertified = $derived(cert.status === 'done' && (cert.certificate.status !== 'certified' || cert.endToEnd?.status === 'failed'));
  const warn = $derived(notCertified || discretizationHigh);

  const summary = $derived([
    cert.status === 'pending' ? t('resultChecks.pending')
      : cert.status === 'done' ? t(notCertified ? 'resultChecks.notCertified' : 'resultChecks.certified') : null,
    discretizationHigh ? t('resultChecks.discretizationHigh') : null,
  ].filter(Boolean).join(' · '));

  const cases = $derived([...(is3D ? resultsStore.perCase3D : resultsStore.perCase)]);
  const checkResults = $derived([...cases.map(([, result]) => result), is3D ? resultsStore.results3D : resultsStore.results]);
  const caseLabels = $derived(cases.map(([id]) => modelStore.loadCases.find((c) => c.id === id)?.name ?? `#${id}`));

  let open = $state(false);
  $effect(() => { if (warn) open = true; });
</script>

<SelfCheckBanner results={checkResults} labels={caseLabels} />

{#if cert.status !== 'idle' || discretizationShown}
  <details class="rc" class:warn bind:open data-testid="result-checks">
    <summary data-testid="result-checks-toggle">
      <span class="rc-title">{t('resultChecks.title')}</span>
      {#if summary}<span class="rc-summary">{summary}</span>{/if}
    </summary>
    <CertificateStatus />
    <DiscretizationStatus />
  </details>
{/if}

<style>
  .rc { margin-top: 8px; border-top: 1px solid var(--st-hair); padding-top: 6px; }
  summary { display: flex; align-items: center; min-height: 44px; flex-wrap: wrap; gap: 8px; cursor: pointer; list-style: none; font-size: 12px; color: var(--st-text-2); }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '▸'; color: var(--st-text-3); font-size: 12px; }
  details[open] > summary::before { content: '▾'; }
  .rc-title { font-weight: 500; }
  .rc-summary { min-width: 0; overflow-wrap: anywhere; color: var(--st-text-3); font-size: 12px; }
  .warn .rc-summary { min-width: 0; overflow-wrap: anywhere; color: var(--st-warn); }
</style>
