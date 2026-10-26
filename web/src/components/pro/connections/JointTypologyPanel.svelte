<script lang="ts">
  /**
   * The selected joint's typology: chosen or proposed, its parameters, sized in one click until it
   * holds, every check with its clause, why it cannot be resolved when it cannot, and the joint
   * drawn from its own parts (the same ones the 3D view extrudes).
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { jointDesignStore } from '../../../lib/store/joint-design.svelte';
  import { proposeAllJoints, typologyContext } from '../../../lib/store/joint-typology';
  import { TYPOLOGIES, defaultParams, sizeTypology, type Typology, type TypologyParams } from '../../../lib/connection/typology';
  import { BOLT_GRADES } from '../../../lib/connection/bolted-joint';
  import JointDrawing from './JointDrawing.svelte';

  let { nodeId, elementIds }: { nodeId: number; elementIds: readonly number[] } = $props();
  const choice = $derived.by(() => { void modelStore.model.jointDesigns; return jointDesignStore.choicesFor(nodeId).typology ?? null; });
  const design = $derived.by(() => { void modelStore.model.jointDesigns; void resultsStore.results3D; return choice ? jointDesignStore.designFor(nodeId, elementIds).typology : null; });
  const params = $derived<TypologyParams | null>(choice ? { ...defaultParams(choice.kind), ...choice.params } : null);
  const base = $derived(choice?.kind === 'basePinned' || choice?.kind === 'baseFixed');
  let note = $state<string | null>(null);

  function setKind(kind: Typology) { jointDesignStore.set(nodeId, { typology: { kind, params: defaultParams(kind), ...(choice?.mainId !== undefined ? { mainId: choice.mainId } : {}) } }); }
  function setParam(patch: Partial<TypologyParams>) { if (choice) jointDesignStore.set(nodeId, { typology: { ...choice, params: { ...choice.params, ...patch } } }); }
  function size() {
    if (!choice) return;
    const ctx = typologyContext(nodeId, elementIds);
    if (!ctx) return;
    const d = sizeTypology(choice.kind, ctx, choice.mainId);
    jointDesignStore.set(nodeId, { typology: { ...choice, params: d.params } });
    note = d.state === 'designed' ? t('joint.typ.sized') : t(d.unresolvedKey ?? 'joint.typ.unresolved.limits');
  }
  function propose() {
    const r = proposeAllJoints([nodeId], true);
    note = r.unresolved.length ? t(r.unresolved[0]!.reasonKey) : t('joint.typ.proposed');
  }
  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(x < 10 ? 2 : 1) : '∞');
</script>

<section class="jt" data-testid="joint-typology">
  <div class="jt-row">
    <label>{t('joint.typ.kind')}
      <select value={choice?.kind ?? ''} onchange={(e) => setKind(e.currentTarget.value as Typology)} data-testid="joint-typ-kind">
        {#if !choice}<option value="">—</option>{/if}
        {#each TYPOLOGIES as k (k)}<option value={k}>{t(`joint.typ.kind.${k}`)}</option>{/each}
      </select>
    </label>
    <button class="jt-btn" onclick={propose} data-testid="joint-typ-propose">{t('joint.typ.propose')}</button>
    {#if choice}<button class="jt-btn" onclick={size} data-testid="joint-typ-size">{t('joint.typ.size')}</button>{/if}
    {#if design}<span class="jt-state" data-state={design.state} data-testid="joint-typ-state">{t(`joint.typ.state.${design.state}`)}</span>{/if}
  </div>
  {#if note}<p class="jt-note" role="status" data-testid="joint-typ-note">{note}</p>{/if}

  {#if choice && params}
    <div class="jt-params">
      <label>{t('joint.typ.p.plateT')}<input type="number" min="5" step="1" value={params.plateT} onchange={(e) => setParam({ plateT: +e.currentTarget.value })} /></label>
      {#if !base}
        <label>{t('joint.typ.p.boltD')}<select value={params.boltD} onchange={(e) => setParam({ boltD: +e.currentTarget.value })}>{#each [16, 20, 24, 27] as d}<option value={d}>Ø{d}</option>{/each}</select></label>
        <label>{t('joint.typ.p.grade')}<select value={params.boltGrade} onchange={(e) => setParam({ boltGrade: e.currentTarget.value as TypologyParams['boltGrade'] })}>{#each BOLT_GRADES as g}<option value={g}>{g}</option>{/each}</select></label>
        <label>{t('joint.typ.p.rows')}<input type="number" min="1" max="8" value={params.rows} onchange={(e) => setParam({ rows: +e.currentTarget.value })} /></label>
      {:else}
        <label>N (mm)<input type="number" min="100" step="10" value={params.plateN ?? design?.params.plateN ?? ''} onchange={(e) => setParam({ plateN: +e.currentTarget.value })} /></label>
        <label>B (mm)<input type="number" min="100" step="10" value={params.plateB ?? design?.params.plateB ?? ''} onchange={(e) => setParam({ plateB: +e.currentTarget.value })} /></label>
        <label>{t('joint.typ.p.anchorD')}<input type="number" min="12" step="2" value={params.anchorD ?? 20} onchange={(e) => setParam({ anchorD: +e.currentTarget.value })} /></label>
      {/if}
      <label>{t('joint.typ.p.weldLeg')}<input type="number" min="3" max="16" value={params.weldLeg} onchange={(e) => setParam({ weldLeg: +e.currentTarget.value })} /></label>
      {#if choice.kind === 'endPlate' || choice.kind === 'knee'}
        <label class="jt-check"><input type="checkbox" checked={!!params.stiffeners} onchange={(e) => setParam({ stiffeners: e.currentTarget.checked })} /> {t('joint.typ.p.stiffeners')}</label>
      {/if}
    </div>
  {/if}

  {#if design}
    {#if design.unresolvedKey}<p class="jt-why" data-testid="joint-typ-why">{t(design.unresolvedKey)}</p>{/if}
    {#each design.assumptions ?? [] as a (a)}<p class="jt-n">{t(a)}</p>{/each}
    {#if design.checks.length}
      <table class="jt-t" data-testid="joint-typ-checks">
        <thead><tr><th></th><th>{t('joint.typ.clause')}</th><th class="num">{t('joint.typ.demand')}</th><th class="num">{t('joint.typ.capacity')}</th><th class="num">η</th></tr></thead>
        <tbody>
          {#each design.checks as c, i (i)}
            <tr class:bad={c.ratio > 1}><td>{t(c.labelKey)}</td><td>{c.key}</td><td class="num">{fmt(c.demand)} {c.unit}</td><td class="num">{fmt(c.capacity)} {c.unit}</td><td class="num">{fmt(c.ratio)}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if design.parts.length}<JointDrawing parts={design.parts} />{/if}
    <p class="jt-n">{tp('joint.typ.parts', { n: design.parts.length })}</p>
  {:else if !choice}
    <p class="jt-n">{t('joint.typ.none')}</p>
  {/if}
</section>

<style>
  .jt { border: 1px solid var(--st-hair); border-radius: 4px; padding: 6px 8px; margin: 6px 0; font-size: 0.72rem; }
  .jt-row, .jt-params { display: flex; gap: 6px; align-items: flex-end; flex-wrap: wrap; }
  .jt-params { margin-top: 6px; }
  label { display: flex; flex-direction: column; gap: 2px; color: var(--st-text-2); font-size: 0.66rem; }
  label.jt-check { flex-direction: row; align-items: center; }
  input, select { font: inherit; font-size: 0.72rem; padding: 1px 4px; width: 5rem; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 3px; color: var(--st-text); }
  input[type='checkbox'] { width: auto; }
  .jt-btn { font: inherit; font-size: 0.7rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); border-radius: 4px; background: var(--st-surface-3); color: var(--st-text); cursor: pointer; }
  .jt-btn:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .jt-state { font-size: 0.66rem; padding: 1px 6px; border-radius: 3px; border: 1px solid var(--st-hair-strong); }
  .jt-state[data-state='exceeded'], .jt-state[data-state='unresolved'] { color: var(--st-danger); border-color: var(--st-danger); }
  .jt-note, .jt-n { color: var(--st-text-2); margin: 4px 0 0; }
  .jt-why { color: var(--st-warn); margin: 4px 0 0; }
  .jt-t { border-collapse: collapse; width: 100%; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .jt-t th, .jt-t td { padding: 1px 4px; border-top: 1px solid var(--st-hair); text-align: left; font-weight: 400; }
  .jt-t .num { text-align: right; }
  .jt-t tr.bad td { color: var(--st-danger); }
</style>
