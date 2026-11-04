<script lang="ts">
  /**
   * The mechanism the collapse ends in: drawn on the canvas, each hinge with its
   * rotation as a multiple of θ, and λc checked again by virtual work.
   */
  import { t, tp } from '../../../lib/i18n';
  import type { PlasticCollapseResult } from '../../../lib/engine/plastic-collapse';
  import { plasticCourse } from '../../../lib/store/plastic-course.svelte';
  import { dot } from '../../../lib/engine/plastic/kinematics';
  import { thetaLabel } from '../../../lib/canvas/draw-plastic-course';
  import { fmtQ, fmtCoord, unitQ } from '../../../lib/store/display-units.svelte';
  import PlasticSection from './PlasticSection.svelte';

  let { r }: { r: PlasticCollapseResult } = $props();
  let open = $state(false);
  $effect(() => { if (!open && plasticCourse.view === 'mechanism') plasticCourse.view = 'steps'; });

  const view = $derived(plasticCourse.collapse);
  const order = $derived(r.hinges.map((h, i) => ({ h, i })).filter(({ h }) => h.kind === 'bending' && h.unloadedAt === undefined));
  const axial = $derived(r.hinges.some((h) => h.kind === 'axial'));
  const work = $derived.by(() => {
    if (!view) return null;
    const Wi = view.hinges.reduce((s, h) => s + plasticCourse.mpOf(h.member) * Math.abs(h.theta), 0);
    const We = dot(view.km.work, view.d);
    return { Wi, We, lambda: We > 0 ? Wi / We : Infinity };
  });
  const showing = $derived(plasticCourse.view === 'mechanism');
  const mom = (v: number) => `${fmtQ(v, 'moment')} ${unitQ('moment')}`;
</script>

{#if r.isMechanism && view}
  <PlasticSection testid="plastic-mechanism" bind:open title={t('course.plastic.mech.title')}
    summary={tp(view.dof === 1 ? 'course.plastic.mech.summaryOne' : 'course.plastic.mech.summaryMany', { n: view.hinges.length, k: view.dof })}
    help={t('course.plastic.mech.help')}>
    <button class="adv-result-btn" class:active={showing} data-testid="plastic-mechanism-draw"
      onclick={() => (plasticCourse.view = showing ? 'steps' : 'mechanism')}>
      {showing ? t('course.plastic.mech.hide') : t('course.plastic.mech.show')}
    </button>
    <table class="mt">
      <thead><tr><th>#</th><th>{t('plastic.member')}</th><th>x [{unitQ('length')}]</th><th>θ</th></tr></thead>
      <tbody>
        {#each view.hinges as h, k (k)}
          <tr>
            <td>{(order[k]?.i ?? k) + 1}</td><td>{h.member}</td><td>{fmtCoord(order[k]?.h.x ?? 0)}</td>
            <td>{h.theta === 0 ? '0' : thetaLabel(h.theta)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if view.dof > 1}<p class="mt-note">{tp('course.plastic.mech.manyDof', { k: view.dof })}</p>{/if}
    {#if axial}
      <p class="mt-note">{t('course.plastic.mech.axialNote')}</p>
    {:else if work}
      <p>{t('course.plastic.mech.vwLead')}</p>
      <div class="mt-eq" data-testid="plastic-mechanism-vw">
        Σ Mp|θ| = {mom(work.Wi)}·θ<br />
        Σ P·δ = {fmtQ(work.We, 'moment')}·θ<br />
        λ = {mom(work.Wi)} / {fmtQ(work.We, 'moment')} = {work.lambda.toFixed(3)}
      </div>
      <p>{tp('course.plastic.mech.vwAgree', { lambda: r.collapseFactor.toFixed(3) })}</p>
    {/if}
  </PlasticSection>
{/if}

<style>
  .mt { width: 100%; border-collapse: collapse; font-size: 0.66rem; margin: 6px 0 4px; font-variant-numeric: tabular-nums; }
  .mt th { color: var(--st-text-3); font-weight: 500; text-align: right; padding: 1px 3px; }
  .mt td { text-align: right; padding: 1px 3px; color: var(--st-text-2); }
  .mt-eq { font-family: var(--st-mono); font-size: 0.64rem; color: var(--st-value); margin: 2px 0 4px; overflow-wrap: anywhere; }
  .mt-note { color: var(--st-text-3); }
  p { margin: 3px 0; }
</style>
