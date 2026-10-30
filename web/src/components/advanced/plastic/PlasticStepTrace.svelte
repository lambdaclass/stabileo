<script lang="ts">
  /**
   * What the step on screen did, in the order a hand calculation does it: the
   * elastic solve of the current structure, the section that reaches Mp first
   * and the Δλ that takes it there, the new λ, and the hinge put in.
   */
  import { t, tp } from '../../../lib/i18n';
  import type { PlasticCollapseResult } from '../../../lib/engine/plastic-collapse';
  import { fmtQ, fmtCoord, unitQ } from '../../../lib/store/display-units.svelte';
  import PlasticSection from './PlasticSection.svelte';

  let { r, step }: { r: PlasticCollapseResult; step: number } = $props();

  const st = $derived(r.steps[step]);
  const before = $derived(r.hinges.filter((h) => h.step < step).length);
  const last = $derived(step === r.steps.length - 1);
  const f3 = (v: number) => v.toFixed(3);
  const mom = (v: number) => `${fmtQ(v, 'moment')} ${unitQ('moment')}`;
  const force = (v: number) => `${fmtQ(v, 'force')} ${unitQ('force')}`;
  const at = (x: number) => `${fmtCoord(x)} ${unitQ('length')}`;
  /** Δλ = (Mp − M·sgn m)/|m| with this event's numbers. */
  function formula(e: { axial: boolean; limit: number; sM: number; absm: number }): string {
    const q = e.axial ? 'force' : 'moment';
    const sM = e.sM < 0 ? `(${fmtQ(e.sM, q)})` : fmtQ(e.sM, q);
    const [cap, val] = e.axial ? ['Np', 'N'] : ['Mp', 'M'];
    return `Δλ = (${cap} − ${val}·sgn m)/|m| = (${fmtQ(e.limit, q)} − ${sM})/${fmtQ(e.absm, q)} = ${f3(st.trace.dLambda)}`;
  }

  /** The event in the signs of the hinge table (the drawn axes). */
  const events = $derived((st?.trace.events ?? []).map((ev) => {
    const h = r.hinges[ev.hinge];
    const reached = ev.before + st.trace.dLambda * ev.perUnit;
    const f = Math.sign(h.moment) * Math.sign(reached) || 1;
    const m = f * ev.perUnit, M = f * ev.before;
    const s = Math.sign(m) || 1;
    return { h, i: ev.hinge + 1, m, M, sM: s * M, absm: Math.abs(m), limit: ev.limit, axial: h.kind === 'axial' };
  }));
</script>

{#if st}
  <PlasticSection testid="plastic-trace" title={t('course.plastic.trace.title')}
    summary={tp('course.plastic.trace.summary', { k: step + 1, dl: f3(st.trace.dLambda), lambda: f3(st.loadFactor) })}
    help={t('course.plastic.trace.help')}>
    <ol class="tr">
      <li>{tp('course.plastic.trace.solve', { n: before })}</li>
      {#each events as e (e.i)}
        <li>
          {#if e.axial}
            {tp('course.plastic.trace.eventAxial', { member: e.h.elementId, n: force(e.m), N: force(e.M), np: force(e.limit) })}
          {:else}
            {tp('course.plastic.trace.event', { member: e.h.elementId, x: at(e.h.x), m: mom(e.m), M: mom(e.M), mp: mom(e.limit) })}
          {/if}
          <div class="tr-eq" data-testid="plastic-trace-formula">{formula(e)}</div>
        </li>
      {/each}
      <li>{t('course.plastic.trace.min')}</li>
      <li>{tp('course.plastic.trace.update', { before: f3(st.trace.lambdaBefore), dl: f3(st.trace.dLambda), after: f3(st.loadFactor) })}</li>
      {#each events as e (e.i)}
        <li>{e.axial ? tp('course.plastic.trace.yield', { member: e.h.elementId, i: e.i }) : tp('course.plastic.trace.hinge', { member: e.h.elementId, x: at(e.h.x), i: e.i })}</li>
      {/each}
      <li class="tr-end">{last && r.isMechanism ? tp('course.plastic.trace.collapse', { lambda: f3(r.collapseFactor) }) : last ? t('course.plastic.trace.noMechanism') : t('course.plastic.trace.next')}</li>
    </ol>
  </PlasticSection>
{/if}

<style>
  .tr { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 3px; }
  .tr-eq { margin-top: 2px; font-family: var(--st-mono); font-size: 0.64rem; color: var(--st-value); overflow-wrap: anywhere; }
  .tr-end { color: var(--st-text); }
</style>
