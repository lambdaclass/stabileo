<script lang="ts">
  /**
   * The collapse analysis, as it happened: step through the events, see λ and
   * the hinges formed at each, and read the whole sequence in one table.
   */
  import { t } from '../../lib/i18n';
  import { resultsStore } from '../../lib/store';
  import { DEFAULT_FY, type SectionMp } from '../../lib/engine/plastic-moments';
  import type { PlasticCollapseResult } from '../../lib/engine/plastic-collapse';

  let { mps }: { mps: SectionMp[] } = $props();
  const r = $derived(resultsStore.plasticResult as PlasticCollapseResult | null);
  const step = $derived(resultsStore.plasticStep);
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
      <tr><th>#</th><th>{t('plastic.member')}</th><th>x [m]</th><th>{t('plastic.value')}</th><th>λ</th></tr>
    </thead>
    <tbody>
      {#each r.hinges as h, i (i)}
        <tr class:now={h.step === step} class:later={h.step > step}>
          <td>{i + 1}</td>
          <td>{h.elementId}{h.kind === 'axial' ? ` (${t('plastic.axial')})` : ''}</td>
          <td>{h.x.toFixed(2)}</td>
          <td>{h.kind === 'axial' ? `N = ${h.moment.toFixed(1)} kN` : `M = ${h.moment.toFixed(1)} kN·m`}</td>
          <td>{h.loadFactor.toFixed(3)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="pl-note">{t('plastic.note')}</p>
  {#each mps as m (m.sectionId)}
    <div class="adv-result-info" data-testid="plastic-mp">
      {m.name}: Mp = {m.mp.toFixed(1)} kN·m (Zp = {(m.zp * 1e6).toFixed(0)} cm³, fy = {m.fy} MPa) — {t(`advanced.mpSource.${m.source}`)}{#if m.fyAssumed} · {t('advanced.mpFyAssumed').replace('{fy}', String(DEFAULT_FY))}{/if}
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
