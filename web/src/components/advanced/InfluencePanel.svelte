<script lang="ts">
  /**
   * The influence line's own controls, under its entry in Advanced: what is being read and where,
   * the section's position (typed, or 0, L/2, L), what the line says, how to load it, and the
   * step-by-step explanation.
   */
  import { t, tp } from '../../lib/i18n';
  import { resultsStore, modelStore, uiStore } from '../../lib/store';
  import UnitInput from '../UnitInput.svelte';
  import InfluenceLoading from './InfluenceLoading.svelte';
  import { moveInfluenceSection, runInfluence, openInfluenceExplanation, currentUnitInput, loadedMembers } from '../../lib/actions/influence-line';
  import { positionToT, otherSideOf } from '../../lib/engine/influence/section-pick';
  import { canonicalQuantity, familyOf, ordinateUnit } from '../../lib/engine/influence/quantities';
  import { numText } from '../../lib/engine/steps/format';
  import { FORCE_QUANTITIES, DISPLACEMENT_QUANTITIES } from '../../lib/engine/influence/quantities';
  import type { InfluenceQuantity } from '../../lib/store/model.svelte';
  import AdvTarget from './kit/AdvTarget.svelte';
  import AdvChips from './kit/AdvChips.svelte';
  import AdvValues from './kit/AdvValues.svelte';
  import AdvFold from './kit/AdvFold.svelte';
  import AdvLink from './kit/AdvLink.svelte';

  const il = $derived(resultsStore.influenceLine);
  const q = $derived(il ? canonicalQuantity(il.quantity) : canonicalQuantity(uiStore.ilQuantity));
  const elem = $derived(il?.targetElementId !== undefined ? modelStore.elements.get(il.targetElementId) : undefined);
  const L = $derived.by(() => {
    if (!elem) return 0;
    const a = modelStore.nodes.get(elem.nodeI), b = modelStore.nodes.get(elem.nodeJ);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  });
  const at = $derived(il?.targetPosition ?? 0.5);
  const atEnd = $derived(!!elem && (at < 1e-9 || at > 1 - 1e-9));
  const endNode = $derived(elem && atEnd ? (at < 0.5 ? elem.nodeI : elem.nodeJ) : undefined);
  const supported = $derived(endNode !== undefined && [...modelStore.supports.values()].some((s) => s.nodeId === endNode));
  const other = $derived(elem && atEnd ? otherSideOf(elem.id, at, modelStore.elements, modelStore.nodes) : null);

  let posError = $state<string | null>(null);
  $effect(() => { void il; posError = null; });

  function setX(x: number) {
    if (!elem) return;
    const tt = positionToT(x, L);
    if (tt === null) { posError = tp('course.influence.panel.xRange', { L: numText(L, 4) }); return; }
    posError = null;
    moveInfluenceSection(elem.id, tt);
  }

  const peaks = $derived.by(() => {
    if (!il || il.points.length === 0) return null;
    let max = il.points[0], min = il.points[0];
    for (const p of il.points) { if (p.value > max.value) max = p; if (p.value < min.value) min = p; }
    const where = (p: typeof max) => {
      const e = modelStore.elements.get(p.elementId);
      const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
      const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
      return tp('course.influence.panel.atLoad', { e: p.elementId, x: numText(p.t * len, 3) });
    };
    return { max: { v: max.value, where: where(max) }, min: { v: min.value, where: where(min) } };
  });

  const memberChips = [...FORCE_QUANTITIES, ...DISPLACEMENT_QUANTITIES].map((id) => ({ id, label: id === 'ry' ? 'θ' : id, title: t(`course.influence.name.${id}`) }));
  function pickQuantity(id: string) {
    if (!elem) return;
    uiStore.ilQuantity = id as typeof uiStore.ilQuantity;
    runInfluence(id as InfluenceQuantity, undefined, elem.id, at, true);
  }
  const unit = $derived(il ? currentUnitInput() : null);
  const loaded = $derived(unit && il ? loadedMembers(unit, il.direction ?? 'vertical') : []);
</script>

<div class="ilp" data-testid="il-panel">
  {#if !il}
    <p class="ilp-hint">{t('course.influence.panel.pick')}</p>
    <p class="ilp-hint">{t('course.influence.panel.pickWhere')}</p>
    <AdvLink label={t('course.influence.panel.explain')} onclick={() => openInfluenceExplanation([])} testid="il-explain" />
  {:else}
    <AdvTarget
      label={t(`course.influence.name.${q}`)}
      position={elem ? `x = ${numText(at * L, 3)} m · x/L = ${(at * 100).toFixed(1)}%` : tp('course.influence.panel.onNode', { n: il.targetNodeId ?? '' })}
      slider={!!elem} t={at} sliderTitle={t('course.influence.panel.section')}
      oncommit={(tt) => elem && moveInfluenceSection(elem.id, tt)} />
    <span class="ilp-what" data-testid="il-what">{il.targetElementId !== undefined ? tp('course.influence.panel.onMember', { e: il.targetElementId }) : tp('course.influence.panel.onNode', { n: il.targetNodeId ?? '' })}</span>
    {#if elem}
      <AdvChips chips={memberChips} value={q} testid="il-quantity" onchange={pickQuantity} />
      <div class="ilp-row">
        <span class="ilp-x"><UnitInput value={at * L} qty="length" onchange={setX} testid="il-x" /></span>
        <div class="ilp-snaps">
          <button class:on={at < 1e-9} onclick={() => setX(0)} data-testid="il-x0">0</button>
          <button class:on={Math.abs(at - 0.5) < 1e-9} onclick={() => setX(L / 2)}>L/2</button>
          <button class:on={at > 1 - 1e-9} onclick={() => setX(L)} data-testid="il-xL">L</button>
        </div>
      </div>
      {#if posError}<p class="ilp-error" role="alert" data-testid="il-x-error">{posError}</p>{/if}
      {#if atEnd && familyOf(q) === 'force'}
        <p class="ilp-note" data-testid="il-end-note">{tp(at < 0.5 ? 'course.influence.panel.endStart' : 'course.influence.panel.endEnd', { n: endNode ?? '', e: elem.id })}</p>
        <div class="ilp-links">
          {#if other}
            <AdvLink label={tp('course.influence.panel.otherSide', { e: other.elementId })} onclick={() => runInfluence(q, undefined, other.elementId, other.t, true)} testid="il-other-side" />
          {/if}
          {#if supported && endNode !== undefined}
            <AdvLink label={t('course.influence.panel.reaction')} onclick={() => runInfluence('Rz', endNode, undefined, 0.5, true)} testid="il-support-reaction" />
          {/if}
        </div>
      {/if}
    {/if}

    {#if peaks}
      <AdvValues testid="il-peaks" help={t(`course.influence.doc.sign.${q}`)} items={[
        { label: `η ${t('course.influence.panel.maxSub')}`, value: `${numText(peaks.max.v, 4)}`, tone: 'accent' },
        { label: `η ${t('course.influence.panel.minSub')}`, value: `${numText(peaks.min.v, 4)}` },
      ]} />
      <p class="ilp-sub">[{ordinateUnit(q)}] η<sub>{t('course.influence.panel.maxSub')}</sub> {peaks.max.where} · η<sub>{t('course.influence.panel.minSub')}</sub> {peaks.min.where}</p>
    {/if}

    {#if unit}<InfluenceLoading {il} {unit} loadedIds={loaded} />{/if}

    <AdvFold title={t('steps.catalog.button')} testid="il-steps">
      <AdvLink label={t('course.influence.panel.explain')} onclick={() => openInfluenceExplanation(loaded)} testid="il-explain" />
    </AdvFold>
  {/if}
</div>

<style>
  .ilp { display: flex; flex-direction: column; gap: 2px; margin: 2px 0 6px; font-size: 0.72rem; color: var(--st-text-2); }
  .ilp-hint { margin: 0 0 4px; line-height: 1.45; font-size: 0.68rem; color: var(--st-text-2); }
  .ilp-what { font-size: 0.64rem; color: var(--st-text-3); margin: -2px 0 2px; }
  .ilp-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 2px 0; }
  .ilp-x :global(input) { width: 4.2rem; height: 18px; padding: 0 4px; font-size: 0.65rem; color: var(--st-text); background: rgba(19, 33, 45, 0.8); border: 1px solid var(--st-surface-3); border-radius: 3px; }
  .ilp-sub { margin: -4px 0 4px; color: var(--st-text-3); font-size: 0.62rem; }
  .ilp-snaps { display: flex; flex-wrap: wrap; gap: 2px; }
  .ilp-snaps button {
    height: 18px; min-width: 22px; padding: 0 5px; font-size: 0.6rem; border: 1px solid var(--st-surface-3); border-radius: 3px;
    background: rgba(19, 33, 45, 0.8); color: var(--st-text-3); cursor: pointer;
  }
  .ilp-snaps button:hover { color: var(--st-text-2); }
  .ilp-snaps button.on { color: var(--st-accent); border-color: var(--st-accent); background: rgba(229, 72, 42, 0.12); }
  .ilp-links { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
  .ilp-error { margin: 0; color: var(--st-danger); font-size: 0.66rem; }
  .ilp-note { margin: 2px 0; line-height: 1.4; color: var(--st-text-3); font-size: 0.64rem; }
</style>
