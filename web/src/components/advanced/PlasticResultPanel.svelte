<script lang="ts">
  /**
   * The collapse analysis, as it happened: step through the events, see λ and
   * the hinges formed at each, and read the whole sequence in one table.
   */
  import { t, tp } from '../../lib/i18n';
  import { resultsStore } from '../../lib/store';
  import { DEFAULT_FY, type SectionMp } from '../../lib/engine/plastic-moments';
  import type { PlasticCollapseResult } from '../../lib/engine/plastic-collapse';
  import { fmtQ, fmtCoord, unitQ, toQ, sigQ } from '../../lib/store/display-units.svelte';
  import { plainNumber } from '../../lib/utils/units';
  import PlasticCertificate from './PlasticCertificate.svelte';
  import PlasticStepTrace from './plastic/PlasticStepTrace.svelte';
  import PlasticCurve from './plastic/PlasticCurve.svelte';
  import PlasticMechanism from './plastic/PlasticMechanism.svelte';
  import PlasticUserMechanism from './plastic/PlasticUserMechanism.svelte';
  import { plasticCourse } from '../../lib/store/plastic-course.svelte';
  import { openExplainedCatalog } from '../../lib/actions/step-wizards';
  import { explainedSteps } from '../../lib/store/explained-steps.svelte';

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
  const goTo = (k: number) => { resultsStore.plasticStep = k; plasticCourse.view = 'steps'; };
  /** Plastic rotation of hinge h at the step on screen (none before it forms, none for an axial yield). */
  const rotation = (h: number) => r?.steps[step]?.rotations?.[h];
  function openMethod(id: string) {
    resultsStore.clearPlastic();
    openExplainedCatalog();
    explainedSteps.openMethod(id);
  }
</script>

{#if r}
  <div class="adv-result-row">
    <button class="adv-result-btn" class:active={resultsStore.diagramType === 'plasticHinges'} onclick={() => { resultsStore.diagramType = 'plasticHinges'; plasticCourse.view = 'steps'; }}>{t('advanced.plasticLabel')}</button>
    <button class="small-btn" onclick={() => { if (step > 0) goTo(step - 1); }} disabled={step === 0} data-testid="plastic-prev">&#9664;</button>
    <span class="adv-result-label" data-testid="plastic-step">{step + 1}/{r.steps.length}</span>
    <button class="small-btn" onclick={() => { if (step < r.steps.length - 1) goTo(step + 1); }} disabled={step >= r.steps.length - 1} data-testid="plastic-next">&#9654;</button>
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
  <PlasticCertificate result={r} />
  <table class="pl-table" data-testid="plastic-hinges">
    <thead>
      <tr><th>#</th><th>{t('plastic.member')}</th><th>x [{unitQ('length')}]</th><th>{t('plastic.value')}</th><th>λ</th><th title={t('course.plastic.rotationTitle')}>θp [{unitQ('rotation')}]</th></tr>
    </thead>
    <tbody>
      {#each r.hinges as h, i (i)}
        <tr class:now={h.step === step} class:later={h.step > step}>
          <td>{i + 1}</td>
          <td>{h.elementId}{h.kind === 'axial' ? ` (${t('plastic.axial')})` : ''}{#if h.unloadedAt !== undefined && h.unloadedAt <= (r.steps[step]?.loadFactor ?? 0)}<span class="pl-closed" title={tp('course.plastic.closedTitle', { lambda: h.unloadedAt.toFixed(3) })}> · {t('course.plastic.closed')}</span>{/if}</td>
          <td>{fmtCoord(h.x)}</td>
          <td>{h.kind === 'axial' ? `N = ${fmtQ(h.moment, 'force')} ${unitQ('force')}` : `M = ${fmtQ(h.moment, 'moment')} ${unitQ('moment')}`}</td>
          <td>{h.loadFactor.toFixed(3)}</td>
          <td data-testid="plastic-rotation">{h.kind === 'axial' || h.step > step ? '—' : fmtQ(Math.abs(rotation(i) ?? 0), 'rotation')}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="pl-note">{t('plastic.note')} {t('course.plastic.rotationNote')}</p>
  <PlasticStepTrace {r} {step} />
  <PlasticCurve {r} />
  <PlasticMechanism {r} />
  <PlasticUserMechanism {r} />
  <div class="pl-methods">
    <span>{t('course.plastic.methods.lead')}</span>
    <button class="small-btn" onclick={() => openMethod('plasticKinematic')} data-testid="plastic-open-kinematic">{t('steps.m.plasticKinematic.title')}</button>
    <button class="small-btn" onclick={() => openMethod('plasticStatic')} data-testid="plastic-open-static">{t('steps.m.plasticStatic.title')}</button>
  </div>
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
  .pl-closed { color: var(--st-text-3); font-weight: 400; }
  .pl-methods { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 6px 0; font-size: 0.66rem; color: var(--st-text-3); }
  .pl-methods span { flex-basis: 100%; }
</style>
