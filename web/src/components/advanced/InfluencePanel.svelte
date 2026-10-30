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

  const unit = $derived(il ? currentUnitInput() : null);
  const loaded = $derived(unit && il ? loadedMembers(unit, il.direction ?? 'vertical') : []);
</script>

<div class="ilp" data-testid="il-panel">
  {#if !il}
    <p class="ilp-hint">{t('course.influence.panel.pick')}</p>
    <p class="ilp-hint">{t('course.influence.panel.pickWhere')}</p>
    <button class="ilp-btn" onclick={() => openInfluenceExplanation([])} data-testid="il-explain">{t('course.influence.panel.explain')}</button>
  {:else}
    <div class="ilp-what" data-testid="il-what">
      <strong>{t(`course.influence.name.${q}`)}</strong>
      <span>{il.targetElementId !== undefined ? tp('course.influence.panel.onMember', { e: il.targetElementId }) : tp('course.influence.panel.onNode', { n: il.targetNodeId ?? '' })}</span>
    </div>

    {#if elem}
      <div class="ilp-row">
        <span class="ilp-label">{t('course.influence.panel.section')}</span>
        <span class="ilp-x"><UnitInput value={at * L} qty="length" onchange={setX} testid="il-x" /></span>
        <span class="ilp-sub">x/L = {numText(at, 3)}</span>
      </div>
      <div class="ilp-snaps">
        <button class:on={at < 1e-9} onclick={() => setX(0)} data-testid="il-x0">x = 0</button>
        <button class:on={Math.abs(at - 0.5) < 1e-9} onclick={() => setX(L / 2)}>L/2</button>
        <button class:on={at > 1 - 1e-9} onclick={() => setX(L)} data-testid="il-xL">x = L</button>
      </div>
      {#if posError}<p class="ilp-error" role="alert" data-testid="il-x-error">{posError}</p>{/if}
      {#if atEnd && familyOf(q) === 'force'}
        <p class="ilp-note" data-testid="il-end-note">{tp(at < 0.5 ? 'course.influence.panel.endStart' : 'course.influence.panel.endEnd', { n: endNode ?? '', e: elem.id })}</p>
        <div class="ilp-snaps">
          {#if other}
            <button onclick={() => runInfluence(q, undefined, other.elementId, other.t, true)} data-testid="il-other-side">{tp('course.influence.panel.otherSide', { e: other.elementId })}</button>
          {/if}
          {#if supported && endNode !== undefined}
            <button onclick={() => runInfluence('Rz', endNode, undefined, 0.5, true)} data-testid="il-support-reaction">{t('course.influence.panel.reaction')}</button>
          {/if}
        </div>
      {/if}
    {/if}

    {#if peaks}
      <dl class="ilp-peaks" data-testid="il-peaks">
        <dt>η<sub>{t('course.influence.panel.maxSub')}</sub></dt><dd>{numText(peaks.max.v, 4)} {ordinateUnit(q)} <span class="ilp-sub">{peaks.max.where}</span></dd>
        <dt>η<sub>{t('course.influence.panel.minSub')}</sub></dt><dd>{numText(peaks.min.v, 4)} {ordinateUnit(q)} <span class="ilp-sub">{peaks.min.where}</span></dd>
      </dl>
    {/if}
    <p class="ilp-sign">{t(`course.influence.doc.sign.${q}`)}</p>

    {#if unit}<InfluenceLoading {il} {unit} loadedIds={loaded} />{/if}

    <button class="ilp-btn" onclick={() => openInfluenceExplanation(loaded)} data-testid="il-explain">{t('course.influence.panel.explain')}</button>
  {/if}
</div>

<style>
  .ilp { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.2rem 0 0.4rem 0.6rem; padding-left: 0.6rem; border-left: 2px solid var(--st-hair); font-size: 0.72rem; color: var(--st-text-2); }
  .ilp-hint { margin: 0; line-height: 1.45; color: var(--st-text-2); }
  .ilp-what { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: baseline; }
  .ilp-what strong { color: var(--st-text); font-weight: 600; }
  .ilp-row { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .ilp-label { color: var(--st-text-3); }
  .ilp-x :global(input) { width: 4.6rem; }
  .ilp-sub { color: var(--st-text-3); font-size: 0.66rem; }
  .ilp-snaps { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .ilp-snaps button, .ilp-btn {
    background: none; border: 1px solid var(--st-hair); border-radius: var(--st-radius); color: var(--st-text-2);
    font-size: 0.7rem; padding: 0.2rem 0.45rem; cursor: pointer;
  }
  .ilp-snaps button:hover, .ilp-btn:hover { background: var(--st-surface-3); color: var(--st-text); border-color: var(--st-hair-strong); }
  .ilp-snaps button.on { color: var(--st-accent); border-color: var(--st-accent); }
  .ilp-btn { align-self: flex-start; padding: 0.3rem 0.55rem; }
  .ilp-error { margin: 0; color: var(--st-danger); font-size: 0.68rem; }
  .ilp-note { margin: 0; line-height: 1.4; color: var(--st-text-3); font-size: 0.68rem; }
  .ilp-sign { margin: 0; line-height: 1.4; color: var(--st-text-3); font-size: 0.66rem; }
  .ilp-peaks { display: grid; grid-template-columns: auto 1fr; gap: 0.1rem 0.4rem; margin: 0; font-family: var(--st-mono); font-size: 0.68rem; }
  .ilp-peaks dt { color: var(--st-text-3); }
  .ilp-peaks dd { margin: 0; color: var(--st-value); }
</style>
