<script lang="ts">
  /**
   * Specifications › Fixed points: the plane the beams' and slabs' nodes lie in and each column
   * stack's fixed point, written as the members' offsets (`store/placement.ts`): the analysis,
   * the 3D view and the sheets read the members where these put them.
   */
  import Hint from '../Hint.svelte';
  import { t, tp, i18n } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { columnFixedPoints, columnPointIsOwn, columnStacks, placementData, setColumnFixedPoint, setEdgesFlush, setLevelReference } from '../../../lib/store/placement';
  import { LEVEL_REFERENCES, type LevelReference } from '../../../lib/model/placement';
  import { FIXED_POINT_KINDS, fixedSigns, type FixedPointKind } from '../../../lib/rc-sheets/fixed-points';
  import { PHYSICAL_GROUP_KIND } from '../../../lib/model/physical/types';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';

  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const placement = $derived(placementData());
  const reference = $derived(placement.reference);
  const stacks = $derived.by(() => {
    void modelStore.elements; void modelStore.model.groups;
    const nameOf = (id: number) => [...modelStore.model.groups.values()].find((g) => g.kind === PHYSICAL_GROUP_KIND && (g.members.elements ?? []).includes(id))?.name;
    return columnStacks().filter((s) => s.storeys.length > 1).map((s) => ({ ...s, name: nameOf(s.storeys[0]!) ?? '', xy: s.key.split(',').map((v) => Number(v) / 100) }));
  });
  const kinds = $derived.by(() => { void placement; void stacks; return columnFixedPoints(); });
  const kindOf = (stack: string): FixedPointKind => kinds.get(stack) ?? 'c';
  const allKind = $derived.by(() => { const ks = new Set(stacks.map((s) => kindOf(s.key))); return ks.size === 1 ? [...ks][0]! : null; });
  /** The beam and slab of each reference as drawn, the nodes' line dashed: y down, in px. */
  const FIG: Record<LevelReference, { slab: number; beam: number }> = { slabTop: { slab: 0, beam: 0 }, slabAxis: { slab: -6, beam: -6 }, axes: { slab: -6, beam: -14 } };
  const grid = [[-1, 1], [0, 1], [1, 1], [-1, 0], [0, 0], [1, 0], [-1, -1], [0, -1], [1, -1]] as const;
  const kindAt = (sx: number, sy: number): FixedPointKind => FIXED_POINT_KINDS.find((k) => { const [a, b] = fixedSigns(k); return a === sx && b === sy; })!;
</script>

<div class="pk" data-testid="spec-placement">
  <section class="pk-card">
    <h4 class="pk-heading">{t('rcSheets.placement.reference')}</h4>
    <Hint text={t('rcSheets.placement.referenceHint')} />
    <div class="pl-refs" role="radiogroup" aria-label={t('rcSheets.placement.reference')}>
      {#each LEVEL_REFERENCES as r (r)}
        {@const f = FIG[r]}
        <button type="button" class="pl-ref" class:on={reference === r} role="radio" aria-checked={reference === r} onclick={() => setLevelReference(r)} data-testid="placement-ref-{r}">
          <svg viewBox="0 0 96 44" aria-hidden="true">
            <rect x="4" y={14 + f.slab} width="88" height="12" class="slab" />
            <rect x="38" y={14 + f.beam} width="20" height="28" class="beam" />
            <line x1="0" x2="96" y1="14" y2="14" class="node" />
          </svg>
          <span>{t(`rcSheets.placement.ref.${r}`)}</span>
          <small>{t(`rcSheets.placement.ref.${r}Hint`)}</small>
        </button>
      {/each}
    </div>
    {#if !reference}<p class="pk-warn" data-testid="placement-unset">{t('rcSheets.placement.unset')}</p>{/if}
    <label class="pk-check pl-edges">
      <input type="checkbox" checked={!!placement.edges} onchange={(e) => setEdgesFlush(e.currentTarget.checked)} data-testid="placement-edges" />
      {t('rcSheets.placement.edges')}
    </label>
    <Hint text={t('rcSheets.placement.edgesHint')} />
    {#if reference && reference !== 'axes'}<p class="pl-note" data-testid="placement-joint">{t(reference === 'slabTop' ? 'rcSheets.placement.jointSlabTop' : 'rcSheets.placement.jointSlabAxis')}</p>{/if}
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('rcSheets.placement.columns')}</h4>
    <Hint text={t('rcSheets.placement.columnsHint')} />
    {#if stacks.length}
      <div class="pl-all">
        <span>{t('rcSheets.placement.allColumns')}</span>
        <div class="pl-grid" role="radiogroup" aria-label={t('rcSheets.placement.allColumns')}>
          {#each grid as [sx, sy] (`${sx},${sy}`)}
            {@const k = kindAt(sx, sy)}
            <button type="button" class:on={allKind === k} role="radio" aria-checked={allKind === k} title={t(`rcSheets.fixed.kind.${k}`)} aria-label={t(`rcSheets.fixed.kind.${k}`)} onclick={() => setColumnFixedPoint(null, k)} data-testid="placement-all-{k}"></button>
          {/each}
        </div>
      </div>
      <table class="pl-stacks">
        <tbody>
          {#each stacks as s (s.key)}
            {@const own = placement && columnPointIsOwn(s.key)}
            <tr data-testid="placement-stack">
              <th scope="row">{s.name}</th>
              <td class="pl-xy">{tp('rcSheets.placement.at', { x: fmt(s.xy[0] ?? 0), y: fmt(s.xy[1] ?? 0) })}</td>
              <td>
                <select value={own || !placement.edges ? kindOf(s.key) : ''} onchange={(e) => setColumnFixedPoint(s.key, e.currentTarget.value === '' ? null : e.currentTarget.value as FixedPointKind)} aria-label={tp('rcSheets.placement.stackOf', { name: s.name || tp('rcSheets.placement.at', { x: fmt(s.xy[0] ?? 0), y: fmt(s.xy[1] ?? 0) }) })}>
                  {#if placement.edges}<option value="">{tp('rcSheets.placement.byEdge', { kind: t(`rcSheets.fixed.kind.${kindOf(s.key)}`) })}</option>{/if}
                  {#each FIXED_POINT_KINDS as k (k)}<option value={k}>{t(`rcSheets.fixed.kind.${k}`)}</option>{/each}
                </select>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="pl-note">{t('rcSheets.placement.noStacks')}</p>
    {/if}
  </section>
</div>

<style>
  .pl-refs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
  .pl-ref { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 6px; border: 1px solid var(--st-hair); border-radius: var(--st-radius); background: none; color: var(--st-text-2); text-align: left; cursor: pointer; }
  .pl-ref.on { border-color: var(--st-accent); color: var(--st-text); background: var(--st-selected-bg); }
  .pl-ref span { font-size: 0.74rem; font-weight: 600; }
  .pl-ref small { font-size: 0.66rem; color: var(--st-text-3); line-height: 1.3; }
  .pl-ref svg { width: 100%; height: 44px; }
  .pl-ref .slab { fill: var(--st-surface-3); stroke: var(--st-text-3); stroke-width: 0.8; }
  .pl-ref .beam { fill: var(--st-surface-3); stroke: var(--st-text-2); stroke-width: 0.8; }
  .pl-ref .node { stroke: var(--st-accent); stroke-width: 1; stroke-dasharray: 3 2; }
  .pl-edges { margin-top: 8px; }
  .pl-note { font-size: 0.7rem; color: var(--st-text-2); margin: 6px 0 0; line-height: 1.35; }
  .pl-all { display: flex; align-items: center; gap: 10px; margin: 4px 0 8px; font-size: 0.72rem; color: var(--st-text-2); }
  .pl-grid { display: grid; grid-template-columns: repeat(3, 14px); gap: 3px; padding: 4px; border: 1px dashed var(--st-hair-strong); }
  .pl-grid button { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--st-text-3); background: none; padding: 0; cursor: pointer; }
  .pl-grid button.on { background: var(--st-accent); border-color: var(--st-accent); }
  .pl-stacks { border-collapse: collapse; font-size: 0.72rem; width: 100%; }
  .pl-stacks th, .pl-stacks td { padding: 2px 6px; text-align: left; }
  .pl-stacks th { font-weight: 500; color: var(--st-text); }
  .pl-xy { color: var(--st-text-3); }
  .pl-stacks select { font-size: 0.72rem; }
</style>
