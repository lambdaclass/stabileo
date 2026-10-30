<script lang="ts">
  /**
   * A mechanism the reader proposes: hinges placed by tapping the members, then
   * whether it is a mechanism, its λ by virtual work, its moments at that λ and
   * the verdict of the theorems, next to the λc of the step-by-step analysis.
   */
  import { t, tp } from '../../../lib/i18n';
  import type { PlasticCollapseResult } from '../../../lib/engine/plastic-collapse';
  import { plasticCourse } from '../../../lib/store/plastic-course.svelte';
  import { thetaLabel } from '../../../lib/canvas/draw-plastic-course';
  import { fmtQ, fmtCoord, unitQ } from '../../../lib/store/display-units.svelte';
  import PlasticSection from './PlasticSection.svelte';

  let { r }: { r: PlasticCollapseResult } = $props();
  let open = $state(false);

  const u = $derived(plasticCourse.user);
  const v = $derived(u?.verdict ?? null);
  const need = $derived((u?.ghF ?? 0) + 1);
  const lengthOf = (member: number) => {
    const input = plasticCourse.input;
    const e = input?.elements.get(member);
    if (!input || !e) return 0;
    const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
    return Math.hypot(b.x - a.x, b.z - a.z);
  };
  const where = (h: { member: number; t: number }) => tp('course.plastic.user.where', { member: h.member, x: `${fmtCoord(h.t * lengthOf(h.member))} ${unitQ('length')}` });
  const mom = (x: number) => `${fmtQ(x, 'moment')} ${unitQ('moment')}`;
  const why = $derived(new Map((u?.ignored ?? []).map((x) => [x.hinge, x.why])));
  const summary = $derived(plasticCourse.hinges.length === 0
    ? t('course.plastic.user.summaryEmpty')
    : v?.kind === 'mechanism'
      ? tp('course.plastic.user.summaryLambda', { n: plasticCourse.hinges.length, lambda: v.mech.lambda.toFixed(3) })
      : tp('course.plastic.user.summaryCount', { n: plasticCourse.hinges.length }));

  function togglePicking() {
    plasticCourse.picking = !plasticCourse.picking;
    if (!plasticCourse.picking && plasticCourse.hinges.length === 0) plasticCourse.view = 'steps';
  }
  $effect(() => {
    if (open) return;
    if (plasticCourse.picking) plasticCourse.picking = false;
    if (plasticCourse.view === 'user') plasticCourse.view = 'steps';
  });
</script>

<PlasticSection testid="plastic-user" bind:open title={t('course.plastic.user.title')} {summary} help={t('course.plastic.user.help')}>
  <div class="um-row">
    <button class="adv-result-btn um-main" class:active={plasticCourse.picking} onclick={togglePicking} data-testid="plastic-user-pick">
      {plasticCourse.picking ? t('course.plastic.user.done') : t('course.plastic.user.place')}
    </button>
    {#if plasticCourse.hinges.length}
      <button class="small-btn" onclick={() => plasticCourse.clearHinges()} data-testid="plastic-user-clear">{t('course.plastic.user.clear')}</button>
    {/if}
  </div>
  {#if plasticCourse.picking}<p class="um-hint">{t('course.plastic.user.hint')}</p>{/if}

  {#if plasticCourse.hinges.length}
    <ul class="um-list" data-testid="plastic-user-hinges">
      {#each plasticCourse.hinges as h, i (i)}
        {@const s = u?.sectionOf[i] ?? -1}
        {@const th = v?.kind === 'mechanism' && s >= 0 ? v.mech.theta[s] : null}
        <li class:aside={why.has(i)}>
          <span>{i + 1} · {where(h)}{#if th !== null} · {th === 0 ? t('course.plastic.user.still') : thetaLabel(th)}{/if}</span>
          <button class="um-x" onclick={() => plasticCourse.removeHinge(i)} aria-label={t('course.plastic.user.remove')}>×</button>
          {#if why.has(i)}<div class="um-why">{t(`course.plastic.user.ignored.${why.get(i)}`)}</div>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if u && v}
    <div class="um-verdict" data-testid="plastic-user-verdict">
      {#if v.kind === 'notMechanism'}
        <p class="bad">{tp('course.plastic.user.notMechanism', { n: u.n, r: v.remaining, gh: u.ghF, need })}</p>
      {:else if v.kind === 'multi'}
        <p class="bad">{tp('course.plastic.user.multi', { k: v.dof, n: u.n, need })}</p>
        <button class="adv-result-btn" onclick={() => (plasticCourse.combine = true)} data-testid="plastic-user-combine">{t('course.plastic.user.combine')}</button>
      {:else if v.kind === 'noWork'}
        <p class="bad">{t('course.plastic.user.noWork')}</p>
      {:else if v.kind === 'mechanism'}
        <p>{tp(`course.plastic.user.type.${v.type}`, { n: u.n, gh: u.ghF, need, free: v.dist?.free ?? 0 })}</p>
        {#if v.combined}<p>{t('course.plastic.user.combined')}</p>{/if}
        <div class="um-eq" data-testid="plastic-user-lambda">
          Σ Mp|θ| = λ·Σ P·δ<br />
          {mom(v.mech.Wi)}·θ = λ·{fmtQ(v.mech.W, 'moment')}·θ<br />
          λ = {v.mech.lambda.toFixed(3)}
        </div>
        {#if v.admissible}
          <p class="ok" data-testid="plastic-user-admissible">{tp('course.plastic.user.admissible', { lambda: v.mech.lambda.toFixed(3) })}</p>
        {:else if v.dist?.worst}
          <p class="bad" data-testid="plastic-user-admissible">{tp('course.plastic.user.exceeds', {
            member: v.dist.worst.member, x: `${fmtCoord(v.dist.worst.t * lengthOf(v.dist.worst.member))} ${unitQ('length')}`,
            M: mom(Math.abs(v.dist.worst.M)), mp: mom(v.dist.worst.mp), lambda: v.mech.lambda.toFixed(3), lower: v.lower.toFixed(3),
          })}</p>
        {/if}
        <p>{tp('course.plastic.user.compare', { lambda: r.collapseFactor.toFixed(3), diff: (100 * (v.mech.lambda / r.collapseFactor - 1)).toFixed(1) })}</p>
        <div class="um-row" role="group" aria-label={t('course.plastic.user.showLabel')}>
          <button class="adv-result-btn" class:active={plasticCourse.userShows === 'mechanism'} onclick={() => { plasticCourse.userShows = 'mechanism'; plasticCourse.view = 'user'; }} data-testid="plastic-user-show-mech">{t('course.plastic.user.showMech')}</button>
          <button class="adv-result-btn" class:active={plasticCourse.userShows === 'moments'} onclick={() => { plasticCourse.userShows = 'moments'; plasticCourse.view = 'user'; }} data-testid="plastic-user-show-moments">{t('course.plastic.user.showMoments')}</button>
        </div>
      {/if}
    </div>
  {/if}
</PlasticSection>

<style>
  .um-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 2px 0 4px; }
  .um-main { flex: 1 1 auto; }
  .um-hint { margin: 0 0 4px; color: var(--st-text-3); }
  .um-list { list-style: none; margin: 0 0 4px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .um-list li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 2px 4px; padding: 2px 4px; border-radius: 4px; background: var(--st-surface-2); font-variant-numeric: tabular-nums; }
  .um-list li.aside span { text-decoration: line-through; color: var(--st-text-3); }
  .um-why { flex-basis: 100%; font-size: 0.62rem; color: var(--st-text-3); }
  .um-x { border: none; background: none; color: var(--st-text-3); cursor: pointer; font-size: 0.85rem; line-height: 1; padding: 0 4px; }
  .um-x:hover { color: var(--st-text); }
  .um-verdict p { margin: 3px 0; }
  .um-eq { font-family: var(--st-mono); font-size: 0.64rem; color: var(--st-value); margin: 2px 0 4px; overflow-wrap: anywhere; }
  .ok { color: #2fb36b; }
  .bad { color: var(--st-text); }
  @media (pointer: coarse) { .um-x { min-width: 30px; min-height: 30px; } }
</style>
