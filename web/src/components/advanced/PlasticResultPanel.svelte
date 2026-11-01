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
  import AdvValues from './kit/AdvValues.svelte';
  import { hingeTracks, trackAt } from '../../lib/engine/plastic/tracks';
  import AdvFold from './kit/AdvFold.svelte';
  import AdvLink from './kit/AdvLink.svelte';

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
  const tracks = $derived(r ? hingeTracks(r.hinges, r.steps.length - 1) : null);
  const lambdaNow = $derived(r?.steps[step]?.loadFactor ?? 0);
  const rows = $derived(r && tracks ? tracks.members.map((m, k) => ({ k, at: trackAt(r.hinges, m, step, lambdaNow) })).filter((x) => x.at) as Array<{ k: number; at: { now: number; first: number; open: boolean } }> : []);
  const activeCount = $derived(rows.filter((x) => x.at.open).length);
  const finalCount = $derived(r && tracks ? tracks.members.filter((m) => trackAt(r.hinges, m, r.steps.length - 1, r.collapseFactor)?.open).length : 0);
  const moved = $derived(rows.some((x) => x.at.now !== x.at.first));
  const keySteps = $derived(tracks?.keySteps ?? []);
  const keyIndex = $derived(Math.max(0, keySteps.findLastIndex((k) => k <= step)));
  const trackRotation = (k: number) => (tracks?.members[k] ?? []).filter((i) => (r?.hinges[i].step ?? Infinity) <= step).reduce((acc, i) => acc + Math.abs(rotation(i) ?? 0), 0);
  const values = $derived(r ? [
    { label: t('course.plastic.v.step'), value: r.steps[step]?.loadFactor.toFixed(3) ?? '—', tone: 'accent' as const },
    { label: t('course.plastic.v.collapse'), value: r.isMechanism ? r.collapseFactor.toFixed(3) : '—' },
    { label: t('course.plastic.v.hinges'), value: String(activeCount) },
    { label: 'GH', value: String(Math.max(0, r.degree)) },
  ] : []);
  function openMethod(id: string) {
    resultsStore.clearPlastic();
    openExplainedCatalog();
    explainedSteps.openMethod(id);
  }
</script>

{#if r}
  <div class="adv-result-row">
    <button class="adv-result-btn" class:active={resultsStore.diagramType === 'plasticHinges'} onclick={() => { resultsStore.diagramType = 'plasticHinges'; plasticCourse.view = 'steps'; }}>{t('advanced.plasticLabel')}</button>
    <button class="small-btn" onclick={() => { if (keyIndex > 0) goTo(keySteps[keyIndex - 1]); }} disabled={keyIndex === 0} data-testid="plastic-prev">&#9664;</button>
    <span class="adv-result-label" data-testid="plastic-step">{keyIndex + 1}/{keySteps.length}</span>
    <button class="small-btn" onclick={() => { if (keyIndex < keySteps.length - 1) goTo(keySteps[keyIndex + 1]); }} disabled={keyIndex >= keySteps.length - 1} data-testid="plastic-next">&#9654;</button>
  </div>
  <AdvValues items={values} help={`${t('course.plastic.v.help')}`} testid="plastic-values" />
  {#if step === r.steps.length - 1}
    <p class="pl-verdict" data-testid="plastic-verdict">{r.isMechanism
      ? t('plastic.collapse').replace('{lambda}', r.collapseFactor.toFixed(3)).replace('{n}', String(finalCount))
      : t('plastic.noCollapse')}</p>
  {/if}
  <PlasticCertificate result={r} />
  <table class="pl-table" data-testid="plastic-hinges">
    <thead>
      <tr><th>#</th><th>{t('plastic.member')}</th><th>x [{unitQ('length')}]</th><th>{t('plastic.value')}</th><th>λ</th><th title={t('course.plastic.rotationTitle')}>θp [{unitQ('rotation')}]</th></tr>
    </thead>
    <tbody>
      {#each rows as { k, at } (k)}
        {@const h = r.hinges[at.now]}
        {@const h0 = r.hinges[at.first]}
        <tr class:closed={!at.open} class:now={h.step === step}>
          <td>{k + 1}</td>
          <td>{h.elementId}{h.kind === 'axial' ? ` (${t('plastic.axial')})` : ''}{#if !at.open}<span class="pl-closed" title={tp('course.plastic.closedTitle', { lambda: (h.unloadedAt ?? 0).toFixed(3) })}> · {t('course.plastic.closed')}</span>{/if}</td>
          <td>{#if at.now !== at.first}<span class="pl-moved" title={t('course.plastic.movedNote')}>{fmtCoord(h0.x)} → </span>{/if}{fmtCoord(h.x)}</td>
          <td>{h.kind === 'axial' ? `N = ${fmtQ(h.moment, 'force')} ${unitQ('force')}` : `M = ${fmtQ(h.moment, 'moment')} ${unitQ('moment')}`}</td>
          <td>{h0.loadFactor.toFixed(3)}</td>
          <td data-testid="plastic-rotation">{h.kind === 'axial' ? '—' : fmtQ(trackRotation(k), 'rotation')}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if moved}<p class="pl-note" data-testid="plastic-moved-note">{t('course.plastic.movedNote')}</p>{/if}
  <PlasticStepTrace {r} {step} />
  <PlasticCurve {r} />
  <PlasticMechanism {r} />
  <PlasticUserMechanism {r} />
  <AdvFold title={t('course.plastic.methods.title')} summary={t('course.plastic.methods.summary')} help={t('course.plastic.methods.help')} testid="plastic-methods">
    <p class="pl-note">{t('course.plastic.methods.lead')}</p>
    <div class="pl-methods">
      <AdvLink label={t('steps.m.plasticKinematic.title')} onclick={() => openMethod('plasticKinematic')} testid="plastic-open-kinematic" />
      <AdvLink label={t('steps.m.plasticStatic.title')} onclick={() => openMethod('plasticStatic')} testid="plastic-open-static" />
    </div>
  </AdvFold>
  <AdvFold title={t('course.plastic.mp.title')} summary={t('course.plastic.mp.summary').replace('{n}', String(mps.length))} testid="plastic-mps">
    {#each mps as m (m.sectionId)}
      <div class="pl-mp" data-testid="plastic-mp">
        <b>{m.name}</b>: Mp = {fmtQ(m.mp, 'moment')} {unitQ('moment')} (Zp = {sigQ(m.zp, 'sectionModulus')} {unitQ('sectionModulus')}, fy = {fy(m.fy)}) · {t(`advanced.mpSource.${m.source}`)}{#if m.fyAssumed} · {fyAssumedNote()}{/if}
      </div>
    {/each}
  </AdvFold>
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
  .pl-methods { display: flex; flex-wrap: wrap; gap: 4px; }
  .pl-verdict { margin: -4px 0 6px; font-size: 0.66rem; color: var(--st-text-2); }
  .pl-table tr.closed td { opacity: 0.5; font-style: italic; }
  .pl-moved { color: var(--st-text-3); font-size: 0.6rem; }
  .pl-mp { font-size: 0.64rem; line-height: 1.45; color: var(--st-text-2); padding: 2px 0; }
</style>
