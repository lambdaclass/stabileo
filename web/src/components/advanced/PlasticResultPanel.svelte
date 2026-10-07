<script lang="ts">
  /**
   * The collapse analysis, as it happened: step through the events, see λ and
   * the hinges formed at each, and read the whole sequence in one table.
   */
  import { t } from '../../lib/i18n';
  import { resultsStore } from '../../lib/store';
  import { DEFAULT_FY, type SectionMp } from '../../lib/engine/plastic-moments';
  import type { PlasticCollapseResult } from '../../lib/engine/plastic-collapse';
  import { fmtQ, fmtCoord, unitQ, toQ, sigQ } from '../../lib/store/display-units.svelte';
  import { plainNumber } from '../../lib/utils/units';

  let { mps }: { mps: SectionMp[] } = $props();
  const r = $derived(resultsStore.plasticResult as PlasticCollapseResult | null);
  const step = $derived(resultsStore.plasticStep);

  /*
   * Shown in the chosen unit system; the analysis works in m, kN, kN·m, m³
   * and MPa. A yield stress reads as written (250, not 250.0).
   */
  const fy = (mpa: number) => `${plainNumber(toQ(mpa, 'stress'), 1)} ${unitQ('stress')}`;
  /** The assumed-fy note, with the value in the chosen unit. */
  const fyAssumedNote = () => t('advanced.mpFyAssumed').replace('{fy}', fy(DEFAULT_FY));
</script>

{#if r}
  <div class="adv-result-row">
    <button class="adv-result-btn" class:active={resultsStore.diagramType === 'plasticHinges'} onclick={() => (resultsStore.diagramType = 'plasticHinges')}>{t('advanced.plasticLabel')}</button>
    <button class="small-btn" onclick={() => { if (step > 0) resultsStore.plasticStep--; }} disabled={step === 0}>&#9664;</button>
    <span class="adv-result-label" data-testid="plastic-step">{step + 1}/{r.steps.length}</span>
    <button class="small-btn" onclick={() => { if (step < r.steps.length - 1) resultsStore.plasticStep++; }} disabled={step >= r.steps.length - 1}>&#9654;</button>
  </div>
  <div class="adv-result-info" data-testid="plastic-verdict">
    λ = {r.steps[step]?.loadFactor.toFixed(3) ?? '—'}
    {#if step === r.steps.length - 1}
      · {r.isMechanism
        ? t('plastic.collapse').replace('{lambda}', r.collapseFactor.toFixed(3)).replace('{n}', String(r.hinges.length))
        : t('plastic.noCollapse')}
    {/if}
    · GH = {Math.max(0, r.degree)}
  </div>
  <table class="pl-table" data-testid="plastic-hinges">
    <thead>
      <tr><th>#</th><th>{t('plastic.member')}</th><th>x [{unitQ('length')}]</th><th>{t('plastic.value')}</th><th>λ</th></tr>
    </thead>
    <tbody>
      {#each r.hinges as h, i (i)}
        <tr class:now={h.step === step} class:later={h.step > step}>
          <td>{i + 1}</td>
          <td>{h.elementId}{h.kind === 'axial' ? ` (${t('plastic.axial')})` : ''}</td>
          <td>{fmtCoord(h.x)}</td>
          <td>{h.kind === 'axial' ? `N = ${fmtQ(h.moment, 'force')} ${unitQ('force')}` : `M = ${fmtQ(h.moment, 'moment')} ${unitQ('moment')}`}</td>
          <td>{h.loadFactor.toFixed(3)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="pl-note">{t('plastic.note')}</p>
  {#each mps as m (m.sectionId)}
    <div class="adv-result-info" data-testid="plastic-mp">
      {m.name}: Mp = {fmtQ(m.mp, 'moment')} {unitQ('moment')} (Zp = {sigQ(m.zp, 'sectionModulus')} {unitQ('sectionModulus')}, fy = {fy(m.fy)}) — {t(`advanced.mpSource.${m.source}`)}{#if m.fyAssumed} · {fyAssumedNote()}{/if}
    </div>
  {/each}
{/if}

<style>
  .pl-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; margin: 4px 0; font-variant-numeric: tabular-nums; }
  .pl-table th { color: var(--st-text-3); font-weight: 500; text-align: right; padding: 2px 4px; }
  .pl-table td { text-align: right; padding: 2px 4px; color: var(--st-text-2); }
  .pl-table th:nth-child(2), .pl-table td:nth-child(2) { text-align: left; }
  .pl-table tr.now td { color: var(--st-accent); font-weight: 600; }
  .pl-table tr.later td { opacity: 0.45; }
  .pl-note { margin: 2px 0 6px; font-size: 0.62rem; line-height: 1.4; color: var(--st-text-3); }
</style>
