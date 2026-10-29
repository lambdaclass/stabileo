<script lang="ts">
  /**
   * The certified modal result (docs/verification/CERTIFY.md): each frequency enclosed, and no
   * mode missed below a cutoff. Computed in the background once the modes are shown
   * (`store/analysis-certificate.svelte.ts`); `mode` is the one on screen, whose interval is
   * spelled out, the rest are listed on demand.
   */
  import { t } from '../../lib/i18n';
  import { createBackgroundCertificate } from '../../lib/store/analysis-certificate.svelte';
  import type { CertificateAnswer, ModalCertificate } from '../../lib/engine/certificate-types';
  import { frequencyInterval, modeEnclosureOf, modalCutoffHz } from '../../lib/engine/certificate-read';
  import { formatEnclosure, formatDirected } from '../../lib/utils/certificate-format';
  import SelfCheckBanner from './SelfCheckBanner.svelte';
  import type { StructuredDiagnostic } from '../../lib/engine/types';
  import CertLine from './CertLine.svelte';

  let { result, mode = null }: { result: { structuredDiagnostics?: StructuredDiagnostic[]; modes: Array<{ frequency: number }> } | null | undefined; mode?: number | null } = $props();

  const cert = createBackgroundCertificate<CertificateAnswer<ModalCertificate>>();
  $effect(() => cert.track(result));

  const c = $derived(cert.state.status === 'done' ? cert.state.answer.certificate : null);
  const intervals = $derived((result?.modes ?? []).map((m) => {
    const e = modeEnclosureOf(c, m.frequency);
    return e ? frequencyInterval(e) : null;
  }));
  const range = (iv: { lo: number; hi: number | null }) => formatEnclosure(iv.lo, iv.hi);
  const cutoff = $derived(modalCutoffHz(c));
  const summary = $derived.by(() => {
    if (!c || c.status !== 'certified') return '';
    const n = intervals.filter(Boolean).length;
    const head = t('certificate.modal').replace('{n}', String(n));
    return cutoff !== null
      ? `${head} · ${t('certificate.modalComplete').replace('{f}', formatDirected(cutoff, 'down', 4)).replace('{n}', String(c.completeModes))}`
      : `${head} · ${t('certificate.modalIncomplete').replace('{reason}', c.countFailure ?? '—')}`;
  });
  const current = $derived(mode !== null ? intervals[mode] ?? null : null);
</script>

<SelfCheckBanner results={[result]} />

{#if cert.state.status === 'pending'}
  <CertLine kind="pending" text={t('certificate.pending')} testid="modal-certificate" />
{:else if cert.state.status === 'failed'}
  <CertLine kind="no" text={t('certificate.notCertified').replace('{reason}', cert.state.reason)} tooltip={t('certificate.modalTooltip')} testid="modal-certificate" />
{:else if c && c.status !== 'certified'}
  <CertLine kind="no" text={t('certificate.notCertified').replace('{reason}', c.reason)} tooltip={t('certificate.modalTooltip')} testid="modal-certificate" />
{:else if c}
  <CertLine kind={cutoff !== null ? 'ok' : 'no'} text={current && mode !== null ? `${t('certificate.modalMode').replace('{i}', String(mode + 1)).replace('{range}', range(current))} · ${summary}` : summary} tooltip={t('certificate.modalTooltip')} testid="modal-certificate" />
  {#if intervals.some(Boolean)}
    <details class="cert-modes">
      <summary>{t('certificate.modalAll')}</summary>
      <ul>
        {#each intervals as iv, i (i)}
          <li>{i + 1}: {iv ? `${range(iv)} Hz` : '—'}</li>
        {/each}
      </ul>
    </details>
  {/if}
{/if}

<style>
  .cert-modes { font-size: 0.62rem; color: var(--st-text-3); margin: 0 0 4px; }
  .cert-modes summary { cursor: pointer; }
  .cert-modes ul { margin: 2px 0 0 14px; padding: 0; columns: 2; font-variant-numeric: tabular-nums; }
</style>
